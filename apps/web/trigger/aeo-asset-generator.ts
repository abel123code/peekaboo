import { task } from "@trigger.dev/sdk";
import { executeAeoAssetRun } from "../../../tools/seo-agent/src/pipelines/aeo-asset/execute";

export const aeoAssetGeneratorTask = task({
  id: "aeo-asset-generator",
  queue: {
    concurrencyLimit: 1
  },
  retry: {
    maxAttempts: 1
  },
  maxDuration: 1800,
  run: async (payload: { runId: string }, { ctx }) => {
    return executeAeoAssetRun(payload.runId, {
      triggerRunId: ctx.run.id
    });
  }
});
