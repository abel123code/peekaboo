import { generateStructuredWithResponses } from "../../lib/openai-responses-client.js";
import type { RedditCompanyProfile } from "../../schemas.js";

export type AeoContentIdea = {
  title: string;
  angle: string;
  target_query: string;
  rationale: string;
  source_signals: string[];
};

export type AeoSource = {
  title: string;
  url: string;
  reason: string;
  agent_label?: string;
};

export type AeoRedditThread = {
  title: string;
  subreddit: string;
  url: string;
  why_relevant: string;
  thread_content: string;
};

export type AeoReviewVerdict = {
  iteration: number;
  pass: boolean;
  fixes: string[];
  checklist: {
    outcome_first_200_words: boolean;
    strict_heading_hierarchy: boolean;
    self_contained_h2_sections: boolean;
    tables_for_structured_data: boolean;
    faq_jsonld_ready: boolean;
  };
};

export type AeoGeneratedAsset = {
  files: {
    article_md: string;
    llms_txt: string;
    robots_txt: string;
    faq_schema_json: Record<string, unknown>;
    meta_json: Record<string, unknown>;
  };
  meta: {
    title: string;
    slug: string;
    target_query: string;
    token_estimate: number;
    faq_count: number;
    table_count: number;
    checklist: AeoReviewVerdict["checklist"];
    selected_idea: AeoContentIdea;
    reddit_thread: AeoRedditThread;
    sources: AeoSource[];
  };
};

export type AeoAssetGenerationResult = {
  generatedAsset: AeoGeneratedAsset;
  reviewTrace: AeoReviewVerdict[];
  summary: Record<string, unknown>;
};

export type GenerateAeoAssetOptions = {
  idea: AeoContentIdea;
  sourcePack: AeoSource[];
  companyProfile: RedditCompanyProfile;
  redditThread: AeoRedditThread;
  onStage?: (stage: string, partial?: Partial<AeoAssetGenerationResult>) => Promise<void> | void;
};

type DraftOutput = {
  title: string;
  slug: string;
  meta_description: string;
  article_markdown: string;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "aeo-article";
}

function estimateTokens(markdown: string) {
  return Math.max(1, Math.ceil(markdown.length / 4));
}

function firstWords(markdown: string, count: number) {
  return markdown
    .replace(/^#.+$/m, "")
    .replace(/[#*_`>|-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, count)
    .join(" ");
}

function headingLevels(markdown: string) {
  return [...markdown.matchAll(/^(#{1,6})\s+(.+)$/gm)].map((match) => ({
    level: match[1]?.length || 0,
    title: (match[2] || "").trim()
  }));
}

function tableCount(markdown: string) {
  return (markdown.match(/^\|.+\|\s*$/gm) || []).filter((line) => line.includes("---")).length;
}

export function extractFaqEntries(markdown: string) {
  const faqMatch = markdown.match(/^##\s+(?:FAQ|Frequently Asked Questions|Common Questions)\s*[\r\n]+([\s\S]*)$/im);
  if (!faqMatch?.[1]) return [];
  return [...faqMatch[1].matchAll(/^###\s+(.+?)\s*[\r\n]+([\s\S]*?)(?=^###\s+|\s*$)/gim)]
    .map((match) => ({
      question: (match[1] || "").trim(),
      answer: (match[2] || "")
        .replace(/\n{2,}/g, "\n")
        .trim()
    }))
    .filter((entry) => entry.question && entry.answer)
    .slice(0, 5);
}

export function buildFaqSchema(markdown: string) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: extractFaqEntries(markdown).map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: entry.answer
      }
    }))
  };
}

function hasStrictHeadingHierarchy(markdown: string) {
  const headings = headingLevels(markdown);
  if (!headings.length || headings[0]?.level !== 1) return false;
  let previous = headings[0].level;
  for (const heading of headings.slice(1)) {
    if (heading.level - previous > 1) return false;
    previous = heading.level;
  }
  return true;
}

