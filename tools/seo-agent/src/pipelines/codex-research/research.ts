import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { loadEnv, rootDir } from "../../config.js";
import {
  CodexContentBriefSchema,
  type CodexContentBrief,
  type CodexResearchAngle,
  type CodexResearchExecutionMode,
  type CodexResearchTrace,
  type CodexSourceSignal,
  type CodexTraceEvent,
  type RedditCompanyProfile
} from "../../schemas.js";
import { generateStructuredWithResponses } from "../../lib/openai-responses-client.js";
import { AgentHarness, type AnyHarnessTool } from "../reddit-intelligence/harness.js";
import { extractQueries, extractUrlsFromText, normalizeCodexEvent } from "./normalizer.js";

loadEnv();

export type CodexSelectedRedditThread = {
  id?: string;
  reddit_id: string;
  subreddit: string;
  title: string;
  url: string;
  why_relevant: string;
  thread_content: string;
  relevance_score?: number;
  urgency_score?: number;
  commercial_intent_score?: number;
};

export type CodexSubagentResult = {
  id: string;
  label: string;
  angle: string;
  prompt: string;
  status: "completed" | "failed";
  raw_jsonl: string;
  normalized_events: CodexTraceEvent[];
  final_answer: string;
  trusted_sources: CodexSourceSignal[];
  ignored_sources: CodexSourceSignal[];
  error?: string;
};

export type CodexResearchSnapshot = {
  executionMode: CodexResearchExecutionMode;
  trace: CodexResearchTrace;
  subagents: CodexSubagentResult[];
  contentBrief: CodexContentBrief | null;
  proposedSkillDiff: string;
  currentStage: string;
};

export type RunCodexResearchOptions = {
  selectedThread: CodexSelectedRedditThread;
  profile: RedditCompanyProfile;
  forceVirtual?: boolean;
  onUpdate?: (snapshot: CodexResearchSnapshot) => Promise<void> | void;
};

function nowIso() {
  return new Date().toISOString();
}

