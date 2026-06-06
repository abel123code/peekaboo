import { NextResponse } from "next/server";
import { loadLatestRedditIntelligence } from "../../../../lib/reddit-intelligence-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await loadLatestRedditIntelligence();
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
