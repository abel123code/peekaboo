import { generateStructured } from "../lib/langchain-client.js";
import { CompetitorIntelligencePlanSchema, type CompanyProfile } from "../schemas.js";

export type CompetitorStrategyCandidate = {
  keyword: string;
  recommendation_type: "gap" | "weak_overlap" | "existing_opportunity";
  search_volume: number;
  cpc: number;
  competition: string | null;
  keyword_difficulty: number | null;
  intent: string | null;
  source_competitors: string[];
  competitor_best_rank: number | null;
  client_rank: number | null;
  existing_opportunity_score: number | null;
  coverage_status: "uncovered" | "in_progress" | "published";
  evidence_summary: string;
};

export async function competitorIntelligenceStrategist({
  client,
  profile,
  memoryMarkdown,
  candidates
}: {
  client: {
    name: string;
    websiteUrl: string;
    websiteContext: string;
    defaultAudience?: string | null;
    brandVoice?: string | null;
    locationName: string;
    languageName: string;
  };
  profile: CompanyProfile;
  memoryMarkdown: string;
  candidates: CompetitorStrategyCandidate[];
}) {
  return generateStructured({
    schema: CompetitorIntelligencePlanSchema,
    schemaName: "competitor_intelligence_plan",
    systemInstruction:
      "You are a senior AEO strategist. Recommend answer-ready content actions from competitor ranking gaps, existing keyword data, and published coverage.",
    userPrompt: `
Create a concise competitor intelligence recommendation plan.

Client:
${JSON.stringify(client, null, 2)}

Structured company profile:
${JSON.stringify(profile, null, 2)}

Existing strategy memory:
${memoryMarkdown || "(No prior memory.)"}

Candidate opportunities:
${JSON.stringify(candidates.slice(0, 60), null, 2)}

Instructions:
- Recommend only keywords from the provided candidates.
- Do not recommend candidates with coverage_status "published".
- Prefer "gap" and "weak_overlap" items where competitors are visibly winning and the client can credibly satisfy the search intent.
- Use existing_opportunity_score as supporting context, not the only decision factor.
- Return 3 to 8 recommendations.
- Make suggested_goal suitable for the existing article writer.
- Keep rationales specific to competitor evidence, client fit, and whether the topic is not yet covered.
- Scores should be whole numbers from 0 to 100.
`
  });
}