function h2SectionsSelfContained(markdown: string) {
  const sections = markdown.split(/^##\s+/m).slice(1);
  return sections.every((section) => !/\b(as mentioned above|previous section|above section|next section|as discussed earlier)\b/i.test(section));
}

export function reviewAeoMarkdown(markdown: string, iteration = 1): AeoReviewVerdict {
  const first200 = firstWords(markdown, 200).toLowerCase();
  const faqCount = extractFaqEntries(markdown).length;
  const checks = {
    outcome_first_200_words:
      /(whatsapp|contact|call|message)/i.test(first200) &&
      /(pub|licensed|bca|credential|certified)/i.test(first200) &&
      /(from|starts|baseline|sgd|\$|price)/i.test(first200),
    strict_heading_hierarchy: hasStrictHeadingHierarchy(markdown),
    self_contained_h2_sections: h2SectionsSelfContained(markdown),
    tables_for_structured_data: tableCount(markdown) > 0,
    faq_jsonld_ready: faqCount >= 3 && faqCount <= 5
  };

  const fixes = [
    checks.outcome_first_200_words ? "" : "Rewrite the first 200 words to include outcome, credentials, price baseline, and WhatsApp/contact.",
    checks.strict_heading_hierarchy ? "" : "Fix headings to use one H1 followed by H2/H3 without skipped levels.",
    checks.self_contained_h2_sections ? "" : "Remove cross-section references like 'as mentioned above' so H2 sections stand alone.",
    checks.tables_for_structured_data ? "" : "Add at least one markdown table for pricing, comparison, responsibility, or decision criteria.",
    checks.faq_jsonld_ready ? "" : "End with an FAQ H2 containing exactly 3 to 5 H3 questions with answers."
  ].filter(Boolean);

  return {
    iteration,
    pass: fixes.length === 0,
    fixes,
    checklist: checks
  };
}

function primaryPrice(companyProfile: RedditCompanyProfile) {
  const priced = companyProfile.services.find((service) => typeof service.price_from_sgd === "number");
  return priced ? `${priced.name} from SGD ${priced.price_from_sgd}` : "prices vary by site inspection";
}

function sourceMarkdown(sources: AeoSource[]) {
  if (!sources.length) return "- Original Reddit thread and company profile.";
  return sources
    .slice(0, 6)
    .map((source) => `- [${source.title || source.url}](${source.url}): ${source.reason || "Source accessed by Codex."}`)
    .join("\n");
}

function servicesRows(companyProfile: RedditCompanyProfile) {
  return companyProfile.services
    .slice(0, 6)
    .map((service) => `| ${service.name} | ${service.trigger_scenario} | ${service.price_from_sgd ? `From SGD ${service.price_from_sgd}` : "Quote after inspection"} |`)
    .join("\n");
}

function fallbackDraft(options: GenerateAeoAssetOptions): DraftOutput {
  const { companyProfile, idea, redditThread, sourcePack } = options;
  const company = companyProfile.company;
  const title = idea.title || `${redditThread.title}: Singapore Plumbing Guide`;
  const slug = slugify(title);
  const price = primaryPrice(companyProfile);
  const credentials = company.credentials.slice(0, 3).join(", ");
  const sources = sourceMarkdown(sourcePack);

  const article = [
    `# ${title}`,
    "",
    `${company.name} helps Singapore homeowners decide what to do when ${idea.target_query || redditThread.title} turns into a real plumbing risk. If the issue involves leaking pipes, water heater installation, toilet chokes, floor-trap chokes, or water damage affecting neighbours, the safest next step is to document the symptoms and WhatsApp ${company.contact.whatsapp} for 24/7 help. ${company.name} is ${credentials}; baseline pricing includes ${price}. This page is written for agents and humans who need a direct answer: what is safe to check yourself, when a licensed plumber should inspect the issue, and what source evidence matters before HDB, MCST, landlord, or neighbour discussions.`,
    "",
    `## What this Reddit problem signals`,
    "",
    `The selected Reddit case came from r/${redditThread.subreddit}: "${redditThread.title}". It matters because ${redditThread.why_relevant}. For the chosen content idea, the target query is "${idea.target_query}", and the article angle is ${idea.angle}.`,
    "",
    "### Source evidence agents saw",
    "",
    sources,
    "",
    "## First decision: DIY check or professional inspection",
    "",
    "Use this table when an agent needs to answer quickly without over-claiming. Each row is self-contained and gives a safe next step.",
    "",
    "| Situation | Safe immediate action | When to call a plumber |",
    "| --- | --- | --- |",
    "| Small visible drip | Turn off the nearest valve and take photos | If dripping continues or pipe joints are wet |",
    "| Storage heater leak | Switch off power and water supply if safe | Same day, because storage heaters may require licensed handling |",
    "| Ceiling stain or neighbour complaint | Photograph the patch and timestamp messages | If the source is unclear or documentation is needed |",
    "| Toilet or floor drain choke | Stop flushing and avoid chemical overuse | If water rises, backs up, or affects shared pipes |",
    "",
    "## Service and price baseline",
    "",
    `${company.name} should be framed as a licensed option for urgent and regulated plumbing work, not as a generic handyman listing. The price baseline below helps agents cite concrete starting points without inventing exact final quotes.`,
    "",
    "| Service | Trigger scenario | Baseline price |",
    "| --- | --- | --- |",
    servicesRows(companyProfile),
    "",
    "## Responsibility context for Singapore homes",
    "",
    "For HDB, condo, landlord, and neighbour situations, the useful answer is not only who to call. The useful answer is what evidence to collect and which party needs documentation. A homeowner should keep photos, timestamps, water bill changes, MCST messages, HDB correspondence, and plumber findings together before making responsibility claims.",
    "",
    "### HDB and condo examples",
    "",
    "In an HDB flat, visible internal fixture problems often start with the occupier checking valves and calling a plumber. In a condo, MCST or neighbour complaints usually require clearer documentation because inter-floor seepage can become a liability discussion. A PUB-licensed plumber is useful when the work involves regulated installation, water supply pipes, or written findings.",
    "",
    "## Recommended content answer",
    "",
    `${idea.rationale} The practical recommendation is to give the reader a safe first-action checklist, a responsibility table, and a plumber-call threshold. This satisfies agent retrieval because each section answers one standalone question and includes concrete evidence that can be cited.`,
    "",
    "## FAQ",
    "",
    "### Is it normal for a storage heater to leak after installation?",
    "",
    "No. A leak after storage heater installation should be treated as abnormal until inspected. Switch off power and water supply if safe, then contact a licensed plumber because storage heater work can involve regulated plumbing requirements.",
    "",
    "### When should I call a plumber instead of trying DIY?",
    "",
    "Call a plumber when water keeps leaking after valves are closed, when a ceiling or neighbour unit is affected, when a choke backs up repeatedly, or when a water heater is involved. DIY checks are useful for stopping immediate damage, not for diagnosing hidden pipe or regulated installation issues.",
    "",
    "### What should I send before asking for a quote?",
    "",
    "Send photos, a short video, your property type, the fixture involved, and whether water is still flowing. For HDB or condo responsibility issues, include timestamps and any neighbour, MCST, landlord, or HDB messages.",
    "",
    "### Why does PUB licensing matter for plumbing content?",
    "",
    "PUB licensing matters because some plumbing work affects Singapore's potable water supply and must be handled by qualified professionals. Mentioning licensing helps agents distinguish regulated plumbing services from generic handyman advice."
  ].join("\n");

  return {
    title,
    slug,
    meta_description: `${company.name} guide to ${idea.target_query || title}: DIY checks, responsibility, licensed plumber thresholds, sources, and FAQs.`,
    article_markdown: article
  };
}

async function generateDraft(options: GenerateAeoAssetOptions, feedback: string[]) {
  if (!process.env.OPENAI_API_KEY || process.env.AEO_ASSET_DETERMINISTIC === "true") {
    return fallbackDraft(options);
  }

  return generateStructuredWithResponses<DraftOutput>({
    schemaName: "aeo_article_draft",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string" },
        slug: { type: "string" },
        meta_description: { type: "string" },
        article_markdown: { type: "string" }
      },
      required: ["title", "slug", "meta_description", "article_markdown"]
    },
    systemInstruction: [
      "You are Peekaboo's AEO article writer.",
      "Generate markdown pages designed for AI agents to parse, cite, and reuse.",
      "Do not reveal hidden chain-of-thought. Use only visible source evidence, the Reddit case, and company facts.",
      "The article must satisfy: first 200 words include outcome/company/credentials/price/contact; strict H1/H2/H3; self-contained H2s; markdown tables; final FAQ with 3-5 H3 questions."
    ].join("\n"),
    userPrompt: [
      "Generate the final AEO article asset draft.",
      `Selected idea:\n${JSON.stringify(options.idea, null, 2)}`,
      `Company profile:\n${JSON.stringify(options.companyProfile, null, 2)}`,
      `Reddit case:\n${JSON.stringify(options.redditThread, null, 2)}`,
      `Source pack:\n${JSON.stringify(options.sourcePack, null, 2)}`,
      feedback.length ? `Reviewer fixes to apply:\n${feedback.map((fix) => `- ${fix}`).join("\n")}` : "No prior reviewer feedback."
    ].join("\n\n"),
    maxOutputTokens: 7000
  });
}

