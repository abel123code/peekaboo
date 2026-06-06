import { createSupabaseAdmin } from "./supabase-admin";
import type { AeoAssetRun, CodexResearchRun } from "./database.types";
import { toAeoAssetRunSummary, toRunSummary, type AeoAssetRunSummary, type CodexRunSummary } from "./codex-demo";

export type AeoAssetPayload = {
  assetRun: AeoAssetRunSummary;
  codexRun: CodexRunSummary | null;
};

export async function loadAeoAssetRun(assetRunId: string): Promise<AeoAssetPayload> {
  if (!assetRunId) throw new Error("Missing AEO asset run id.");

  const supabase = createSupabaseAdmin();
  const { data: assetRun, error: assetError } = await supabase
    .from("aeo_asset_runs")
    .select("*")
    .eq("id", assetRunId)
    .single();

  if (assetError || !assetRun) {
    throw new Error(assetError?.message || "AEO asset run not found.");
  }

  const typedAssetRun = assetRun as AeoAssetRun;
  const { data: codexRun, error: codexError } = await supabase
    .from("codex_research_runs")
    .select("*")
    .eq("id", typedAssetRun.codex_run_id)
    .maybeSingle();

  if (codexError) throw new Error(codexError.message);

  return {
    assetRun: toAeoAssetRunSummary(typedAssetRun),
    codexRun: codexRun ? toRunSummary(codexRun as CodexResearchRun) : null
  };
}
