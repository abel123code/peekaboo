import { hasDataForSeoCredentials } from "../config.js";
import { KeywordDiscoveryCandidateSchema, KeywordMetricSchema, SerpResultSchema } from "../schemas.js";

type SkippedResult = {
  skipped: true;
  reason: string;
};

export type DataForSeoSkippedResult = SkippedResult;

export type CompetitorDomainCandidate = {
  domain: string;
  avg_position: number | null;
  intersections: number;
  organic_keywords: number;
  organic_etv: number;
};

export type RankedKeywordCandidate = {
  keyword: string;
  search_volume: number;
  cpc: number;
  competition: string | null;
  keyword_difficulty: number | null;
  intent: string | null;
  rank_absolute: number | null;
  rank_group: number | null;
  url: string | null;
  domain: string | null;
  etv: number;
  source_domain: string;
  monthly_searches: Array<{ year: number; month: number; search_volume: number | null }>;
};

export type DomainIntersectionKeyword = {
  keyword: string;
  search_volume: number;
  cpc: number;
  competition: string | null;
  keyword_difficulty: number | null;
  intent: string | null;
  first_domain_rank: number | null;
  second_domain_rank: number | null;
  first_domain_url: string | null;
  second_domain_url: string | null;
  first_domain_etv: number;
  second_domain_etv: number;
};

