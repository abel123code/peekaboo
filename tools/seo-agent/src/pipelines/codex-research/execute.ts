import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnv } from "../../config.js";
import { loadRedditCompanyProfile } from "../reddit-intelligence/investigation.js";
import { runCodexResearch, type CodexSelectedRedditThread, type CodexResearchSnapshot } from "./research.js";

type CodexResearchRunRow = {
  id: string;
  selected_reddit_thread: unknown;
};

function createCodexSupabase() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function number(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function selectedThreadFromJson(value: unknown): CodexSelectedRedditThread {
  const record = asRecord(value);
  const thread: CodexSelectedRedditThread = {
    id: text(record.id, ""),
    reddit_id: text(record.reddit_id, text(record.redditId, "selected-thread")),
    subreddit: text(record.subreddit, "singapore"),
    title: text(record.title, "Selected Reddit thread"),
    url: text(record.url, "https://www.reddit.com"),
    why_relevant: text(record.why_relevant || record.whyRelevant, "Selected by Module 1 as a high-signal Reddit pain point."),
    thread_content: text(record.thread_content || record.threadContent, text(record.why_relevant, "")),
    relevance_score: number(record.relevance_score, 0),
    urgency_score: number(record.urgency_score, 0),
    commercial_intent_score: number(record.commercial_intent_score, 0)
  };
  if (!thread.title || !thread.url) throw new Error("Codex research run is missing a selected Reddit thread snapshot.");
  return thread;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function updateRun(supabase: SupabaseClient, runId: string, patch: Record<string, unknown>) {
  const { error } = await supabase.from("codex_research_runs").update(patch).eq("id", runId);
  if (error) throw new Error(error.message);
}

function summaryFromSnapshot(snapshot: CodexResearchSnapshot) {
  return {
    execution_mode: snapshot.executionMode,
    event_count: snapshot.trace.events.length,
    subagent_count: snapshot.subagents.length,
    trusted_source_count: snapshot.trace.trusted_sources.length,
    ignored_source_count: snapshot.trace.ignored_sources.length,
    repeated_query_count: snapshot.trace.repeated_queries.length,
    summary: snapshot.trace.summary
  };
}

async function persistSubagents(supabase: SupabaseClient, runId: string, snapshot: CodexResearchSnapshot) {
  await supabase.from("codex_subagent_runs").delete().eq("run_id", runId);
  if (!snapshot.subagents.length) return;

  const { error } = await supabase.from("codex_subagent_runs").insert(
    snapshot.subagents.map((agent) => ({
      run_id: runId,
      agent_id: agent.id,
      agent_label: agent.label,
      angle: agent.angle,
      prompt: agent.prompt,
      status: agent.status,
      raw_jsonl: agent.raw_jsonl,
      normalized_events: agent.normalized_events,
      final_answer: agent.final_answer,
      trusted_sources: agent.trusted_sources,
      ignored_sources: agent.ignored_sources,
      error: agent.error || null
    }))
  );
  if (error) throw new Error(error.message);
}

export async function executeCodexResearchRun(
  runId: string,
  {
    triggerRunId,
    forceVirtual
  }: {
    triggerRunId?: string | null;
    forceVirtual?: boolean;
  } = {}
) {
  loadEnv();
  const supabase = createCodexSupabase();

  const { data: run, error: runError } = await supabase
    .from("codex_research_runs")
    .select("*")
    .eq("id", runId)
    .single<CodexResearchRunRow>();
  if (runError || !run) throw new Error(runError?.message || `Codex research run not found: ${runId}`);

  const selectedThread = selectedThreadFromJson(run.selected_reddit_thread);

  await updateRun(supabase, run.id, {
    status: "running",
    current_stage: "loading company profile",
    started_at: new Date().toISOString(),
    error: null,
    ...(triggerRunId ? { trigger_run_id: triggerRunId } : {})
  });

  try {
    const profile = await loadRedditCompanyProfile();
    await updateRun(supabase, run.id, {
      company_profile_snapshot: profile,
      current_stage: "starting Master Codex"
    });

    const result = await runCodexResearch({
      selectedThread,
      profile,
      forceVirtual,
      onUpdate: async (snapshot) => {
        await updateRun(supabase, run.id, {
          status: "running",
          execution_mode: snapshot.executionMode,
          current_stage: snapshot.currentStage,
          normalized_trace: snapshot.trace,
          content_brief: snapshot.contentBrief || {},
          proposed_skill_diff: snapshot.proposedSkillDiff,
          summary: summaryFromSnapshot(snapshot)
        });
      }
    });

    await persistSubagents(supabase, run.id, result);

    await updateRun(supabase, run.id, {
      status: "completed",
      current_stage: null,
      execution_mode: result.executionMode,
      normalized_trace: result.trace,
      content_brief: result.contentBrief || {},
      proposed_skill_diff: result.proposedSkillDiff,
      summary: summaryFromSnapshot(result),
      completed_at: new Date().toISOString(),
      error: null
    });

    return {
      runId: run.id,
      executionMode: result.executionMode,
      eventCount: result.trace.events.length,
      subagentCount: result.subagents.length
    };
  } catch (error) {
    await updateRun(supabase, run.id, {
      status: "failed",
      current_stage: "failed",
      error: getErrorMessage(error)
    });
    throw error;
  }
}
