import { task } from "@trigger.dev/sdk";
import { executeCodexResearchRun } from "../../../tools/seo-agent/src/pipelines/codex-research/execute";

export const codexResearchTask = task({
  id: "codex-research",
  queue: {
    concurrencyLimit: 1
  },
  retry: {
    maxAttempts: 1
  },
  maxDuration: 3600,
  run: async (payload: { runId: string; forceVirtual?: boolean }, { ctx }) => {
    return executeCodexResearchRun(payload.runId, {
      triggerRunId: ctx.run.id,
      forceVirtual: payload.forceVirtual
    });
  }
});