function authHeader(): string {
  const username = process.env.DATAFORSEO_USERNAME || "";
  const password = process.env.DATAFORSEO_PASSWORD || "";
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

async function dataForSeoPost(endpoint: string, body: unknown): Promise<any | SkippedResult> {
  if (!hasDataForSeoCredentials()) {
    return {
      skipped: true,
      reason: "DATAFORSEO_USERNAME and DATAFORSEO_PASSWORD are not configured."
    };
  }

  const response = await fetch(`https://api.dataforseo.com/v3/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DataForSEO request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  if (data?.status_code && data.status_code >= 40000) {
    throw new Error(`DataForSEO request failed: ${data.status_code} ${data.status_message}`);
  }
  return data;
}

function normalizeDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || url;
  }
}

function metricNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function metricString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function metricNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseKeywordCandidate(item: any, source: string) {
  return KeywordDiscoveryCandidateSchema.parse({
    keyword: item.keyword,
    search_volume: item.keyword_info?.search_volume || 0,
    cpc: item.keyword_info?.cpc || 0,
    competition: item.keyword_info?.competition_level || null,
    keyword_difficulty: metricNullableNumber(item.keyword_properties?.keyword_difficulty),
    intent: item.search_intent_info?.main_intent || null,
    last_updated: item.keyword_info?.last_updated_time || null,
    source,
    monthly_searches: item.keyword_info?.monthly_searches || []
  });
}

function parseRankedKeyword(item: any, sourceDomain: string): RankedKeywordCandidate | null {
  const keywordData = item.keyword_data || item;
  const keyword = keywordData.keyword || item.keyword;
  if (!keyword) return null;

  const keywordInfo = keywordData.keyword_info || item.keyword_info || {};
  const keywordProperties = keywordData.keyword_properties || item.keyword_properties || {};
  const searchIntentInfo = keywordData.search_intent_info || item.search_intent_info || {};
  const serpItem = item.ranked_serp_element?.serp_item || item.serp_item || {};
  const rankedElement = item.ranked_serp_element || {};

  return {
    keyword,
    search_volume: metricNumber(keywordInfo.search_volume),
    cpc: metricNumber(keywordInfo.cpc),
    competition: metricString(keywordInfo.competition_level),
    keyword_difficulty: metricNullableNumber(keywordProperties.keyword_difficulty),
    intent: metricString(searchIntentInfo.main_intent),
    rank_absolute: metricNumber(serpItem.rank_absolute, metricNumber(rankedElement.rank_absolute, NaN)) || null,
    rank_group: metricNumber(serpItem.rank_group, metricNumber(rankedElement.rank_group, NaN)) || null,
    url: metricString(serpItem.url),
    domain: metricString(serpItem.domain),
    etv: metricNumber(rankedElement.etv, metricNumber(serpItem.etv)),
    source_domain: normalizeDomain(sourceDomain),
    monthly_searches: keywordInfo.monthly_searches || []
  };
}

function parseIntersectionKeyword(item: any): DomainIntersectionKeyword | null {
  const keywordData = item.keyword_data || item;
  const keyword = keywordData.keyword || item.keyword;
  if (!keyword) return null;

  const keywordInfo = keywordData.keyword_info || item.keyword_info || {};
  const keywordProperties = keywordData.keyword_properties || item.keyword_properties || {};
  const searchIntentInfo = keywordData.search_intent_info || item.search_intent_info || {};
  const first = item.first_domain_serp_element || {};
  const second = item.second_domain_serp_element || {};
  const firstSerp = first.serp_item || {};
  const secondSerp = second.serp_item || {};

  return {
    keyword,
    search_volume: metricNumber(keywordInfo.search_volume),
    cpc: metricNumber(keywordInfo.cpc),
    competition: metricString(keywordInfo.competition_level),
    keyword_difficulty: metricNullableNumber(keywordProperties.keyword_difficulty),
    intent: metricString(searchIntentInfo.main_intent),
    first_domain_rank: metricNumber(firstSerp.rank_absolute, metricNumber(first.rank_absolute, NaN)) || null,
    second_domain_rank: metricNumber(secondSerp.rank_absolute, metricNumber(second.rank_absolute, NaN)) || null,
    first_domain_url: metricString(firstSerp.url),
    second_domain_url: metricString(secondSerp.url),
    first_domain_etv: metricNumber(first.etv, metricNumber(firstSerp.etv)),
    second_domain_etv: metricNumber(second.etv, metricNumber(secondSerp.etv))
  };
}

export async function fetchKeywordOverview({
  keywords,
  locationName,
  languageName
}: {
  keywords: string[];
  locationName?: string;
  languageName?: string;
}) {
  const uniqueKeywords = [...new Set(keywords.filter(Boolean))].slice(0, 50);
  if (!uniqueKeywords.length) return [];

  const data = await dataForSeoPost("dataforseo_labs/google/keyword_overview/live", [
    {
      keywords: uniqueKeywords,
      location_name: locationName || "United States",
      language_name: languageName || "English"
    }
  ]);

  if (data.skipped) return { skipped: true, keywords: uniqueKeywords, reason: data.reason };

  const items = data?.tasks?.[0]?.result?.[0]?.items || [];
  return items.map((item: any) =>
    KeywordMetricSchema.parse({
      keyword: item.keyword,
      search_volume: item.keyword_info?.search_volume || 0,
      cpc: item.keyword_info?.cpc || 0,
      competition: item.keyword_info?.competition_level || null,
      keyword_difficulty: metricNullableNumber(item.keyword_properties?.keyword_difficulty),
      intent: item.search_intent_info?.main_intent || null,
      last_updated: item.keyword_info?.last_updated_time || null
    })
  );
}

export async function enrichKeywordDifficulty<T extends { keyword: string; keyword_difficulty: number | null }>({
  candidates,
  locationName,
  languageName
}: {
  candidates: T[];
  locationName?: string;
  languageName?: string;
}): Promise<{ candidates: T[]; skippedReasons: string[] }> {
  if (!candidates.length) return { candidates, skippedReasons: [] };

  const skippedReasons: string[] = [];
  const keywords = [...new Set(candidates.map((candidate) => candidate.keyword).filter(Boolean))];
  const overviewByKeyword = new Map<string, { keyword_difficulty: number | null }>();

  for (let index = 0; index < keywords.length; index += 50) {
    const result = await fetchKeywordOverview({
      keywords: keywords.slice(index, index + 50),
      locationName,
      languageName
    });

    if ("skipped" in result) {
      skippedReasons.push(result.reason);
      continue;
    }

    for (const metric of result) {
      overviewByKeyword.set(metric.keyword.toLowerCase(), {
        keyword_difficulty: metric.keyword_difficulty
      });
    }
  }

  return {
    skippedReasons: [...new Set(skippedReasons)],
    candidates: candidates.map((candidate) => {
      const overview = overviewByKeyword.get(candidate.keyword.toLowerCase());
      if (!overview || overview.keyword_difficulty === null) return candidate;
      return {
        ...candidate,
        keyword_difficulty: overview.keyword_difficulty
      };
    })
  };
}

export async function fetchKeywordsForSite({
  target,
  locationName,
  languageName,
  limit = 100
}: {
  target: string;
  locationName?: string;
  languageName?: string;
  limit?: number;
}) {
  const data = await dataForSeoPost("dataforseo_labs/google/keywords_for_site/live", [
    {
      target: normalizeDomain(target),
      location_name: locationName || "United States",
      language_name: languageName || "English",
      include_serp_info: true,
      include_subdomains: true,
      limit
    }
  ]);

  if (data.skipped) return { skipped: true, reason: data.reason };

  const items = data?.tasks?.[0]?.result?.[0]?.items || [];
  return items.map((item: any) => parseKeywordCandidate(item, "keywords_for_site"));
}

export async function fetchCompetitorDomains({
  target,
  locationName,
  languageName,
  limit = 20
}: {
  target: string;
  locationName?: string;
  languageName?: string;
  limit?: number;
}): Promise<CompetitorDomainCandidate[] | SkippedResult> {
  const data = await dataForSeoPost("dataforseo_labs/google/competitors_domain/live", [
    {
      target: normalizeDomain(target),
      location_name: locationName || "United States",
      language_name: languageName || "English",
      item_types: ["organic"],
      exclude_top_domains: true,
      limit
    }
  ]);

  if (data.skipped) return { skipped: true, reason: data.reason };

  const items = data?.tasks?.[0]?.result?.[0]?.items || [];
  return items
    .map((item: any) => ({
      domain: item.domain,
      avg_position: typeof item.avg_position === "number" ? item.avg_position : null,
      intersections: metricNumber(item.intersections),
      organic_keywords: metricNumber(item.full_domain_metrics?.organic?.count, metricNumber(item.metrics?.organic?.count)),
      organic_etv: metricNumber(item.full_domain_metrics?.organic?.etv, metricNumber(item.metrics?.organic?.etv))
    }))
    .filter((item: CompetitorDomainCandidate) => item.domain);
}

export async function fetchRankedKeywords({
  target,
  locationName,
  languageName,
  limit = 100
}: {
  target: string;
  locationName?: string;
  languageName?: string;
  limit?: number;
}): Promise<RankedKeywordCandidate[] | SkippedResult> {
  const normalizedTarget = normalizeDomain(target);
  const data = await dataForSeoPost("dataforseo_labs/google/ranked_keywords/live", [
    {
      target: normalizedTarget,
      location_name: locationName || "United States",
      language_name: languageName || "English",
      order_by: ["keyword_data.keyword_info.search_volume,desc"],
      limit
    }
  ]);

  if (data.skipped) return { skipped: true, reason: data.reason };

  const items = data?.tasks?.[0]?.result?.[0]?.items || [];
  return items
    .map((item: any) => parseRankedKeyword(item, normalizedTarget))
    .filter((item: RankedKeywordCandidate | null): item is RankedKeywordCandidate => Boolean(item));
}

export async function fetchDomainIntersection({
  target1,
  target2,
  locationName,
  languageName,
  limit = 50
}: {
  target1: string;
  target2: string;
  locationName?: string;
  languageName?: string;
  limit?: number;
}): Promise<DomainIntersectionKeyword[] | SkippedResult> {
  const data = await dataForSeoPost("dataforseo_labs/google/domain_intersection/live", [
    {
      target1: normalizeDomain(target1),
      target2: normalizeDomain(target2),
      location_name: locationName || "United States",
      language_name: languageName || "English",
      include_serp_info: true,
      order_by: ["keyword_data.keyword_info.search_volume,desc"],
      limit
    }
  ]);

  if (data.skipped) return { skipped: true, reason: data.reason };

  const items = data?.tasks?.[0]?.result?.[0]?.items || [];
  return items
    .map((item: any) => parseIntersectionKeyword(item))
    .filter((item: DomainIntersectionKeyword | null): item is DomainIntersectionKeyword => Boolean(item));
}

export async function fetchKeywordIdeas({
  seedKeywords,
  locationName,
  languageName,
  limit = 100
}: {
  seedKeywords: string[];
  locationName?: string;
  languageName?: string;
  limit?: number;
}) {
  const seeds = [...new Set(seedKeywords.filter(Boolean))].slice(0, 20);
  if (!seeds.length) return [];

  const data = await dataForSeoPost("dataforseo_labs/google/keyword_ideas/live", [
    {
      seed_keywords: seeds,
      location_name: locationName || "United States",
      language_name: languageName || "English",
      include_serp_info: true,
      limit
    }
  ]);

  if (data.skipped) return { skipped: true, seedKeywords: seeds, reason: data.reason };

  const items = data?.tasks?.[0]?.result?.[0]?.items || [];
  return items.map((item: any) => parseKeywordCandidate(item, "keyword_ideas"));
}

export async function fetchKeywordSuggestions({
  keyword,
  locationName,
  languageName,
  limit = 50
}: {
  keyword: string;
  locationName?: string;
  languageName?: string;
  limit?: number;
}) {
  if (!keyword.trim()) return [];

  const data = await dataForSeoPost("dataforseo_labs/google/keyword_suggestions/live", [
    {
      keyword,
      location_name: locationName || "United States",
      language_name: languageName || "English",
      include_seed_keyword: true,
      include_serp_info: true,
      limit
    }
  ]);

  if (data.skipped) return { skipped: true, keyword, reason: data.reason };

  const items = data?.tasks?.[0]?.result?.[0]?.items || [];
  return items.map((item: any) => parseKeywordCandidate(item, "keyword_suggestions"));
}

export async function fetchGoogleOrganicSerp({
  keyword,
  locationName,
  languageName
}: {
  keyword: string;
  locationName?: string;
  languageName?: string;
}) {
  const data = await dataForSeoPost("serp/google/organic/live/advanced", [
    {
      keyword,
      location_name: locationName || "United States",
      language_name: languageName || "English",
      depth: 10
    }
  ]);

  if (data.skipped) return { skipped: true, reason: data.reason };

  const items = data?.tasks?.[0]?.result?.[0]?.items || [];
  return items
    .filter((item: any) => item.type === "organic")
    .slice(0, 10)
    .map((item: any) =>
      SerpResultSchema.parse({
        rank: item.rank_group,
        title: item.title,
        url: item.url,
        domain: item.domain,
        description: item.description
      })
    );
}
