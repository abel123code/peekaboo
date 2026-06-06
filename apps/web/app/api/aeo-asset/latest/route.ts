import { NextResponse } from "next/server";
import { loadAeoAssetRun } from "../../../../lib/aeo-asset-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const assetRunId = url.searchParams.get("assetRunId") || "";
    const payload = await loadAeoAssetRun(assetRunId);
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
