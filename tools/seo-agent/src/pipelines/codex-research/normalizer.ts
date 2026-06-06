import type { CodexTraceEvent } from "../../schemas.js";

export type RawCodexJsonlEvent = Record<string, unknown>;

export type NormalizeContext = {
  agentId: string;
  agentLabel: string;
};

function nowIso() {
  return new Date().toISOString();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, fallback = "") {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function truncate(value: string, max = 360) {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

function titleFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/$/, "").split("/").filter(Boolean).slice(-2).join(" / ");
    return path ? `${parsed.hostname} - ${path}` : parsed.hostname;
  } catch {
    return url;
  }
}

function collectText(value: unknown, depth = 0): string[] {
  if (depth > 4) return [];
  if (typeof value === "string" || typeof value === "number") return [String(value)];
  if (Array.isArray(value)) return value.flatMap((item) => collectText(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((item) => collectText(item, depth + 1));
  }
  return [];
}

function itemText(item: Record<string, unknown>) {
  const direct = text(item.text || item.content || item.message || item.output || item.summary, "");
  if (direct) return direct;

  const content = asArray(item.content)
    .map((entry) => text(asRecord(entry).text, ""))
    .filter(Boolean)
    .join("\n");
  if (content) return content;

  try {
    return JSON.stringify(item);
  } catch {
    return "";
  }
}

function eventStatus(raw: RawCodexJsonlEvent, item: Record<string, unknown>) {
  const rawType = text(raw.type, "");
  const status = text(item.status || raw.status, "");
  if (status) return status;
  if (rawType.endsWith(".started")) return "running";
  if (rawType.endsWith(".completed")) return "completed";
  if (rawType.endsWith(".failed")) return "failed";
  return "completed";
}

function eventLabel(kind: string, item: Record<string, unknown>) {
  if (kind === "command_execution") return "Command execution";
  if (kind === "mcp_tool_call") return `MCP tool: ${text(item.name || item.tool, "tool")}`;
  if (kind === "web_search") return "Web search";
  if (kind === "file_change") return "File change";
  if (kind === "agent_message") return "Agent message";
  if (kind === "error") return "Codex error";
  return kind.replaceAll("_", " ");
}

function eventType(kind: string) {
  if (kind === "mcp_tool_call") return "tool_call";
  if (kind === "web_search") return "web_search";
  if (kind === "command_execution") return "command_execution";
  if (kind === "file_change") return "file_change";
  if (kind === "agent_message") return "agent_message";
  if (kind === "error") return "error";
  return "codex_event";
}

function phaseFor(kind: string) {
  if (kind === "agent_message") return "answering";
  if (kind === "command_execution" || kind === "mcp_tool_call" || kind === "web_search") return "researching";
  if (kind === "file_change") return "artifact";
  if (kind === "error") return "error";
  return "running";
}

function inputFor(kind: string, item: Record<string, unknown>) {
  if (kind === "command_execution") return { command: text(item.command, "") };
  if (kind === "web_search") return { query: text(item.query || item.text || item.input, "") };
  if (kind === "mcp_tool_call") return { tool: text(item.name || item.tool, ""), arguments: item.arguments || item.input || {} };
  return {};
}

function outputFor(kind: string, item: Record<string, unknown>) {
  if (kind === "agent_message") return { text: itemText(item) };
  if (kind === "command_execution") return { output: text(item.output || item.result, ""), exit_code: item.exit_code };
  if (kind === "mcp_tool_call" || kind === "web_search") return { result: item.output || item.result || itemText(item) };
  return {};
}

function summaryFor(kind: string, item: Record<string, unknown>) {
  if (kind === "command_execution") {
    const command = text(item.command, "");
    return command ? `Ran ${command}` : "Codex ran a command.";
  }
  if (kind === "web_search") {
    const query = text(item.query || item.text || item.input, "");
    return query ? `Searched for "${query}"` : "Codex searched the web.";
  }
  if (kind === "mcp_tool_call") {
    return `Called ${text(item.name || item.tool, "an MCP tool")}.`;
  }
  if (kind === "agent_message") return truncate(itemText(item));
  if (kind === "error") return truncate(text(item.message || item.error, "Codex reported an error."));
  return truncate(itemText(item));
}

export function parseCodexJsonl(jsonl: string): RawCodexJsonlEvent[] {
  return jsonl
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? [parsed as RawCodexJsonlEvent] : [];
      } catch {
        return [
          {
            type: "error",
            message: `Could not parse Codex JSONL line: ${line.slice(0, 160)}`
          }
        ];
      }
    });
}

