import fs from "node:fs/promises";
import path from "node:path";
import { rootDir } from "../../config.js";
import {
  RedditCompanyProfileSchema,
  type RedditCompanyProfile,
  type RedditInvestigationRejectedThread,
  type RedditInvestigationSelectedThread,
  type RedditInvestigationTrace
} from "../../schemas.js";
import {
  generateStructuredWithResponses,
  type OpenAIFunctionTool
} from "../../lib/openai-responses-client.js";
import {
  fetchRedditThread,
  searchRedditThreads,
  type RedditFetchedThread,
  type RedditSearchSort,
  type RedditSearchTime,
  type RedditThreadCandidate
} from "../../lib/reddit-client.js";
import { AgentHarness, type AnyHarnessTool, type HarnessEvent, type HarnessTool } from "./harness.js";

type InvestigationPlanStep = {
  step: string;
  goal: string;
  subreddits?: string[];
  queries?: string[];
  rationale: string;
};

type TraceToolCall = {
  id: string;
  tool: "search_reddit" | "fetch_thread" | "record_decision" | "finish_investigation";
  input: Record<string, unknown>;
  output_summary: string;
  status: "completed" | "failed";
  actor: "agent" | "system_backfill";
  timestamp: string;
};

type TraceDecision = {
  id: string;
  type: "selected" | "rejected" | "expanded_search" | "note";
  subject: string;
  rationale: string;
  confidence: number;
  timestamp: string;
};

type InvestigationState = {
  trace: RedditInvestigationTrace;
  candidates: Map<string, RedditThreadCandidate>;
  fetched: Map<string, RedditFetchedThread>;
  searchedKeys: Set<string>;
};

type InvestigationOptions = {
  maxAgentTurns?: number;
  onStageUpdate?: (stage: string) => Promise<void> | void;
  onTraceUpdate?: (trace: RedditInvestigationTrace) => Promise<void> | void;
};

type SearchRedditInput = {
  subreddit: string;
  query: string;
  sort?: RedditSearchSort;
  time?: RedditSearchTime;
  limit?: number;
  reason?: string;
};

type FetchThreadInput = {
  reddit_id: string;
  reason?: string;
};

type RecordDecisionInput = {
  type: "selected" | "rejected" | "expanded_search" | "note";
  subject: string;
  rationale: string;
  confidence: number;
};

type FinishInvestigationInput = {
  reason: string;
  confidence?: number;
};

type FinalJudgeOutput = {
  summary: string;
  selected_threads: Array<{
    reddit_id: string;
    relevance_score: number;
    urgency_score: number;
    commercial_intent_score: number;
    why_relevant: string;
    matched_services: string[];
    matched_icps: string[];
  }>;
  rejected_threads: Array<{
    reddit_id: string;
    reason: string;
  }>;
};

const REDDIT_PROFILE_PATH = path.join(rootDir, "inputs", "mr-plumber-sg.json");

const redditTools: OpenAIFunctionTool[] = [
  {
    type: "function",
    name: "search_reddit",
    description: "Search one subreddit for public Reddit threads matching a plumbing or home-services query.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["subreddit", "query", "sort", "time", "limit", "reason"],
      properties: {
        subreddit: { type: "string", description: "Subreddit name such as r/singapore or singapore." },
        query: { type: "string", description: "Search query to run inside the subreddit." },
        sort: { type: "string", enum: ["relevance", "hot", "top", "new", "comments"] },
        time: { type: "string", enum: ["all", "year", "month", "week", "day"] },
        limit: { type: "integer", minimum: 1, maximum: 10 },
        reason: { type: "string", description: "Short visible rationale for why this search is useful." }
      }
    }
  },
  {
    type: "function",
    name: "fetch_thread",
    description: "Fetch full content and top comments for a thread found by search_reddit.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["reddit_id", "reason"],
      properties: {
        reddit_id: { type: "string", description: "The reddit_id returned by search_reddit." },
        reason: { type: "string", description: "Short visible rationale for why this thread deserves inspection." }
      }
    }
  },
  {
    type: "function",
    name: "record_decision",
    description: "Record a visible investigation decision, rejection, expansion, or note for the UI trace.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["type", "subject", "rationale", "confidence"],
      properties: {
        type: { type: "string", enum: ["selected", "rejected", "expanded_search", "note"] },
        subject: { type: "string" },
        rationale: { type: "string" },
        confidence: { type: "integer", minimum: 0, maximum: 100 }
      }
    }
  },
  {
    type: "function",
    name: "finish_investigation",
    description: "Stop the visible research loop once enough evidence has been gathered or the next step should be deterministic judging.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["reason", "confidence"],
      properties: {
        reason: { type: "string", description: "Short visible reason for ending the research loop." },
        confidence: { type: "integer", minimum: 0, maximum: 100 }
      }
    }
  }
];

const finalJudgeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "selected_threads", "rejected_threads"],
  properties: {
    summary: { type: "string" },
    selected_threads: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "reddit_id",
          "relevance_score",
          "urgency_score",
          "commercial_intent_score",
          "why_relevant",
          "matched_services",
          "matched_icps"
        ],
        properties: {
          reddit_id: { type: "string" },
          relevance_score: { type: "integer", minimum: 0, maximum: 100 },
          urgency_score: { type: "integer", minimum: 0, maximum: 100 },
          commercial_intent_score: { type: "integer", minimum: 0, maximum: 100 },
          why_relevant: { type: "string" },
          matched_services: { type: "array", items: { type: "string" } },
          matched_icps: { type: "array", items: { type: "string" } }
        }
      }
    },
    rejected_threads: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["reddit_id", "reason"],
        properties: {
          reddit_id: { type: "string" },
          reason: { type: "string" }
        }
      }
    }
  }
} satisfies Record<string, unknown>;

function clampScore(value: number, fallback = 50) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function uniqueStrings(values: string[], limit = 50) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, limit);
}

function cleanSubreddit(subreddit: string) {
  const clean = subreddit.trim().replace(/^r\//i, "").replace(/^\/r\//i, "");
  return clean ? `r/${clean}` : subreddit;
}

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function parseToolInput<T>(value: string, fallback: T): T {
  const parsed = safeJsonParse<Record<string, unknown> | null>(value, null);
  if (!parsed) throw new Error("Expected JSON object arguments.");
  return { ...(fallback as Record<string, unknown>), ...parsed } as T;
}

function traceRecord(value: Record<string, unknown>) {
  return value;
}

function nowIso() {
  return new Date().toISOString();
}

function compactThread(thread: RedditThreadCandidate | RedditFetchedThread) {
  return {
    reddit_id: thread.reddit_id,
    subreddit: `r/${thread.subreddit}`,
    title: thread.title,
    url: thread.url,
    reddit_score: thread.reddit_score,
    comment_count: thread.comment_count,
    created_utc: thread.created_utc,
    snippet: thread.selftext.slice(0, 280),
    search_query: thread.search_query
  };
}

function profileBrief(profile: RedditCompanyProfile) {
  return {
    company: profile.company,
    industry: profile.industry,
    services: profile.services.map((service) => ({
      id: service.id,
      name: service.name,
      urgency: service.urgency,
      trigger_scenario: service.trigger_scenario
    })),
    icps: profile.icps.map((icp) => ({
      id: icp.id,
      label: icp.label,
      trigger_event: icp.trigger_event,
      decision_window: icp.decision_window,
      decision_drivers: icp.decision_drivers
    })),
    hair_on_fire_problems: profile.hair_on_fire_problems.map((problem) => ({
      problem: problem.problem,
      search_intent: problem.search_intent,
      where_they_ask: problem.where_they_ask
    })),
    agent_optimization_targets: profile.agent_optimization_targets,
    research_hints_for_peekaboo_agent: profile.research_hints_for_peekaboo_agent
  };
}

function buildInvestigationPlan(profile: RedditCompanyProfile): InvestigationPlanStep[] {
  const hints = profile.research_hints_for_peekaboo_agent;
  const hairQueries = profile.hair_on_fire_problems.flatMap((problem) => problem.search_intent);
  const queries = uniqueStrings([...hints.high_signal_search_queries, ...hairQueries], 18);

  return [
    {
      step: "Map likely Singapore buying-intent communities",
      goal: "Start with local subreddits where residents ask urgent home-service questions.",
      subreddits: hints.primary_subreddits.map(cleanSubreddit),
      queries: queries.slice(0, 8),
      rationale: "The profile already identifies Singapore-specific communities and high-signal plumbing searches."
    },
    {
      step: "Probe urgent and regulatory pain points",
      goal: "Prioritize emergency, PUB, MCST, HDB, BTO, water heater, leak, and choke scenarios.",
      queries: queries.slice(0, 12),
      rationale: "These are the conversations most likely to produce near-term service decisions."
    },
    {
      step: "Expand only when local signal is thin",
      goal: "Use home-maintenance communities for universal plumbing phrasing if Singapore threads are sparse.",
      subreddits: hints.secondary_subreddits.map(cleanSubreddit),
      rationale: "Secondary subreddits help discover recurring patterns, but local Singapore fit remains the priority."
    },
    {
      step: "Fetch evidence and judge",
      goal: "Inspect top comments before choosing 5-8 high-signal threads.",
      rationale: "Titles often hide whether the thread has real purchase intent, pricing anxiety, or vendor recommendations."
    }
  ];
}

function localCandidateScore(profile: RedditCompanyProfile, candidate: RedditThreadCandidate) {
  const text = `${candidate.title} ${candidate.selftext}`.toLowerCase();
  const filters = profile.research_hints_for_peekaboo_agent.thread_relevance_filters;
  const keywordScore = filters.include_keywords.reduce(
    (score, keyword) => score + (text.includes(keyword.toLowerCase()) ? 10 : 0),
    0
  );
  const singaporeScore = /\b(singapore|sg|hdb|bto|pub|mcst|condo)\b/i.test(text) ? 25 : 0;
  const engagementScore = Math.min(25, Math.log10(candidate.reddit_score + candidate.comment_count + 2) * 12);
  const recencyScore = candidate.created_utc && Date.now() - new Date(candidate.created_utc).getTime() < 395 * 86_400_000 ? 15 : 5;
  const excludedPenalty = filters.exclude_keywords.some((keyword) => text.includes(keyword.toLowerCase())) ? -40 : 0;
  return clampScore(keywordScore + singaporeScore + engagementScore + recencyScore + excludedPenalty, 0);
}

function matchedServices(profile: RedditCompanyProfile, text: string) {
  const lower = text.toLowerCase();
  return profile.services
    .filter((service) => {
      const haystack = `${service.name} ${service.what_it_is} ${service.trigger_scenario}`.toLowerCase();
      return service.name
        .toLowerCase()
        .split(/\W+/)
        .filter((part) => part.length > 3)
        .some((part) => lower.includes(part)) || haystack.split(/\W+/).some((part) => part.length > 5 && lower.includes(part));
    })
    .map((service) => service.name)
    .slice(0, 3);
}

function matchedIcps(profile: RedditCompanyProfile, text: string) {
  const lower = text.toLowerCase();
  return profile.icps
    .filter((icp) =>
      [icp.label, icp.trigger_event, icp.demographics, ...icp.decision_drivers].some((value) =>
        value
          .toLowerCase()
          .split(/\W+/)
          .filter((part) => part.length > 4)
          .some((part) => lower.includes(part))
      )
    )
    .map((icp) => icp.label)
    .slice(0, 2);
}

async function emitTrace(state: InvestigationState, options: InvestigationOptions) {
  await options.onTraceUpdate?.(state.trace);
}

async function setStage(stage: string, options: InvestigationOptions) {
  console.log(`Reddit intelligence: ${stage}`);
  await options.onStageUpdate?.(stage);
}

function addToolCall(state: InvestigationState, toolCall: Omit<TraceToolCall, "id" | "timestamp">) {
  state.trace.tool_calls.push(
    traceRecord({
      id: `${toolCall.tool}-${state.trace.tool_calls.length + 1}`,
      timestamp: nowIso(),
      ...toolCall
    })
  );
}

function addDecision(state: InvestigationState, decision: Omit<TraceDecision, "id" | "timestamp">) {
  state.trace.decisions.push(
    traceRecord({
      id: `decision-${state.trace.decisions.length + 1}`,
      timestamp: nowIso(),
      ...decision,
      confidence: clampScore(decision.confidence)
    })
  );
}

function addHarnessEvent(state: InvestigationState, event: HarnessEvent) {
  state.trace.harness_events.push(traceRecord(event as unknown as Record<string, unknown>));
}

function addSyntheticHarnessEvent(state: InvestigationState, event: Omit<HarnessEvent, "id" | "timestamp">) {
  state.trace.harness_events.push(
    traceRecord({
      id: `harness-${state.trace.harness_events.length + 1}`,
      timestamp: nowIso(),
      ...event
    })
  );
}

async function handleSearchReddit(state: InvestigationState, input: SearchRedditInput, actor: TraceToolCall["actor"]) {
  const subreddit = cleanSubreddit(input.subreddit);
  const query = input.query.trim();
  const key = `${subreddit.toLowerCase()}::${query.toLowerCase()}::${input.sort || "relevance"}::${input.time || "year"}`;
  if (state.searchedKeys.has(key)) {
    return {
      skipped: true,
      reason: "Search already executed.",
      results: []
    };
  }

  state.searchedKeys.add(key);
  try {
    const results = await searchRedditThreads({
      subreddit,
      query,
      sort: input.sort || "relevance",
      time: input.time || "year",
      limit: input.limit || 8
    });
    for (const result of results) {
      if (!state.candidates.has(result.reddit_id)) state.candidates.set(result.reddit_id, result);
    }

    addToolCall(state, {
      tool: "search_reddit",
      input: { subreddit, query, sort: input.sort || "relevance", time: input.time || "year", reason: input.reason || "" },
      output_summary: `${results.length} threads returned; ${state.candidates.size} unique candidates total.`,
      status: "completed",
      actor
    });

    return {
      result_count: results.length,
      results: results.slice(0, 8).map(compactThread)
    };
  } catch (error) {
    addToolCall(state, {
      tool: "search_reddit",
      input: { subreddit, query, reason: input.reason || "" },
      output_summary: error instanceof Error ? error.message : String(error),
      status: "failed",
      actor
    });
    return {
      error: error instanceof Error ? error.message : String(error),
      results: []
    };
  }
}

async function handleFetchThread(state: InvestigationState, input: FetchThreadInput, actor: TraceToolCall["actor"]) {
  if (state.fetched.has(input.reddit_id)) {
    return {
      skipped: true,
      thread: compactThread(state.fetched.get(input.reddit_id)!)
    };
  }

  const candidate = state.candidates.get(input.reddit_id);
  if (!candidate) {
    return {
      error: `Thread candidate not found for reddit_id ${input.reddit_id}. Run search_reddit first.`
    };
  }

  try {
    const thread = await fetchRedditThread(candidate);
    state.fetched.set(thread.reddit_id, thread);
    addToolCall(state, {
      tool: "fetch_thread",
      input: { reddit_id: input.reddit_id, title: candidate.title, reason: input.reason || "" },
      output_summary: `Fetched post and ${thread.top_comments.length} top comments.`,
      status: "completed",
      actor
    });
    return {
      thread: {
        ...compactThread(thread),
        top_comment_count: thread.top_comments.length,
        content_preview: thread.thread_content.slice(0, 1200)
      }
    };
  } catch (error) {
    addToolCall(state, {
      tool: "fetch_thread",
      input: { reddit_id: input.reddit_id, title: candidate.title, reason: input.reason || "" },
      output_summary: error instanceof Error ? error.message : String(error),
      status: "failed",
      actor
    });
    return {
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function handleRecordDecision(state: InvestigationState, input: RecordDecisionInput) {
  addDecision(state, {
    type: input.type,
    subject: input.subject,
    rationale: input.rationale,
    confidence: input.confidence
  });

  addToolCall(state, {
    tool: "record_decision",
    input,
    output_summary: `Recorded ${input.type} decision for ${input.subject}.`,
    status: "completed",
    actor: "agent"
  });

  return {
    recorded: true,
    decision_count: state.trace.decisions.length
  };
}

function redditToolDefinition(name: TraceToolCall["tool"]) {
  const definition = redditTools.find((tool) => tool.name === name);
  if (!definition) throw new Error(`Missing Reddit tool definition for ${name}.`);
  return definition;
}

function buildRedditHarnessTools(state: InvestigationState): AnyHarnessTool[] {
  const searchTool: HarnessTool<SearchRedditInput> = {
    definition: redditToolDefinition("search_reddit"),
    parse: (raw) =>
      parseToolInput<SearchRedditInput>(raw, {
        subreddit: "r/singapore",
        query: "plumber Singapore",
        sort: "relevance",
        time: "year",
        limit: 8,
        reason: "Fallback parsed search"
      }),
    policy: (input) => {
      if (!input.subreddit?.trim()) return { allowed: false, reason: "Search requires a subreddit." };
      if (!input.query?.trim()) return { allowed: false, reason: "Search requires a query." };
      if ((input.limit || 8) > 10) return { allowed: false, reason: "Search limit must stay at or below 10 per call." };
      return { allowed: true, reason: "Search is scoped to one allowed Reddit query inside the tool budget." };
    },
    execute: (input) => handleSearchReddit(state, input, "agent"),
    summarizeInput: (input) => `${cleanSubreddit(input.subreddit)} / "${input.query}" - ${input.reason || "agent search"}`,
    summarizeOutput: (output) =>
      typeof output.result_count === "number"
        ? `${output.result_count} threads returned.`
        : typeof output.error === "string"
        ? output.error
        : "Search completed."
  };

  const fetchTool: HarnessTool<FetchThreadInput> = {
    definition: redditToolDefinition("fetch_thread"),
    parse: (raw) =>
      parseToolInput<FetchThreadInput>(raw, {
        reddit_id: "",
        reason: "Fallback parsed fetch"
      }),
    policy: (input) =>
      input.reddit_id?.trim()
        ? { allowed: true, reason: "Thread fetch has a candidate id and is inside the tool budget." }
        : { allowed: false, reason: "Thread fetch requires a reddit_id returned by search_reddit." },
    execute: (input) => handleFetchThread(state, input, "agent"),
    summarizeInput: (input) => `${input.reddit_id} - ${input.reason || "inspect evidence"}`,
    summarizeOutput: (output) => {
      const thread = output.thread && typeof output.thread === "object" ? (output.thread as Record<string, unknown>) : {};
      if (typeof thread.title === "string") return `Fetched evidence for "${thread.title}".`;
      if (typeof output.error === "string") return output.error;
      return "Fetch completed.";
    }
  };

  const decisionTool: HarnessTool<RecordDecisionInput> = {
    definition: redditToolDefinition("record_decision"),
    parse: (raw) =>
      parseToolInput<RecordDecisionInput>(raw, {
        type: "note",
        subject: "Unparsed decision",
        rationale: raw,
        confidence: 50
      }),
    policy: (input) => {
      if (!input.subject?.trim()) return { allowed: false, reason: "Decision requires a subject." };
      if (!input.rationale?.trim()) return { allowed: false, reason: "Decision requires a visible rationale." };
      return { allowed: true, reason: "Decision is a visible summary, not private chain-of-thought." };
    },
    execute: async (input, context) => {
      const result = handleRecordDecision(state, input);
      await context.recordDecision(`${input.type}: ${input.subject}`, input.rationale, {
        confidence: clampScore(input.confidence),
        decision_type: input.type
      });
      return result;
    },
    summarizeInput: (input) => `${input.type}: ${input.subject}`,
    summarizeOutput: (output) =>
      typeof output.decision_count === "number" ? `Decision count is now ${output.decision_count}.` : "Decision recorded."
  };

  const finishTool: HarnessTool<FinishInvestigationInput> = {
    definition: redditToolDefinition("finish_investigation"),
    parse: (raw) =>
      parseToolInput<FinishInvestigationInput>(raw, {
        reason: "Agent indicated the research loop can stop.",
        confidence: 70
      }),
    policy: (input) =>
      input.reason?.trim()
        ? { allowed: true, reason: "The model can stop the research loop with a visible reason." }
        : { allowed: false, reason: "Finish requires a visible reason." },
    execute: (input, context) => {
      const confidence = clampScore(input.confidence ?? 70);
      const reason = input.reason.trim() || "Agent indicated the research loop can stop.";
      context.finish(reason);
      addToolCall(state, {
        tool: "finish_investigation",
        input: { reason, confidence },
        output_summary: `Agent finished the research loop at ${confidence}% confidence.`,
        status: "completed",
        actor: "agent"
      });
      return {
        finished: true,
        reason,
        confidence
      };
    },
    summarizeInput: (input) => input.reason,
    summarizeOutput: (output) => (typeof output.reason === "string" ? output.reason : "Investigation finished.")
  };

  return [searchTool, fetchTool, decisionTool, finishTool];
}

async function runAgentToolLoop(profile: RedditCompanyProfile, state: InvestigationState, options: InvestigationOptions) {
  await setStage("harness running Reddit research loop", options);
  const prompt = [
    "Run a visible Reddit investigation for this company profile.",
    "",
    "Use the tools instead of giving a normal written answer.",
    "Requirements:",
    "- Search at least 6 combinations across the primary Singapore subreddits.",
    "- Fetch promising threads before selecting or rejecting them.",
    "- Record visible decisions when you expand, reject, or find a strong candidate.",
    "- Prioritize near-term purchase intent, Singapore relevance, plumbing problem specificity, and evidence in comments.",
    "- Use finish_investigation when the research loop has enough evidence or further action should move to deterministic judging.",
    "- Stop after you have enough evidence for 5-8 final high-signal threads.",
    "",
    `Investigation plan:\n${JSON.stringify(state.trace.plan, null, 2)}`,
    "",
    `Profile brief:\n${JSON.stringify(profileBrief(profile), null, 2)}`
  ].join("\n");

  const harness = new AgentHarness({
    objective: "Find 5-8 high-signal Reddit conversations for Mr Plumber Singapore and record why weak threads are rejected.",
    systemInstruction: profile.agent_role,
    prompt,
    tools: buildRedditHarnessTools(state),
    maxTurns: options.maxAgentTurns || 8,
    maxToolCalls: 28,
    maxOutputTokens: 1200,
    onEvent: async (event) => {
      addHarnessEvent(state, event);
      await emitTrace(state, options);
    }
  });

  await harness.run();
}

function searchObservationSummary(output: Record<string, unknown>) {
  if (output.skipped) return "Search skipped because it was already executed.";
  if (typeof output.error === "string") return output.error;
  if (typeof output.result_count === "number") return `${output.result_count} threads returned.`;
  return "Search completed.";
}

function fetchObservationSummary(output: Record<string, unknown>) {
  if (output.skipped) return "Fetch skipped because the thread was already inspected.";
  if (typeof output.error === "string") return output.error;
  const thread = output.thread && typeof output.thread === "object" ? (output.thread as Record<string, unknown>) : {};
  if (typeof thread.title === "string") return `Fetched evidence for "${thread.title}".`;
  return "Fetch completed.";
}

async function runSystemSearch(
  state: InvestigationState,
  input: SearchRedditInput,
  options: InvestigationOptions,
  policyReason: string
) {
  const normalizedInput = {
    subreddit: cleanSubreddit(input.subreddit),
    query: input.query,
    sort: input.sort || "relevance",
    time: input.time || "year",
    limit: input.limit || 8,
    reason: input.reason || ""
  };

  addSyntheticHarnessEvent(state, {
    type: "policy_check",
    actor: "harness",
    label: "Backfill coverage check",
    summary: policyReason,
    status: "allowed",
    tool: "search_reddit",
    input: normalizedInput,
    policy: {
      allowed: true,
      reason: policyReason
    }
  });
  addSyntheticHarnessEvent(state, {
    type: "tool_execution",
    actor: "system_backfill",
    label: "Executing search_reddit",
    summary: `${normalizedInput.subreddit} / "${normalizedInput.query}"`,
    status: "running",
    tool: "search_reddit",
    input: normalizedInput
  });

  const output = (await handleSearchReddit(state, input, "system_backfill")) as Record<string, unknown>;
  addSyntheticHarnessEvent(state, {
    type: "observation",
    actor: "harness",
    label: "search_reddit result",
    summary: searchObservationSummary(output),
    status: output.error ? "failed" : output.skipped ? "skipped" : "completed",
    tool: "search_reddit",
    input: normalizedInput,
    output
  });
  await emitTrace(state, options);
}

async function runSystemFetch(
  state: InvestigationState,
  input: FetchThreadInput,
  options: InvestigationOptions,
  policyReason: string
) {
  addSyntheticHarnessEvent(state, {
    type: "policy_check",
    actor: "harness",
    label: "Candidate evidence check",
    summary: policyReason,
    status: "allowed",
    tool: "fetch_thread",
    input,
    policy: {
      allowed: true,
      reason: policyReason
    }
  });
  addSyntheticHarnessEvent(state, {
    type: "tool_execution",
    actor: "system_backfill",
    label: "Executing fetch_thread",
    summary: `${input.reddit_id} - ${input.reason || "inspect evidence"}`,
    status: "running",
    tool: "fetch_thread",
    input
  });

  const output = (await handleFetchThread(state, input, "system_backfill")) as Record<string, unknown>;
  addSyntheticHarnessEvent(state, {
    type: "observation",
    actor: "harness",
    label: "fetch_thread result",
    summary: fetchObservationSummary(output),
    status: output.error ? "failed" : output.skipped ? "skipped" : "completed",
    tool: "fetch_thread",
    input,
    output
  });
  await emitTrace(state, options);
}

async function backfillSearches(profile: RedditCompanyProfile, state: InvestigationState, options: InvestigationOptions) {
  await setStage("backfilling comprehensive Reddit searches", options);
  const hints = profile.research_hints_for_peekaboo_agent;
  const queries = uniqueStrings([
    ...hints.high_signal_search_queries,
    ...profile.hair_on_fire_problems.flatMap((problem) => problem.search_intent)
  ]);
  const primary = hints.primary_subreddits.map(cleanSubreddit);
  const secondary = hints.secondary_subreddits.map(cleanSubreddit);

  let searchCount = 0;
  for (const subreddit of primary) {
    for (const query of queries.slice(0, 10)) {
      if (state.candidates.size >= 24 || searchCount >= 16) break;
      await runSystemSearch(
        state,
        {
          subreddit,
          query,
          sort: "relevance",
          time: "year",
          limit: 8,
          reason: "System backfill to ensure primary subreddit coverage."
        },
        options,
        "Primary subreddit coverage is below the candidate target, so a deterministic search is allowed."
      );
      searchCount++;
    }
  }

  if (state.candidates.size < 14) {
    for (const subreddit of secondary) {
      for (const query of queries.slice(0, 6)) {
        if (state.candidates.size >= 18 || searchCount >= 24) break;
        await runSystemSearch(
          state,
          {
            subreddit,
            query,
            sort: "relevance",
            time: "year",
            limit: 6,
            reason: "Secondary expansion because local Reddit signal was thin."
          },
          options,
          "Local candidate volume is thin, so secondary subreddit expansion is allowed."
        );
        searchCount++;
      }
    }
  }
}

async function fetchBestCandidates(profile: RedditCompanyProfile, state: InvestigationState, options: InvestigationOptions) {
  await setStage("fetching candidate thread evidence", options);
  const ranked = [...state.candidates.values()]
    .sort((a, b) => localCandidateScore(profile, b) - localCandidateScore(profile, a))
    .slice(0, 14);

  for (const candidate of ranked) {
    if (state.fetched.size >= 12) break;
    await runSystemFetch(
      state,
      {
        reddit_id: candidate.reddit_id,
        reason: "Fetch top locally ranked candidate for final evidence review."
      },
      options,
      "Candidate ranks high on local relevance, geography, engagement, or urgency signals."
    );
  }
}

function fallbackSelectedThread(profile: RedditCompanyProfile, thread: RedditFetchedThread): RedditInvestigationSelectedThread {
  const text = `${thread.title}\n${thread.thread_content}`;
  const relevanceScore = localCandidateScore(profile, thread);
  return {
    reddit_id: thread.reddit_id,
    subreddit: `r/${thread.subreddit}`,
    title: thread.title,
    url: thread.url,
    relevance_score: relevanceScore,
    urgency_score: /emergency|urgent|overflow|leak|burst|choke|not working|stopped/i.test(text) ? 80 : 55,
    commercial_intent_score: /recommend|quote|price|plumber|who should|who to call|service|install/i.test(text) ? 82 : 50,
    why_relevant: "Selected by local fallback scoring because it matches the profile's plumbing keywords, geography, and engagement signals.",
    matched_services: matchedServices(profile, text),
    matched_icps: matchedIcps(profile, text),
    thread_content: thread.thread_content
  };
}

async function judgeFinalThreads(profile: RedditCompanyProfile, state: InvestigationState, options: InvestigationOptions) {
  await setStage("judging final Reddit threads", options);
  const fetched = [...state.fetched.values()];
  if (!fetched.length) {
    addSyntheticHarnessEvent(state, {
      type: "error",
      actor: "judge",
      label: "Final judge blocked",
      summary: "No Reddit threads were fetched, so the final judge has no evidence to score.",
      status: "failed"
    });
    await emitTrace(state, options);
    throw new Error("No Reddit threads were fetched. Check Reddit credentials, subreddit availability, or search queries.");
  }

  const candidatesForJudge = fetched.map((thread) => ({
    ...compactThread(thread),
    local_score: localCandidateScore(profile, thread),
    content: thread.thread_content.slice(0, 2500)
  }));

  addSyntheticHarnessEvent(state, {
    type: "tool_execution",
    actor: "judge",
    label: "Final judge",
    summary: `Scoring ${candidatesForJudge.length} fetched Reddit candidates against relevance, urgency, and commercial intent.`,
    status: "running",
    tool: "final_judge",
    input: {
      candidate_count: candidatesForJudge.length
    }
  });
  await emitTrace(state, options);

  const judge = await generateStructuredWithResponses<FinalJudgeOutput>({
    schemaName: "reddit_investigation_final_judge",
    schema: finalJudgeSchema,
    systemInstruction:
      "You are an evaluator for a Reddit intelligence agent. Return only the threads that show real service-buying or problem-solving signal for the company. Do not invent thread IDs.",
    userPrompt: [
      `Company profile:\n${JSON.stringify(profileBrief(profile), null, 2)}`,
      "",
      "Fetched Reddit candidates:",
      JSON.stringify(candidatesForJudge, null, 2),
      "",
      "Pick 5 to 8 selected_threads if possible. Reject weak, generic, off-geography, joke, politics, or pure DIY threads."
    ].join("\n"),
    maxOutputTokens: 3200
  });

  const fetchedById = new Map(fetched.map((thread) => [thread.reddit_id, thread]));
  const selectedIds = new Set<string>();
  const selected: RedditInvestigationSelectedThread[] = [];

  for (const item of judge.selected_threads) {
    const thread = fetchedById.get(item.reddit_id);
    if (!thread || selectedIds.has(thread.reddit_id)) continue;
    selectedIds.add(thread.reddit_id);
    selected.push({
      reddit_id: thread.reddit_id,
      subreddit: `r/${thread.subreddit}`,
      title: thread.title,
      url: thread.url,
      relevance_score: clampScore(item.relevance_score),
      urgency_score: clampScore(item.urgency_score),
      commercial_intent_score: clampScore(item.commercial_intent_score),
      why_relevant: item.why_relevant,
      matched_services: item.matched_services.slice(0, 5),
      matched_icps: item.matched_icps.slice(0, 4),
      thread_content: thread.thread_content
    });
  }

  if (selected.length < 5) {
    for (const thread of fetched.sort((a, b) => localCandidateScore(profile, b) - localCandidateScore(profile, a))) {
      if (selected.length >= 8) break;
      if (selectedIds.has(thread.reddit_id)) continue;
      selectedIds.add(thread.reddit_id);
      selected.push(fallbackSelectedThread(profile, thread));
    }
  }

  const rejected: RedditInvestigationRejectedThread[] = [];
  for (const item of judge.rejected_threads) {
    const thread = fetchedById.get(item.reddit_id) || state.candidates.get(item.reddit_id);
    if (!thread || selectedIds.has(thread.reddit_id)) continue;
    rejected.push({
      reddit_id: thread.reddit_id,
      subreddit: `r/${thread.subreddit}`,
      title: thread.title,
      reason: item.reason
    });
  }

  for (const thread of fetched) {
    if (selectedIds.has(thread.reddit_id) || rejected.some((item) => item.reddit_id === thread.reddit_id)) continue;
    rejected.push({
      reddit_id: thread.reddit_id,
      subreddit: `r/${thread.subreddit}`,
      title: thread.title,
      reason: "Fetched for evidence but ranked below the final selected set."
    });
  }

  state.trace.selected_threads = selected
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, 8);
  state.trace.rejected_threads = rejected.slice(0, 30);
  state.trace.summary =
    judge.summary ||
    `Selected ${state.trace.selected_threads.length} high-signal threads from ${state.candidates.size} candidates.`;

  addSyntheticHarnessEvent(state, {
    type: "observation",
    actor: "judge",
    label: "Final judge output",
    summary: state.trace.summary,
    status: "completed",
    tool: "final_judge",
    output: {
      selected_threads: state.trace.selected_threads.length,
      rejected_threads: state.trace.rejected_threads.length,
      candidate_count: state.candidates.size
    }
  });

  for (const thread of state.trace.selected_threads) {
    addDecision(state, {
      type: "selected",
      subject: thread.title,
      rationale: thread.why_relevant,
      confidence: thread.relevance_score
    });
  }

  await emitTrace(state, options);
}

export async function loadRedditCompanyProfile(profilePath = REDDIT_PROFILE_PATH) {
  const raw = JSON.parse(await fs.readFile(profilePath, "utf8")) as unknown;
  return RedditCompanyProfileSchema.parse(raw);
}

export async function runRedditInvestigation(profile: RedditCompanyProfile, options: InvestigationOptions = {}) {
  const state: InvestigationState = {
    trace: {
      plan: buildInvestigationPlan(profile).map((step) => traceRecord(step as unknown as Record<string, unknown>)),
      harness_events: [],
      tool_calls: [],
      decisions: [],
      rejected_threads: [],
      selected_threads: [],
      summary: ""
    },
    candidates: new Map(),
    fetched: new Map(),
    searchedKeys: new Set()
  };

  await setStage("validating hardcoded company profile", options);
  await emitTrace(state, options);
  await runAgentToolLoop(profile, state, options);
  await backfillSearches(profile, state, options);
  await fetchBestCandidates(profile, state, options);
  await judgeFinalThreads(profile, state, options);

  return {
    profile,
    trace: state.trace,
    candidates: [...state.candidates.values()],
    fetched_threads: [...state.fetched.values()]
  };
}
