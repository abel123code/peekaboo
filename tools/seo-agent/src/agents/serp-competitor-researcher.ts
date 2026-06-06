import { fetchGoogleOrganicSerp } from "../lib/dataforseo-client.js";
import { generateStructured } from "../lib/langchain-client.js";
import { SerpAnalysisSchema, type SeoContentTask } from "../schemas.js";

export async function serpCompetitorResearcher(task: SeoContentTask, searchDemand: unknown) {
  const serpResults = await fetchGoogleOrganicSerp({
    keyword: task.targetKeyword,
    locationName: task.locationName,
    languageName: task.languageName
  });

  const analysis = await generateStructured({
    schema: SerpAnalysisSchema,
    schemaName: "serp_competitor_analysis",
    systemInstruction:
      "You are a SERP Competitor Researcher. Infer search intent and competitor patterns from keyword and SERP data.",
    userPrompt: `
Analyze the SEO opportunity.

Target keyword: ${task.targetKeyword}
Topic: ${task.topic}
Keyword metrics:
${JSON.stringify((searchDemand as any).keyword_metrics, null, 2)}

SERP results:
${JSON.stringify(serpResults, null, 2)}
`
  });

  return {
    agent: "SERP Competitor Researcher",
    serp_results: serpResults,
    serp_analysis: analysis
  };
}
