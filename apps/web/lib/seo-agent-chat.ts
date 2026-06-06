import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { tasks } from "@trigger.dev/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { competitorIntelligenceTask } from "../trigger/competitor-intelligence";

const SEO_ARTIFACT_BUCKET = "seo-workflow-artifacts";
const AgentSuggestedActionSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "run_competitor_analyze_only",
    "run_competitor_fetch_and_analyze",
    "explain_recommendations",
    "prepare_writer_from_recommendation"
  ]),
  label: z.string().min(1),
  description: z.string().min(1),
  requiresConfirmation: z.boolean().default(false),
  payload: z.record(z.string(), z.unknown()).default({})
});

const AgentChatResponseSchema = z.object({
  response: z.string().min(1),
  suggested_actions: z.array(AgentSuggestedActionSchema).default([]),
  memory_note: z.string().default("")
});

type AgentSuggestedAction = z.infer<typeof AgentSuggestedActionSchema>;
type ConfirmedAction = AgentSuggestedAction;

type AgentContext = {
  client: unknown;
  latestSnapshot: unknown;
  latestRuns: unknown[];
  recommendations: unknown[];
  keywordOpportunities: unknown[];
  workflowRuns: unknown[];
  drafts: unknown[];
  coverage: unknown[];
  agentMemory: string;
  intelligenceMemory: string;
};

const AGENT_MEMORY_PREFIX = "agent-memory/clients";