export function normalizeCodexEvent(raw: RawCodexJsonlEvent, context: NormalizeContext, index: number): CodexTraceEvent | null {
  const rawType = text(raw.type, "codex_event");
  const item = asRecord(raw.item);
  const kind = text(item.type || raw.item_type || rawType, rawType);

  if (kind === "reasoning" || rawType.includes("reasoning")) return null;

  const status = eventStatus(raw, item);
  const id = text(raw.id || item.id, `${context.agentId}-event-${index + 1}`);

  if (rawType === "thread.started") {
    return {
      id,
      timestamp: nowIso(),
      phase: "starting",
      actor: "codex",
      type: "thread_started",
      label: "Codex thread started",
      summary: `Started ${context.agentLabel}.`,
      status,
      agent_id: context.agentId,
      agent_label: context.agentLabel,
      input: {},
      output: { thread_id: raw.thread_id }
    };
  }

  if (rawType === "turn.completed") {
    return {
      id,
      timestamp: nowIso(),
      phase: "completed",
      actor: "codex",
      type: "turn_completed",
      label: "Codex turn completed",
      summary: `Completed ${context.agentLabel}.`,
      status,
      agent_id: context.agentId,
      agent_label: context.agentLabel,
      input: {},
      output: asRecord(raw.usage)
    };
  }

  if (rawType === "turn.failed" || rawType === "error" || kind === "error") {
    return {
      id,
      timestamp: nowIso(),
      phase: "error",
      actor: "codex",
      type: "error",
      label: "Codex error",
      summary: truncate(text(raw.message || raw.error || item.message, "Codex run failed.")),
      status: "failed",
      agent_id: context.agentId,
      agent_label: context.agentLabel,
      input: {},
      output: asRecord(raw)
    };
  }

  if (!Object.keys(item).length && rawType.startsWith("turn.")) return null;

  return {
    id,
    timestamp: nowIso(),
    phase: phaseFor(kind),
    actor: kind === "agent_message" ? "codex" : "tool",
    type: eventType(kind),
    label: eventLabel(kind, item),
    summary: summaryFor(kind, item),
    status,
    agent_id: context.agentId,
    agent_label: context.agentLabel,
    input: inputFor(kind, item),
    output: outputFor(kind, item)
  };
}

export function normalizeCodexJsonl(jsonl: string, context: NormalizeContext): CodexTraceEvent[] {
  return parseCodexJsonl(jsonl)
    .map((event, index) => normalizeCodexEvent(event, context, index))
    .filter((event): event is CodexTraceEvent => Boolean(event));
}

export function extractUrlsFromText(value: string): string[] {
  return [...new Set(value.match(/https?:\/\/[^\s)"'<]+/g) || [])].slice(0, 20);
}

export function sourceAccessEventsFromEvent(event: CodexTraceEvent): CodexTraceEvent[] {
  if (event.type === "source_access") return [];

  const haystack = collectText({
    summary: event.summary,
    label: event.label,
    input: event.input,
    output: event.output
  }).join("\n");
  const urls = extractUrlsFromText(haystack);

  return urls.map((url, index) => ({
    id: `${event.id}-source-${index + 1}`,
    timestamp: event.timestamp,
    phase: "researching",
    actor: "tool",
    type: "source_access",
    label: "Access article",
    summary: `Access article: ${url}`,
    status: event.status || "completed",
    agent_id: event.agent_id,
    agent_label: event.agent_label,
    input: {
      url,
      source_event_id: event.id
    },
    output: {
      url,
      title: titleFromUrl(url),
      reason: event.summary || event.label
    }
  }));
}

export function extractQueries(events: CodexTraceEvent[]): string[] {
  return [
    ...new Set(
      events
        .map((event) => text(event.input.query || event.output.query || event.summary, ""))
        .filter((value) => value.includes(" ") && !value.startsWith("Ran "))
        .slice(0, 30)
    )
  ];
}
