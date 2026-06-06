import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF || "replace-with-trigger-project-ref",
  dirs: ["./trigger"],
  maxDuration: 7200,
  retries: {
    default: {
      maxAttempts: 2,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 30_000,
      factor: 2,
      randomize: true
    }
  }
});
