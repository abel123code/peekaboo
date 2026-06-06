import type { Json, RedditIntelligenceRun, RedditThread } from "./database.types";

export type TraceRecord = Record<string, unknown>;

export type RedditTrace = {
  plan: TraceRecord[];
  harness_events: TraceRecord[];
  tool_calls: TraceRecord[];
  decisions: TraceRecord[];
  rejected_threads: TraceRecord[];
  selected_threads: TraceRecord[];
  summary: string;
};

export type RedditRunSummary = Pick<
  RedditIntelligenceRun,
  | "id"
  | "profile_slug"
  | "profile_name"
  | "status"
  | "current_stage"
  | "trigger_run_id"
  | "summary"
  | "error"
  | "started_at"
  | "completed_at"
  | "created_at"
  | "updated_at"
>;

export type RedditThreadSummary = Pick<
  RedditThread,
  | "id"
  | "run_id"
  | "reddit_id"
  | "subreddit"
  | "title"
  | "url"
  | "reddit_score"
  | "comment_count"
  | "created_utc"
  | "relevance_score"
  | "urgency_score"
  | "commercial_intent_score"
  | "why_relevant"
  | "matched_services"
  | "matched_icps"
  | "created_at"
>;

export type DemoPhase = {
  id: "profile" | "planning" | "searching" | "fetching" | "judging" | "selected";
  label: string;
  status: "completed" | "active" | "upcoming" | "failed";
};

export type DemoAction = {
  eventId: string;
  phaseLabel: string;
  title: string;
  tool: string;
  status: string;
  actor: string;
  summary: string;
  code: string;
  policy: string;
  observation: string;
  failed: boolean;
};

export type SearchMapItem = {
  id: string;
  subreddit: string;
  query: string;
  reason: string;
  resultCount: number | null;
  uniqueCandidateCount: number | null;
  status: string;
  actor: string;
  outputSummary: string;
};

export type EvidenceItem = {
  id: string;
  redditId: string;
  title: string;
  reason: string;
  status: string;
  actor: string;
  outputSummary: string;
  commentCount: number | null;
};

export type DecisionItem = {
  id: string;
  title: string;
  subreddit: string;
  reason: string;
  url?: string;
  relevanceScore?: number;
  urgencyScore?: number;
  commercialIntentScore?: number;
};

export type RedditDemoModel = {
  isActive: boolean;
  runLabel: string;
  currentPhaseIndex: number;
  phases: DemoPhase[];
  currentAction: DemoAction;
  searchMap: SearchMapItem[];
  evidenceQueue: EvidenceItem[];
  selected: DecisionItem[];
  rejected: DecisionItem[];
  counts: {
    events: number;
    searches: number;
    fetched: number;
    decisions: number;
    selected: number;
    rejected: number;
    candidates: number;
  };
};

export type RedditLatestPayload = {
  runs: RedditRunSummary[];
  latestRun: RedditRunSummary | null;
  threads: RedditThreadSummary[];
  trace: RedditTrace;
  demo: RedditDemoModel;
};

const phaseSpecs: Array<Pick<DemoPhase, "id" | "label">> = [
  { id: "profile", label: "Profile loaded" },
  { id: "planning", label: "Agent planning" },
  { id: "searching", label: "Searching Reddit" },
  { id: "fetching", label: "Fetching evidence" },
  { id: "judging", label: "Judging candidates" },
  { id: "selected", label: "Final threads selected" }
];

export function asRecord(value: Json | unknown): TraceRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as TraceRecord) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asTrace(value: Json | unknown): RedditTrace {
  const record = asRecord(value);
  return {
    plan: asArray(record.plan).filter(isRecord),
    harness_events: asArray(record.harness_events).filter(isRecord),
    tool_calls: asArray(record.tool_calls).filter(isRecord),
    decisions: asArray(record.decisions).filter(isRecord),
    rejected_threads: asArray(record.rejected_threads).filter(isRecord),
    selected_threads: asArray(record.selected_threads).filter(isRecord),
    summary: typeof record.summary === "string" ? record.summary : ""
  };
}

export function toRunSummary(run: RedditIntelligenceRun): RedditRunSummary {
  return {
    id: run.id,
    profile_slug: run.profile_slug,
    profile_name: run.profile_name,
    status: run.status,
    current_stage: run.current_stage,
    trigger_run_id: run.trigger_run_id,
    summary: run.summary,
    error: run.error,
    started_at: run.started_at,
    completed_at: run.completed_at,
    created_at: run.created_at,
    updated_at: run.updated_at
  };
}

