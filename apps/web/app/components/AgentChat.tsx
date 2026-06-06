"use client";

import Link from "next/link";
import { Bot, Clock, ExternalLink, Loader2, NotebookText, Plus, RefreshCw, Send, Sparkles, User, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentMessage, Json } from "../../lib/database.types";
import { cn } from "../../lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";

type SuggestedAction = {
  id: string;
  type: string;
  label: string;
  description: string;
  requiresConfirmation: boolean;
  payload: Record<string, unknown>;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  metadata: Json;
  created_at?: string;
};

type ConversationSummary = {
  id: string;
  title: string;
  status: "active" | "archived";
  updated_at: string;
  created_at: string;
};

type AgentMemory = {
  agentMemory: string;
  agentMemoryPath: string;
  intelligenceMemory: string;
  intelligenceMemoryPath: string;
};

function actionsFromMetadata(metadata: Json): SuggestedAction[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const value = metadata.suggested_actions as unknown;
  if (!Array.isArray(value)) return [];
  return value.filter((item: unknown): item is SuggestedAction => {
    return Boolean(
      item &&
        typeof item === "object" &&
        !Array.isArray(item) &&
        typeof (item as SuggestedAction).id === "string" &&
        typeof (item as SuggestedAction).type === "string" &&
        typeof (item as SuggestedAction).label === "string" &&
        typeof (item as SuggestedAction).description === "string"
    );
  });
}

function urlFromAction(clientId: string, action: SuggestedAction) {
  if (action.type !== "prepare_writer_from_recommendation") return null;
  const recommendationId = String(action.payload.recommendation_id || "").trim();
  return recommendationId ? `/clients/${clientId}/new-content?recommendation_id=${recommendationId}` : null;
}

function roleIcon(role: ChatMessage["role"]) {
  if (role === "user") return User;
  if (role === "tool") return Sparkles;
  return Bot;
}