function loadSeoAgentEnv() {
  const envPath = path.resolve(process.cwd(), "..", "..", "tools", "seo-agent", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

async function generateAgentResponse({
  systemInstruction,
  userPrompt
}: {
  systemInstruction: string;
  userPrompt: string;
}) {
  loadSeoAgentEnv();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY.");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${systemInstruction}\n\n${userPrompt}\n\nReturn valid JSON only.`
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini request failed: ${response.status} ${await response.text()}`);
  }
  const data = await response.json();
  const text = String(data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
  if (!text) throw new Error("Gemini returned an empty response.");
  const parsed = JSON.parse(text);
  const normalized = {
    response: parsed.response || parsed.answer || parsed.message || parsed.content || parsed.text,
    suggested_actions: parsed.suggested_actions || parsed.suggestedActions || parsed.actions || [],
    memory_note: parsed.memory_note || parsed.memoryNote || parsed.memory || ""
  };
  const result = AgentChatResponseSchema.safeParse(normalized);
  if (result.success) return result.data;
  throw new Error(`Gemini response shape was invalid: ${result.error.message}`);
}

function memoryPath(clientId: string) {
  return `${AGENT_MEMORY_PREFIX}/${clientId}.md`;
}

async function readStorageText(supabase: SupabaseClient, path: string) {
  const { data, error } = await supabase.storage.from(SEO_ARTIFACT_BUCKET).download(path);
  if (error) return "";
  return data.text();
}

async function writeStorageText(supabase: SupabaseClient, path: string, content: string) {
  const { error } = await supabase.storage.from(SEO_ARTIFACT_BUCKET).upload(path, content, {
    contentType: "text/markdown",
    upsert: true
  });
  if (error) throw new Error(`Failed to update agent memory: ${error.message}`);
}

function truncate(value: unknown, length = 12_000) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > length ? `${text.slice(0, length)}\n...truncated` : text;
}

async function ensureConversation(supabase: SupabaseClient, clientId: string, conversationId?: string | null) {
  if (conversationId) {
    const { data, error } = await supabase
      .from("agent_conversations")
      .select("*")
      .eq("id", conversationId)
      .eq("client_id", clientId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) {
      await supabase
        .from("agent_conversations")
        .update({ status: "archived" })
        .eq("client_id", clientId)
        .eq("status", "active")
        .neq("id", conversationId);
      await supabase.from("agent_conversations").update({ status: "active" }).eq("id", conversationId).eq("client_id", clientId);
      return data as { id: string };
    }
  }

  const { data, error } = await supabase
    .from("agent_conversations")
    .insert({
      client_id: clientId,
      title: "AEO Agent Chat",
      status: "active"
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as { id: string };
}

async function insertMessage({
  supabase,
  conversationId,
  clientId,
  role,
  content,
  metadata = {}
}: {
  supabase: SupabaseClient;
  conversationId: string;
  clientId: string;
  role: "user" | "assistant" | "tool";
  content: string;
  metadata?: Record<string, unknown>;
}) {
  const { data, error } = await supabase
    .from("agent_messages")
    .insert({
      conversation_id: conversationId,
      client_id: clientId,
      role,
      content,
      metadata
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await supabase.from("agent_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
  return data;
}

async function loadContext(supabase: SupabaseClient, clientId: string): Promise<AgentContext> {
  const [{ data: client }, { data: snapshots }, { data: runs }, { data: recommendations }, { data: keywordOpportunities }, { data: workflowRuns }, { data: drafts }, { data: coverage }] =
    await Promise.all([
      supabase.from("clients").select("*").eq("id", clientId).single(),
      supabase.from("competitor_intelligence_snapshots").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(1),
      supabase.from("competitor_intelligence_runs").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(5),
      supabase.from("competitor_recommendations").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(15),
      supabase.from("keyword_opportunities").select("*").eq("client_id", clientId).order("opportunity_score", { ascending: false }).limit(15),
      supabase.from("workflow_runs").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(10),
      supabase.from("article_drafts").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(10),
      supabase.from("published_content_coverage").select("*").eq("client_id", clientId).order("published_at", { ascending: false }).limit(25)
    ]);

  if (!client) throw new Error("Client not found.");
  const latestRun = (runs || [])[0] as any;
  const agentMemory = await readStorageText(supabase, memoryPath(clientId));
  const intelligenceMemory = latestRun?.memory_path
    ? await readStorageText(supabase, String(latestRun.memory_path).replace(`${SEO_ARTIFACT_BUCKET}/`, ""))
    : "";

  return {
    client,
    latestSnapshot: (snapshots || [])[0] || null,
    latestRuns: runs || [],
    recommendations: recommendations || [],
    keywordOpportunities: keywordOpportunities || [],
    workflowRuns: workflowRuns || [],
    drafts: drafts || [],
    coverage: coverage || [],
    agentMemory,
    intelligenceMemory
  };
}

function defaultActions(context: AgentContext): AgentSuggestedAction[] {
  const latestSnapshot = context.latestSnapshot as any;
  const recommendations = context.recommendations as any[];
  const snapshotAgeDays = latestSnapshot?.created_at
    ? Math.floor((Date.now() - new Date(latestSnapshot.created_at).getTime()) / 86_400_000)
    : null;
  const actions: AgentSuggestedAction[] = [];

  if (latestSnapshot) {
    actions.push({
      id: randomUUID(),
      type: "run_competitor_analyze_only",
      label: "Analyze Latest Snapshot",
      description: "Reuse the saved competitor snapshot and rerun strategy without DataForSEO calls.",
      requiresConfirmation: true,
      payload: {}
    });
  }

  actions.push({
    id: randomUUID(),
    type: "run_competitor_fetch_and_analyze",
    label: "Fetch + Analyze",
    description: latestSnapshot && snapshotAgeDays !== null && snapshotAgeDays < 7
      ? "Refresh DataForSEO anyway, then generate recommendations. This spends fresh API credits."
      : "Refresh competitor data from DataForSEO, then generate recommendations.",
    requiresConfirmation: true,
    payload: {}
  });

  if (recommendations[0]?.id) {
    actions.push({
      id: randomUUID(),
      type: "prepare_writer_from_recommendation",
      label: "Prepare Writer",
      description: `Open the writer with the current top recommendation: ${recommendations[0].keyword}.`,
      requiresConfirmation: false,
      payload: {
        recommendation_id: recommendations[0].id
      }
    });
  }

  actions.push({
    id: randomUUID(),
    type: "explain_recommendations",
    label: "Explain Recommendations",
    description: "Summarize the saved recommendations, coverage, and next best action.",
    requiresConfirmation: false,
    payload: {}
  });

  return actions;
}

function actionByType(actions: AgentSuggestedAction[], type: AgentSuggestedAction["type"]) {
  return actions.find((action) => action.type === type) || null;
}

function bestRecommendation(context: AgentContext) {
  return ((context.recommendations as any[]) || [])[0] || null;
}

function deterministicAgentResponse(message: string, context: AgentContext, actions: AgentSuggestedAction[]) {
  const normalized = message.toLowerCase();
  const latestSnapshot = context.latestSnapshot as any;
  const recommendation = bestRecommendation(context);
  const recommendations = (context.recommendations as any[]) || [];
  const keywordOpportunities = (context.keywordOpportunities as any[]) || [];
  const workflowRuns = (context.workflowRuns as any[]) || [];
  const drafts = (context.drafts as any[]) || [];
  const coverage = (context.coverage as any[]) || [];
  const snapshotAgeDays = latestSnapshot?.created_at
    ? Math.floor((Date.now() - new Date(latestSnapshot.created_at).getTime()) / 86_400_000)
    : null;

  if (/(what can you do|capabilities|what are you able|how can you help|agent do)/i.test(normalized)) {
    return {
      response: [
        "I can read the saved AEO context for this client and propose controlled actions.",
        "",
        `Current context: ${latestSnapshot ? `1 competitor snapshot (${snapshotAgeDays === null || snapshotAgeDays < 1 ? "fresh today" : `${snapshotAgeDays} days old`})` : "no competitor snapshot yet"}, ${recommendations.length} recommendations, ${keywordOpportunities.length} keyword opportunities, ${workflowRuns.length} workflow runs, ${drafts.length} drafts, and ${coverage.length} approved/published coverage records.`,
        "",
        "Actions I can propose: refresh competitor data with DataForSEO, rerun analysis on the latest saved snapshot, explain the current recommendations, or open the writer from a recommendation. Anything that changes data or spends API credits needs your confirmation first."
      ].join("\n"),
      suggested_actions: actions.slice(0, 3),
      memory_note: "User asked what the agent can do; agent summarized current context and available controlled actions."
    };
  }

  if (/(refresh|fetch|new data|competitor data|dataforseo|crawl|pull)/i.test(normalized)) {
    const action = actionByType(actions, "run_competitor_fetch_and_analyze");
    return {
      response:
        "I can refresh competitor data by running Fetch + Analyze. This will call DataForSEO, save a new snapshot, and then generate fresh recommendations. Confirm the action if you want me to run it.",
      suggested_actions: action ? [action] : [],
      memory_note: "User asked to refresh competitor data; agent proposed Fetch + Analyze."
    };
  }

  if (/(analy[sz]e|analysis|rerun|again|without fetching|no fetch|latest snapshot)/i.test(normalized)) {
    const action = actionByType(actions, "run_competitor_analyze_only");
    if (action) {
      return {
        response:
          "I can rerun the strategy layer using the latest saved snapshot. This skips DataForSEO and is the right option for testing prompts or refreshing recommendations without spending API credits.",
        suggested_actions: [action],
        memory_note: "User asked to rerun analysis; agent proposed Analyze Only."
      };
    }

    const fetchAction = actionByType(actions, "run_competitor_fetch_and_analyze");
    return {
      response:
        "There is no saved competitor snapshot yet, so I cannot run Analyze Only. The first run needs to be Fetch + Analyze so the system has data to reason from.",
      suggested_actions: fetchAction ? [fetchAction] : [],
      memory_note: "User asked to analyze but no snapshot exists; agent proposed Fetch + Analyze."
    };
  }

  if (/(which|what should|recommendation|next|prioriti[sz]e|best|use)/i.test(normalized)) {
    const prepareAction = actionByType(actions, "prepare_writer_from_recommendation");
    if (recommendation) {
      const competitors = Array.isArray(recommendation.source_competitors) && recommendation.source_competitors.length
        ? ` Competitor evidence: ${recommendation.source_competitors.join(", ")}.`
        : "";
      const score = typeof recommendation.opportunity_score === "number" ? ` Score: ${recommendation.opportunity_score}.` : "";
      return {
        response: `Use "${recommendation.keyword}" next. The reason is: ${recommendation.rationale}${score}${competitors} If you want to act on it, open the writer and review the prefilled brief before starting article generation.`,
        suggested_actions: prepareAction ? [prepareAction] : [],
        memory_note: `User asked what to prioritize; agent recommended ${recommendation.keyword}.`
      };
    }

    const nextAction = latestSnapshot
      ? actionByType(actions, "run_competitor_analyze_only")
      : actionByType(actions, "run_competitor_fetch_and_analyze");
    return {
      response:
        "I do not see saved competitor recommendations yet. Run competitor intelligence first, then I can compare the recommendation list and help choose the next article.",
      suggested_actions: nextAction ? [nextAction] : [],
      memory_note: "User asked for next recommendation but none existed; agent proposed running intelligence."
    };
  }

  const explainAction = actionByType(actions, "explain_recommendations");
  return {
    response: snapshotAgeDays === null
      ? "I can help once we have competitor data. Start with Fetch + Analyze to pull DataForSEO data and create recommendations."
      : `I can answer from the saved AEO context. The latest competitor snapshot is ${snapshotAgeDays < 1 ? "fresh today" : `${snapshotAgeDays} days old`}. Ask me what to prioritize, or tell me to rerun analysis.`,
    suggested_actions: explainAction ? [explainAction] : [],
    memory_note: "User chatted with the agent; agent provided context-aware guidance."
  };
}

async function appendAgentMemory({
  supabase,
  clientId,
  note
}: {
  supabase: SupabaseClient;
  clientId: string;
  note: string;
}) {
  if (!note.trim()) return;
  const path = memoryPath(clientId);
  const current = await readStorageText(supabase, path);
  const next = [
    current.trim() || "# Agent Memory\n\n## Event Log",
    "",
    `### ${new Date().toISOString()}`,
    note.trim()
      .split("\n")
      .map((line) => `- ${line.replace(/^[-*]\s*/, "")}`)
      .join("\n")
  ].join("\n");
  await writeStorageText(supabase, path, next);
}

async function executeConfirmedAction({
  supabase,
  clientId,
  action
}: {
  supabase: SupabaseClient;
  clientId: string;
  action: ConfirmedAction;
}) {
  if (action.type === "prepare_writer_from_recommendation") {
    const recommendationId = String(action.payload.recommendation_id || "").trim();
    if (!recommendationId) throw new Error("Missing recommendation_id.");
    return {
      content: "Prepared the writer handoff. Open the linked writer form to review or adjust the brief before starting generation.",
      metadata: {
        url: `/clients/${clientId}/new-content?recommendation_id=${recommendationId}`,
        action
      },
      memoryNote: `Prepared writer handoff for recommendation ${recommendationId}.`
    };
  }

  if (action.type === "run_competitor_analyze_only" || action.type === "run_competitor_fetch_and_analyze") {
    const mode = action.type === "run_competitor_analyze_only" ? "analyze_only" : "fetch_and_analyze";
    const { data: client, error: clientError } = await supabase.from("clients").select("*").eq("id", clientId).single();
    if (clientError || !client) throw new Error(clientError?.message || "Client not found.");

    if (mode === "analyze_only") {
      const { count, error } = await supabase
        .from("competitor_intelligence_snapshots")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId);
      if (error) throw new Error(error.message);
      if ((count || 0) === 0) throw new Error("No saved snapshot exists yet. Run Fetch + Analyze first.");
    }

    const { count: activeCount, error: activeError } = await supabase
      .from("competitor_intelligence_runs")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .in("status", ["queued", "running"]);
    if (activeError) throw new Error(activeError.message);
    if ((activeCount || 0) > 0) throw new Error("Another competitor intelligence run is already queued or running.");

    const { data: run, error: runError } = await supabase
      .from("competitor_intelligence_runs")
      .insert({
        client_id: clientId,
        mode,
        location_name: (client as any).default_location_name || "Singapore",
        language_name: (client as any).default_language_name || "English",
        status: "queued",
        current_stage: "queued"
      })
      .select("id")
      .single();
    if (runError) throw new Error(runError.message);

    try {
      const handle = await tasks.trigger<typeof competitorIntelligenceTask>(
        "competitor-intelligence",
        { runId: (run as any).id },
        {
          idempotencyKey: (run as any).id,
          tags: [`competitor_intelligence_run:${(run as any).id}`, `client:${clientId}`, "agent_chat"]
        }
      );
      await supabase
        .from("competitor_intelligence_runs")
        .update({ trigger_run_id: handle.id })
        .eq("id", (run as any).id);
    } catch (error) {
      await supabase
        .from("competitor_intelligence_runs")
        .update({
          status: "failed",
          current_stage: "trigger launch failed",
          error: error instanceof Error ? error.message : String(error)
        })
        .eq("id", (run as any).id);
      throw error;
    }

    return {
      content: `Started competitor intelligence in ${mode.replaceAll("_", " ")} mode. You can watch progress on the Intelligence tab.`,
      metadata: {
        run_id: (run as any).id,
        mode,
        action
      },
      memoryNote: `User confirmed ${mode}. Started competitor intelligence run ${(run as any).id}.`
    };
  }

  if (action.type === "explain_recommendations") {
    return {
      content: "I reviewed the saved recommendations and current coverage. Ask me which recommendation to prioritize and I will compare the top options.",
      metadata: { action },
      memoryNote: "Explained saved recommendations on request."
    };
  }

  throw new Error(`Unsupported agent action: ${action.type}`);
}

