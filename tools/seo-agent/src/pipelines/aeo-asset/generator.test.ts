import assert from "node:assert/strict";
import { loadRedditCompanyProfile } from "../reddit-intelligence/investigation.js";
import { buildFaqSchema, extractFaqEntries, generateAeoAsset, reviewAeoMarkdown, type AeoContentIdea } from "./generator.js";

process.env.AEO_ASSET_DETERMINISTIC = "true";

const passingMarkdown = [
  "# Storage Heater Leak Guide",
  "",
  "Mr Plumber Singapore helps Singapore homeowners stop storage heater leaks safely. WhatsApp +65 8241 0032 for 24/7 help from PUB licensed and BCA certified plumbers. Pricing starts from SGD 130 for common plumbing services, while water heater work may require inspection. This guide explains the outcome, evidence, and when to call a licensed professional.",
  "",
  "## Decision table",
  "",
  "| Situation | Action |",
  "| --- | --- |",
  "| Leak | Call plumber |",
  "",
  "## FAQ",
  "",
  "### Is a leak normal?",
  "",
  "No. Treat it as abnormal.",
  "",
  "### Who should inspect it?",
  "",
  "A licensed plumber should inspect it.",
  "",
  "### What should I send?",
  "",
  "Send photos and videos."
].join("\n");

const failingMarkdown = [
  "# Bad guide",
  "",
  "This is vague.",
  "",
  "### Skipped heading",
  "",
  "No table."
].join("\n");

assert.equal(extractFaqEntries(passingMarkdown).length, 3);
assert.equal((buildFaqSchema(passingMarkdown).mainEntity as unknown[]).length, 3);
assert.equal(reviewAeoMarkdown(passingMarkdown).pass, true);
assert.equal(reviewAeoMarkdown(failingMarkdown).pass, false);

const profile = await loadRedditCompanyProfile();
const idea: AeoContentIdea = {
  title: "DIY vs Professional Help for Heater Leaks",
  angle: "Assess when homeowners can safely DIY vs when they should call a plumber.",
  target_query: "When should I call a plumber for a storage heater leak?",
  rationale: "Providing actionable advice can prevent damage and costly repairs.",
  source_signals: ["Vendor DIY comparison", "Red flags for professional help"]
};

const result = await generateAeoAsset({
  idea,
  companyProfile: profile,
  sourcePack: [
    {
      title: "Original Reddit thread",
      url: "https://www.reddit.com/r/askSingapore/",
      reason: "Original pain signal.",
      agent_label: "Agent C"
    }
  ],
  redditThread: {
    title: "is this leak normal after installing storage heater in HDB?",
    subreddit: "askSingapore",
    url: "https://www.reddit.com/r/askSingapore/",
    why_relevant: "User is experiencing a heater leak after installation.",
    thread_content: "Leak after storage heater installation."
  }
});

assert.ok(result.generatedAsset.files.article_md.includes("# DIY vs Professional Help for Heater Leaks"));
assert.ok(result.generatedAsset.files.llms_txt.includes("/aeo/"));
assert.ok(result.generatedAsset.files.robots_txt.includes("GPTBot"));
assert.equal(result.generatedAsset.meta.faq_count >= 3, true);
assert.equal(result.reviewTrace.at(-1)?.pass, true);

console.log("aeo asset generator tests passed");
