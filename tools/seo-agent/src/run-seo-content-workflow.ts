#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { loadEnv, rootDir } from "./config.js";
import { SeoContentTaskSchema } from "./schemas.js";
import { runSeoContentWorkflow } from "./pipelines/content/workflow.js";

loadEnv();

type CliArgs = {
  inputPath: string | null;
  resumeRunDir: string | null;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { inputPath: null, resumeRunDir: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg === "--resume") {
      const resumeValue = argv[i + 1];
      args.resumeRunDir = resumeValue ? path.resolve(process.cwd(), resumeValue) : null;
      i++;
    } else if (!args.inputPath) {
      args.inputPath = path.resolve(process.cwd(), arg);
    }
  }
  return args;
}

async function loadTask({ inputPath, resumeRunDir }: CliArgs) {
  let raw: unknown;

  if (inputPath) {
    raw = JSON.parse(await fs.readFile(inputPath, "utf8"));
  } else if (resumeRunDir) {
    raw = JSON.parse(await fs.readFile(path.join(resumeRunDir, "00-input-task.json"), "utf8"));
  } else {
    raw = JSON.parse(
      await fs.readFile(path.join(rootDir, "inputs", "sample-content-task.json"), "utf8")
    );
  }

  return SeoContentTaskSchema.parse(raw);
}

const args = parseArgs(process.argv.slice(2));

try {
  if (args.resumeRunDir && !args.inputPath) {
    console.log(`Resuming from: ${args.resumeRunDir}`);
  }

  const task = await loadTask(args);
  const result = await runSeoContentWorkflow(task, {
    resumeRunDir: args.resumeRunDir
  });

  console.log("AEO content workflow completed.");
  console.log(`Run folder: ${result.runDir}`);
  console.log(`Final post: ${result.finalPostPath}`);
} catch (error) {
  console.error("AEO content workflow failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
