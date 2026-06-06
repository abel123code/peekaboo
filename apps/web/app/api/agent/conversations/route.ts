import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientId = String(url.searchParams.get("client_id") || "").trim();
  const conversationId = String(url.searchParams.get("conversation_id") || "").trim();

  if (!clientId) {
    return NextResponse.json({ error: "Client is required." }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();

  const { data: conversations, error: conversationsError } = await supabase
    .from("agent_conversations")
    .select("*")
    .eq("client_id", clientId)
    .order("updated_at", { ascending: false })
    .limit(20);
  if (conversationsError) return NextResponse.json({ error: conversationsError.message }, { status: 500 });

  const selectedConversationId = conversationId || conversations?.[0]?.id || "";
  const { data: messages, error: messagesError } = selectedConversationId
    ? await supabase
        .from("agent_messages")
        .select("*")
        .eq("conversation_id", selectedConversationId)
        .eq("client_id", clientId)
        .order("created_at", { ascending: true })
        .limit(100)
    : { data: [], error: null };
  if (messagesError) return NextResponse.json({ error: messagesError.message }, { status: 500 });

  return NextResponse.json({
    conversations: conversations || [],
    conversationId: selectedConversationId || null,
    messages: messages || []
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const clientId = String(body.client_id || "").trim();
    const conversationId = String(body.conversation_id || "").trim();

    if (!clientId) {
      return NextResponse.json({ error: "Client is required." }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();

    if (conversationId) {
      const { error: archiveError } = await supabase
        .from("agent_conversations")
        .update({ status: "archived" })
        .eq("id", conversationId)
        .eq("client_id", clientId);
      if (archiveError) return NextResponse.json({ error: archiveError.message }, { status: 500 });
    } else {
      const { error: archiveError } = await supabase
        .from("agent_conversations")
        .update({ status: "archived" })
        .eq("client_id", clientId)
        .eq("status", "active");
      if (archiveError) return NextResponse.json({ error: archiveError.message }, { status: 500 });
    }

    const { data, error } = await supabase
      .from("agent_conversations")
      .insert({
        client_id: clientId,
        title: "AEO Agent Chat",
        status: "active"
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ conversationId: data.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