function truncate(value: string, max = 420) {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

function eventId(prefix: string, index: number) {
  return `${prefix}-${index + 1}`;
}

function makeEvent(value: Omit<CodexTraceEvent, "id" | "timestamp" | "input" | "output"> & { input?: Record<string, unknown>; output?: Record<string, unknown> }, index: number): CodexTraceEvent {
  return {
    id: eventId("codex", index),
    timestamp: nowIso(),
    input: {},
    output: {},
    ...value
  };
}

function parseMarkdownList(sectionName: string, markdown: string) {
  const pattern = new RegExp(`(?:^|\\n)#+\\s*${sectionName}\\s*\\n([\\s\\S]*?)(?=\\n#+\\s|$)`, "i");
  const match = markdown.match(pattern);
  if (!match?.[1]) return [];
  return match[1]
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

function sourceSignalsFromAnswer(answer: string, agentLabel: string, fallbackTitle: string): CodexSourceSignal[] {
  const urls = extractUrlsFromText(answer);
  if (urls.length) {
    return urls.slice(0, 5).map((url, index) => ({
      title: `Source ${index + 1}`,
      url,
      reason: "Codex referenced this URL in its final answer.",
      agent_label: agentLabel
    }));
  }

  return parseMarkdownList("Trusted sources", answer)
    .slice(0, 4)
    .map((line) => ({
      title: line,
      url: "",
      reason: "Codex named this as a trusted source pattern.",
      agent_label: agentLabel
    }))
    .concat(
      answer.trim()
        ? []
        : [
            {
              title: fallbackTitle,
              url: "",
              reason: "No explicit source was emitted; keeping the angle as a source-gap signal.",
              agent_label: agentLabel
            }
          ]
    );
}

function ignoredSignalsFromAnswer(answer: string, agentLabel: string): CodexSourceSignal[] {
  return parseMarkdownList("Ignored sources", answer)
    .slice(0, 4)
    .map((line) => ({
      title: line,
      url: "",
      reason: "Codex marked this pattern as weak or less useful.",
      agent_label: agentLabel
    }));
}

function defaultResearchAngles(thread: CodexSelectedRedditThread, profile: RedditCompanyProfile, skill: string): CodexResearchAngle[] {
  const baseContext = [
    `Company: ${profile.company.name}`,
    `Industry: ${profile.industry.primary_category}`,
    `Reddit thread: ${thread.title}`,
    `Subreddit: r/${thread.subreddit}`,
    `Why it matters: ${thread.why_relevant}`,
    `Thread excerpt: ${truncate(thread.thread_content || thread.title, 1800)}`,
    `Current AEO skill:\n${truncate(skill, 2200)}`
  ].join("\n\n");

  const specs = [
    {
      id: "urgent-buyer",
      label: "Agent A",
      angle: "Urgent buyer / immediate fix",
      objective: "Find what a panicking Singapore homeowner needs in the first 10 minutes and what would make them trust a plumber."
    },
    {
      id: "responsibility-context",
      label: "Agent B",
      angle: "Responsibility / HDB / condo / landlord context",
      objective: "Find how agents resolve who is responsible for payment, evidence, HDB, MCST, upstairs-neighbour, or landlord scenarios."
    },
    {
      id: "vendor-diy",
      label: "Agent C",
      angle: "Vendor comparison / DIY vs professional help",
      objective: "Find what separates safe DIY advice from situations where agents recommend a professional plumber."
    }
  ];

  return specs.map((spec) => ({
    ...spec,
    prompt: [
      "You are a Codex research subagent for Peekaboo. Research only; do not edit files.",
      "Use observable research behavior: search, inspect, compare, and then report concise findings.",
      "Do not reveal hidden reasoning. Report visible decisions, sources, and source-quality judgments.",
      baseContext,
      `Your angle: ${spec.angle}`,
      `Objective: ${spec.objective}`,
      "Return markdown with these exact headings:",
      "## Search patterns",
      "## Trusted sources",
      "## Ignored sources",
      "## Content gaps",
      "## Recommendation"
    ].join("\n\n")
  }));
}

async function loadSkillMarkdown(profileSlug = "mr-plumber-sg") {
  const skillPath = path.join(rootDir, "skills", `${profileSlug}-aeo.md`);
  try {
    return await fs.readFile(skillPath, "utf8");
  } catch {
    return "";
  }
}

async function pathExists(candidate: string) {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function resolveWorkspaceRoot() {
  const starts = [process.cwd(), rootDir, path.resolve(rootDir, "..", "..")];
  for (const start of starts) {
    let current = path.resolve(start);
    for (let index = 0; index < 8; index++) {
      if (await pathExists(path.join(current, ".git"))) return current;
      const next = path.dirname(current);
      if (next === current) break;
      current = next;
    }
  }
  return path.resolve(rootDir, "..", "..");
}

function emptyTrace(plan: CodexResearchAngle[]): CodexResearchTrace {
  return {
    plan,
    events: [],
    trusted_sources: [],
    ignored_sources: [],
    repeated_queries: [],
    missing_content_opportunities: [],
    summary: ""
  };
}

async function emit(snapshot: CodexResearchSnapshot, onUpdate?: RunCodexResearchOptions["onUpdate"]) {
  await onUpdate?.({
    ...snapshot,
    trace: {
      ...snapshot.trace,
      events: [...snapshot.trace.events],
      trusted_sources: [...snapshot.trace.trusted_sources],
      ignored_sources: [...snapshot.trace.ignored_sources],
      repeated_queries: [...snapshot.trace.repeated_queries],
      missing_content_opportunities: [...snapshot.trace.missing_content_opportunities]
    },
    subagents: snapshot.subagents.map((agent) => ({
      ...agent,
      normalized_events: [...agent.normalized_events],
      trusted_sources: [...agent.trusted_sources],
      ignored_sources: [...agent.ignored_sources]
    }))
  });
}

function finalAnswerFromEvents(events: CodexTraceEvent[]) {
  return [...events]
    .reverse()
    .map((event) => (typeof event.output.text === "string" ? event.output.text : event.summary))
    .find((value) => value && eventLooksLikeAnswer(value)) || "";
}

function eventLooksLikeAnswer(value: string) {
  return value.includes("##") || value.length > 80;
}

async function runRealCodexSubagent(angle: CodexResearchAngle, cwd: string, onEvent: (event: CodexTraceEvent) => Promise<void> | void): Promise<CodexSubagentResult> {
  const command = process.env.CODEX_EXEC_COMMAND || "codex";
  const args = ["exec", "--json", "--ephemeral", "--sandbox", "read-only", angle.prompt];
  const timeoutMs = Number(process.env.CODEX_EXEC_TIMEOUT_MS || 180_000);
  let rawJsonl = "";
  let stderr = "";
  const events: CodexTraceEvent[] = [];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: process.platform === "win32",
      env: process.env
    });
    let buffer = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${angle.label} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      rawJsonl += text;
      buffer += text;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const raw = JSON.parse(trimmed) as Record<string, unknown>;
          const normalized = normalizeCodexEvent(raw, { agentId: angle.id, agentLabel: angle.label }, events.length);
          if (normalized) {
            events.push(normalized);
            void onEvent(normalized);
          }
        } catch {
          const normalized = normalizeCodexEvent(
            { type: "error", message: `Could not parse Codex JSONL line: ${trimmed.slice(0, 160)}` },
            { agentId: angle.id, agentLabel: angle.label },
            events.length
          );
          if (normalized) {
            events.push(normalized);
            void onEvent(normalized);
          }
        }
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (buffer.trim()) {
        try {
          const raw = JSON.parse(buffer.trim()) as Record<string, unknown>;
          const normalized = normalizeCodexEvent(raw, { agentId: angle.id, agentLabel: angle.label }, events.length);
          if (normalized) events.push(normalized);
        } catch {
          // Ignore trailing non-JSON fragments; stderr is preserved in the thrown error when the process fails.
        }
      }
      if (code !== 0) {
        reject(new Error(`${angle.label} exited with code ${code}. ${stderr.trim()}`.trim()));
        return;
      }
      resolve();
    });
  });

  if (!events.length) throw new Error(`${angle.label} produced no normalized Codex events.`);
  const finalAnswer = finalAnswerFromEvents(events);

  return {
    id: angle.id,
    label: angle.label,
    angle: angle.angle,
    prompt: angle.prompt,
    status: "completed",
    raw_jsonl: rawJsonl,
    normalized_events: events,
    final_answer: finalAnswer,
    trusted_sources: sourceSignalsFromAnswer(finalAnswer, angle.label, angle.angle),
    ignored_sources: ignoredSignalsFromAnswer(finalAnswer, angle.label)
  };
}