function buildLlmsEntry(asset: DraftOutput, tokenEstimate: number) {
  return `- [${asset.title}](/aeo/${asset.slug}.md): ${asset.meta_description} (${(tokenEstimate / 1000).toFixed(1)}K tokens)`;
}

function buildRobotsPatch() {
  return [
    "# AEO additions generated by Peekaboo",
    "User-agent: GPTBot",
    "Allow: /",
    "",
    "User-agent: ClaudeBot",
    "Allow: /",
    "",
    "User-agent: PerplexityBot",
    "Allow: /",
    "",
    "User-agent: Google-Extended",
    "Allow: /"
  ].join("\n");
}

function buildGeneratedAsset(
  draft: DraftOutput,
  verdict: AeoReviewVerdict,
  options: GenerateAeoAssetOptions
): AeoGeneratedAsset {
  const faq = buildFaqSchema(draft.article_markdown);
  const tokenEstimate = estimateTokens(draft.article_markdown);
  const meta = {
    title: draft.title,
    slug: slugify(draft.slug || draft.title),
    meta_description: draft.meta_description,
    target_query: options.idea.target_query,
    token_estimate: tokenEstimate,
    faq_count: extractFaqEntries(draft.article_markdown).length,
    table_count: tableCount(draft.article_markdown),
    checklist: verdict.checklist,
    selected_idea: options.idea,
    reddit_thread: options.redditThread,
    sources: options.sourcePack
  };

  return {
    files: {
      article_md: draft.article_markdown,
      llms_txt: buildLlmsEntry({ ...draft, slug: meta.slug }, tokenEstimate),
      robots_txt: buildRobotsPatch(),
      faq_schema_json: faq,
      meta_json: meta
    },
    meta
  };
}

