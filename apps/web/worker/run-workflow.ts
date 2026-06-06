import { executeSeoWorkflowRun } from "../../../tools/seo-agent/src/pipelines/content/execute";

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error("Usage: tsx worker/run-workflow.ts <run-id>");

  await executeSeoWorkflowRun(runId, {
    artifactMode: "local"
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
