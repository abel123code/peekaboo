import {
  enrichKeywordDifficulty,
  fetchKeywordIdeas,
  fetchKeywordSuggestions,
  fetchKeywordsForSite
} from "../lib/dataforseo-client.js";
import { generateStructured } from "../lib/langchain-client.js";
import {
  CompanyProfileSchema,
  KeywordOpportunityPlanSchema,
  type CompanyProfile,
  type KeywordDiscoveryCandidate
} from "../schemas.js";

type KeywordResearchClient = {
  name: string;
  websiteUrl: string;
  websiteContext: string;
  defaultAudience?: string | null;
  brandVoice?: string | null;
  locationName: string;
  languageName: string;
};

type KeywordResearchStageUpdate = {
  status: "running" | "failed" | "completed";
  currentStage: string | null;
  error?: string | null;
};

type KeywordResearchStageComplete = {
  name: string;
  fileName: string;
  output: unknown;
};

type KeywordOpportunityResearcherOptions = {
  onStageUpdate?: (state: KeywordResearchStageUpdate) => Promise<void> | void;
  onStageComplete?: (state: KeywordResearchStageComplete) => Promise<void> | void;
};

function isSkipped(value: unknown): value is { skipped: true; reason: string } {
  return Boolean(value && typeof value === "object" && "skipped" in value);
}

function uniqueStrings(values: string[], limit: number) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, limit);
}

function profileSeedTerms(client: KeywordResearchClient, profile: CompanyProfile) {
  return uniqueStrings(
    [
      client.name,
      client.websiteContext,
      client.defaultAudience || "",
      ...profile.products_services,
      ...profile.target_audiences,
      ...profile.pain_points,
      ...profile.differentiators,
      ...profile.offers,
      ...profile.funnel_stages.awareness,
      ...profile.funnel_stages.consideration,
      ...profile.funnel_stages.comparison,
      ...profile.funnel_stages.decision,
      ...profile.funnel_stages.retention
    ],
    30
  );
}

function dedupeCandidates(candidates: KeywordDiscoveryCandidate[]) {
  const byKeyword = new Map<string, KeywordDiscoveryCandidate>();
  for (const candidate of candidates) {
    const key = candidate.keyword.toLowerCase();
    const existing = byKeyword.get(key);
    if (!existing || candidate.search_volume > existing.search_volume) {
      byKeyword.set(key, candidate);
    }
  }
  return [...byKeyword.values()];
}

function filterExcluded(candidates: KeywordDiscoveryCandidate[], profile: CompanyProfile) {
  const excluded = profile.excluded_topics.map((topic) => topic.toLowerCase()).filter(Boolean);
  if (!excluded.length) return candidates;
  return candidates.filter((candidate) => !excluded.some((topic) => candidate.keyword.toLowerCase().includes(topic)));
}

function difficultyForScoring(keywordDifficulty: number | null) {
  return keywordDifficulty ?? 50;
}

function preRankCandidate(candidate: KeywordDiscoveryCandidate) {
  const volumeScore = Math.min(100, Math.round(Math.log10(candidate.search_volume + 1) * 25));
  const difficultyScore = Math.max(0, 100 - difficultyForScoring(candidate.keyword_difficulty));
  const cpcScore = Math.min(100, Math.round(candidate.cpc * 20));
  return volumeScore * 0.45 + difficultyScore * 0.35 + cpcScore * 0.2;
}

function finalOpportunityScore({
  candidate,
  relevanceScore,
  businessValueScore
}: {
  candidate: KeywordDiscoveryCandidate;
  relevanceScore: number;
  businessValueScore: number;
}) {
  const volumeScore = Math.min(100, Math.round(Math.log10(candidate.search_volume + 1) * 25));
  const difficultyScore = Math.max(0, 100 - difficultyForScoring(candidate.keyword_difficulty));
  const cpcScore = Math.min(100, Math.round(candidate.cpc * 20));
  return Math.round(
    relevanceScore * 0.32 +
      businessValueScore * 0.28 +
      volumeScore * 0.2 +
      difficultyScore * 0.15 +
      cpcScore * 0.05
  );
}

function clampScore(value: number | null | undefined, fallback = 50) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function compactCandidate(candidate: KeywordDiscoveryCandidate) {
  return {
    keyword: candidate.keyword,
    search_volume: candidate.search_volume,
    cpc: candidate.cpc,
    competition: candidate.competition,
    keyword_difficulty: candidate.keyword_difficulty,
    intent: candidate.intent,
    source: candidate.source
  };
}

