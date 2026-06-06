import type { SupabaseClient } from "@supabase/supabase-js";
import type { RunState, RunStore } from "../lib/file-store.js";

export const SEO_ARTIFACT_BUCKET = "seo-workflow-artifacts";

export function createSupabaseRunStore(
  supabase: SupabaseClient,
  {
    bucket = SEO_ARTIFACT_BUCKET,
    prefix
  }: {
    bucket?: string;
    prefix: string;
  }
): RunStore {
  const normalizedPrefix = prefix.replace(/^\/+|\/+$/g, "");
  const storage = supabase.storage.from(bucket);

  function objectPath(stepName: string) {
    return `${normalizedPrefix}/${stepName}.json`;
  }

  async function uploadJson(stepName: string, data: unknown) {
    const path = objectPath(stepName);
    const { error } = await storage.upload(path, JSON.stringify(data, null, 2), {
      contentType: "application/json",
      upsert: true
    });
    if (error) throw new Error(`Failed to upload ${path}: ${error.message}`);
    return `${bucket}/${path}`;
  }

  async function readState(): Promise<RunState> {
    try {
      return await loadJson<RunState>("run-state");
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

  async function loadJson<T>(stepName: string): Promise<T> {
    const path = objectPath(stepName);
    const { data, error } = await storage.download(path);
    if (error) throw new Error(`Failed to download ${path}: ${error.message}`);
    return JSON.parse(await data.text()) as T;
  }

  return {
    runDir: `${bucket}/${normalizedPrefix}`,
    save: uploadJson,
    load: loadJson,
    async exists(stepName) {
      const path = objectPath(stepName);
      const { error } = await storage.download(path);
      return !error;
    },
    async updateState(patch) {
      const current = await readState();
      const next = {
        ...current,
        ...patch,
        updatedAt: new Date().toISOString()
      };
      await uploadJson("run-state", next);
    }
  };
}
