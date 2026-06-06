import { generateStructured } from "../lib/langchain-client.js";
import { SeoOutlineSchema, type SeoContentTask } from "../schemas.js";

export async function seoOutlineArchitect(
  task: SeoContentTask,
  brief: unknown,
  competitorResearch: unknown,
  icpPainHypothesis: unknown
) {
  const outline = await generateStructured({
    schema: SeoOutlineSchema,
    schemaName: "seo_article_outline",
    systemInstruction:
      "You are an AEO Outline Architect. Build an answer-focused article structure that can surface in AI answer engines.",
    userPrompt: `
Build the outline for this article.

Topic: ${task.topic}
Target keyword: ${task.targetKeyword}
Brief:
${JSON.stringify((brief as any).brief, null, 2)}

SERP analysis:
${JSON.stringify((competitorResearch as any).serp_analysis, null, 2)}

ICP pain hypothesis:
${JSON.stringify((icpPainHypothesis as any).icp_pain_hypothesis, null, 2)}

Rules:
- Cover the keyword's dominant search intent completely.
- Use the ICP pain hypothesis to choose section emphasis, examples, comparison points, and FAQ angles.
- Include sections that address the reader's trigger moments, decision criteria, and anxieties when relevant.
`
  });

  return {
    agent: "AEO Outline Architect",
    outline
  };
}
