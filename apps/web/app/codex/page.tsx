import { loadLatestCodexResearch } from "../../lib/codex-research-data";
import type { CodexLatestPayload } from "../../lib/codex-demo";
import { CodexMissionControl } from "./CodexMissionControl";

export const dynamic = "force-dynamic";

export default async function CodexPage({
  searchParams
}: {
  searchParams?: Promise<{ runId?: string }>;
}) {
  let initialData: CodexLatestPayload | null = null;
  let setupError: string | null = null;
  const params = await searchParams;

  try {
    initialData = await loadLatestCodexResearch(params?.runId || null);
  } catch (error) {
    setupError = error instanceof Error ? error.message : String(error);
  }

  return <CodexMissionControl initialData={initialData} setupError={setupError} runId={params?.runId || null} />;
}