function fallbackFinalAnswer(angle: CodexResearchAngle, thread: CodexSelectedRedditThread) {
  return [
    "## Search patterns",
    `- ${thread.title}`,
    "- HDB plumber emergency Singapore",
    "- ceiling leak responsibility HDB MCST plumber",
    "",
    "## Trusted sources",
    "- Singapore-specific pages that answer responsibility, evidence, first steps, and when to call a plumber.",
    "- Official HDB/MCST-style guidance where responsibility or evidence collection is involved.",
    "",
    "## Ignored sources",
    "- Generic listicles with no HDB, condo, cost, or emergency context.",
    "- DIY pages that do not explain when water damage requires a professional.",
    "",
    "## Content gaps",
    `- ${angle.objective}`,
    "- Clear responsibility matrix and first-10-minutes action checklist.",
    "",
    "## Recommendation",
    `- Build content around "${thread.title}" with Singapore responsibility context and plain emergency steps.`
  ].join("\n");
}

function virtualTools(thread: CodexSelectedRedditThread): AnyHarnessTool[] {
  return [
    {
      definition: {
        type: "function",
        name: "search_web",
        description: "Record a visible web-style search query and return likely source patterns for the demo fallback.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            query: { type: "string" },
            reason: { type: "string" }
          },
          required: ["query", "reason"]
        }
      },
      parse: (raw) => JSON.parse(raw) as { query: string; reason: string },
      execute: (input) => ({
        query: input.query,
        results: [
          { title: "HDB responsibility guidance", url: "", reason: "Likely trusted for ownership and evidence rules." },
          { title: "Singapore plumber emergency page", url: "", reason: "Likely useful if it gives steps, costs, and response windows." },
          { title: thread.title, url: thread.url, reason: "Original Reddit pain signal." }
        ]
      }),
      summarizeInput: (input) => `search_web("${input.query}")`,
      summarizeOutput: (output) => `Returned ${(output.results as unknown[] | undefined)?.length || 0} fallback result patterns.`
    },
    {
      definition: {
        type: "function",
        name: "record_decision",
        description: "Record a visible source or content decision for the trace.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            label: { type: "string" },
            rationale: { type: "string" }
          },
          required: ["label", "rationale"]
        }
      },
      parse: (raw) => JSON.parse(raw) as { label: string; rationale: string },
      execute: async (input, context) => {
        await context.recordDecision(input.label, input.rationale, input);
        return { recorded: true };
      },
      summarizeInput: (input) => `${input.label}: ${input.rationale}`,
      summarizeOutput: () => "Decision recorded."
    },
    {
      definition: {
        type: "function",
        name: "finish_research",
        description: "Stop the fallback research loop.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            reason: { type: "string" }
          },
          required: ["reason"]
        }
      },
      parse: (raw) => JSON.parse(raw) as { reason: string },
      execute: (input, context) => {
        context.finish(input.reason);
        return { finished: true, reason: input.reason };
      },
      summarizeInput: (input) => input.reason,
      summarizeOutput: () => "Fallback research finished."
    }
  ];
}

