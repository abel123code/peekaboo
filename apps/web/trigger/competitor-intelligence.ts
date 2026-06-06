import { task } from "@trigger.dev/sdk";
import { executeCompetitorIntelligenceRun } from "../../../tools/seo-agent/src/pipelines/competitor-intel/execute";

export const competitorIntelligenceTask = task({
  id: "competitor-intelligence",
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
  maxDuration: 3600,
  run: async (payload: { runId: string }, { ctx }) => {
    return executeCompetitorIntelligenceRun(payload.runId, {
      triggerRunId: ctx.run.id
    });
  }
});
