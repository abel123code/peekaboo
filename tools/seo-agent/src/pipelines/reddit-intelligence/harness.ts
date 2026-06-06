import {
  createOpenAIResponse,
  extractFunctionCalls,
  type OpenAIFunctionTool
} from "../../lib/openai-responses-client.js";

export type HarnessEventStatus =
  | "requested"
  | "allowed"
  | "blocked"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export type HarnessEventType =
  | "objective"
  | "model_action"
  | "policy_check"
  | "tool_execution"
  | "observation"
  | "decision"
  | "finish"
  | "error";

export type HarnessActor = "agent" | "harness" | "tool" | "system_backfill" | "judge";

export type HarnessEvent = {
  id: string;
  timestamp: string;
  type: HarnessEventType;
  actor: HarnessActor;
  label: string;
  summary: string;
  status?: HarnessEventStatus;
  tool?: string;
  call_id?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  policy?: {
    allowed: boolean;
    reason: string;
  };
};

export type HarnessPolicyResult = {
  allowed: boolean;
  reason: string;
};

export type HarnessSnapshot = {
  events: HarnessEvent[];
  finished: boolean;
  finishReason: string;
  toolCallCount: number;
  toolCounts: Record<string, number>;
};

export type HarnessToolContext = {
  snapshot: () => HarnessSnapshot;
  finish: (reason: string) => void;
  recordDecision: (label: string, summary: string, input?: Record<string, unknown>) => Promise<void>;
};

export type HarnessTool<TInput = unknown> = {
  definition: OpenAIFunctionTool;
  parse: (rawArguments: string) => TInput;
  policy?: (input: TInput, snapshot: HarnessSnapshot) => HarnessPolicyResult;
  execute: (input: TInput, context: HarnessToolContext) => Promise<Record<string, unknown>> | Record<string, unknown>;
  summarizeInput?: (input: TInput) => string;
  summarizeOutput?: (output: Record<string, unknown>) => string;
};

export type AnyHarnessTool = HarnessTool<any>;

type AgentHarnessOptions = {
  objective: string;
  systemInstruction: string;
  prompt: string;
  tools: AnyHarnessTool[];
  maxTurns?: number;
  maxToolCalls?: number;
  maxOutputTokens?: number;
  onEvent?: (event: HarnessEvent, snapshot: HarnessSnapshot) => Promise<void> | void;
};

function nowIso() {
  return new Date().toISOString();
}

