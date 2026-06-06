import { createSupabaseAdmin } from "./supabase-admin";
import type { CodexResearchRun, CodexSubagentRun, RedditThread } from "./database.types";
import {
  asTrace,
  deriveCodexDemo,
  toRunSummary,
  toSubagentSummary,
  toThreadChoice,
  type CodexLatestPayload
} from "./codex-demo";

export async function loadLatestCodexResearch(runId?: string | null): Promise<CodexLatestPayload> {
  const supabase = createSupabaseAdmin();
  const query = supabase.from("codex_research_runs").select("*").order("created_at", { ascending: false }).limit(10);
  const { data: runs, error: runsError } = runId ? await query.eq("id", runId) : await query;
  if (runsError) throw new Error(runsError.message);

  const typedRuns = (runs || []) as CodexResearchRun[];
  const latestRun = typedRuns[0] || null;
  let subagents: CodexSubagentRun[] = [];

  if (latestRun) {
    const { data: subagentRows, error: subagentError } = await supabase
      .from("codex_subagent_runs")
      .select("*")
      .eq("run_id", latestRun.id)
      .order("agent_label", { ascending: true });
    if (subagentError) throw new Error(subagentError.message);
    subagents = (subagentRows || []) as CodexSubagentRun[];
  }

  const { data: threadRows, error: threadsError } = await supabase
    .from("reddit_threads")
    .select("*")
    .order("relevance_score", { ascending: false })
    .limit(8);
  if (threadsError) throw new Error(threadsError.message);

  const runSummaries = typedRuns.map(toRunSummary);
  const latestRunSummary = latestRun ? toRunSummary(latestRun) : null;
  const subagentSummaries = subagents.map(toSubagentSummary);
  const trace = asTrace(latestRun?.normalized_trace || {});

  return {
    runs: runSummaries,
    latestRun: latestRunSummary,
    subagents: subagentSummaries,
    redditThreads: ((threadRows || []) as RedditThread[]).map(toThreadChoice),
    trace,
    demo: deriveCodexDemo(latestRunSummary, trace, subagentSummaries)
  };
}