export function AgentChat({
  clientId,
  initialConversationId,
  initialMessages
}: {
  clientId: string;
  initialConversationId: string | null;
  initialMessages: AgentMessage[];
}) {
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialMessages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      metadata: message.metadata,
      created_at: message.created_at
    }))
  );
  const [input, setInput] = useState("");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [pending, setPending] = useState(false);
  const [startingNew, setStartingNew] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [loadingMemory, setLoadingMemory] = useState(false);
  const [memory, setMemory] = useState<AgentMemory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const hasMessages = messages.length > 0;
  const starterPrompts = useMemo(
    () => ["What should we do next?", "Run analysis again without fetching.", "Refresh competitor data.", "Which recommendation should I use?"],
    []
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  useEffect(() => {
    loadConversations(conversationId || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function formatConversationLabel(conversation: ConversationSummary) {
    const date = new Date(conversation.updated_at || conversation.created_at);
    return `${conversation.status === "active" ? "Active" : "Archived"} - ${date.toLocaleString()}`;
  }

  async function loadConversations(selectedId?: string) {
    setLoadingHistory(true);
    try {
      const params = new URLSearchParams({ client_id: clientId });
      if (selectedId) params.set("conversation_id", selectedId);
      const response = await fetch(`/api/agent/conversations?${params.toString()}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error || "Could not load old chats.");
        return;
      }
      setConversations(payload.conversations || []);
      if (payload.conversationId) setConversationId(payload.conversationId);
      if (selectedId && payload.messages) {
        setMessages(
          payload.messages.map((message: AgentMessage) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            metadata: message.metadata,
            created_at: message.created_at
          }))
        );
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load old chats.");
    } finally {
      setLoadingHistory(false);
    }
  }

  async function loadMemory() {
    setLoadingMemory(true);
    setError(null);
    try {
      const response = await fetch(`/api/agent/memory?${new URLSearchParams({ client_id: clientId }).toString()}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error || "Could not load agent memory.");
        return;
      }
      setMemory(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load agent memory.");
    } finally {
      setLoadingMemory(false);
    }
  }

  function openMemory() {
    setMemoryOpen(true);
    loadMemory();
  }

  async function post(body: Record<string, unknown>) {
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          conversation_id: conversationId,
          ...body
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error || "Agent request failed.");
        return;
      }

      if (payload.conversationId) setConversationId(payload.conversationId);
      if (payload.message) {
        setMessages((current) => [
          ...current,
          {
            id: `assistant-${Date.now()}`,
            role: payload.message.role || "assistant",
            content: payload.message.content,
            metadata: payload.message.metadata || {}
          }
        ]);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Agent request failed.");
    } finally {
      setPending(false);
      busyRef.current = false;
      loadConversations(conversationId || undefined);
    }
  }

  async function sendMessage(nextMessage?: string) {
    const content = (nextMessage || input).trim();
    if (!content || busyRef.current) return;

    busyRef.current = true;
    setInput("");
    setMessages((current) => [
      ...current,
      {
        id: `user-${Date.now()}`,
        role: "user",
        content,
        metadata: {}
      }
    ]);
    await post({ message: content });
  }

  async function confirmAction(action: SuggestedAction) {
    if (busyRef.current) return;

    busyRef.current = true;
    setMessages((current) => [
      ...current,
      {
        id: `confirm-${Date.now()}`,
        role: "user",
        content: `Confirm: ${action.label}`,
        metadata: {}
      }
    ]);
    await post({ confirmed_action: action });
  }

  async function newChat() {
    if (busyRef.current || startingNew) return;
    setStartingNew(true);
    setError(null);

    try {
      const response = await fetch("/api/agent/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          conversation_id: conversationId
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error || "Could not start a new chat.");
        return;
      }
      setConversationId(payload.conversationId || null);
      setMessages([]);
      setInput("");
      await loadConversations(payload.conversationId || undefined);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not start a new chat.");
    } finally {
      setStartingNew(false);
    }
  }

  return (
    <Card className="overflow-hidden border-zinc-200 bg-white py-0 shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-zinc-950 text-white">
            <Bot className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-zinc-950">Peekaboo - AEO Agent</div>
            <div className="text-xs text-zinc-500">Pulls answer visibility context, proposes actions, waits for approval.</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button disabled={loadingMemory} size="sm" variant="outline" type="button" onClick={openMemory} title="View agent memory">
            {loadingMemory ? <Loader2 className="size-3.5 animate-spin" /> : <NotebookText className="size-3.5" />}
            Memory
          </Button>
          {conversations.length ? (
            <label className="flex items-center gap-2 text-xs text-zinc-500">
              <Clock className="size-3.5" />
              <select
                className="h-8 max-w-56 rounded-lg border border-zinc-200 bg-white px-2 text-xs text-zinc-700 outline-none focus:border-zinc-400"
                disabled={pending || startingNew || loadingHistory}
                value={conversationId || ""}
                onChange={(event) => loadConversations(event.target.value)}
              >
                {conversations.map((conversation) => (
                  <option key={conversation.id} value={conversation.id}>
                    {formatConversationLabel(conversation)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <Button disabled={pending || startingNew} size="sm" variant="outline" type="button" onClick={newChat}>
            {startingNew ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            New Chat
          </Button>
        </div>
      </div>

      {memoryOpen ? (
        <div className="fixed inset-0 z-50 bg-zinc-950/40 px-4 py-6 backdrop-blur-sm">
          <div className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-zinc-950 text-white">
                  <NotebookText className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-zinc-950">Agent Memory</div>
                  <div className="truncate text-xs text-zinc-500">Read-only markdown context used by the AEO agent.</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button disabled={loadingMemory} size="sm" variant="outline" type="button" onClick={loadMemory}>
                  {loadingMemory ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                  Refresh
                </Button>
                <Button size="icon" variant="ghost" type="button" onClick={() => setMemoryOpen(false)} title="Close memory">
                  <X className="size-4" />
                </Button>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-2 gap-0 max-lg:grid-cols-1">
              <section className="flex min-h-0 flex-col border-r border-zinc-200 max-lg:border-b max-lg:border-r-0">
                <div className="border-b border-zinc-200 px-4 py-3">
                  <div className="text-sm font-medium text-zinc-950">Chat Memory</div>
                  <div className="mt-1 truncate text-xs text-zinc-500">{memory?.agentMemoryPath || "agent-memory/clients"}</div>
                </div>
                <ScrollArea className="min-h-0 flex-1 bg-zinc-50">
                  <pre className="whitespace-pre-wrap px-4 py-4 font-mono text-xs leading-5 text-zinc-700">
                    {loadingMemory
                      ? "Loading memory..."
                      : memory?.agentMemory?.trim() || "No chat memory has been written for this client yet."}
                  </pre>
                </ScrollArea>
              </section>

              <section className="flex min-h-0 flex-col">
                <div className="border-b border-zinc-200 px-4 py-3">
                  <div className="text-sm font-medium text-zinc-950">Intelligence Memory</div>
                  <div className="mt-1 truncate text-xs text-zinc-500">{memory?.intelligenceMemoryPath || "competitor-intelligence/memory"}</div>
                </div>
                <ScrollArea className="min-h-0 flex-1 bg-zinc-50">
                  <pre className="whitespace-pre-wrap px-4 py-4 font-mono text-xs leading-5 text-zinc-700">
                    {loadingMemory
                      ? "Loading memory..."
                      : memory?.intelligenceMemory?.trim() || "No competitor intelligence memory has been written for this client yet."}
                  </pre>
                </ScrollArea>
              </section>
            </div>
          </div>
        </div>
      ) : null}

      <ScrollArea className="h-[520px] bg-zinc-50/60">
        <CardContent className="px-4 py-4">
          {error ? (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Agent error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {!hasMessages ? (
            <div className="mx-auto grid max-w-3xl gap-5 py-10">
              <div className="text-center">
                <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-white ring-1 ring-zinc-200">
                  <Sparkles className="size-5 text-zinc-700" />
                </div>
                <h2 className="text-lg font-semibold text-zinc-950">What should the agent help with?</h2>
                <p className="mt-2 text-sm text-zinc-500">
                  The agent reads saved intelligence, recommendations, workflows, drafts, coverage, and memory. It can propose actions and run them after you confirm.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 max-md:grid-cols-1">
                {starterPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-left text-sm text-zinc-700 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={pending || startingNew}
                    type="button"
                    onClick={() => sendMessage(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              {messages.map((message) => {
                const actions = actionsFromMetadata(message.metadata);
                const Icon = roleIcon(message.role);
                const isUser = message.role === "user";

                return (
                  <div key={message.id} className={cn("flex gap-3", isUser && "justify-end")}>
                    {!isUser ? (
                      <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg bg-white text-zinc-700 ring-1 ring-zinc-200">
                        <Icon className="size-4" />
                      </div>
                    ) : null}

                    <div className={cn("max-w-[760px]", isUser && "flex justify-end")}>
                      <div
                        className={cn(
                          "rounded-xl border px-4 py-3 text-sm leading-6 shadow-sm",
                          isUser
                            ? "border-zinc-950 bg-zinc-950 text-white"
                            : message.role === "tool"
                            ? "border-sky-200 bg-sky-50 text-sky-950"
                            : "border-zinc-200 bg-white text-zinc-800"
                        )}
                      >
                        <div className="whitespace-pre-wrap">{message.content}</div>
                      </div>

                      {actions.length ? (
                        <div className="mt-2 grid gap-2">
                          {actions.map((action) => {
                            const href = urlFromAction(clientId, action);
                            return (
                              <div key={action.id} className="rounded-xl border border-zinc-200 bg-white p-3 text-zinc-800 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-medium text-zinc-950">{action.label}</div>
                                    <p className="mt-1 text-xs leading-5 text-zinc-500">{action.description}</p>
                                  </div>
                                  {action.requiresConfirmation ? (
                                    <span className="rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">Confirm</span>
                                  ) : null}
                                </div>
                                <div className="mt-3">
                                  {href ? (
                                    <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={href}>
                                      <ExternalLink className="size-3.5" />
                                      Open Writer
                                    </Link>
                                  ) : (
                                    <Button disabled={pending || startingNew} size="sm" type="button" onClick={() => confirmAction(action)}>
                                      {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                                      Confirm Action
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}

              {pending ? (
                <div className="flex gap-3">
                  <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg bg-white text-zinc-700 ring-1 ring-zinc-200">
                    <Bot className="size-4" />
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-500 shadow-sm">
                    <Loader2 className="size-4 animate-spin" />
                    Agent is thinking...
                  </div>
                </div>
              ) : null}

              <div ref={bottomRef} />
            </div>
          )}
        </CardContent>
      </ScrollArea>

      <div className="border-t border-zinc-200 bg-white p-3">
        <div className="flex gap-2 max-md:grid">
          <Textarea
            className="min-h-11 resize-none bg-white text-sm"
            disabled={pending || startingNew}
            placeholder={pending ? "Agent is working..." : "Ask the AEO agent what to do next..."}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
              }
            }}
          />
          <Button className="h-auto min-w-24" disabled={pending || startingNew || !input.trim()} type="button" onClick={() => sendMessage()}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Send
          </Button>
        </div>
      </div>
    </Card>
  );
}
