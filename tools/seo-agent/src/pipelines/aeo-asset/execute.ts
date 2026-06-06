import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnv } from "../../config.js";
import { RedditCompanyProfileSchema, type RedditCompanyProfile } from "../../schemas.js";
import { loadRedditCompanyProfile } from "../reddit-intelligence/investigation.js";
import {
  generateAeoAsset,
  type AeoContentIdea,
  type AeoRedditThread,
  type AeoSource,
  type AeoAssetGenerationResult
} from "./generator.js";

type AeoAssetRunRow = {
  id: string;
  codex_run_id: string;
  idea_index: number;
  selected_idea: unknown;
  source_pack: unknown;
};

type CodexRunRow = {
  id: string;
  status: string;
  selected_reddit_thread: unknown;
  company_profile_snapshot: unknown;
  normalized_trace: unknown;
  content_brief: unknown;
};

function createAeoSupabase() {
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

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function number(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function jsonStrings(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function updateRun(supabase: SupabaseClient, runId: string, patch: Record<string, unknown>) {
  const { error } = await supabase.from("aeo_asset_runs").update(patch).eq("id", runId);
  if (error) throw new Error(error.message);
}

function ideaFromJson(value: unknown): AeoContentIdea {
  const record = asRecord(value);
  const idea = {
    title: text(record.title, ""),
    angle: text(record.angle, ""),
    target_query: text(record.target_query || record.targetQuery, ""),
    rationale: text(record.rationale, ""),
    source_signals: jsonStrings(record.source_signals || record.sourceSignals)
  };
  if (!idea.title || !idea.angle || !idea.rationale) throw new Error("AEO asset run is missing a selected content idea.");
  return idea;
}

function threadFromJson(value: unknown): AeoRedditThread {
  const record = asRecord(value);
  return {
    title: text(record.title, "Selected Reddit thread"),
    subreddit: text(record.subreddit, "askSingapore"),
    url: text(record.url, "https://www.reddit.com"),
    why_relevant: text(record.why_relevant || record.whyRelevant, "Selected as a high-signal Reddit pain point."),
    thread_content: text(record.thread_content || record.threadContent, "")
  };
}

function sourceFromJson(value: unknown): AeoSource | null {
  const record = asRecord(value);
  const url = text(record.url || asRecord(record.input).url || asRecord(record.output).url, "");
  if (!url) return null;
  return {
    title: text(record.title || asRecord(record.output).title, url),
    url,
    reason: text(record.reason || asRecord(record.output).reason || record.summary, "Source accessed during Codex research."),
    agent_label: text(record.agent_label || record.agentLabel, "")
  };
}

function sourcePackFromJson(value: unknown): AeoSource[] {
  const seen = new Set<string>();
  const sources: AeoSource[] = [];
  for (const item of asArray(value)) {
    const source = sourceFromJson(item);
    if (!source || seen.has(source.url)) continue;
    seen.add(source.url);
    sources.push(source);
  }
  return sources.slice(0, 12);
}

function sourcePackFromTrace(traceValue: unknown) {
  const trace = asRecord(traceValue);
  const events = asArray(trace.events);
  const trusted = asArray(trace.trusted_sources);
  return sourcePackFromJson([
    ...events.filter((event) => text(asRecord(event).type, "") === "source_access"),
    ...trusted
  ]);
}

function ideasFromContentBrief(value: unknown): AeoContentIdea[] {
  const brief = asRecord(value);
  return asArray(brief.content_ideas)
    .map((idea) => {
      try {
        return ideaFromJson(idea);
      } catch {
        return null;
      }
    })
    .filter((idea): idea is AeoContentIdea => Boolean(idea));
}

async function companyProfileFromCodexRun(value: unknown): Promise<RedditCompanyProfile> {
  const parsed = RedditCompanyProfileSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  return loadRedditCompanyProfile();
}

function summaryFromResult(result: AeoAssetGenerationResult) {
  return {
    ...result.summary,
    review_iterations: result.reviewTrace.length,
    files: Object.keys(result.generatedAsset.files)
  };
}

export async function executeAeoAssetRun(
  runId: string,
  {
    triggerRunId
  }: {
    triggerRunId?: string | null;
  } = {}
) {
  loadEnv();
  const supabase = createAeoSupabase();

  const { data: run, error: runError } = await supabase
    .from("aeo_asset_runs")
    .select("*")
    .eq("id", runId)
    .single<AeoAssetRunRow>();
  if (runError || !run) throw new Error(runError?.message || `AEO asset run not found: ${runId}`);

  const { data: codexRun, error: codexError } = await supabase
    .from("codex_research_runs")
    .select("*")
    .eq("id", run.codex_run_id)
    .single<CodexRunRow>();
  if (codexError || !codexRun) throw new Error(codexError?.message || `Codex research run not found: ${run.codex_run_id}`);
  if (codexRun.status !== "completed") throw new Error("Codex research must be completed before generating an AEO asset.");

  const ideas = ideasFromContentBrief(codexRun.content_brief);
  const selectedIdea = Object.keys(asRecord(run.selected_idea)).length
    ? ideaFromJson(run.selected_idea)
    : ideas[run.idea_index];
  if (!selectedIdea) throw new Error(`Invalid content idea index: ${run.idea_index}`);

  const sourcePack = sourcePackFromJson(run.source_pack).length
    ? sourcePackFromJson(run.source_pack)
    : sourcePackFromTrace(codexRun.normalized_trace);
  const redditThread = threadFromJson(codexRun.selected_reddit_thread);
  const companyProfile = await companyProfileFromCodexRun(codexRun.company_profile_snapshot);

  await updateRun(supabase, run.id, {
    status: "running",
    current_stage: "idea locked",
    trigger_run_id: triggerRunId || run.id,
    selected_idea: selectedIdea,
    source_pack: sourcePack,
    error: null,
    started_at: new Date().toISOString()
  });

  try {
    const result = await generateAeoAsset({
      idea: selectedIdea,
      sourcePack,
      companyProfile,
      redditThread,
      onStage: async (stage, partial) => {
        await updateRun(supabase, run.id, {
          status: "running",
          current_stage: stage,
          ...(partial?.generatedAsset ? { generated_asset: partial.generatedAsset } : {}),
          ...(partial?.reviewTrace ? { review_trace: partial.reviewTrace } : {}),
          ...(partial?.summary ? { summary: partial.summary } : {})
        });
      }
    });

    await updateRun(supabase, run.id, {
      status: "completed",
      current_stage: null,
      generated_asset: result.generatedAsset,
      review_trace: result.reviewTrace,
      summary: summaryFromResult(result),
      completed_at: new Date().toISOString(),
      error: null
    });

    return {
      runId: run.id,
      codexRunId: run.codex_run_id,
      title: result.generatedAsset.meta.title,
      tokenEstimate: number(result.generatedAsset.meta.token_estimate, 0)
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
