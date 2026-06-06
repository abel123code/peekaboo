import { createClient } from "@supabase/supabase-js";
import { keywordOpportunityResearcher } from "../../agents/keyword-opportunity-researcher.js";
import { loadEnv } from "../../config.js";

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

type KeywordResearchRunRow = {
  id: string;
  client_id: string;
  location_name: string;
  language_name: string;
};

type ClientProfileRow = {
  profile: unknown;
};

function createKeywordResearchSupabase() {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeKeyword(keyword: string) {
  return keyword.trim().toLowerCase().replace(/\s+/g, " ");
}

function dedupeOpportunitiesByKeyword<T extends { keyword: string; opportunity_score: number }>(opportunities: T[]) {
  const byKeyword = new Map<string, T>();
  for (const opportunity of opportunities) {
    const normalizedKeyword = normalizeKeyword(opportunity.keyword);
    if (!normalizedKeyword) continue;

    const existing = byKeyword.get(normalizedKeyword);
    if (!existing || opportunity.opportunity_score > existing.opportunity_score) {
      byKeyword.set(normalizedKeyword, opportunity);
    }
  }
  return [...byKeyword.values()];
}

export async function executeKeywordResearchRun(
  researchRunId: string,
  {
    triggerRunId
  }: {
    triggerRunId?: string | null;
  } = {}
) {
  loadEnv();

  const supabase = createKeywordResearchSupabase();

  const { data: run, error: runError } = await supabase
    .from("keyword_research_runs")
    .select("*")
    .eq("id", researchRunId)
    .single<KeywordResearchRunRow>();
  if (runError || !run) throw new Error(runError?.message || `Keyword research run not found: ${researchRunId}`);

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("*")
    .eq("id", run.client_id)
    .single<ClientRow>();
  if (clientError || !client) throw new Error(clientError?.message || `Client not found: ${run.client_id}`);

  const { data: profileRow, error: profileError } = await supabase
    .from("client_profiles")
    .select("profile")
    .eq("client_id", run.client_id)
    .maybeSingle<ClientProfileRow>();
  if (profileError) throw new Error(profileError.message);

  await supabase
    .from("keyword_research_runs")
    .update({
      status: "running",
      current_stage: "initializing",
      started_at: new Date().toISOString(),
      error: null,
      ...(triggerRunId ? { trigger_run_id: triggerRunId } : {})
    })
    .eq("id", run.id);

  try {
    const dataforseoPayload: Record<string, unknown> = {};
    const summaryPayload: Record<string, unknown> = {};

    const result = await keywordOpportunityResearcher(
      {
        client: {
          name: client.name,
          websiteUrl: client.website_url,
          websiteContext: client.website_context,
          defaultAudience: client.default_audience,
          brandVoice: client.brand_voice,
          locationName: run.location_name,
          languageName: run.language_name
        },
        rawProfile: profileRow?.profile || {}
      },
      {
        onStageUpdate: async (state) => {
          await supabase
            .from("keyword_research_runs")
            .update({
              status: state.status,
              current_stage: state.currentStage,
              error: state.error || null
            })
            .eq("id", run.id);
        },
        onStageComplete: async ({ fileName, output }) => {
          const update: Record<string, unknown> = {};

          if (fileName === "01-build-seed-terms" && isRecord(output)) {
            update.seed_terms = output.seedTerms || [];
          }

          if (fileName === "02-fetch-site-keywords") {
            dataforseoPayload.site_keywords = output;
            update.dataforseo_payload = dataforseoPayload;
          }

          if (fileName === "03-fetch-keyword-ideas") {
            dataforseoPayload.keyword_ideas = output;
            update.dataforseo_payload = dataforseoPayload;
          }

          if (fileName === "04-fetch-keyword-suggestions") {
            dataforseoPayload.keyword_suggestions = output;
            update.dataforseo_payload = dataforseoPayload;
          }

          if (fileName === "05-prepare-keyword-candidates" && isRecord(output)) {
            dataforseoPayload.skipped_reasons = output.skippedReasons || [];
            dataforseoPayload.candidates = output.candidates || [];
            update.dataforseo_payload = dataforseoPayload;
          }

          if (fileName === "06-plan-keyword-opportunities" && isRecord(output)) {
            summaryPayload.text = output.summary || "";
            update.summary = summaryPayload;
          }

          if (fileName === "07-score-keyword-opportunities" && Array.isArray(output)) {
            summaryPayload.opportunity_count = output.length;
            update.summary = summaryPayload;
          }

          if (Object.keys(update).length) {
            await supabase.from("keyword_research_runs").update(update).eq("id", run.id);
          }
        }
      }
    );

    await supabase
      .from("keyword_research_runs")
      .update({
        current_stage: "saving opportunities",
        seed_terms: result.seed_terms,
        dataforseo_payload: result.dataforseo_payload,
        summary: result.summary
      })
      .eq("id", run.id);

    await supabase.from("keyword_opportunities").delete().eq("research_run_id", run.id);

    const dedupedOpportunities = dedupeOpportunitiesByKeyword(result.opportunities);

    if (dedupedOpportunities.length) {
      const { error: upsertError } = await supabase.from("keyword_opportunities").upsert(
        dedupedOpportunities.map((opportunity) => ({
          research_run_id: run.id,
          client_id: run.client_id,
          keyword: opportunity.keyword,
          normalized_keyword: normalizeKeyword(opportunity.keyword),
          funnel_stage: opportunity.funnel_stage,
          intent: opportunity.intent,
          search_volume: opportunity.search_volume,
          cpc: opportunity.cpc,
          competition: opportunity.competition,
          keyword_difficulty: opportunity.keyword_difficulty,
          trend: opportunity.trend,
          relevance_score: opportunity.relevance_score,
          business_value_score: opportunity.business_value_score,
          opportunity_score: opportunity.opportunity_score,
          suggested_topic: opportunity.suggested_topic,
          suggested_goal: opportunity.suggested_goal,
          suggested_audience: opportunity.suggested_audience,
          image_search_query: opportunity.image_search_query,
          reference_links: opportunity.reference_links,
          rationale: opportunity.rationale
        })),
        {
          onConflict: "client_id,normalized_keyword"
        }
      );
      if (upsertError) throw new Error(upsertError.message);
    }

    await supabase
      .from("keyword_research_runs")
      .update({
        status: "completed",
        current_stage: null,
        completed_at: new Date().toISOString(),
        error: null
      })
      .eq("id", run.id);

    return {
      researchRunId: run.id,
      opportunityCount: dedupedOpportunities.length
    };
  } catch (error) {
    await supabase
      .from("keyword_research_runs")
      .update({
        status: "failed",
        error: getErrorMessage(error)
      })
      .eq("id", run.id);
    throw error;
  }
}