async function runVirtualSubagent(angle: CodexResearchAngle, thread: CodexSelectedRedditThread, onEvent: (event: CodexTraceEvent) => Promise<void> | void): Promise<CodexSubagentResult> {
  const events: CodexTraceEvent[] = [];
  const finalAnswer = fallbackFinalAnswer(angle, thread);

  if (process.env.OPENAI_API_KEY && process.env.CODEX_RESEARCH_DETERMINISTIC !== "true") {
    try {
      const harness = new AgentHarness({
        objective: `${angle.label}: ${angle.objective}`,
        systemInstruction: "You are a visible research harness fallback. Use tools to record observable searches and decisions. Do not reveal hidden reasoning.",
        prompt: `${angle.prompt}\n\nUse search_web at least once, record one decision, then finish_research.`,
        tools: virtualTools(thread),
        maxTurns: 4,
        maxToolCalls: 8,
        onEvent: async (event) => {
          const normalized: CodexTraceEvent = {
            id: `${angle.id}-${event.id}`,
            timestamp: event.timestamp,
            phase: event.type === "decision" ? "judging" : "researching",
            actor: event.actor,
            type: event.type,
            label: event.label,
            summary: event.summary,
            status: event.status || "completed",
            agent_id: angle.id,
            agent_label: angle.label,
            input: event.input || {},
            output: event.output || {}
          };
          events.push(normalized);
          await onEvent(normalized);
        }
      });
      await harness.run();
    } catch {
      // Deterministic fallback below still produces a demo-safe trace.
    }
  }

  if (!events.length) {
    const synthetic = [
      makeEvent(
        {
          phase: "researching",
          actor: "codex",
          type: "web_search",
          label: "Fallback search",
          summary: `Searched for "${thread.title}" from ${angle.angle}.`,
          status: "completed",
          agent_id: angle.id,
          agent_label: angle.label,
          input: { query: thread.title },
          output: {}
        },
        0
      ),
      makeEvent(
        {
          phase: "answering",
          actor: "codex",
          type: "agent_message",
          label: "Fallback answer",
          summary: truncate(finalAnswer),
          status: "completed",
          agent_id: angle.id,
          agent_label: angle.label,
          output: { text: finalAnswer }
        },
        1
      )
    ];
    events.push(...synthetic);
    for (const event of synthetic) await onEvent(event);
  }

  return {
    id: angle.id,
    label: angle.label,
    angle: angle.angle,
    prompt: angle.prompt,
    status: "completed",
    raw_jsonl: events.map((event) => JSON.stringify(event)).join("\n"),
    normalized_events: events,
    final_answer: finalAnswer,
    trusted_sources: sourceSignalsFromAnswer(finalAnswer, angle.label, angle.angle),
    ignored_sources: ignoredSignalsFromAnswer(finalAnswer, angle.label)
  };
}

