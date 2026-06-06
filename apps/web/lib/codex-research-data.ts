import { createSupabaseAdmin } from "./supabase-admin";
import type { AeoAssetRun, CodexResearchRun, CodexSubagentRun, RedditThread } from "./database.types";
import {
  asTrace,
  deriveCodexDemo,
  toAeoAssetRunSummary,
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
  let assetRuns: AeoAssetRun[] = [];

  if (latestRun) {
    const [{ data: subagentRows, error: subagentError }, { data: assetRows, error: assetError }] = await Promise.all([
      supabase
        .from("codex_subagent_runs")
        .select("*")
        .eq("run_id", latestRun.id)
        .order("agent_label", { ascending: true }),
      supabase
        .from("aeo_asset_runs")
        .select("*")
        .eq("codex_run_id", latestRun.id)
        .order("created_at", { ascending: false })
    ]);
    if (subagentError) throw new Error(subagentError.message);
    if (assetError) throw new Error(assetError.message);
    subagents = (subagentRows || []) as CodexSubagentRun[];
    assetRuns = (assetRows || []) as AeoAssetRun[];
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
  const assetRunSummaries = assetRuns.map(toAeoAssetRunSummary);
  const trace = asTrace(latestRun?.normalized_trace || {});

  return {
    runs: runSummaries,
    latestRun: latestRunSummary,
    subagents: subagentSummaries,
    assetRuns: assetRunSummaries,
    latestAssetRun: assetRunSummaries[0] || null,
    redditThreads: ((threadRows || []) as RedditThread[]).map(toThreadChoice),
    trace,
    demo: deriveCodexDemo(latestRunSummary, trace, subagentSummaries)
  };
}