export function toThreadSummary(thread: RedditThread): RedditThreadSummary {
  return {
    id: thread.id,
    run_id: thread.run_id,
    reddit_id: thread.reddit_id,
    subreddit: thread.subreddit,
    title: thread.title,
    url: thread.url,
    reddit_score: thread.reddit_score,
    comment_count: thread.comment_count,
    created_utc: thread.created_utc,
    relevance_score: thread.relevance_score,
    urgency_score: thread.urgency_score,
    commercial_intent_score: thread.commercial_intent_score,
    why_relevant: thread.why_relevant,
    matched_services: thread.matched_services,
    matched_icps: thread.matched_icps,
    created_at: thread.created_at
  };
}

export function text(value: unknown, fallback = "-") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function number(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function jsonStrings(value: Json | unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

export function profileName(run: RedditRunSummary | null) {
  if (!run) return "Mr Plumber Singapore";
  const summary = asRecord(run.summary);
  return run.profile_name || text(summary.profile_name, "Mr Plumber Singapore");
}

export function deriveRedditDemo(latestRun: RedditRunSummary | null, trace: RedditTrace, threads: RedditThreadSummary[]): RedditDemoModel {
  const toolCalls = trace.tool_calls;
  const searchMap = toolCalls.filter((call) => call.tool === "search_reddit").map(toSearchMapItem);
  const evidenceQueue = toolCalls.filter((call) => call.tool === "fetch_thread").map(toEvidenceItem);
  const selected = selectedDecisions(trace, threads);
  const rejected = rejectedDecisions(trace);
  const currentPhaseIndex = deriveCurrentPhaseIndex(latestRun, trace, searchMap, evidenceQueue, selected);
  const phases = phaseSpecs.map((phase, index) => ({
    ...phase,
    status: phaseStatus(latestRun, currentPhaseIndex, index)
  }));
  const summary = asRecord(latestRun?.summary);

  return {
    isActive: latestRun?.status === "queued" || latestRun?.status === "running",
    runLabel: latestRun ? `${profileName(latestRun)} / ${latestRun.status}` : "No run yet",
    currentPhaseIndex,
    phases,
    currentAction: deriveCurrentAction(latestRun, trace, currentPhaseIndex),
    searchMap,
    evidenceQueue,
    selected,
    rejected,
    counts: {
      events: trace.harness_events.length,
      searches: searchMap.length,
      fetched: evidenceQueue.length,
      decisions: trace.decisions.length,
      selected: selected.length,
      rejected: rejected.length,
      candidates: number(summary.candidate_count, Math.max(selected.length + rejected.length, 0))
    }
  };
}

function isRecord(value: unknown): value is TraceRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function formatSubreddit(value: unknown) {
  const raw = text(value, "");
  if (!raw) return "-";
  return raw.startsWith("r/") ? raw : `r/${raw.replace(/^\/?r\//i, "")}`;
}

function parseThreadCounts(summary: string) {
  const match = summary.match(/(\d+)\s+threads returned(?:;\s+(\d+)\s+unique candidates total)?/i);
  return {
    resultCount: match ? Number(match[1]) : null,
    uniqueCandidateCount: match?.[2] ? Number(match[2]) : null
  };
}

function parseCommentCount(summary: string) {
  const match = summary.match(/Fetched post and\s+(\d+)\s+top comments/i);
  return match ? Number(match[1]) : null;
}

function toSearchMapItem(call: TraceRecord, index: number): SearchMapItem {
  const input = asRecord(call.input);
  const outputSummary = text(call.output_summary, "");
  const counts = parseThreadCounts(outputSummary);
  return {
    id: text(call.id, `search-${index}`),
    subreddit: formatSubreddit(input.subreddit),
    query: text(input.query, "unknown query"),
    reason: text(input.reason, ""),
    status: text(call.status, "pending"),
    actor: text(call.actor, "agent"),
    outputSummary,
    ...counts
  };
}

function toEvidenceItem(call: TraceRecord, index: number): EvidenceItem {
  const input = asRecord(call.input);
  const outputSummary = text(call.output_summary, "");
  return {
    id: text(call.id, `fetch-${index}`),
    redditId: text(input.reddit_id, ""),
    title: text(input.title, text(input.reddit_id, "Untitled thread")),
    reason: text(input.reason, ""),
    status: text(call.status, "pending"),
    actor: text(call.actor, "agent"),
    outputSummary,
    commentCount: parseCommentCount(outputSummary)
  };
}

function selectedDecisions(trace: RedditTrace, threads: RedditThreadSummary[]) {
  if (threads.length) {
    return threads.map((thread) => ({
      id: thread.reddit_id,
      title: thread.title,
      subreddit: thread.subreddit,
      reason: thread.why_relevant,
      url: thread.url,
      relevanceScore: thread.relevance_score,
      urgencyScore: thread.urgency_score,
      commercialIntentScore: thread.commercial_intent_score
    }));
  }

  return trace.selected_threads.map((thread, index) => ({
    id: text(thread.reddit_id, `selected-${index}`),
    title: text(thread.title, "Selected thread"),
    subreddit: text(thread.subreddit, ""),
    reason: text(thread.why_relevant, ""),
    url: text(thread.url, ""),
    relevanceScore: number(thread.relevance_score, 0),
    urgencyScore: number(thread.urgency_score, 0),
    commercialIntentScore: number(thread.commercial_intent_score, 0)
  }));
}

function rejectedDecisions(trace: RedditTrace) {
  return trace.rejected_threads.map((thread, index) => ({
    id: text(thread.reddit_id, `rejected-${index}`),
    title: text(thread.title, "Rejected thread"),
    subreddit: text(thread.subreddit, ""),
    reason: text(thread.reason, "")
  }));
}

function deriveCurrentPhaseIndex(
  run: RedditRunSummary | null,
  trace: RedditTrace,
  searches: SearchMapItem[],
  fetches: EvidenceItem[],
  selected: DecisionItem[]
) {
  if (!run) return 0;
  if (run.status === "completed") return 5;

  const stage = (run.current_stage || "").toLowerCase();
  const hasJudge = trace.harness_events.some((event) => event.tool === "final_judge" || text(event.label, "").toLowerCase().includes("judge"));
  const hasModelAction = trace.harness_events.some((event) => event.type === "model_action");

  if (selected.length > 0 || trace.selected_threads.length > 0) return 5;
  if (stage.includes("judging") || hasJudge) return 4;
  if (stage.includes("fetching") || fetches.length > 0) return 3;
  if (stage.includes("backfilling") || stage.includes("search") || searches.length > 0) return 2;
  if (stage.includes("harness") || stage.includes("planning") || hasModelAction) return 1;
  return 0;
}

function phaseStatus(run: RedditRunSummary | null, currentPhaseIndex: number, index: number): DemoPhase["status"] {
  if (!run) return index === 0 ? "active" : "upcoming";
  if (run.status === "failed") return index < currentPhaseIndex ? "completed" : index === currentPhaseIndex ? "failed" : "upcoming";
  if (run.status === "completed") return "completed";
  if (index < currentPhaseIndex) return "completed";
  if (index === currentPhaseIndex) return "active";
  return "upcoming";
}

function phaseLabel(index: number) {
  return phaseSpecs[index]?.label || "Harness";
}

function deriveCurrentAction(run: RedditRunSummary | null, trace: RedditTrace, currentPhaseIndex: number): DemoAction {
  if (!run) {
    return {
      eventId: "idle",
      phaseLabel: "Ready",
      title: "Waiting for investigation",
      tool: "none",
      status: "idle",
      actor: "harness",
      summary: "Press Run Investigation to start the Reddit agent harness.",
      code: "await harness.run({ objective: \"Find Reddit demand signals\" })",
      policy: "Harness will validate each requested action before tools run.",
      observation: "No run has started yet.",
      failed: false
    };
  }

  if (run.status === "failed") {
    return {
      eventId: `failed-${run.id}`,
      phaseLabel: phaseLabel(currentPhaseIndex),
      title: "Run failed",
      tool: "error",
      status: "failed",
      actor: "harness",
      summary: run.error || "The investigation failed.",
      code: `throw new Error(${JSON.stringify(run.error || "Investigation failed")})`,
      policy: "Failure is surfaced directly instead of hidden inside an empty result.",
      observation: run.error || "No additional error detail was recorded.",
      failed: true
    };
  }

  const meaningfulEvents = trace.harness_events.filter((event) =>
    ["model_action", "policy_check", "tool_execution", "observation", "error", "finish"].includes(text(event.type, ""))
  );
  const event = meaningfulEvents[meaningfulEvents.length - 1];
  if (!event) {
    return {
      eventId: `stage-${run.id}-${run.current_stage || run.status}`,
      phaseLabel: phaseLabel(currentPhaseIndex),
      title: text(run.current_stage, "Initializing"),
      tool: "harness",
      status: run.status,
      actor: "harness",
      summary: "The harness is preparing the company profile and research plan.",
      code: `load_company_profile({ slug: "mr-plumber-sg" })`,
      policy: "Profile JSON must validate before Reddit tools can run.",
      observation: text(run.current_stage, "Queued"),
      failed: false
    };
  }

  const callId = text(event.call_id, "");
  const eventIndex = trace.harness_events.lastIndexOf(event);
  const previousEvents = trace.harness_events.slice(0, eventIndex + 1).reverse();
  const matchingPolicy = previousEvents.find(
    (candidate) => candidate.type === "policy_check" && (callId ? candidate.call_id === callId : candidate.tool === event.tool)
  );
  const matchingObservation = previousEvents.find(
    (candidate) => candidate.type === "observation" && (callId ? candidate.call_id === callId : candidate.tool === event.tool)
  );

  return {
    eventId: text(event.id, `event-${trace.harness_events.length}`),
    phaseLabel: phaseLabel(currentPhaseIndex),
    title: actionTitle(event),
    tool: text(event.tool, "harness"),
    status: text(event.status, run.status),
    actor: text(event.actor, "harness"),
    summary: text(event.summary, ""),
    code: actionCode(event),
    policy: policySummary(matchingPolicy, event),
    observation: observationSummary(matchingObservation, event),
    failed: text(event.status, "") === "failed" || text(event.type, "") === "error"
  };
}

function actionTitle(event: TraceRecord) {
  const type = text(event.type, "");
  const tool = text(event.tool, "harness");
  if (type === "model_action") return `Model requested ${tool}`;
  if (type === "policy_check") return "Harness policy check";
  if (type === "tool_execution") return `Tool running: ${tool}`;
  if (type === "observation") return `Tool returned: ${tool}`;
  if (type === "finish") return "Harness stopped";
  if (type === "error") return `Harness error: ${tool}`;
  return text(event.label, "Harness action");
}

function actionCode(event: TraceRecord) {
  const input = asRecord(event.input);
  const output = asRecord(event.output);
  const tool = text(event.tool, "harness");
  if (tool === "search_reddit") {
    return [
      "search_reddit({",
      `  subreddit: ${JSON.stringify(formatSubreddit(input.subreddit))},`,
      `  query: ${JSON.stringify(text(input.query, ""))},`,
      `  reason: ${JSON.stringify(text(input.reason, ""))}`,
      "})"
    ].join("\n");
  }
  if (tool === "fetch_thread") {
    return [
      "fetch_thread({",
      `  reddit_id: ${JSON.stringify(text(input.reddit_id, ""))},`,
      `  reason: ${JSON.stringify(text(input.reason, ""))}`,
      "})"
    ].join("\n");
  }
  if (tool === "record_decision") {
    return [
      "record_decision({",
      `  type: ${JSON.stringify(text(input.type, ""))},`,
      `  subject: ${JSON.stringify(text(input.subject, ""))},`,
      `  confidence: ${number(input.confidence, 0)}`,
      "})"
    ].join("\n");
  }
  if (tool === "final_judge") {
    return [
      "final_judge({",
      `  candidate_count: ${number(input.candidate_count, number(output.candidate_count, 0))},`,
      `  selected_threads: ${number(output.selected_threads, 0)},`,
      `  rejected_threads: ${number(output.rejected_threads, 0)}`,
      "})"
    ].join("\n");
  }
  return text(event.summary, "harness.step()");
}

function policySummary(policyEvent: TraceRecord | undefined, event: TraceRecord) {
  if (!policyEvent && event.tool === "final_judge") {
    return "judge step: final selection runs after the research loop has fetched evidence.";
  }
  if (!policyEvent) return "Waiting for harness policy check.";
  const policy = asRecord(policyEvent.policy);
  const verdict = policy.allowed === false ? "blocked" : "allowed";
  return `${verdict}: ${text(policy.reason, text(policyEvent.summary, ""))}`;
}

function observationSummary(observationEvent: TraceRecord | undefined, fallback: TraceRecord) {
  if (observationEvent) return text(observationEvent.summary, "");
  if (fallback.type === "observation") return text(fallback.summary, "");
  return "Waiting for tool observation.";
}
