import assert from "node:assert/strict";
import { loadRedditCompanyProfile } from "../reddit-intelligence/investigation.js";
import { runCodexResearch, type CodexSelectedRedditThread } from "./research.js";

process.env.CODEX_RESEARCH_DETERMINISTIC = "true";

const thread: CodexSelectedRedditThread = {
  reddit_id: "test-thread",
  subreddit: "askSingapore",
  title: "HDB toilet overflow and leaking to downstairs neighbour",
  url: "https://www.reddit.com/r/askSingapore/",
  why_relevant: "Direct urgent plumbing pain with HDB responsibility context.",
  thread_content: "Toilet overflowed and downstairs neighbour is complaining about ceiling stains.",
  relevance_score: 95,
  urgency_score: 94,
  commercial_intent_score: 90
};

const profile = await loadRedditCompanyProfile();
const result = await runCodexResearch({
  profile,
  selectedThread: thread,
  forceVirtual: true
});

assert.equal(result.executionMode, "virtual_fallback");
assert.equal(result.trace.plan.length, 3);
assert.equal(result.subagents.length, 3);
assert.ok(result.trace.events.length >= 6);
assert.ok(result.trace.events.some((event) => event.type === "source_access"));
assert.ok(result.trace.trusted_sources.some((source) => source.url === thread.url));
assert.ok(result.contentBrief?.title);
assert.equal(result.contentBrief?.content_ideas.length, 3);
assert.ok(result.proposedSkillDiff.includes("Proposed Skill Diff"));

console.log("codex research full-run test passed");
