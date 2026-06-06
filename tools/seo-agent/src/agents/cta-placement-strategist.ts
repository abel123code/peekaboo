import { generateStructured } from "../lib/langchain-client.js";
import { CtaPlacementSchema, type SeoContentTask } from "../schemas.js";

export async function ctaPlacementStrategist(
  task: SeoContentTask,
  brief: unknown,
  outline: unknown,
  icpPainHypothesis: unknown
) {
  const placement = await generateStructured({
    schema: CtaPlacementSchema,
    schemaName: "cta_placement_strategy",
    systemInstruction: `
You are a CTA Placement Strategist for commercial AEO articles.
Your job is to choose the single best conversion moment inside the article.
Do not choose the conclusion, final takeaway section, or FAQ section unless there is truly no better option.
Prefer a point where the reader has just recognized a problem, compared options, or learned when the product is useful.
`,
    userPrompt: `
Choose where the CTA should appear in this article.

Website: ${task.website.name} (${task.website.url})
Goal: ${task.goal}
Topic: ${task.topic}
Target keyword: ${task.targetKeyword}
Audience: ${task.audience || "Not specified"}

Brief:
${JSON.stringify((brief as any).brief, null, 2)}

Outline:
${JSON.stringify((outline as any).outline, null, 2)}

ICP pain hypothesis:
${JSON.stringify((icpPainHypothesis as any).icp_pain_hypothesis, null, 2)}

Rules:
- Select one heading from the outline sections.
- The CTA will be inserted immediately after that section.
- The CTA should feel helpful, not pushy.
- The button URL is handled by code, so do not include a URL.
- Button label should be short and brand-relevant.
- Match the CTA to the ICP's decision criteria, anxieties, and likely reader state at that point.
`
  });

  return {
    agent: "CTA Placement Strategist",
    placement
  };
}