export async function handleAgentChat({
  supabase,
  clientId,
  conversationId,
  message,
  confirmedAction
}: {
  supabase: SupabaseClient;
  clientId: string;
  conversationId?: string | null;
  message?: string;
  confirmedAction?: ConfirmedAction | null;
}) {
  const conversation = await ensureConversation(supabase, clientId, conversationId);

  if (confirmedAction) {
    const result = await executeConfirmedAction({ supabase, clientId, action: confirmedAction });
    await insertMessage({
      supabase,
      conversationId: conversation.id,
      clientId,
      role: "tool",
      content: result.content,
      metadata: result.metadata
    });
    await appendAgentMemory({ supabase, clientId, note: result.memoryNote });
    return {
      conversationId: conversation.id,
      message: {
        role: "assistant",
        content: result.content,
        metadata: result.metadata
      }
    };
  }

  const trimmedMessage = String(message || "").trim();
  if (!trimmedMessage) throw new Error("Message is required.");
  await insertMessage({
    supabase,
    conversationId: conversation.id,
    clientId,
    role: "user",
    content: trimmedMessage
  });

  const context = await loadContext(supabase, clientId);
  const actions = defaultActions(context);
  const deterministicResponse = deterministicAgentResponse(trimmedMessage, context, actions);
  let response = deterministicResponse;

  try {
    response = await generateAgentResponse({
      systemInstruction:
        "You are Peekaboo, a client-scoped AEO agent powered by Codex-style reasoning. You advise and propose only the allowed actions. You cannot claim an action has run unless a tool result says it has. Keep responses concise and practical.",
      userPrompt: `
User message:
${trimmedMessage}

Deterministic controller recommendation:
${JSON.stringify(deterministicResponse, null, 2)}

Current allowed action candidates:
${JSON.stringify(actions, null, 2)}

Client and AEO context:
${truncate({
  client: context.client,
  latestSnapshot: context.latestSnapshot,
  latestRuns: context.latestRuns,
  recommendations: context.recommendations,
  keywordOpportunities: context.keywordOpportunities,
  workflowRuns: context.workflowRuns,
  drafts: context.drafts,
  coverage: context.coverage
})}

Agent markdown memory:
${truncate(context.agentMemory, 6000)}

Competitor intelligence memory, read-only:
${truncate(context.intelligenceMemory, 6000)}

Instructions:
- Return only suggested actions from the provided action candidates unless the user is asking for explanation only.
- Prefer the deterministic controller recommendation unless it is obviously wrong.
- If the user asks to run or refresh data, propose the matching action and explain that confirmation is required.
- Prefer analyze_only when a recent snapshot exists; prefer fetch_and_analyze when no snapshot exists or it is stale.
- For "what should we do next", explain the strongest recommendation and include Prepare Writer if a recommendation exists.
- memory_note should summarize the user's intent and your advice in 1 to 3 short lines.
`
    });
  } catch {
    response = deterministicResponse;
  }

  const deterministicActionTypes = new Set(deterministicResponse.suggested_actions.map((action) => action.type));
  const llmActionTypes = new Set(response.suggested_actions.map((action) => action.type));
  const shouldUseControllerResponse =
    deterministicResponse.suggested_actions.length > 0 &&
    (response.suggested_actions.length === 0 || ![...deterministicActionTypes].some((type) => llmActionTypes.has(type)));
  const selectedResponse = shouldUseControllerResponse ? deterministicResponse : response;
  const allowedByType = new Map(actions.map((action) => [action.type, action]));
  const suggestedActions = selectedResponse.suggested_actions
    .map((action) => {
      const fallback = allowedByType.get(action.type);
      if (!fallback) return null;
      return {
        ...fallback,
        id: action.id || fallback.id,
        label: action.label || fallback.label,
        description: action.description || fallback.description,
        payload: Object.keys(action.payload || {}).length ? action.payload : fallback.payload
      };
    })
    .filter((action): action is AgentSuggestedAction => Boolean(action))
    .slice(0, 3);
  const finalSuggestedActions = suggestedActions.length ? suggestedActions : deterministicResponse.suggested_actions.slice(0, 3);

  await insertMessage({
    supabase,
    conversationId: conversation.id,
    clientId,
    role: "assistant",
    content: selectedResponse.response || deterministicResponse.response,
    metadata: {
      suggested_actions: finalSuggestedActions
    }
  });
  await appendAgentMemory({ supabase, clientId, note: selectedResponse.memory_note || deterministicResponse.memory_note });

  return {
    conversationId: conversation.id,
    message: {
      role: "assistant",
      content: selectedResponse.response || deterministicResponse.response,
      metadata: {
        suggested_actions: finalSuggestedActions
      }
    }
  };
}
