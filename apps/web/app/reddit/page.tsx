import { loadLatestRedditIntelligence } from "../../lib/reddit-intelligence-data";
import type { RedditLatestPayload } from "../../lib/reddit-demo";
import { RedditHarnessDemo } from "./RedditHarnessDemo";

export const dynamic = "force-dynamic";

export default async function RedditPage() {
  let initialData: RedditLatestPayload | null = null;
  let setupError: string | null = null;

  try {
    initialData = await loadLatestRedditIntelligence();
  } catch (error) {
    setupError = error instanceof Error ? error.message : String(error);
  }

  return <RedditHarnessDemo initialData={initialData} setupError={setupError} />;
}
