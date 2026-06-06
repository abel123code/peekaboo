import { task } from "@trigger.dev/sdk";
import { executeRedditIntelligenceRun } from "../../../tools/seo-agent/src/pipelines/reddit-intelligence/execute";

export const redditIntelligenceTask = task({
  id: "reddit-intelligence",
  queue: {
    concurrencyLimit: 1
  },
  retry: {
    maxAttempts: 1
  },
  maxDuration: 3600,
  run: async (payload: { runId: string }, { ctx }) => {
    return executeRedditIntelligenceRun(payload.runId, {
      triggerRunId: ctx.run.id
    });
  }
});
