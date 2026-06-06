import type { AgentConversation, AgentMessage, Client } from "../../../../lib/database.types";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";
import { AgentChat } from "../../../components/AgentChat";
import { ClientWorkspaceShell } from "../ClientWorkspaceShell";

export default async function ClientAgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createSupabaseAdmin();

  const [{ data: client, error: clientError }, { data: conversations }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).single(),
    supabase
      .from("agent_conversations")
      .select("*")
      .eq("client_id", id)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
  ]);

  if (clientError || !client) {
    throw new Error(clientError?.message || "Client not found.");
  }

  const conversation = ((conversations || [])[0] || null) as AgentConversation | null;
  const { data: messages } = conversation
    ? await supabase
        .from("agent_messages")
        .select("*")
        .eq("conversation_id", conversation.id)
        .eq("client_id", id)
        .order("created_at", { ascending: true })
        .limit(100)
    : { data: [] };

  return (
    <ClientWorkspaceShell client={client as Client} active="agent">
      <AgentChat clientId={id} initialConversationId={conversation?.id || null} initialMessages={(messages || []) as AgentMessage[]} />
    </ClientWorkspaceShell>
  );
}
