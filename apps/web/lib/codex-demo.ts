import type { AeoAssetRun, CodexResearchRun, CodexSubagentRun, Json, RedditThread } from "./database.types";

export type TraceRecord = Record<string, unknown>;

export type CodexTrace = {
  plan: TraceRecord[];
  events: TraceRecord[];
  trusted_sources: TraceRecord[];
  ignored_sources: TraceRecord[];
  repeated_queries: string[];
  missing_content_opportunities: string[];
  summary: string;
};

export type CodexRunSummary = Pick<
  CodexResearchRun,
  | "id"
  | "reddit_thread_id"
  | "profile_slug"
  | "status"
  | "execution_mode"
  | "current_stage"
  | "trigger_run_id"
  | "selected_reddit_thread"
  | "content_brief"
  | "proposed_skill_diff"
  | "summary"
  | "error"
  | "started_at"
  | "completed_at"
  | "created_at"
  | "updated_at"
>;

export type CodexSubagentSummary = Pick<
  CodexSubagentRun,
  | "id"
  | "run_id"
  | "agent_id"
  | "agent_label"
  | "angle"
  | "prompt"
  | "status"
  | "normalized_events"
  | "final_answer"
  | "trusted_sources"
  | "ignored_sources"
  | "error"
  | "created_at"
  | "updated_at"
>;

export type AeoAssetRunSummary = Pick<
  AeoAssetRun,
  | "id"
  | "codex_run_id"
  | "status"
  | "current_stage"
  | "trigger_run_id"
  | "idea_index"
  | "selected_idea"
  | "source_pack"
  | "generated_asset"
  | "review_trace"
  | "summary"
  | "error"
  | "started_at"
  | "completed_at"
  | "created_at"
  | "updated_at"
>;

export type RedditThreadChoice = Pick<
  RedditThread,
  | "id"
  | "reddit_id"
  | "subreddit"
  | "title"
  | "url"
  | "relevance_score"
  | "urgency_score"
  | "commercial_intent_score"
  | "why_relevant"
  | "comment_count"
  | "created_at"
>;

export type CodexPhase = {
  id: "case" | "planning" | "subagents" | "analysis" | "brief" | "skill";
  label: string;
  status: "completed" | "active" | "upcoming" | "failed";
};

export type CodexAction = {
  eventId: string;
  phaseLabel: string;
  actor: string;
  agentLabel: string;
  title: string;
  summary: string;
  status: string;
  code: string;
  failed: boolean;
};

export type CodexLane = {
  id: string;
  label: string;
  angle: string;
  prompt: string;
  status: string;
  events: TraceRecord[];
  eventCount: number;
  latestEvent: TraceRecord | null;
  finalAnswer: string;
  trustedSources: TraceRecord[];
  ignoredSources: TraceRecord[];
};

export type CodexDemoModel = {
  isActive: boolean;
  currentPhaseIndex: number;
  phases: CodexPhase[];
  currentAction: CodexAction;
  lanes: CodexLane[];
  sourceAccesses: TraceRecord[];
  trustedSources: TraceRecord[];
  ignoredSources: TraceRecord[];
  repeatedQueries: string[];
  missingContentOpportunities: string[];
  counts: {
    events: number;
    subagents: number;
    sourceAccesses: number;
    trustedSources: number;
    ignoredSources: number;
  };
};

export type CodexLatestPayload = {
  runs: CodexRunSummary[];
  latestRun: CodexRunSummary | null;
  subagents: CodexSubagentSummary[];
  assetRuns: AeoAssetRunSummary[];
  latestAssetRun: AeoAssetRunSummary | null;
  redditThreads: RedditThreadChoice[];
  trace: CodexTrace;
  demo: CodexDemoModel;
};

const phaseSpecs: Array<Pick<CodexPhase, "id" | "label">> = [
  { id: "case", label: "Case selected" },
  { id: "planning", label: "Master Codex planning" },
  { id: "subagents", label: "Subagents researching" },
  { id: "analysis", label: "Trace analysis" },
  { id: "brief", label: "Content brief" },
  { id: "skill", label: "Skill update proposed" }
];

export function asRecord(value: Json | unknown): TraceRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as TraceRecord) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is TraceRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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

export function asTrace(value: Json | unknown): CodexTrace {
  const record = asRecord(value);
  return {
    plan: asArray(record.plan).filter(isRecord),
    events: asArray(record.events).filter(isRecord),
    trusted_sources: asArray(record.trusted_sources).filter(isRecord),
    ignored_sources: asArray(record.ignored_sources).filter(isRecord),
    repeated_queries: asArray(record.repeated_queries).map(String).filter(Boolean),
    missing_content_opportunities: asArray(record.missing_content_opportunities).map(String).filter(Boolean),
    summary: text(record.summary, "")
  };
}

