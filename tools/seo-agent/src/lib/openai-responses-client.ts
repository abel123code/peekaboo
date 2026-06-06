import { requireEnv } from "../config.js";

type ResponseInput =
  | string
  | Array<
      | {
          role: "system" | "user" | "assistant";
          content: string;
        }
      | {
          type: "function_call_output";
          call_id: string;
          output: string;
        }
    >;

export type OpenAIFunctionTool = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type OpenAIResponseOutputItem = {
  id?: string;
  type?: string;
  role?: string;
  name?: string;
  call_id?: string;
  arguments?: string;
  content?: Array<{
    type?: string;
    text?: string;
  }>;
};

export type OpenAIResponse = {
  id: string;
  output?: OpenAIResponseOutputItem[];
  output_text?: string;
};

type CreateResponseOptions = {
  input: ResponseInput;
  tools?: OpenAIFunctionTool[];
  previousResponseId?: string;
  toolChoice?: "auto" | "none";
  textFormat?: Record<string, unknown>;
  instructions?: string;
  maxOutputTokens?: number;
};

type GenerateJsonOptions = {
  schemaName: string;
  schema: Record<string, unknown>;
  systemInstruction: string;
  userPrompt: string;
  maxOutputTokens?: number;
};

function responseModel() {
  return process.env.OPENAI_MODEL || "gpt-4o-2024-08-06";
}

function responseText(response: OpenAIResponse) {
  if (response.output_text) return response.output_text;

  return (response.output || [])
    .flatMap((item) => item.content || [])
    .map((content) => content.text || "")
    .join("")
    .trim();
}

export function extractFunctionCalls(response: OpenAIResponse) {
  return (response.output || []).filter(
    (item): item is OpenAIResponseOutputItem & { name: string; call_id: string; arguments: string } =>
      item.type === "function_call" &&
      typeof item.name === "string" &&
      typeof item.call_id === "string" &&
      typeof item.arguments === "string"
  );
}

export async function createOpenAIResponse({
  input,
  tools,
  previousResponseId,
  toolChoice = "auto",
  textFormat,
  instructions,
  maxOutputTokens = 1600
}: CreateResponseOptions): Promise<OpenAIResponse> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("OPENAI_API_KEY")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: responseModel(),
      input,
      ...(instructions ? { instructions } : {}),
      ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
      ...(tools?.length ? { tools, tool_choice: toolChoice } : {}),
      ...(textFormat ? { text: { format: textFormat } } : {}),
      max_output_tokens: maxOutputTokens
    })
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI Responses request failed: ${response.status} ${text}`);
  }

  return JSON.parse(text) as OpenAIResponse;
}

export async function generateStructuredWithResponses<T>({
  schemaName,
  schema,
  systemInstruction,
  userPrompt,
  maxOutputTokens = 2400
}: GenerateJsonOptions): Promise<T> {
  const response = await createOpenAIResponse({
    input: [
      { role: "system", content: systemInstruction },
      { role: "user", content: userPrompt }
    ],
    toolChoice: "none",
    textFormat: {
      type: "json_schema",
      name: schemaName,
      strict: true,
      schema
    },
    maxOutputTokens
  });

  const text = responseText(response);
  if (!text) throw new Error(`OpenAI structured response "${schemaName}" returned no text.`);
  return JSON.parse(text) as T;
}
