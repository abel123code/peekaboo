import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { competitorIntelligenceStrategist, type CompetitorStrategyCandidate } from "../../agents/competitor-intelligence-strategist.js";
import { loadEnv } from "../../config.js";
import {
  enrichKeywordDifficulty,
  fetchCompetitorDomains,
  fetchDomainIntersection,
  fetchRankedKeywords,
  type CompetitorDomainCandidate,
  type DomainIntersectionKeyword,
  type RankedKeywordCandidate
} from "../../lib/dataforseo-client.js";
import { SEO_ARTIFACT_BUCKET } from "../../integrations/supabase-artifacts.js";
import { CompanyProfileSchema } from "../../schemas.js";

type RunMode = "fetch_and_analyze" | "analyze_only" | "fetch_only";

type RunRow = {
  id: string;
  client_id: string;
  mode: RunMode;
  snapshot_id: string | null;
  location_name: string;
  language_name: string;
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

type SnapshotRow = {
  id: string;
  client_id: string;
  location_name: string;
  language_name: string;
  artifact_bucket: string | null;
  artifact_prefix: string | null;
  competitors: Array<{ domain: string }> | null;
};

type KeywordOpportunityRow = {
  keyword: string;
  normalized_keyword: string;
  funnel_stage: string;
  search_volume: number;
  cpc: number;
  competition: string | null;
  keyword_difficulty: number | null;
  intent: string | null;
  opportunity_score: number;
  suggested_topic: string;
  suggested_goal: string;
  suggested_audience: string | null;
  image_search_query: string | null;
  reference_links: unknown;
};

function createCompetitorSupabase() {
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

function normalizeDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || url;
  }
}

function normalizeKeyword(keyword: string) {
  return keyword.trim().toLowerCase().replace(/\s+/g, " ");
}

