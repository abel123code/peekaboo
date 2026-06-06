import { task } from "@trigger.dev/sdk";
import { executeSeoWorkflowRun } from "../../../tools/seo-agent/src/pipelines/content/execute";

export const seoContentWorkflowTask = task({
  id: "seo-content-workflow",
  queue: {
    concurrencyLimit: 1
  },
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30_000,
    factor: 2,
    randomize: true
  },
  maxDuration: 7200,
  run: async (payload: { runId: string }, { ctx }) => {
    return executeSeoWorkflowRun(payload.runId, {
      artifactMode: "supabase",
      triggerRunId: ctx.run.id
    });
  }
});
