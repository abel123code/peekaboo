import { NextResponse } from "next/server";
import { handleAgentChat } from "../../../../lib/seo-agent-chat";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const clientId = String(body.client_id || "").trim();
    if (!clientId) {
      return NextResponse.json({ error: "Client is required." }, { status: 400 });
    }

    const result = await handleAgentChat({
      supabase: createSupabaseAdmin(),
      clientId,
      conversationId: body.conversation_id ? String(body.conversation_id) : null,
      message: body.message,
      confirmedAction: body.confirmed_action || null
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
