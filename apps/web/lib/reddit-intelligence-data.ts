import { createSupabaseAdmin } from "./supabase-admin";
import type { RedditIntelligenceRun, RedditThread } from "./database.types";
import {
  asTrace,
  deriveRedditDemo,
  toRunSummary,
  toThreadSummary,
  type RedditLatestPayload
} from "./reddit-demo";

export async function loadLatestRedditIntelligence(): Promise<RedditLatestPayload> {
  const supabase = createSupabaseAdmin();
  const { data: runs, error: runsError } = await supabase
    .from("reddit_intelligence_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);
  if (runsError) throw new Error(runsError.message);

  const typedRuns = (runs || []) as RedditIntelligenceRun[];
  const latestRun = typedRuns[0] || null;
  let threads: RedditThread[] = [];

  if (latestRun) {
    const { data: threadRows, error: threadError } = await supabase
      .from("reddit_threads")
      .select("*")
      .eq("run_id", latestRun.id)
      .order("relevance_score", { ascending: false });
    if (threadError) throw new Error(threadError.message);
    threads = (threadRows || []) as RedditThread[];
  }

  const runSummaries = typedRuns.map(toRunSummary);
  const latestRunSummary = latestRun ? toRunSummary(latestRun) : null;
  const threadSummaries = threads.map(toThreadSummary);
  const trace = asTrace(latestRun?.investigation_trace || {});
  const demo = deriveRedditDemo(latestRunSummary, trace, threadSummaries);

  return {
    runs: runSummaries,
    latestRun: latestRunSummary,
    threads: threadSummaries,
    trace,
    demo
  };
}
