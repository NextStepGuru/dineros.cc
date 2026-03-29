import type { Prisma } from "@prisma/client";
import type OpenAI from "openai";
import type { ChatCompletion } from "openai/resources/chat/completions";
import { prisma } from "~/server/clients/prismaClient";
import { dateTimeService } from "~/server/services/forecast";
import { log } from "~/server/logger";
import {
  isOpenAiCredentialFailure,
  notifyIntegrationAlert,
} from "~/server/services/integrationOpsAlert";

const ERROR_MESSAGE_MAX = 8000;

export async function loggedChatCompletion(params: {
  client: OpenAI;
  body: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
  purpose: string;
  /** Stored on success and on failure (when present). */
  metadata?: Prisma.InputJsonValue;
  /**
   * When set, success rows use the merged JSON from this callback instead of `metadata` alone.
   * Use for logging parsed model output. Failure rows still use `metadata` only.
   */
  metadataFromResponse?: (
    _response: ChatCompletion,
  ) => Prisma.InputJsonValue | Promise<Prisma.InputJsonValue>;
}): Promise<ChatCompletion> {
  const { client, body, purpose, metadata, metadataFromResponse } = params;
  const start = dateTimeService.now();
  const modelName =
    typeof body.model === "string" ? body.model : "unknown";

  try {
    const response = await client.chat.completions.create(body);
    const durationMs = dateTimeService.now().valueOf() - start.valueOf();
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

    const successMetadata = metadataFromResponse
      ? await metadataFromResponse(response)
      : metadata;

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
        metadata: successMetadata ?? undefined,
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
    const durationMs = dateTimeService.now().valueOf() - start.valueOf();
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : String(err);
    let httpStatus: number | null = null;
    if (err && typeof err === "object") {
      const o = err as { status?: number; response?: { status?: number } };
      if (typeof o.status === "number") httpStatus = o.status;
      else if (typeof o.response?.status === "number") {
        httpStatus = o.response.status;
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

    console.error(
      "[OPENAI_REQUEST_FAILED]",
      JSON.stringify({
        purpose,
        durationMs,
        httpStatus,
        error: message.slice(0, 2000),
      }),
    );

    const credential = isOpenAiCredentialFailure(httpStatus, message);
    log({
      message: "OpenAI chat completion failed",
      data: { purpose, durationMs, httpStatus, error: message },
      level: credential ? "error" : "warn",
    });

    if (credential) {
      await notifyIntegrationAlert({
        source: "openai",
        kind: "credential",
        message: message.slice(0, ERROR_MESSAGE_MAX),
        httpStatus,
        details: { purpose, metadata: metadata ?? null },
        dedupeKey: `openai:credential:${purpose}`,
      });
    }

    throw err;
  }
}
