import { generateStructured } from "../lib/langchain-client.js";
import { SeoReviewSchema, type SeoContentTask } from "../schemas.js";

export async function editorialSeoReviewer(
  task: SeoContentTask,
  writtenPost: unknown,
  ctaPlacement: unknown,
  icpPainHypothesis: unknown
) {
  const review = await generateStructured({
    schema: SeoReviewSchema,
    schemaName: "editorial_seo_review",
    systemInstruction:
      "You are an Editorial AEO Reviewer. Check the draft for answer quality, citation-readiness, completeness, and practical usefulness.",
    userPrompt: `
Review this article draft.

Target keyword: ${task.targetKeyword}
Goal: ${task.goal}

Draft:
${JSON.stringify((writtenPost as any).post, null, 2)}

CTA placement strategy:
${JSON.stringify((ctaPlacement as any).placement, null, 2)}

ICP pain hypothesis:
${JSON.stringify((icpPainHypothesis as any).icp_pain_hypothesis, null, 2)}

Review rules:
- Check whether the article uses the ICP pain hypothesis to make the writing specific without ignoring the target keyword's search intent.
- Flag generic writing that does not address the stated hair-on-fire problem, decision criteria, or anxieties.
- Check whether the CTA marker appears at an appropriate conversion moment.
- Flag it if the CTA only appears at the very end, conclusion, final takeaway, or FAQ section when the strategy did not choose that.
- Include cta_review with placement_is_appropriate, cta_is_not_at_end_only, and notes.
`
  });

  return {
    agent: "Editorial AEO Reviewer",
    review
  };
}
