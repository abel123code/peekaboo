#!/usr/bin/env node
import { loadEnv } from "./config.js";
import { loadRedditCompanyProfile, runRedditInvestigation } from "./pipelines/reddit-intelligence/investigation.js";

async function main() {
  loadEnv();
  const profile = await loadRedditCompanyProfile();
  const result = await runRedditInvestigation(profile, {
    onStageUpdate: (stage) => {
      console.log(`[stage] ${stage}`);
    }
  });

  console.log(JSON.stringify(result.trace, null, 2));
}

main().catch((error) => {
  console.error("Reddit investigation failed.");
  console.error(error);
  process.exitCode = 1;
});
