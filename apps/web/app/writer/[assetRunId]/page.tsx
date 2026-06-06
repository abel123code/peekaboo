import { loadAeoAssetRun, type AeoAssetPayload } from "../../../lib/aeo-asset-data";
import { AeoAssetWriterPage } from "../AeoAssetWriterView";

export const dynamic = "force-dynamic";

export default async function WriterPage({
  params
}: {
  params: Promise<{ assetRunId: string }>;
}) {
  const { assetRunId } = await params;
  let initialPayload: AeoAssetPayload | null = null;
  let setupError: string | null = null;

  try {
    initialPayload = await loadAeoAssetRun(assetRunId);
  } catch (error) {
    setupError = error instanceof Error ? error.message : String(error);
  }

  return <AeoAssetWriterPage initialPayload={initialPayload} setupError={setupError} assetRunId={assetRunId} />;
}