function defaultBrief(thread: CodexSelectedRedditThread, trace: CodexResearchTrace): CodexContentBrief {
  return {
    title: `${thread.title}: Singapore homeowner guide`,
    audience: "Singapore HDB, condo, landlord, and homeowner searchers facing an urgent plumbing problem.",
    promise: "Explain what to do first, who is responsible, when DIY is unsafe, and when to call Mr Plumber SG.",
    sections: [
      "First 10 minutes: stop water damage and stay safe",
      "Who is responsible: HDB, condo MCST, landlord, upstairs neighbour, or owner",
      "Safe DIY checks vs call-a-plumber boundaries",
      "Evidence checklist before contacting HDB, MCST, landlord, or neighbour",
      "When emergency plumber response is worth it"
    ],
    questions_to_answer: [
      "What should I do immediately?",
      "Who pays if the leak affects another unit?",
      "What evidence should I collect?",
      "When is DIY risky?",
      "What should a plumber inspect first?"
    ],
    citation_targets: trace.trusted_sources.map((source) => source.title).slice(0, 6),
    content_rules: [
      "Lead with emergency steps before brand copy.",
      "Include HDB/condo/landlord responsibility context.",
      "Use a responsibility matrix and evidence checklist.",
      "Explain clear DIY boundaries."
    ],
    agent_findings: trace.missing_content_opportunities.slice(0, 8)
  };
}

async function buildContentBrief(thread: CodexSelectedRedditThread, trace: CodexResearchTrace) {
  const fallback = defaultBrief(thread, trace);
  if (!process.env.OPENAI_API_KEY || process.env.CODEX_RESEARCH_DETERMINISTIC === "true") return fallback;

  try {
    const brief = await generateStructuredWithResponses<CodexContentBrief>({
      schemaName: "codex_content_brief",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          audience: { type: "string" },
          promise: { type: "string" },
          sections: { type: "array", items: { type: "string" } },
          questions_to_answer: { type: "array", items: { type: "string" } },
          citation_targets: { type: "array", items: { type: "string" } },
          content_rules: { type: "array", items: { type: "string" } },
          agent_findings: { type: "array", items: { type: "string" } }
        },
        required: ["title", "audience", "promise", "sections", "questions_to_answer", "citation_targets", "content_rules", "agent_findings"]
      },
      systemInstruction: "Create concise AEO content briefs from observable agent traces. Do not include hidden chain-of-thought.",
      userPrompt: JSON.stringify({ thread, trace }, null, 2),
      maxOutputTokens: 1800
    });
    return CodexContentBriefSchema.parse(brief);
  } catch {
    return fallback;
  }
}

function buildSkillDiff(brief: CodexContentBrief, trace: CodexResearchTrace) {
  const trusted = trace.trusted_sources.map((source) => `+- Agents trusted: ${source.title} - ${source.reason}`).slice(0, 5);
  const ignored = trace.ignored_sources.map((source) => `+- Agents ignored: ${source.title} - ${source.reason}`).slice(0, 5);
  const rules = brief.content_rules.map((rule) => `+- ${rule}`).slice(0, 8);

  return [
    "## Proposed Skill Diff",
    "",
    "```diff",
    "+## Learned From Latest Codex Run",
    ...trusted,
    ...ignored,
    "+",
    "+## Updated Content Rules",
    ...rules,
    "```"
  ].join("\n");
}

