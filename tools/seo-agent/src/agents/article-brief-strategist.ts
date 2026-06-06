import { generateStructured } from "../lib/langchain-client.js";
import { ArticleBriefSchema, type SeoContentTask } from "../schemas.js";

export async function articleBriefStrategist(
  task: SeoContentTask,
  searchDemand: unknown,
  competitorResearch: unknown,
  icpPainHypothesis: unknown
) {
  const brief = await generateStructured({
    schema: ArticleBriefSchema,
    schemaName: "article_brief",
    systemInstruction:
      "You are an Article Brief Strategist. Turn SEO research into a clear writing brief.",
    userPrompt: `
Create an article brief.

Task:
${JSON.stringify(task, null, 2)}

Search demand:
${JSON.stringify(searchDemand, null, 2)}

Competitor research:
${JSON.stringify(competitorResearch, null, 2)}

ICP pain hypothesis:
${JSON.stringify((icpPainHypothesis as any).icp_pain_hypothesis, null, 2)}

Rules:
- Use the ICP pain hypothesis to make reader_problem, promise, article_angle, and writing_constraints specific.
- Keep the brief aligned with the dominant SEO search intent and must-cover topics.
- Do not claim the ICP hypothesis is proven demographic data.
`
  });

  return {
    agent: "Article Brief Strategist",
    brief
  };
}
