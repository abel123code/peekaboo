import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";
import { requireEnv } from "../config.js";

type GenerateStructuredOptions<TSchema extends z.ZodType> = {
  schema: TSchema;
  schemaName: string;
  systemInstruction: string;
  userPrompt: string;
  temperature?: number;
  maxAttempts?: number;
};

type GenerateTextOptions = {
  systemInstruction: string;
  userPrompt: string;
  temperature?: number;
  maxAttempts?: number;
};

function createModel(temperature: number) {
  return new ChatGoogleGenerativeAI({
    apiKey: requireEnv("GEMINI_API_KEY"),
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    temperature
  });
}

function createFallbackModel(temperature: number) {
  const fallbackModel = process.env.GEMINI_FALLBACK_MODEL;
  if (!fallbackModel) return null;
  return new ChatGoogleGenerativeAI({
    apiKey: requireEnv("GEMINI_API_KEY"),
    model: fallbackModel,
    temperature
  });
}

function messageContentToString(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text: unknown }).text ?? "");
        }
        return "";
      })
      .join("");
  }
  return String(content ?? "");
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function retry<T>(
  label: string,
  maxAttempts: number,
  action: (attempt: number) => Promise<T>
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await action(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) break;
      const delayMs = 750 * attempt;
      console.warn(`${label} failed on attempt ${attempt}; retrying in ${delayMs}ms.`);
      await sleep(delayMs);
    }
  }
  throw lastError;
}

export async function generateStructured<TSchema extends z.ZodType>({
  schema,
  schemaName,
  systemInstruction,
  userPrompt,
  temperature = 0.4,
  maxAttempts = 3
}: GenerateStructuredOptions<TSchema>): Promise<z.infer<TSchema>> {
  return retry(schemaName, maxAttempts, async (attempt) => {
    const model =
      attempt === maxAttempts && createFallbackModel(temperature)
        ? createFallbackModel(temperature)!
        : createModel(temperature);
    const structuredModel = model.withStructuredOutput(schema, {
      name: schemaName
    });
    const result = await structuredModel.invoke([
      ["system", systemInstruction],
      ["human", userPrompt]
    ]);
    return schema.parse(result);
  });
}

export async function generateText({
  systemInstruction,
  userPrompt,
  temperature = 0.7,
  maxAttempts = 3
}: GenerateTextOptions): Promise<string> {
  return retry("Text generation", maxAttempts, async (attempt) => {
    const model =
      attempt === maxAttempts && createFallbackModel(temperature)
        ? createFallbackModel(temperature)!
        : createModel(temperature);
    const message = await model.invoke([
      ["system", systemInstruction],
      ["human", userPrompt]
    ]);
    const text = messageContentToString(message.content)
      .trim()
      .replace(/^```markdown\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    if (!text) {
      throw new Error("Model returned an empty text response.");
    }
    return text;
  });
}