export function toRunSummary(run: CodexResearchRun): CodexRunSummary {
  return {
    id: run.id,
    reddit_thread_id: run.reddit_thread_id,
    profile_slug: run.profile_slug,
    status: run.status,
    execution_mode: run.execution_mode,
    current_stage: run.current_stage,
    trigger_run_id: run.trigger_run_id,
    selected_reddit_thread: run.selected_reddit_thread,
    content_brief: run.content_brief,
    proposed_skill_diff: run.proposed_skill_diff,
    summary: run.summary,
    error: run.error,
    started_at: run.started_at,
    completed_at: run.completed_at,
    created_at: run.created_at,
    updated_at: run.updated_at
  };
}

export function toSubagentSummary(row: CodexSubagentRun): CodexSubagentSummary {
  return {
    id: row.id,
    run_id: row.run_id,
    agent_id: row.agent_id,
    agent_label: row.agent_label,
    angle: row.angle,
    prompt: row.prompt,
    status: row.status,
    normalized_events: row.normalized_events,
    final_answer: row.final_answer,
    trusted_sources: row.trusted_sources,
    ignored_sources: row.ignored_sources,
    error: row.error,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function toAeoAssetRunSummary(row: AeoAssetRun): AeoAssetRunSummary {
  return {
    id: row.id,
    codex_run_id: row.codex_run_id,
    status: row.status,
    current_stage: row.current_stage,
    trigger_run_id: row.trigger_run_id,
    idea_index: row.idea_index,
    selected_idea: row.selected_idea,
    source_pack: row.source_pack,
    generated_asset: row.generated_asset,
    review_trace: row.review_trace,
    summary: row.summary,
    error: row.error,
    started_at: row.started_at,
    completed_at: row.completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function toThreadChoice(row: RedditThread): RedditThreadChoice {
  return {
    id: row.id,
    reddit_id: row.reddit_id,
    subreddit: row.subreddit,
    title: row.title,
    url: row.url,
    relevance_score: row.relevance_score,
    urgency_score: row.urgency_score,
    commercial_intent_score: row.commercial_intent_score,
    why_relevant: row.why_relevant,
    comment_count: row.comment_count,
    created_at: row.created_at
  };
}

function phaseStatus(run: CodexRunSummary | null, current: number, index: number): CodexPhase["status"] {
  if (run?.status === "failed" && index === current) return "failed";
  if (index < current) return "completed";
  if (index === current) return run?.status === "completed" ? "completed" : "active";
  return "upcoming";
}

function currentPhase(run: CodexRunSummary | null, trace: CodexTrace) {
  if (!run) return 0;
  if (run.status === "completed") return run.proposed_skill_diff ? 5 : 4;
  if (run.status === "failed") return Math.max(1, trace.events.length ? 2 : 1);
  const stage = text(run.current_stage, "").toLowerCase();
  if (stage.includes("skill")) return 5;
  if (stage.includes("brief")) return 4;
  if (stage.includes("analyz")) return 3;
  if (stage.includes("agent") || stage.includes("codex") || stage.includes("subagent")) return trace.events.length > 1 ? 2 : 1;
  if (trace.plan.length) return 1;
  return 0;
}

function actionCode(event: TraceRecord) {
  const input = asRecord(event.input);
  if (input.command) return `command_execution({ command: ${JSON.stringify(input.command)} })`;
  if (input.query) return `search({ query: ${JSON.stringify(input.query)} })`;
  if (event.type === "plan") return "master_codex.plan({ subagents: 3 })";
  if (event.type === "fallback") return "harness.switch_to_virtual_fallback()";
  return `${text(event.type, "codex_event")}(${JSON.stringify(input).slice(0, 220)})`;
}

function currentAction(run: CodexRunSummary | null, trace: CodexTrace, phaseIndex: number): CodexAction {
  const latest = [...trace.events].reverse().find((event) => text(event.type, "") !== "turn_completed");
  if (!run || !latest) {
    return {
      eventId: "idle",
      phaseLabel: phaseSpecs[phaseIndex]?.label || "Ready",
      actor: "harness",
      agentLabel: "Master Codex",
      title: "Ready for selected Reddit thread",
      summary: "Choose a Module 1 Reddit thread to start Codex research.",
      status: "idle",
      code: "await codexResearch.start({ thread })",
      failed: false
    };
  }

  return {
    eventId: text(latest.id, "latest"),
    phaseLabel: phaseSpecs[phaseIndex]?.label || "Running",
    actor: text(latest.actor, "codex"),
    agentLabel: text(latest.agent_label, "Master Codex"),
    title: text(latest.label, "Codex event"),
    summary: run.error || text(latest.summary, "Codex is running."),
    status: run.status === "failed" ? "failed" : text(latest.status, run.status),
    code: actionCode(latest),
    failed: run.status === "failed" || text(latest.status, "") === "failed"
  };
}

function lanesFromTrace(trace: CodexTrace, subagents: CodexSubagentSummary[]): CodexLane[] {
  const fromRows = subagents.map((agent) => {
    const events = asArray(agent.normalized_events).filter(isRecord);
    return {
      id: agent.agent_id,
      label: agent.agent_label,
      angle: agent.angle,
      prompt: agent.prompt,
      status: agent.status,
      events,
      eventCount: events.length,
      latestEvent: [...events].reverse()[0] || null,
      finalAnswer: agent.final_answer,
      trustedSources: asArray(agent.trusted_sources).filter(isRecord),
      ignoredSources: asArray(agent.ignored_sources).filter(isRecord)
    };
  });

  const missing = trace.plan
    .filter((plan) => !fromRows.some((lane) => lane.id === text(plan.id, "")))
    .map((plan) => {
      const events = trace.events.filter((event) => text(event.agent_id, "") === text(plan.id, ""));
      return {
        id: text(plan.id, `lane-${fromRows.length}`),
        label: text(plan.label, "Codex agent"),
        angle: text(plan.angle, "Research angle"),
        prompt: text(plan.prompt, ""),
        status: events.length ? text(events.at(-1)?.status, "running") : "queued",
        events,
        eventCount: events.length,
        latestEvent: events.at(-1) || null,
        finalAnswer: "",
        trustedSources: trace.trusted_sources.filter((source) => text(source.agent_label, "") === text(plan.label, "")),
        ignoredSources: trace.ignored_sources.filter((source) => text(source.agent_label, "") === text(plan.label, ""))
      };
    });

  return [...fromRows, ...missing];
}

function urlFromRecord(record: TraceRecord) {
  const input = asRecord(record.input);
  const output = asRecord(record.output);
  return text(input.url || output.url || record.url, "");
}

function titleFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function sourceAccessesFromTrace(trace: CodexTrace) {
  const seen = new Set<string>();
  const sources: TraceRecord[] = [];
  const push = (source: TraceRecord) => {
    const url = urlFromRecord(source);
    if (!url || seen.has(url)) return;
    seen.add(url);
    sources.push(source);
  };

  trace.events
    .filter((event) => text(event.type, "") === "source_access")
    .forEach((event) => {
      const output = asRecord(event.output);
      const url = urlFromRecord(event);
      push({
        id: text(event.id, url),
        title: text(output.title, titleFromUrl(url)),
        url,
        reason: text(output.reason, text(event.summary, "Codex accessed this source during research.")),
        agent_label: text(event.agent_label, ""),
        source_event_id: text(asRecord(event.input).source_event_id, "")
      });
    });

  trace.trusted_sources.forEach((source) => {
    const url = text(source.url, "");
    if (!url) return;
    push({
      id: text(source.id, url),
      title: text(source.title, titleFromUrl(url)),
      url,
      reason: text(source.reason, "Codex listed this as a trusted source."),
      agent_label: text(source.agent_label, "")
    });
  });

  return sources;
}

export function deriveCodexDemo(run: CodexRunSummary | null, trace: CodexTrace, subagents: CodexSubagentSummary[]): CodexDemoModel {
  const phaseIndex = currentPhase(run, trace);
  const lanes = lanesFromTrace(trace, subagents);
  const sourceAccesses = sourceAccessesFromTrace(trace);
  return {
    isActive: run?.status === "queued" || run?.status === "running",
    currentPhaseIndex: phaseIndex,
    phases: phaseSpecs.map((phase, index) => ({
      ...phase,
      status: phaseStatus(run, phaseIndex, index)
    })),
    currentAction: currentAction(run, trace, phaseIndex),
    lanes,
    sourceAccesses,
    trustedSources: trace.trusted_sources,
    ignoredSources: trace.ignored_sources,
    repeatedQueries: trace.repeated_queries,
    missingContentOpportunities: trace.missing_content_opportunities,
    counts: {
      events: trace.events.length,
      subagents: lanes.length,
      sourceAccesses: sourceAccesses.length,
      trustedSources: trace.trusted_sources.length,
      ignoredSources: trace.ignored_sources.length
    }
  };
}
