import { task } from "@trigger.dev/sdk";
import { executeKeywordResearchRun } from "../../../tools/seo-agent/src/pipelines/keyword-research/execute";

export const keywordOpportunityResearchTask = task({
  id: "keyword-opportunity-research",
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
  run: async (payload: { researchRunId: string }, { ctx }) => {
    return executeKeywordResearchRun(payload.researchRunId, {
      triggerRunId: ctx.run.id
    });
  }
});
