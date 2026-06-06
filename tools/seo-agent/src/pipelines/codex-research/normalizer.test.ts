import assert from "node:assert/strict";
import { extractQueries, normalizeCodexJsonl, parseCodexJsonl, sourceAccessEventsFromEvent } from "./normalizer.js";

const sampleJsonl = [
  JSON.stringify({ type: "thread.started", thread_id: "thread_123" }),
  JSON.stringify({ type: "item.started", item: { id: "item_1", type: "web_search", query: "HDB toilet overflow plumber Singapore" } }),
  JSON.stringify({ type: "item.completed", item: { id: "item_2", type: "reasoning", text: "hidden" } }),
  JSON.stringify({ type: "item.completed", item: { id: "item_3", type: "command_execution", command: "echo hello", output: "hello" } }),
  JSON.stringify({ type: "item.completed", item: { id: "item_4", type: "agent_message", text: "## Trusted sources\n- HDB responsibility guidance" } }),
  JSON.stringify({ type: "turn.completed", usage: { input_tokens: 10, output_tokens: 20 } })
].join("\n");

const raw = parseCodexJsonl(sampleJsonl);
assert.equal(raw.length, 6);

const events = normalizeCodexJsonl(sampleJsonl, {
  agentId: "urgent-buyer",
  agentLabel: "Agent A"
});

assert.equal(events.some((event) => event.type === "reasoning"), false);
assert.equal(events.some((event) => event.type === "web_search"), true);
assert.equal(events.some((event) => event.type === "command_execution"), true);
assert.equal(events.some((event) => event.type === "agent_message"), true);
assert.equal(events.at(-1)?.type, "turn_completed");

const queries = extractQueries(events);
assert.equal(queries.some((query) => query.includes("HDB toilet overflow")), true);

const sourceEvents = sourceAccessEventsFromEvent({
  id: "agent-a-message",
  timestamp: "2026-06-06T00:00:00.000Z",
  phase: "answering",
  actor: "codex",
  type: "agent_message",
  label: "Agent message",
  summary: "Codex used https://www.hdb.gov.sg/residential/living-in-an-hdb-flat as a responsibility source.",
  status: "completed",
  agent_id: "responsibility-context",
  agent_label: "Agent B",
  input: {},
  output: {}
});
assert.equal(sourceEvents.length, 1);
assert.equal(sourceEvents[0]?.type, "source_access");
assert.equal(sourceEvents[0]?.input.url, "https://www.hdb.gov.sg/residential/living-in-an-hdb-flat");

console.log("codex normalizer tests passed");