function summarizeTrace(trace: CodexResearchTrace, mode: CodexResearchExecutionMode) {
  return `Ran ${trace.plan.length} Codex subagents in ${mode} mode, captured ${trace.events.length} visible events, and found ${trace.trusted_sources.length} trusted source signals.`;
}

async function runSubagents({
  angles,
  thread,
  snapshot,
  onUpdate
}: {
  angles: CodexResearchAngle[];
  thread: CodexSelectedRedditThread;
  snapshot: CodexResearchSnapshot;
  onUpdate?: RunCodexResearchOptions["onUpdate"];
}) {
  const cwd = await resolveWorkspaceRoot();
  for (const angle of angles) {
    const onEvent = async (event: CodexTraceEvent) => {
      snapshot.trace.events.push(event);
      snapshot.currentStage = `${angle.label}: ${event.label}`;
      await emit(snapshot, onUpdate);
    };

    const result =
      snapshot.executionMode === "real_codex"
        ? await runRealCodexSubagent(angle, cwd, onEvent)
        : await runVirtualSubagent(angle, thread, onEvent);

    snapshot.subagents.push(result);
    snapshot.trace.trusted_sources.push(...result.trusted_sources);
    snapshot.trace.ignored_sources.push(...result.ignored_sources);
    snapshot.trace.repeated_queries = [...new Set([...snapshot.trace.repeated_queries, ...extractQueries(result.normalized_events), ...parseMarkdownList("Search patterns", result.final_answer)])].slice(0, 20);
    snapshot.trace.missing_content_opportunities = [
      ...new Set([...snapshot.trace.missing_content_opportunities, ...parseMarkdownList("Content gaps", result.final_answer)])
    ].slice(0, 20);
    await emit(snapshot, onUpdate);
  }
}

export async function runCodexResearch(options: RunCodexResearchOptions) {
  const skill = await loadSkillMarkdown();
  const plan = defaultResearchAngles(options.selectedThread, options.profile, skill);
  const snapshot: CodexResearchSnapshot = {
    executionMode: options.forceVirtual ? "virtual_fallback" : "real_codex",
    trace: emptyTrace(plan),
    subagents: [],
    contentBrief: null,
    proposedSkillDiff: "",
    currentStage: "Master Codex created research angles"
  };

  snapshot.trace.events.push(
    makeEvent(
      {
        phase: "planning",
        actor: "master_codex",
        type: "plan",
        label: "Master Codex planned subagents",
        summary: "Created 3 research angles: urgent buyer, responsibility context, and vendor/DIY comparison.",
        status: "completed",
        output: { plan }
      },
      snapshot.trace.events.length
    )
  );
  await emit(snapshot, options.onUpdate);

  try {
    await runSubagents({ angles: plan, thread: options.selectedThread, snapshot, onUpdate: options.onUpdate });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    snapshot.trace.events.push(
      makeEvent(
        {
          phase: "fallback",
          actor: "harness",
          type: "fallback",
          label: "Switched to virtual fallback",
          summary: `Real Codex was unavailable: ${message}`,
          status: "completed",
          output: { error: message }
        },
        snapshot.trace.events.length
      )
    );
    snapshot.executionMode = "virtual_fallback";
    snapshot.subagents = [];
    snapshot.currentStage = "Running virtual fallback subagents";
    await emit(snapshot, options.onUpdate);
    await runSubagents({ angles: plan, thread: options.selectedThread, snapshot, onUpdate: options.onUpdate });
  }

  snapshot.currentStage = "Analyzing Codex traces";
  snapshot.contentBrief = await buildContentBrief(options.selectedThread, snapshot.trace);
  snapshot.proposedSkillDiff = buildSkillDiff(snapshot.contentBrief, snapshot.trace);
  snapshot.trace.summary = summarizeTrace(snapshot.trace, snapshot.executionMode);
  snapshot.currentStage = "Completed Codex research";
  await emit(snapshot, options.onUpdate);

  return snapshot;
}