async function runStage<T>({
  index,
  total,
  name,
  fileName,
  action,
  onStageUpdate,
  onStageComplete
}: {
  index: number;
  total: number;
  name: string;
  fileName: string;
  action: () => Promise<T> | T;
  onStageUpdate?: KeywordOpportunityResearcherOptions["onStageUpdate"];
  onStageComplete?: KeywordOpportunityResearcherOptions["onStageComplete"];
}): Promise<T> {
  const startedAt = Date.now();
  await onStageUpdate?.({ status: "running", currentStage: name, error: null });
  console.log(`[${index}/${total}] ${name} started...`);

  try {
    const output = await action();
    const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`[${index}/${total}] ${name} done in ${durationSeconds}s`);
    await onStageComplete?.({ name, fileName, output });
    return output;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await onStageUpdate?.({ status: "failed", currentStage: name, error: message });
    throw error;
  }
}

export async function keywordOpportunityResearcher({
  client,
  rawProfile
}: {
  client: KeywordResearchClient;
  rawProfile: unknown;
}, options: KeywordOpportunityResearcherOptions = {}) {
  const totalStages = 7;

  const { profile, seedTerms } = await runStage({
    index: 1,
    total: totalStages,
    name: "Build Seed Terms",
    fileName: "01-build-seed-terms",
    action: () => {
      const profile = CompanyProfileSchema.parse(rawProfile || {});
      return {
        profile,
        seedTerms: profileSeedTerms(client, profile)
      };
    },
    onStageUpdate: options.onStageUpdate,
    onStageComplete: options.onStageComplete
  });

  const siteKeywords = await runStage({
    index: 2,
    total: totalStages,
    name: "Fetch Site Keywords",
    fileName: "02-fetch-site-keywords",
    action: () =>
      fetchKeywordsForSite({
        target: client.websiteUrl,
        locationName: client.locationName,
        languageName: client.languageName,
        limit: 100
      }),
    onStageUpdate: options.onStageUpdate,
    onStageComplete: options.onStageComplete
  });

  const keywordIdeas = await runStage({
    index: 3,
    total: totalStages,
    name: "Fetch Keyword Ideas",
    fileName: "03-fetch-keyword-ideas",
    action: () =>
      fetchKeywordIdeas({
        seedKeywords: seedTerms,
        locationName: client.locationName,
        languageName: client.languageName,
        limit: 100
      }),
    onStageUpdate: options.onStageUpdate,
    onStageComplete: options.onStageComplete
  });

  const suggestionResults = await runStage({
    index: 4,
    total: totalStages,
    name: "Fetch Keyword Suggestions",
    fileName: "04-fetch-keyword-suggestions",
    action: () =>
      Promise.all(
        seedTerms.slice(0, 5).map((keyword) =>
          fetchKeywordSuggestions({
            keyword,
            locationName: client.locationName,
            languageName: client.languageName,
            limit: 30
          })
        )
      ),
    onStageUpdate: options.onStageUpdate,
    onStageComplete: options.onStageComplete
  });

  const { candidates, skippedReasons } = await runStage({
    index: 5,
    total: totalStages,
    name: "Prepare Keyword Candidates",
    fileName: "05-prepare-keyword-candidates",
    action: async () => {
      const skippedReasons = [siteKeywords, keywordIdeas, ...suggestionResults]
        .filter(isSkipped)
        .map((result) => result.reason);

      const discoveredCandidates = filterExcluded(
        dedupeCandidates([
          ...(isSkipped(siteKeywords) ? [] : siteKeywords),
          ...(isSkipped(keywordIdeas) ? [] : keywordIdeas),
          ...suggestionResults.flatMap((result) => (isSkipped(result) ? [] : result))
        ]),
        profile
      )
        .sort((a, b) => preRankCandidate(b) - preRankCandidate(a))
        .slice(0, 50);

      const enrichment = await enrichKeywordDifficulty({
        candidates: discoveredCandidates,
        locationName: client.locationName,
        languageName: client.languageName
      });
      const candidates = enrichment.candidates.sort((a, b) => preRankCandidate(b) - preRankCandidate(a));

      return {
        skippedReasons: [...new Set([...skippedReasons, ...enrichment.skippedReasons])],
        candidates,
        candidateBriefs: candidates.map(compactCandidate)
      };
    },
    onStageUpdate: options.onStageUpdate,
    onStageComplete: options.onStageComplete
  });

  const plan = await runStage({
    index: 6,
    total: totalStages,
    name: "Plan Keyword Opportunities",
    fileName: "06-plan-keyword-opportunities",
    action: () =>
      generateStructured({
        schema: KeywordOpportunityPlanSchema,
        schemaName: "keyword_opportunity_plan",
        systemInstruction:
          "You are a senior AEO strategist. Classify and prioritize keyword and question opportunities by funnel stage, answerability, and business relevance.",
        userPrompt: `
Create a keyword opportunity plan from these candidates.

Client:
${JSON.stringify(client, null, 2)}

Structured company profile:
${JSON.stringify(profile, null, 2)}

Seed terms:
${JSON.stringify(seedTerms, null, 2)}

Keyword candidates with SEO metrics:
${JSON.stringify(candidates.map(compactCandidate), null, 2)}

Instructions:
- Only select keywords that appear exactly in the provided keyword candidates.
- Do not invent or rewrite keywords.
- Select the strongest opportunities across the funnel, not only the highest volume terms.
- Classify each as awareness, consideration, comparison, decision, or retention.
- Prefer terms the company can credibly satisfy with its products, expertise, and offers.
- For suggested_goal, write the goal in the same style expected by an article writer.
- Reference links should only come from the company profile source URLs when useful.
- Avoid excluded topics and unsupported claims.
- Return 15 to 25 opportunities.
- Scores should be whole numbers from 0 to 100.
`
      }),
    onStageUpdate: options.onStageUpdate,
    onStageComplete: options.onStageComplete
  });

  const opportunities = await runStage({
    index: 7,
    total: totalStages,
    name: "Score Keyword Opportunities",
    fileName: "07-score-keyword-opportunities",
    action: () => {
      const metricsByKeyword = new Map(candidates.map((candidate) => [candidate.keyword.toLowerCase(), candidate]));
      const opportunities = plan.opportunities
        .filter((opportunity) => opportunity.keyword.trim() && opportunity.suggested_topic.trim() && opportunity.suggested_goal.trim())
        .filter((opportunity) => metricsByKeyword.has(opportunity.keyword.toLowerCase()))
        .slice(0, 30)
        .map((opportunity) => {
          const candidate = metricsByKeyword.get(opportunity.keyword.toLowerCase())!;
          const relevanceScore = clampScore(opportunity.relevance_score);
          const businessValueScore = clampScore(opportunity.business_value_score);
          return {
            ...opportunity,
            relevance_score: relevanceScore,
            business_value_score: businessValueScore,
            reference_links: opportunity.reference_links
              .filter((link) => link.url.trim() && link.title.trim())
              .slice(0, 3),
            search_volume: candidate.search_volume,
            cpc: candidate.cpc,
            competition: candidate.competition,
            keyword_difficulty: candidate.keyword_difficulty,
            trend: candidate.monthly_searches,
            opportunity_score: finalOpportunityScore({
              candidate,
              relevanceScore,
              businessValueScore
            })
          };
        });

      if (!opportunities.length && candidates.length) {
        opportunities.push(
          ...candidates.slice(0, 10).map((candidate) => {
            const relevanceScore = 60;
            const businessValueScore = 60;
            return {
              keyword: candidate.keyword,
              funnel_stage: "consideration" as const,
              intent: candidate.intent,
              relevance_score: relevanceScore,
              business_value_score: businessValueScore,
              suggested_topic: `${candidate.keyword}: What Singapore Buyers Should Know`,
              suggested_goal: `Create an AEO article for Singapore readers researching ${candidate.keyword}. Give a direct, citation-ready answer, explain the search intent clearly, connect the topic to ${client.name}'s products or expertise where relevant, and help the reader decide what to do next.`,
              suggested_audience: client.defaultAudience || null,
              image_search_query: `${candidate.keyword} ${client.locationName}`.trim(),
              reference_links: profile.source_urls.slice(0, 2),
              rationale: "Fallback recommendation generated from a DataForSEO keyword candidate because the model did not return usable opportunities.",
              search_volume: candidate.search_volume,
              cpc: candidate.cpc,
              competition: candidate.competition,
              keyword_difficulty: candidate.keyword_difficulty,
              trend: candidate.monthly_searches,
              opportunity_score: finalOpportunityScore({
                candidate,
                relevanceScore,
                businessValueScore
              })
            };
          })
        );
      }

      return opportunities;
    },
    onStageUpdate: options.onStageUpdate,
    onStageComplete: options.onStageComplete
  });

  return {
    agent: "Keyword Opportunity Researcher",
    seed_terms: seedTerms,
    dataforseo_payload: {
      skipped_reasons: [...new Set(skippedReasons)],
      candidates
    },
    summary: {
      text: plan.summary,
      candidate_count: candidates.length
    },
    opportunities
  };
}
