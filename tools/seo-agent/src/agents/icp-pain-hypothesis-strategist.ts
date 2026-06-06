import { generateStructured } from "../lib/langchain-client.js";
import { IcpPainHypothesisSchema, type SeoContentTask } from "../schemas.js";

export async function icpPainHypothesisStrategist(
  task: SeoContentTask,
  searchDemand: unknown,
  competitorResearch: unknown
) {
  const hypothesis = await generateStructured({
    schema: IcpPainHypothesisSchema,
    schemaName: "icp_pain_hypothesis",
    systemInstruction: `
You are an ICP Pain Hypothesis Strategist for AEO content.
Infer the reader's most urgent problem from the supplied audience, topic, keyword, website context, goal, keyword ideas, and SERP analysis.
Use the supplied audience as the main source of truth. SEO data can clarify search intent and coverage, but it does not prove demographics or buyer identity.
Create a practical hypothesis that helps writers make the article more specific while still satisfying the target keyword's dominant search intent.
`,
    userPrompt: `
Create an ICP pain hypothesis for this AEO article.

Website:
${JSON.stringify(task.website, null, 2)}

Goal: ${task.goal}
Topic: ${task.topic}
Target keyword: ${task.targetKeyword}
Audience: ${task.audience || "Not specified"}
Location: ${task.locationName}
Language: ${task.languageName}

Search demand:
${JSON.stringify(searchDemand, null, 2)}

Competitor research:
${JSON.stringify(competitorResearch, null, 2)}

Decision framework:
- Treat the stated audience as the ICP source of truth when provided.
- Identify the strongest "hair on fire" problem that would make this reader search now.
- Separate urgent trigger moments from general interest.
- Identify what the reader must believe, compare, or feel confident about before taking action.
- Keep the article intent-first: the final article must still satisfy the keyword broadly enough for SEO.
- Mark confidence low if the audience is missing or the hypothesis relies mostly on assumptions.
`
  });

  return {
    agent: "ICP Pain Hypothesis Strategist",
    icp_pain_hypothesis: hypothesis
  };
}
