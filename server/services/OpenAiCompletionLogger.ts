import type { Prisma } from "@prisma/client";
import type OpenAI from "openai";
import type { ChatCompletion } from "openai/resources/chat/completions";
import { prisma } from "~/server/clients/prismaClient";
import { log } from "~/server/logger";

const ERROR_MESSAGE_MAX = 8000;

export async function loggedChatCompletion(params: {
  client: OpenAI;
  body: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
  purpose: string;
  metadata?: Prisma.InputJsonValue;
}): Promise<ChatCompletion> {
  const { client, body, purpose, metadata } = params;
  const start = Date.now();
  const modelName =
    typeof body.model === "string" ? body.model : "unknown";

  try {
    const response = await client.chat.completions.create(body);
    const durationMs = Date.now() - start;
    const usage = response.usage;
    let cachedPromptTokens: number | null = null;
    if (
      usage &&
      typeof usage === "object" &&
      "prompt_tokens_details" in usage &&
      usage.prompt_tokens_details &&
      typeof usage.prompt_tokens_details === "object" &&
      "cached_tokens" in usage.prompt_tokens_details
    ) {
      const c = (usage.prompt_tokens_details as { cached_tokens?: number })
        .cached_tokens;
      if (typeof c === "number") {
        cachedPromptTokens = c;
      }
    }

    await prisma.openAiRequestLog.create({
      data: {
        purpose,
        model: response.model ?? modelName,
        promptTokens: usage?.prompt_tokens ?? null,
        completionTokens: usage?.completion_tokens ?? null,
        totalTokens: usage?.total_tokens ?? null,
        cachedPromptTokens,
        openaiResponseId: response.id ?? null,
        finishReason: response.choices[0]?.finish_reason ?? null,
        durationMs,
        success: true,
        errorMessage: null,
        httpStatus: null,
        metadata: metadata ?? undefined,
      },
    });

    log({
      message: "OpenAI chat completion",
      data: {
        purpose,
        model: response.model,
        promptTokens: usage?.prompt_tokens,
        completionTokens: usage?.completion_tokens,
        totalTokens: usage?.total_tokens,
        cachedPromptTokens,
        durationMs,
        success: true,
      },
      level: "info",
    });

    return response;
  } catch (err: unknown) {
    const durationMs = Date.now() - start;
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : String(err);
    let httpStatus: number | null = null;
    if (err && typeof err === "object" && "status" in err) {
      const s = (err as { status?: number }).status;
      if (typeof s === "number") {
        httpStatus = s;
      }
    }

    try {
      await prisma.openAiRequestLog.create({
        data: {
          purpose,
          model: modelName,
          promptTokens: null,
          completionTokens: null,
          totalTokens: null,
          cachedPromptTokens: null,
          openaiResponseId: null,
          finishReason: null,
          durationMs,
          success: false,
          errorMessage: message.slice(0, ERROR_MESSAGE_MAX),
          httpStatus,
          metadata: metadata ?? undefined,
        },
      });
    } catch (dbErr) {
      log({
        message: "OpenAiRequestLog insert failed",
        data: { dbErr, purpose },
        level: "error",
      });
    }

    log({
      message: "OpenAI chat completion failed",
      data: { purpose, durationMs, httpStatus, error: message },
      level: "warn",
    });

    throw err;
  }
}
