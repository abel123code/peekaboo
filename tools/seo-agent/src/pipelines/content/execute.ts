import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "../../config.js";
import { createSupabaseRunStore, SEO_ARTIFACT_BUCKET } from "../../integrations/supabase-artifacts.js";
import { SeoContentTaskSchema } from "../../schemas.js";
import { runSeoContentWorkflow } from "./workflow.js";

type ArtifactMode = "local" | "supabase";

type RunRow = {
  id: string;
  client_id: string;
  run_name: string;
  keyword: string;
  topic: string;
  goal: string;
  audience: string | null;
  image_search_query: string | null;
  brand_voice_override: string | null;
  backlinks: Array<{ url: string; title: string }> | null;
};

type ClientRow = {
  id: string;
  name: string;
  website_url: string;
  website_context: string;
  default_audience: string | null;
  brand_voice: string | null;
  default_location_name: string;
  default_language_name: string;
};

function createWorkflowSupabase() {
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

export async function executeSeoWorkflowRun(
  runId: string,
  {
    artifactMode = "supabase",
    triggerRunId
  }: {
    artifactMode?: ArtifactMode;
    triggerRunId?: string | null;
  } = {}
) {
  loadEnv();

  const supabase = createWorkflowSupabase();
  const artifactPrefix = `runs/${runId}`;
  const useSupabaseArtifacts = artifactMode === "supabase";

  const { data: run, error: runError } = await supabase
    .from("workflow_runs")
    .select("*")
    .eq("id", runId)
    .single<RunRow>();
  if (runError || !run) throw new Error(runError?.message || `Run not found: ${runId}`);

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("*")
    .eq("id", run.client_id)
    .single<ClientRow>();
  if (clientError || !client) throw new Error(clientError?.message || `Client not found: ${run.client_id}`);

  await supabase
    .from("workflow_runs")
    .update({
      status: "running",
      current_stage: "initializing",
      started_at: new Date().toISOString(),
      error: null,
      ...(triggerRunId ? { trigger_run_id: triggerRunId } : {}),
      ...(useSupabaseArtifacts
        ? {
            artifact_bucket: SEO_ARTIFACT_BUCKET,
            artifact_prefix: artifactPrefix,
            local_run_dir: null
          }
        : {})
    })
    .eq("id", run.id);

  const task = SeoContentTaskSchema.parse({
    runName: run.run_name,
    website: {
      name: client.name,
      url: client.website_url,
      context: client.website_context
    },
    goal: run.goal,
    topic: run.topic,
    targetKeyword: run.keyword,
    locationName: client.default_location_name,
    languageName: client.default_language_name,
    audience: run.audience || client.default_audience || undefined,
    backlinks: run.backlinks || [],
    brandVoice: run.brand_voice_override || client.brand_voice || undefined,
    imageSearchQuery: run.image_search_query || `${run.keyword} ${client.default_location_name}`.trim()
  });

  const store = useSupabaseArtifacts
    ? createSupabaseRunStore(supabase, {
        bucket: SEO_ARTIFACT_BUCKET,
        prefix: artifactPrefix
      })
    : undefined;

  try {
    const result = await runSeoContentWorkflow(task, {
      store,
      onStageUpdate: async (state) => {
        await supabase
          .from("workflow_runs")
          .update({
            status: state.status,
            current_stage: state.currentStage,
            error: state.error || null,
            ...(useSupabaseArtifacts
              ? {
                  artifact_bucket: SEO_ARTIFACT_BUCKET,
                  artifact_prefix: artifactPrefix
                }
              : { local_run_dir: state.runDir || null })
          })
          .eq("id", run.id);
      }
    });

    const finalPayload = result.finalPost as any;
    const icpPayload = result.icpPainHypothesis as any;
    const post = finalPayload.post;

    await supabase.from("article_drafts").upsert(
      {
        run_id: run.id,
        client_id: run.client_id,
        status: "draft",
        title: post.title,
        slug: post.slug,
        meta_description: post.meta_description,
        target_keyword: post.target_keyword,
        excerpt: post.excerpt,
        summary_bullets: post.summary_bullets || [],
        cta_banner: post.cta_banner || {},
        content: post.content,
        seo_review: post.seo_review || null,
        icp_pain_hypothesis: icpPayload.icp_pain_hypothesis || null,
        images: post.images || []
      },
      { onConflict: "run_id" }
    );

    const finalPostPath = useSupabaseArtifacts
      ? `${artifactPrefix}/09-final-post-packager.json`
      : result.finalPostPath;

    await supabase
      .from("workflow_runs")
      .update({
        status: "completed",
        current_stage: null,
        local_run_dir: useSupabaseArtifacts ? null : result.runDir,
        artifact_bucket: useSupabaseArtifacts ? SEO_ARTIFACT_BUCKET : null,
        artifact_prefix: useSupabaseArtifacts ? artifactPrefix : null,
        final_post_path: finalPostPath,
        completed_at: new Date().toISOString(),
        error: null
      })
      .eq("id", run.id);

    return {
      runId: run.id,
      finalPostPath,
      artifactBucket: useSupabaseArtifacts ? SEO_ARTIFACT_BUCKET : null,
      artifactPrefix: useSupabaseArtifacts ? artifactPrefix : null
    };
  } catch (error) {
    await supabase
      .from("workflow_runs")
      .update({
        status: "failed",
        error: getErrorMessage(error)
      })
      .eq("id", run.id);
    throw error;
  }
}
