import { generateStructured, generateText } from "../lib/langchain-client.js";
import { normalizePostMetadata } from "../lib/metadata-normalizer.js";
import { PostMetadataSchema, WrittenPostSchema, type SeoContentTask } from "../schemas.js";

export async function longFormContentWriter(
  task: SeoContentTask,
  brief: unknown,
  outline: unknown,
  ctaPlacement: unknown,
  icpPainHypothesis: unknown
) {
  const placement = (ctaPlacement as any).placement;
  const rawMetadata = await generateStructured({
    schema: PostMetadataSchema,
    schemaName: "post_metadata",
    systemInstruction:
      "You are a Long Form Content Writer for AEO articles. Create concise production-ready answer-engine metadata.",
    userPrompt: `
Create the fixed AEO metadata for this article.

Website:
${JSON.stringify(task.website, null, 2)}

Goal: ${task.goal}
Topic: ${task.topic}
Target keyword: ${task.targetKeyword}
Audience: ${task.audience || "Not specified"}
Brand voice: ${task.brandVoice || "Clear, helpful, expert, and practical."}

Brief:
${JSON.stringify((brief as any).brief, null, 2)}

Outline:
${JSON.stringify((outline as any).outline, null, 2)}

ICP pain hypothesis:
${JSON.stringify((icpPainHypothesis as any).icp_pain_hypothesis, null, 2)}

Rules:
- The CTA button URL must be the website URL: ${task.website.url}
- Use this CTA copy unless it is clearly unsuitable:
${JSON.stringify(placement?.cta, null, 2)}
- meta_description must be 150 to 160 characters.
`
  });
  const metadata = normalizePostMetadata(rawMetadata, task);

  const content = await generateText({
    systemInstruction: `
You are a Long Form Content Writer for AEO articles.
Write useful, specific, human-sounding content.
Return only Markdown.
Do not wrap the Markdown in JSON or code fences.
Start at H2 level. Do not include an H1 because the title is stored separately.
`,
    userPrompt: `
Write the flexible Markdown body for this article.

Title: ${metadata.title}
Target keyword: ${metadata.target_keyword || task.targetKeyword}
Meta description angle: ${(outline as any).outline?.meta_description_angle || ""}

Website:
${JSON.stringify(task.website, null, 2)}

Goal: ${task.goal}
Topic: ${task.topic}
Audience: ${task.audience || "Not specified"}
Brand voice: ${task.brandVoice || "Clear, helpful, expert, and practical."}

Brief:
${JSON.stringify((brief as any).brief, null, 2)}

Outline:
${JSON.stringify((outline as any).outline, null, 2)}

ICP pain hypothesis:
${JSON.stringify((icpPainHypothesis as any).icp_pain_hypothesis, null, 2)}

CTA placement strategy:
${JSON.stringify(placement, null, 2)}

Requirements:
- Begin with a ## heading.
- Include practical comparison content, buying guidance, and FAQs where relevant.
- Use Markdown tables where useful.
- Naturally include the target keyword and close variants.
- Use the ICP pain hypothesis to sharpen the intro, examples, objections, decision criteria, and CTA setup.
- Keep the article intent-first; do not narrow the article so much that it fails to answer the target keyword.
- Avoid the framing listed in language_to_avoid when it is relevant.
- Include exactly one CTA marker.
- Place the CTA marker immediately after the section whose heading best matches: "${placement?.after_section_heading || ""}".
- Do not place the CTA in the conclusion, final takeaway section, or FAQ section unless the CTA placement strategy explicitly chose that location.
- If you cannot use the exact heading, place it after the closest matching high-intent section and keep it away from the ending.
- CTA marker format must be exactly:
  :::cta
  headline: ${placement?.cta?.headline || "Your CTA headline"}
  description: ${placement?.cta?.description || "Your CTA description"}
  button: ${placement?.cta?.button_label || "Your button label"}
  :::
- Do not invent unverifiable test results, prices, awards, or claims.
`
  });

  const post = WrittenPostSchema.parse({
    ...metadata,
    content
  });

  return {
    agent: "Long Form Content Writer",
    post
  };
}