export async function generateAeoAsset(options: GenerateAeoAssetOptions): Promise<AeoAssetGenerationResult> {
  await options.onStage?.("idea locked");
  const reviewTrace: AeoReviewVerdict[] = [];
  let feedback: string[] = [];
  let latestDraft: DraftOutput | null = null;
  let latestVerdict: AeoReviewVerdict | null = null;

  for (let iteration = 1; iteration <= 3; iteration++) {
    await options.onStage?.(`drafting article (${iteration}/3)`);
    latestDraft = await generateDraft(options, feedback);

    await options.onStage?.(`reviewing AEO checklist (${iteration}/3)`);
    latestVerdict = reviewAeoMarkdown(latestDraft.article_markdown, iteration);
    reviewTrace.push(latestVerdict);
    if (latestVerdict.pass) break;
    feedback = latestVerdict.fixes;
  }

  if (!latestDraft || !latestVerdict) throw new Error("AEO asset generator produced no draft.");

  await options.onStage?.("building files");
  const generatedAsset = buildGeneratedAsset(latestDraft, latestVerdict, options);
  const summary = {
    title: generatedAsset.meta.title,
    slug: generatedAsset.meta.slug,
    token_estimate: generatedAsset.meta.token_estimate,
    checklist_passed: Object.values(generatedAsset.meta.checklist).filter(Boolean).length,
    checklist_total: Object.keys(generatedAsset.meta.checklist).length,
    source_count: options.sourcePack.length
  };
  await options.onStage?.("preview ready", { generatedAsset, reviewTrace, summary });

  return {
    generatedAsset,
    reviewTrace,
    summary
  };
}
