import fs from "node:fs/promises";
import path from "node:path";
import { rootDir } from "../config.js";
import { slugify } from "./json-utils.js";

export type RunStatus = "running" | "failed" | "completed";

export type RunState = {
  status: RunStatus;
  currentStage: string | null;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string | null;
};

export type RunStore = {
  runDir: string;
  save(stepName: string, data: unknown): Promise<string>;
  load<T = unknown>(stepName: string): Promise<T>;
  exists(stepName: string): Promise<boolean>;
  updateState(patch: Partial<RunState>): Promise<void>;
};

async function createStoreForDir(runDir: string): Promise<RunStore> {
  const resolvedRunDir = path.resolve(runDir);
  await fs.mkdir(resolvedRunDir, { recursive: true });
  const statePath = path.join(resolvedRunDir, "run-state.json");

  async function readState(): Promise<RunState> {
    try {
      return JSON.parse(await fs.readFile(statePath, "utf8")) as RunState;
    } catch {
      const now = new Date().toISOString();
      return {
        status: "running",
        currentStage: null,
        startedAt: now,
        updatedAt: now,
        error: null
      };
    }
  }

  return {
    runDir: resolvedRunDir,
    async save(stepName, data) {
      const filePath = path.join(resolvedRunDir, `${stepName}.json`);
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
      return filePath;
    },
    async load(stepName) {
      const filePath = path.join(resolvedRunDir, `${stepName}.json`);
      return JSON.parse(await fs.readFile(filePath, "utf8"));
    },
    async exists(stepName) {
      try {
        await fs.access(path.join(resolvedRunDir, `${stepName}.json`));
        return true;
      } catch {
        return false;
      }
    },
    async updateState(patch) {
      const current = await readState();
      const next = {
        ...current,
        ...patch,
        updatedAt: new Date().toISOString()
      };
      await fs.writeFile(statePath, JSON.stringify(next, null, 2), "utf8");
    }
  };
}

export async function createRunStore(runName?: string): Promise<RunStore> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeRunName = slugify(runName || "seo-content-run");
  return createStoreForDir(path.join(rootDir, "outputs", `${timestamp}-${safeRunName}`));
}

export async function createResumeStore(runDir: string): Promise<RunStore> {
  return createStoreForDir(runDir);
}
