import { loadEnv } from "./config.js";
import { loadRedditCompanyProfile } from "./pipelines/reddit-intelligence/investigation.js";
import { runCodexResearch, type CodexSelectedRedditThread } from "./pipelines/codex-research/research.js";

loadEnv();

const sampleThread: CodexSelectedRedditThread = {
  reddit_id: "sample",
  subreddit: "askSingapore",
  title: "HDB toilet overflow and neighbour leak responsibility",
  url: "https://www.reddit.com/r/askSingapore/",
  why_relevant: "Sample Module 2 smoke-test thread for urgent HDB plumbing responsibility research.",
  thread_content:
    "A homeowner has a toilet overflow, worries about water leaking to the unit below, and is not sure whether to call HDB, MCST, landlord, upstairs neighbour, or an emergency plumber.",
  relevance_score: 95,
  urgency_score: 92,
  commercial_intent_score: 88
};

async function main() {
  const profile = await loadRedditCompanyProfile();
  const result = await runCodexResearch({
    profile,
    selectedThread: sampleThread,
    forceVirtual: process.argv.includes("--virtual"),
    onUpdate: (snapshot) => {
      console.error(`${snapshot.executionMode}: ${snapshot.currentStage} (${snapshot.trace.events.length} events)`);
    }
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
