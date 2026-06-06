import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnv } from "../../config.js";
import { loadRedditCompanyProfile, runRedditInvestigation } from "./investigation.js";
import type { RedditInvestigationSelectedThread, RedditInvestigationTrace } from "../../schemas.js";

type RedditRunRow = {
  id: string;
  profile_slug: string;
};

function createRedditSupabase() {
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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function updateRun(supabase: SupabaseClient, runId: string, patch: Record<string, unknown>) {
  const { error } = await supabase.from("reddit_intelligence_runs").update(patch).eq("id", runId);
  if (error) throw new Error(error.message);
}

function threadMetadata(thread: RedditInvestigationSelectedThread, trace: RedditInvestigationTrace) {
  return {
    selected_decision: trace.decisions.find(
      (decision) =>
        typeof decision.subject === "string" &&
        (decision.subject === thread.title || decision.subject.toLowerCase().includes(thread.title.toLowerCase().slice(0, 40)))
    ),
    trace_summary: trace.summary
  };
}

export async function executeRedditIntelligenceRun(
  runId: string,
  {
    triggerRunId
  }: {
    triggerRunId?: string | null;
  } = {}
) {
  loadEnv();
  const supabase = createRedditSupabase();

  const { data: run, error: runError } = await supabase
    .from("reddit_intelligence_runs")
    .select("*")
    .eq("id", runId)
    .single<RedditRunRow>();
  if (runError || !run) throw new Error(runError?.message || `Reddit intelligence run not found: ${runId}`);

  await updateRun(supabase, run.id, {
    status: "running",
    current_stage: "initializing",
    started_at: new Date().toISOString(),
    error: null,
    ...(triggerRunId ? { trigger_run_id: triggerRunId } : {})
  });

  try {
    const profile = await loadRedditCompanyProfile();
    await updateRun(supabase, run.id, {
      profile_name: profile.company.name,
      company_profile_snapshot: profile,
      summary: {
        profile_name: profile.company.name,
        profile_slug: run.profile_slug
      }
    });

    const result = await runRedditInvestigation(profile, {
      onStageUpdate: async (stage) => {
        await updateRun(supabase, run.id, {
          status: "running",
          current_stage: stage
        });
      },
      onTraceUpdate: async (trace) => {
        await updateRun(supabase, run.id, {
          investigation_trace: trace,
          summary: {
            profile_name: profile.company.name,
            searched_count: trace.tool_calls.filter((call) => call.tool === "search_reddit" && call.status === "completed").length,
            fetched_count: trace.tool_calls.filter((call) => call.tool === "fetch_thread" && call.status === "completed").length,
            decision_count: trace.decisions.length,
            selected_count: trace.selected_threads.length,
            rejected_count: trace.rejected_threads.length,
            summary: trace.summary
          }
        });
      }
    });

    await supabase.from("reddit_threads").delete().eq("run_id", run.id);

    if (result.trace.selected_threads.length) {
      const rows = result.trace.selected_threads.map((thread) => ({
        run_id: run.id,
        reddit_id: thread.reddit_id,
        subreddit: thread.subreddit,
        title: thread.title,
        url: thread.url,
        reddit_score: result.candidates.find((candidate) => candidate.reddit_id === thread.reddit_id)?.reddit_score || 0,
        comment_count: result.candidates.find((candidate) => candidate.reddit_id === thread.reddit_id)?.comment_count || 0,
        created_utc: result.candidates.find((candidate) => candidate.reddit_id === thread.reddit_id)?.created_utc || null,
        relevance_score: thread.relevance_score,
        urgency_score: thread.urgency_score,
        commercial_intent_score: thread.commercial_intent_score,
        why_relevant: thread.why_relevant,
        thread_content: thread.thread_content,
        matched_services: thread.matched_services,
        matched_icps: thread.matched_icps,
        metadata: threadMetadata(thread, result.trace)
      }));
      const { error: insertError } = await supabase.from("reddit_threads").insert(rows);
      if (insertError) throw new Error(insertError.message);
    }

    await updateRun(supabase, run.id, {
      status: "completed",
      current_stage: null,
      investigation_trace: result.trace,
      summary: {
        profile_name: profile.company.name,
        selected_count: result.trace.selected_threads.length,
        rejected_count: result.trace.rejected_threads.length,
        candidate_count: result.candidates.length,
        fetched_count: result.fetched_threads.length,
        summary: result.trace.summary
      },
      completed_at: new Date().toISOString(),
      error: null
    });

    return {
      runId: run.id,
      selectedCount: result.trace.selected_threads.length,
      candidateCount: result.candidates.length
    };
  } catch (error) {
    await updateRun(supabase, run.id, {
      status: "failed",
      error: getErrorMessage(error)
    });
    throw error;
  }
}