function defaultSummary(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.slice(0, 240);
  try {
    return JSON.stringify(value).slice(0, 240);
  } catch {
    return String(value).slice(0, 240);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export class AgentHarness {
  private readonly options: Required<Pick<AgentHarnessOptions, "maxTurns" | "maxToolCalls" | "maxOutputTokens">> &
    Omit<AgentHarnessOptions, "maxTurns" | "maxToolCalls" | "maxOutputTokens">;
  private readonly registry: Map<string, AnyHarnessTool>;
  private readonly events: HarnessEvent[] = [];
  private readonly toolCounts: Record<string, number> = {};
  private finished = false;
  private finishReason = "";
  private eventIndex = 0;
  private toolCallCount = 0;

  constructor(options: AgentHarnessOptions) {
    this.options = {
      ...options,
      maxTurns: options.maxTurns || 8,
      maxToolCalls: options.maxToolCalls || 24,
      maxOutputTokens: options.maxOutputTokens || 1200
    };
    this.registry = new Map(options.tools.map((tool) => [tool.definition.name, tool]));
  }

  snapshot(): HarnessSnapshot {
    return {
      events: [...this.events],
      finished: this.finished,
      finishReason: this.finishReason,
      toolCallCount: this.toolCallCount,
      toolCounts: { ...this.toolCounts }
    };
  }

  private async appendEvent(event: Omit<HarnessEvent, "id" | "timestamp">) {
    const fullEvent: HarnessEvent = {
      id: `harness-${++this.eventIndex}`,
      timestamp: nowIso(),
      ...event
    };
    this.events.push(fullEvent);
    await this.options.onEvent?.(fullEvent, this.snapshot());
    return fullEvent;
  }

  private basePolicy(toolName: string): HarnessPolicyResult {
    if (!this.registry.has(toolName)) {
      return {
        allowed: false,
        reason: `Tool "${toolName}" is not in the allowed harness registry.`
      };
    }
    if (this.toolCallCount >= this.options.maxToolCalls) {
      return {
        allowed: false,
        reason: `Tool budget reached (${this.options.maxToolCalls} calls).`
      };
    }
    if (this.finished) {
      return {
        allowed: false,
        reason: `Harness already finished: ${this.finishReason || "stop condition reached"}.`
      };
    }
    return {
      allowed: true,
      reason: "Tool is registered and inside the current budget."
    };
  }

  private makeContext(): HarnessToolContext {
    return {
      snapshot: () => this.snapshot(),
      finish: (reason: string) => {
        this.finished = true;
        this.finishReason = reason.trim() || "Agent requested stop.";
      },
      recordDecision: async (label: string, summary: string, input?: Record<string, unknown>) => {
        await this.appendEvent({
          type: "decision",
          actor: "agent",
          label,
          summary,
          status: "completed",
          input
        });
      }
    };
  }

  async run() {
    await this.appendEvent({
      type: "objective",
      actor: "harness",
      label: "Objective",
      summary: this.options.objective,
      status: "running"
    });

    let response = await createOpenAIResponse({
      input: [
        { role: "system", content: this.options.systemInstruction },
        { role: "user", content: this.options.prompt }
      ],
      tools: this.options.tools.map((tool) => tool.definition),
      maxOutputTokens: this.options.maxOutputTokens
    });

    for (let turn = 0; turn < this.options.maxTurns; turn++) {
      const calls = extractFunctionCalls(response);
      if (!calls.length || this.finished) break;

      const outputs: Array<{ type: "function_call_output"; call_id: string; output: string }> = [];

      for (const call of calls) {
        const tool = this.registry.get(call.name);
        let parsedInput: unknown = {};
        let parseError: Error | null = null;

        try {
          parsedInput = tool ? tool.parse(call.arguments) : {};
        } catch (error) {
          parseError = error instanceof Error ? error : new Error(String(error));
        }

        await this.appendEvent({
          type: "model_action",
          actor: "agent",
          label: `Requested ${call.name}`,
          summary: tool && !parseError ? tool.summarizeInput?.(parsedInput) || defaultSummary(parsedInput) : call.arguments,
          status: "requested",
          tool: call.name,
          call_id: call.call_id,
          input: asRecord(parsedInput)
        });

        const basePolicy = this.basePolicy(call.name);
        const toolPolicy =
          tool && !parseError && basePolicy.allowed
            ? tool.policy?.(parsedInput, this.snapshot()) || basePolicy
            : basePolicy;
        const policy: HarnessPolicyResult = parseError
          ? {
              allowed: false,
              reason: `Tool arguments could not be parsed: ${parseError.message}`
            }
          : toolPolicy.allowed
          ? {
              allowed: true,
              reason: toolPolicy.reason || basePolicy.reason
            }
          : toolPolicy;

        await this.appendEvent({
          type: "policy_check",
          actor: "harness",
          label: policy.allowed ? "Policy allowed action" : "Policy blocked action",
          summary: policy.reason,
          status: policy.allowed ? "allowed" : "blocked",
          tool: call.name,
          call_id: call.call_id,
          input: asRecord(parsedInput),
          policy
        });

        if (!tool || !policy.allowed) {
          outputs.push({
            type: "function_call_output",
            call_id: call.call_id,
            output: JSON.stringify({ error: policy.reason })
          });
          continue;
        }

        await this.appendEvent({
          type: "tool_execution",
          actor: "tool",
          label: `Executing ${call.name}`,
          summary: tool.summarizeInput?.(parsedInput) || defaultSummary(parsedInput),
          status: "running",
          tool: call.name,
          call_id: call.call_id,
          input: asRecord(parsedInput)
        });

        this.toolCallCount += 1;
        this.toolCounts[call.name] = (this.toolCounts[call.name] || 0) + 1;

        try {
          const output = await tool.execute(parsedInput, this.makeContext());
          await this.appendEvent({
            type: "observation",
            actor: "harness",
            label: `${call.name} result`,
            summary: tool.summarizeOutput?.(output) || defaultSummary(output),
            status: "completed",
            tool: call.name,
            call_id: call.call_id,
            input: asRecord(parsedInput),
            output
          });
          outputs.push({
            type: "function_call_output",
            call_id: call.call_id,
            output: JSON.stringify(output)
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await this.appendEvent({
            type: "error",
            actor: "harness",
            label: `${call.name} failed`,
            summary: message,
            status: "failed",
            tool: call.name,
            call_id: call.call_id,
            input: asRecord(parsedInput)
          });
          outputs.push({
            type: "function_call_output",
            call_id: call.call_id,
            output: JSON.stringify({ error: message })
          });
        }

        if (this.finished) break;
      }

      if (!outputs.length || this.finished) break;

      response = await createOpenAIResponse({
        input: outputs,
        tools: this.options.tools.map((tool) => tool.definition),
        previousResponseId: response.id,
        maxOutputTokens: this.options.maxOutputTokens
      });
    }

    await this.appendEvent({
      type: "finish",
      actor: "harness",
      label: "Harness stopped",
      summary: this.finishReason || "No further tool calls or harness budget reached.",
      status: "completed"
    });

    return this.snapshot();
  }
}
