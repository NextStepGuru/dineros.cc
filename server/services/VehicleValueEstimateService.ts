import type { ChatCompletion } from "openai/resources/chat/completions";
import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { createError } from "h3";
import env from "~/server/env";
import { getOpenAIClient } from "~/server/clients/openaiClient";
import { prisma } from "~/server/clients/prismaClient";
import { loggedChatCompletion } from "~/server/services/OpenAiCompletionLogger";
import type { vehicleValueEstimateRequestSchema } from "~/schema/zod";
import { vehicleValueEstimateAiResultSchema } from "~/schema/zod";

const VEHICLE_ASSET_TYPE_ID = 20;

const RATIONALE_MAX = 800;

export type VehicleValueEstimateInput = z.infer<
  typeof vehicleValueEstimateRequestSchema
>;

function buildVehicleInputSummary(
  input: VehicleValueEstimateInput,
): Prisma.InputJsonValue {
  return {
    year: input.year,
    make: input.make,
    model: input.model,
    trim: input.trim ?? null,
    mileage: input.mileage,
    condition: input.condition,
    zip: input.zip ?? null,
    purchasePriceHint: input.purchasePriceHint ?? null,
    vinLast4: input.vinLast4?.trim() || null,
  };
}

function parseEstimateFromCompletion(
  completion: ChatCompletion,
): z.infer<typeof vehicleValueEstimateAiResultSchema> {
  const raw = completion.choices[0]?.message?.content;
  if (!raw?.trim()) {
    throw createError({
      statusCode: 502,
      message: "Vehicle value estimate returned an empty response.",
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw createError({
      statusCode: 502,
      message: "Vehicle value estimate response was not valid JSON.",
    });
  }
  const res = vehicleValueEstimateAiResultSchema.safeParse(parsed);
  if (!res.success) {
    throw createError({
      statusCode: 502,
      message: "Vehicle value estimate could not be parsed.",
    });
  }
  let rationale = res.data.rationale.trim();
  if (rationale.length > RATIONALE_MAX) {
    rationale = rationale.slice(0, RATIONALE_MAX);
  }
  return { ...res.data, rationale };
}

export async function estimateVehicleValue(params: {
  userId: number;
  input: VehicleValueEstimateInput;
}): Promise<z.infer<typeof vehicleValueEstimateAiResultSchema>> {
  const { userId, input } = params;

  await prisma.account.findFirstOrThrow({
    where: {
      id: input.accountId,
      userAccounts: { some: { userId } },
    },
  });

  if (input.accountRegisterId != null) {
    const reg = await prisma.accountRegister.findFirst({
      where: {
        id: input.accountRegisterId,
        accountId: input.accountId,
        isArchived: false,
        account: { userAccounts: { some: { userId } } },
      },
    });
    if (!reg) {
      throw createError({
        statusCode: 400,
        message: "Account register not found or not accessible.",
      });
    }
    if (reg.typeId !== VEHICLE_ASSET_TYPE_ID) {
      throw createError({
        statusCode: 400,
        message: "Vehicle value estimate applies only to Vehicle Asset registers.",
      });
    }
  }

  const client = getOpenAIClient();
  const apiKey = env?.OPENAI_API_KEY?.trim();
  if (!client || !apiKey) {
    throw createError({
      statusCode: 503,
      message: "Vehicle value estimate is unavailable (OpenAI is not configured).",
    });
  }

  const model = env?.OPENAI_VEHICLE_VALUE_MODEL ?? "gpt-5-nano";

  const userPayload = {
    year: input.year,
    make: input.make,
    model: input.model,
    trim: input.trim,
    mileage: input.mileage,
    condition: input.condition,
    zip: input.zip,
    purchasePriceHint: input.purchasePriceHint,
    vinLast4: input.vinLast4?.trim() || undefined,
  };

  const disclaimerRequired =
    "This is a rough illustrative estimate for budgeting only, not an appraisal or licensed guidebook value (e.g. not KBB/NADA).";

  const systemMsg =
    "You estimate typical private-party or retail vehicle values for a personal finance app. Reply with a single JSON object only, no markdown. Keys: estimatedValueMid (number, USD), estimatedValueLow (number), estimatedValueHigh (number), currency (string, usually USD), rationale (short string, under 600 characters), disclaimer (string — use exactly the disclaimer text provided in the user message). estimatedValueLow must be <= estimatedValueMid <= estimatedValueHigh. Values should be plausible for the described vehicle; if uncertain, use a wider range.";

  const userMsg = `Vehicle (JSON):\n${JSON.stringify(userPayload, null, 2)}\n\nRequired disclaimer text for the disclaimer field (copy exactly):\n${disclaimerRequired}`;

  const baseMeta: Prisma.InputJsonValue = {
    userId,
    accountId: input.accountId,
    accountRegisterId: input.accountRegisterId ?? null,
    vehicleInputSummary: buildVehicleInputSummary(input),
  };

  let estimateResult:
    | z.infer<typeof vehicleValueEstimateAiResultSchema>
    | undefined;

  await loggedChatCompletion({
    client,
    purpose: "vehicle_value_estimate",
    metadata: baseMeta,
    metadataFromResponse: async (response) => {
      const result = parseEstimateFromCompletion(response);
      estimateResult = result;
      return {
        ...baseMeta,
        result: {
          estimatedValueMid: result.estimatedValueMid,
          estimatedValueLow: result.estimatedValueLow,
          estimatedValueHigh: result.estimatedValueHigh,
          currency: result.currency,
          rationale: result.rationale,
          disclaimer: result.disclaimer,
        },
      };
    },
    body: {
      model,
      messages: [
        { role: "system", content: systemMsg },
        { role: "user", content: userMsg },
      ],
      response_format: { type: "json_object" },
    },
  });

  if (!estimateResult) {
    throw createError({
      statusCode: 500,
      message: "Vehicle value estimate did not return a result.",
    });
  }

  return estimateResult;
}
