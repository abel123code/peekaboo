import { NextResponse } from "next/server";
import { loadLatestCodexResearch } from "../../../../lib/codex-research-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const payload = await loadLatestCodexResearch(url.searchParams.get("runId"));
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
