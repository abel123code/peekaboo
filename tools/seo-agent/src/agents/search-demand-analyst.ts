import { fetchKeywordOverview } from "../lib/dataforseo-client.js";
import { generateStructured } from "../lib/langchain-client.js";
import { SearchDemandSeedSchema, type SeoContentTask } from "../schemas.js";

export async function searchDemandAnalyst(task: SeoContentTask) {
  const seedKeywords = await generateStructured({
    schema: SearchDemandSeedSchema,
    schemaName: "search_demand_seed_keywords",
    systemInstruction:
      "You are a Search Demand Analyst. Produce practical AEO keyword and question ideas for a content workflow.",
    userPrompt: `
Create keyword and question ideas for this AEO content task.

Website: ${task.website.name} (${task.website.url})
Website context: ${task.website.context}
Goal: ${task.goal}
Topic: ${task.topic}
Target keyword: ${task.targetKeyword}
Audience: ${task.audience || "Not specified"}
Location: ${task.locationName}
Language: ${task.languageName}
`
  });

  const keywordsToScore = [
    seedKeywords.primary_keyword,
    ...seedKeywords.secondary_keywords,
    ...seedKeywords.long_tail_keywords,
    ...seedKeywords.question_keywords
  ];

  const metrics = await fetchKeywordOverview({
    keywords: keywordsToScore,
    locationName: task.locationName,
    languageName: task.languageName
  });

  return {
    agent: "Search Demand Analyst",
    seed_keywords: seedKeywords,
    keyword_metrics: metrics
  };
}