function isSkipped(value: unknown): value is { skipped: true; reason: string } {
  return Boolean(value && typeof value === "object" && "skipped" in value);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function difficultyForScoring(keywordDifficulty: number | null) {
  return keywordDifficulty ?? 50;
}

function localScore(candidate: {
  search_volume: number;
  cpc: number;
  keyword_difficulty: number | null;
  competitor_best_rank: number | null;
  client_rank: number | null;
  existing_opportunity_score: number | null;
}) {
  const volumeScore = Math.min(100, Math.round(Math.log10(candidate.search_volume + 1) * 25));
  const difficultyScore = Math.max(0, 100 - difficultyForScoring(candidate.keyword_difficulty));
  const cpcScore = Math.min(100, Math.round(candidate.cpc * 20));
  const competitorRankScore = candidate.competitor_best_rank ? Math.max(0, 100 - candidate.competitor_best_rank * 4) : 50;
  const clientGapScore = candidate.client_rank ? Math.min(40, candidate.client_rank) : 80;
  const existingScore = candidate.existing_opportunity_score ?? 50;
  return clampScore(
    volumeScore * 0.22 +
      difficultyScore * 0.16 +
      cpcScore * 0.08 +
      competitorRankScore * 0.22 +
      clientGapScore * 0.17 +
      existingScore * 0.15
  );
}

async function updateRun(
  supabase: SupabaseClient,
  runId: string,
  patch: Record<string, unknown>
) {
  const { error } = await supabase.from("competitor_intelligence_runs").update(patch).eq("id", runId);
  if (error) throw new Error(error.message);
}

async function uploadArtifact(supabase: SupabaseClient, prefix: string, name: string, value: unknown, contentType = "application/json") {
  const path = `${prefix.replace(/^\/+|\/+$/g, "")}/${name}`;
  const body = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const { error } = await supabase.storage.from(SEO_ARTIFACT_BUCKET).upload(path, body, {
    contentType,
    upsert: true
  });
  if (error) throw new Error(`Failed to upload ${path}: ${error.message}`);
  return `${SEO_ARTIFACT_BUCKET}/${path}`;
}

async function readTextArtifact(supabase: SupabaseClient, path: string) {
  const normalized = path.replace(`${SEO_ARTIFACT_BUCKET}/`, "").replace(/^\/+/, "");
  const { data, error } = await supabase.storage.from(SEO_ARTIFACT_BUCKET).download(normalized);
  if (error) return "";
  return data.text();
}

async function loadJsonArtifact<T>(supabase: SupabaseClient, snapshot: SnapshotRow, fileName: string): Promise<T> {
  if (!snapshot.artifact_prefix) throw new Error("Snapshot has no artifact prefix.");
  const path = `${snapshot.artifact_prefix}/${fileName}`;
  const { data, error } = await supabase.storage.from(snapshot.artifact_bucket || SEO_ARTIFACT_BUCKET).download(path);
  if (error) throw new Error(`Failed to load snapshot artifact ${path}: ${error.message}`);
  return JSON.parse(await data.text()) as T;
}

function chooseCompetitors(clientDomain: string, competitors: CompetitorDomainCandidate[]) {
  const genericDomains = new Set([
    "amazon.com",
    "facebook.com",
    "google.com",
    "instagram.com",
    "linkedin.com",
    "medium.com",
    "pinterest.com",
    "quora.com",
    "reddit.com",
    "wikipedia.org",
    "youtube.com"
  ]);
  return competitors
    .filter((competitor) => competitor.domain && competitor.domain !== clientDomain && !genericDomains.has(competitor.domain))
    .sort((a, b) => b.intersections - a.intersections || b.organic_etv - a.organic_etv || b.organic_keywords - a.organic_keywords)
    .slice(0, 5);
}

async function fetchSnapshot({
  supabase,
  run,
  client
}: {
  supabase: SupabaseClient;
  run: RunRow;
  client: ClientRow;
}) {
  const snapshotId = randomUUID();
  const prefix = `competitor-intelligence/snapshots/${snapshotId}`;
  const clientDomain = normalizeDomain(client.website_url);
  const skippedReasons: string[] = [];

  await updateRun(supabase, run.id, {
    current_stage: "fetching competitors",
    artifact_bucket: SEO_ARTIFACT_BUCKET,
    artifact_prefix: `competitor-intelligence/runs/${run.id}`
  });

  const competitorResult = await fetchCompetitorDomains({
    target: clientDomain,
    locationName: run.location_name,
    languageName: run.language_name,
    limit: 20
  });
  if (isSkipped(competitorResult)) skippedReasons.push(competitorResult.reason);
  const selectedCompetitors = isSkipped(competitorResult) ? [] : chooseCompetitors(clientDomain, competitorResult);

  await updateRun(supabase, run.id, { current_stage: "fetching ranked keywords" });
  const clientRankedResult = await fetchRankedKeywords({
    target: clientDomain,
    locationName: run.location_name,
    languageName: run.language_name,
    limit: 200
  });
  if (isSkipped(clientRankedResult)) skippedReasons.push(clientRankedResult.reason);
  const clientRankedKeywords = isSkipped(clientRankedResult) ? [] : clientRankedResult;

  const competitorRankedKeywords: Record<string, RankedKeywordCandidate[]> = {};
  const intersections: Record<string, DomainIntersectionKeyword[]> = {};

  for (const competitor of selectedCompetitors) {
    const ranked = await fetchRankedKeywords({
      target: competitor.domain,
      locationName: run.location_name,
      languageName: run.language_name,
      limit: 150
    });
    if (isSkipped(ranked)) {
      skippedReasons.push(ranked.reason);
      competitorRankedKeywords[competitor.domain] = [];
    } else {
      competitorRankedKeywords[competitor.domain] = ranked;
    }

    const intersection = await fetchDomainIntersection({
      target1: clientDomain,
      target2: competitor.domain,
      locationName: run.location_name,
      languageName: run.language_name,
      limit: 50
    });
    if (isSkipped(intersection)) {
      skippedReasons.push(intersection.reason);
      intersections[competitor.domain] = [];
    } else {
      intersections[competitor.domain] = intersection;
    }
  }

  const keywordCount = Object.values(competitorRankedKeywords).reduce((count, keywords) => count + keywords.length, clientRankedKeywords.length);

  const { error: insertError } = await supabase.from("competitor_intelligence_snapshots").insert({
    id: snapshotId,
    client_id: run.client_id,
    location_name: run.location_name,
    language_name: run.language_name,
    artifact_bucket: SEO_ARTIFACT_BUCKET,
    artifact_prefix: prefix,
    competitors: selectedCompetitors,
    competitor_count: selectedCompetitors.length,
    keyword_count: keywordCount,
    skipped_reasons: [...new Set(skippedReasons)]
  });
  if (insertError) throw new Error(insertError.message);

  await uploadArtifact(supabase, prefix, "01-competitors.json", { all: isSkipped(competitorResult) ? [] : competitorResult, selected: selectedCompetitors });
  await uploadArtifact(supabase, prefix, "02-client-ranked-keywords.json", clientRankedKeywords);
  await uploadArtifact(supabase, prefix, "03-competitor-ranked-keywords.json", competitorRankedKeywords);
  await uploadArtifact(supabase, prefix, "04-domain-intersections.json", intersections);

  await updateRun(supabase, run.id, {
    snapshot_id: snapshotId,
    artifact_bucket: SEO_ARTIFACT_BUCKET,
    artifact_prefix: `competitor-intelligence/runs/${run.id}`
  });

  return {
    id: snapshotId,
    client_id: run.client_id,
    location_name: run.location_name,
    language_name: run.language_name,
    artifact_bucket: SEO_ARTIFACT_BUCKET,
    artifact_prefix: prefix,
    competitors: selectedCompetitors
  } satisfies SnapshotRow;
}

async function getLatestSnapshot(supabase: SupabaseClient, clientId: string) {
  const { data, error } = await supabase
    .from("competitor_intelligence_snapshots")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<SnapshotRow>();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No competitor intelligence snapshot exists yet. Run Fetch + Analyze first.");
  return data;
}

async function buildCandidates({
  supabase,
  clientId,
  snapshot
}: {
  supabase: SupabaseClient;
  clientId: string;
  snapshot: SnapshotRow;
}) {
  const [clientKeywords, competitorKeywordsByDomain, intersectionsByDomain] = await Promise.all([
    loadJsonArtifact<RankedKeywordCandidate[]>(supabase, snapshot, "02-client-ranked-keywords.json"),
    loadJsonArtifact<Record<string, RankedKeywordCandidate[]>>(supabase, snapshot, "03-competitor-ranked-keywords.json"),
    loadJsonArtifact<Record<string, DomainIntersectionKeyword[]>>(supabase, snapshot, "04-domain-intersections.json")
  ]);

  const [{ data: opportunities }, { data: coverage }, { data: activeRuns }, { data: draftRows }] = await Promise.all([
    supabase.from("keyword_opportunities").select("*").eq("client_id", clientId).limit(200),
    supabase.from("published_content_coverage").select("normalized_keyword").eq("client_id", clientId),
    supabase.from("workflow_runs").select("keyword,status").eq("client_id", clientId).in("status", ["queued", "running"]),
    supabase.from("article_drafts").select("target_keyword,status").eq("client_id", clientId).neq("status", "approved")
  ]);

  const published = new Set((coverage || []).map((item: any) => item.normalized_keyword));
  const inProgress = new Set<string>();
  for (const row of activeRuns || []) inProgress.add(normalizeKeyword((row as any).keyword || ""));
  for (const row of draftRows || []) inProgress.add(normalizeKeyword((row as any).target_keyword || ""));

  const clientByKeyword = new Map(clientKeywords.map((keyword) => [normalizeKeyword(keyword.keyword), keyword]));
  const opportunitiesByKeyword = new Map((opportunities || []).map((opportunity: any) => [opportunity.normalized_keyword, opportunity as KeywordOpportunityRow]));
  const candidatesByKeyword = new Map<string, CompetitorStrategyCandidate>();

  function upsertCandidate(candidate: CompetitorStrategyCandidate) {
    const normalized = normalizeKeyword(candidate.keyword);
    if (!normalized || candidate.coverage_status === "published") return;
    const existing = candidatesByKeyword.get(normalized);
    if (!existing || localScore(candidate) > localScore(existing)) {
      candidatesByKeyword.set(normalized, candidate);
    }
  }

  for (const [domain, keywords] of Object.entries(competitorKeywordsByDomain || {})) {
    for (const keyword of keywords) {
      const normalized = normalizeKeyword(keyword.keyword);
      const clientKeyword = clientByKeyword.get(normalized);
      const existingOpportunity = opportunitiesByKeyword.get(normalized);
      const coverageStatus = published.has(normalized) ? "published" : inProgress.has(normalized) ? "in_progress" : "uncovered";
      if (clientKeyword || coverageStatus === "published") continue;
      upsertCandidate({
        keyword: keyword.keyword,
        recommendation_type: existingOpportunity ? "existing_opportunity" : "gap",
        search_volume: keyword.search_volume,
        cpc: keyword.cpc,
        competition: keyword.competition,
        keyword_difficulty: keyword.keyword_difficulty,
        intent: keyword.intent,
        source_competitors: [domain],
        competitor_best_rank: keyword.rank_absolute || keyword.rank_group,
        client_rank: null,
        existing_opportunity_score: existingOpportunity?.opportunity_score ?? null,
        coverage_status: coverageStatus,
        evidence_summary: `${domain} ranks for this keyword while the client does not appear in the saved ranked-keyword snapshot.`
      });
    }
  }

  for (const [domain, intersections] of Object.entries(intersectionsByDomain || {})) {
    for (const item of intersections) {
      const normalized = normalizeKeyword(item.keyword);
      const existingOpportunity = opportunitiesByKeyword.get(normalized);
      const coverageStatus = published.has(normalized) ? "published" : inProgress.has(normalized) ? "in_progress" : "uncovered";
      if (coverageStatus === "published") continue;
      const clientRank = item.first_domain_rank;
      const competitorRank = item.second_domain_rank;
      if (!clientRank || !competitorRank || clientRank <= competitorRank + 5) continue;
      upsertCandidate({
        keyword: item.keyword,
        recommendation_type: existingOpportunity ? "existing_opportunity" : "weak_overlap",
        search_volume: item.search_volume,
        cpc: item.cpc,
        competition: item.competition,
        keyword_difficulty: item.keyword_difficulty,
        intent: item.intent,
        source_competitors: [domain],
        competitor_best_rank: competitorRank,
        client_rank: clientRank,
        existing_opportunity_score: existingOpportunity?.opportunity_score ?? null,
        coverage_status: coverageStatus,
        evidence_summary: `${domain} ranks at position ${competitorRank}; client ranks at position ${clientRank}.`
      });
    }
  }

  for (const opportunity of opportunities || []) {
    const typed = opportunity as KeywordOpportunityRow;
    const coverageStatus = published.has(typed.normalized_keyword)
      ? "published"
      : inProgress.has(typed.normalized_keyword)
      ? "in_progress"
      : "uncovered";
    if (coverageStatus === "published") continue;
    upsertCandidate({
      keyword: typed.keyword,
      recommendation_type: "existing_opportunity",
      search_volume: typed.search_volume,
      cpc: typed.cpc,
      competition: typed.competition,
      keyword_difficulty: typed.keyword_difficulty,
      intent: typed.intent,
      source_competitors: [],
      competitor_best_rank: null,
      client_rank: clientByKeyword.get(typed.normalized_keyword)?.rank_absolute || null,
      existing_opportunity_score: typed.opportunity_score,
      coverage_status: coverageStatus,
      evidence_summary: "Existing keyword opportunity not yet marked as published."
    });
  }

  const candidates = [...candidatesByKeyword.values()]
    .sort((a, b) => localScore(b) - localScore(a))
    .slice(0, 60);

  const enrichment = await enrichKeywordDifficulty({
    candidates,
    locationName: snapshot.location_name,
    languageName: snapshot.language_name
  });

  return enrichment.candidates
    .sort((a, b) => localScore(b) - localScore(a))
    .slice(0, 60);
}

function referenceLinksForKeyword(keyword: string, opportunities: KeywordOpportunityRow[]) {
  const normalized = normalizeKeyword(keyword);
  return opportunities.find((opportunity) => opportunity.normalized_keyword === normalized)?.reference_links || [];
}

async function analyzeSnapshot({
  supabase,
  run,
  client,
  snapshot
}: {
  supabase: SupabaseClient;
  run: RunRow;
  client: ClientRow;
  snapshot: SnapshotRow;
}) {
  await updateRun(supabase, run.id, { current_stage: "building candidate set", snapshot_id: snapshot.id });

  const [{ data: profileRow }, { data: opportunities }] = await Promise.all([
    supabase.from("client_profiles").select("profile").eq("client_id", client.id).maybeSingle(),
    supabase.from("keyword_opportunities").select("*").eq("client_id", client.id).limit(200)
  ]);

  const profile = CompanyProfileSchema.parse((profileRow as any)?.profile || {});
  const candidates = await buildCandidates({ supabase, clientId: client.id, snapshot });
  await uploadArtifact(supabase, `competitor-intelligence/runs/${run.id}`, "01-candidates.json", candidates);

  const memoryObjectPath = `competitor-intelligence/memory/clients/${client.id}.md`;
  const previousMemory = await readTextArtifact(supabase, `${SEO_ARTIFACT_BUCKET}/${memoryObjectPath}`);

  await updateRun(supabase, run.id, { current_stage: "strategizing recommendations" });
  const plan = await competitorIntelligenceStrategist({
    client: {
      name: client.name,
      websiteUrl: client.website_url,
      websiteContext: client.website_context,
      defaultAudience: client.default_audience,
      brandVoice: client.brand_voice,
      locationName: run.location_name,
      languageName: run.language_name
    },
    profile,
    memoryMarkdown: previousMemory.slice(-12_000),
    candidates
  });

  await uploadArtifact(supabase, `competitor-intelligence/runs/${run.id}`, "02-strategy-plan.json", plan);

  const opportunitiesTyped = (opportunities || []) as KeywordOpportunityRow[];
  const candidatesByKeyword = new Map(candidates.map((candidate) => [normalizeKeyword(candidate.keyword), candidate]));
  const rows = plan.recommendations
    .filter((recommendation) => candidatesByKeyword.has(normalizeKeyword(recommendation.keyword)))
    .slice(0, 8)
    .map((recommendation) => {
      const candidate = candidatesByKeyword.get(normalizeKeyword(recommendation.keyword))!;
      return {
        run_id: run.id,
        snapshot_id: snapshot.id,
        client_id: client.id,
        keyword: recommendation.keyword,
        normalized_keyword: normalizeKeyword(recommendation.keyword),
        recommendation_type: recommendation.recommendation_type,
        funnel_stage: recommendation.funnel_stage,
        intent: recommendation.intent || candidate.intent,
        search_volume: candidate.search_volume,
        cpc: candidate.cpc,
        competition: candidate.competition,
        keyword_difficulty: candidate.keyword_difficulty,
        opportunity_score: clampScore(recommendation.opportunity_score || localScore(candidate)),
        source_competitors: recommendation.source_competitors.length ? recommendation.source_competitors : candidate.source_competitors,
        evidence: {
          summary: recommendation.evidence_summary || candidate.evidence_summary,
          coverage_status: candidate.coverage_status,
          competitor_best_rank: candidate.competitor_best_rank,
          client_rank: candidate.client_rank,
          existing_opportunity_score: candidate.existing_opportunity_score
        },
        suggested_topic: recommendation.suggested_topic,
        suggested_goal: recommendation.suggested_goal,
        suggested_audience: recommendation.suggested_audience,
        image_search_query: recommendation.image_search_query,
        reference_links: recommendation.reference_links.length ? recommendation.reference_links : referenceLinksForKeyword(recommendation.keyword, opportunitiesTyped),
        rationale: recommendation.rationale
      };
    });

  await supabase.from("competitor_recommendations").delete().eq("run_id", run.id);
  if (rows.length) {
    const { error } = await supabase.from("competitor_recommendations").insert(rows);
    if (error) throw new Error(error.message);
  }

  const runMemory = [
    previousMemory.trim(),
    `\n\n## Competitor Intelligence Run - ${new Date().toISOString()}`,
    "",
    `Summary: ${plan.executive_summary}`,
    "",
    "### Strategic Notes",
    ...plan.strategic_notes.map((note) => `- ${note}`),
    "",
    "### Recommended Actions",
    ...rows.map((row, index) => `${index + 1}. ${row.keyword} - ${row.rationale}`)
  ]
    .filter(Boolean)
    .join("\n");

  await uploadArtifact(supabase, "competitor-intelligence/memory/clients", `${client.id}.md`, runMemory, "text/markdown");

  await updateRun(supabase, run.id, {
    summary: {
      executive_summary: plan.executive_summary,
      strategic_notes: plan.strategic_notes,
      recommendation_count: rows.length,
      candidate_count: candidates.length
    },
    memory_path: `${SEO_ARTIFACT_BUCKET}/${memoryObjectPath}`
  });
}

export async function executeCompetitorIntelligenceRun(
  runId: string,
  {
    triggerRunId
  }: {
    triggerRunId?: string | null;
  } = {}
) {
  loadEnv();
  const supabase = createCompetitorSupabase();

  const { data: run, error: runError } = await supabase
    .from("competitor_intelligence_runs")
    .select("*")
    .eq("id", runId)
    .single<RunRow>();
  if (runError || !run) throw new Error(runError?.message || `Competitor intelligence run not found: ${runId}`);

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("*")
    .eq("id", run.client_id)
    .single<ClientRow>();
  if (clientError || !client) throw new Error(clientError?.message || `Client not found: ${run.client_id}`);

  await updateRun(supabase, run.id, {
    status: "running",
    current_stage: "initializing",
    started_at: new Date().toISOString(),
    error: null,
    ...(triggerRunId ? { trigger_run_id: triggerRunId } : {})
  });

  try {
    let snapshot: SnapshotRow | null = null;
    if (run.mode === "analyze_only") {
      snapshot = run.snapshot_id
        ? (
            await supabase
              .from("competitor_intelligence_snapshots")
              .select("*")
              .eq("id", run.snapshot_id)
              .single<SnapshotRow>()
          ).data
        : await getLatestSnapshot(supabase, run.client_id);
      if (!snapshot) throw new Error("No competitor intelligence snapshot found.");
    } else {
      snapshot = await fetchSnapshot({ supabase, run, client });
    }

    if (run.mode !== "fetch_only") {
      await analyzeSnapshot({ supabase, run, client, snapshot });
    }

    await updateRun(supabase, run.id, {
      status: "completed",
      current_stage: null,
      snapshot_id: snapshot.id,
      completed_at: new Date().toISOString(),
      error: null
    });

    return {
      runId: run.id,
      snapshotId: snapshot.id
    };
  } catch (error) {
    await updateRun(supabase, run.id, {
      status: "failed",
      error: getErrorMessage(error)
    });
    throw error;
  }
}
