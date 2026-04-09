import type { ChatCompletion } from "openai/resources/chat/completions";
import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { createError } from "h3";
import type { AssetEstimateCategory } from "~/consts";
import env from "~/server/env";
import { getOpenAIClient } from "~/server/clients/openaiClient";
import { prisma } from "~/server/clients/prismaClient";
import { loggedChatCompletion } from "~/server/services/OpenAiCompletionLogger";
import type { assetValueEstimateRequestSchema } from "~/schema/zod";
import { vehicleValueEstimateAiResultSchema } from "~/schema/zod";

const RATIONALE_MAX = 800;

const CATEGORY_TO_TYPE_ID: Record<AssetEstimateCategory, number> = {
  vehicle: 20,
  house: 23,
  boat: 24,
  rv: 25,
  motorcycle: 26,
};

const PURPOSE_BY_CATEGORY: Record<AssetEstimateCategory, string> = {
  vehicle: "vehicle_value_estimate",
  house: "house_value_estimate",
  boat: "boat_value_estimate",
  rv: "rv_value_estimate",
  motorcycle: "motorcycle_value_estimate",
};

export type AssetValueEstimateInput = z.infer<
  typeof assetValueEstimateRequestSchema
>;

function buildInputSummary(
  input: AssetValueEstimateInput,
): Prisma.InputJsonValue {
  switch (input.category) {
    case "vehicle":
      return {
        category: input.category,
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
    case "house":
      return {
        category: input.category,
        bedrooms: input.bedrooms,
        bathrooms: input.bathrooms,
        squareFootage: input.squareFootage,
        yearBuilt: input.yearBuilt,
        lotSizeAcres: input.lotSizeAcres ?? null,
        zip: input.zip,
        propertyType: input.propertyType,
        condition: input.condition,
        purchasePriceHint: input.purchasePriceHint ?? null,
      };
    case "boat":
      return {
        category: input.category,
        year: input.year,
        make: input.make,
        model: input.model,
        lengthFeet: input.lengthFeet,
        engineType: input.engineType,
        engineHours: input.engineHours ?? null,
        condition: input.condition,
        zip: input.zip ?? null,
        purchasePriceHint: input.purchasePriceHint ?? null,
      };
    case "rv":
      return {
        category: input.category,
        year: input.year,
        make: input.make,
        model: input.model,
        rvClass: input.rvClass,
        lengthFeet: input.lengthFeet,
        mileage: input.mileage,
        condition: input.condition,
        zip: input.zip ?? null,
        purchasePriceHint: input.purchasePriceHint ?? null,
      };
    case "motorcycle":
      return {
        category: input.category,
        year: input.year,
        make: input.make,
        model: input.model,
        mileage: input.mileage,
        engineCC: input.engineCC ?? null,
        condition: input.condition,
        zip: input.zip ?? null,
        purchasePriceHint: input.purchasePriceHint ?? null,
      };
    default: {
      const _x: never = input;
      return _x;
    }
  }
}

function disclaimerForCategory(category: AssetEstimateCategory): string {
  switch (category) {
    case "vehicle":
      return "This is a rough illustrative estimate for budgeting only, not an appraisal or licensed guidebook value (e.g. not KBB/NADA).";
    case "house":
      return "This is a rough illustrative estimate for budgeting only, not a professional appraisal, broker price opinion, or automated valuation model (e.g. not a substitute for MLS or Zillow-style AVMs for lending).";
    case "boat":
      return "This is a rough illustrative estimate for budgeting only, not a marine survey or licensed guidebook value.";
    case "rv":
      return "This is a rough illustrative estimate for budgeting only, not an appraisal or licensed guidebook value (e.g. not NADA RV guide for lending).";
    case "motorcycle":
      return "This is a rough illustrative estimate for budgeting only, not an appraisal or licensed guidebook value (e.g. not NADA).";
    default: {
      const _x: never = category;
      return _x;
    }
  }
}

function systemPromptForCategory(category: AssetEstimateCategory): string {
  const base =
    "Reply with a single JSON object only, no markdown. Keys: estimatedValueMid (number, USD), estimatedValueLow (number), estimatedValueHigh (number), currency (string, usually USD), rationale (short string, under 600 characters), disclaimer (string — use exactly the disclaimer text provided in the user message). estimatedValueLow must be <= estimatedValueMid <= estimatedValueHigh. If uncertain, use a wider range.";
  switch (category) {
    case "vehicle":
      return `You estimate typical private-party or retail passenger vehicle values for a personal finance app. ${base}`;
    case "house":
      return `You estimate approximate current market value ranges for owner-occupied residential real estate in the United States for a personal finance app. Use typical list/sale dynamics for the described property type and market; ${base}`;
    case "boat":
      return `You estimate typical private-party or retail used boat values in the United States for a personal finance app. ${base}`;
    case "rv":
      return `You estimate typical private-party or retail motorhome / RV / travel trailer values in the United States for a personal finance app. ${base}`;
    case "motorcycle":
      return `You estimate typical private-party or retail motorcycle values in the United States for a personal finance app. ${base}`;
    default: {
      const _x: never = category;
      return _x;
    }
  }
}

function userMessageLabel(category: AssetEstimateCategory): string {
  switch (category) {
    case "vehicle":
      return "Vehicle";
    case "house":
      return "House / real estate";
    case "boat":
      return "Boat";
    case "rv":
      return "RV / motorhome / trailer";
    case "motorcycle":
      return "Motorcycle";
    default: {
      const _x: never = category;
      return _x;
    }
  }
}

function buildUserPayload(input: AssetValueEstimateInput): Record<string, unknown> {
  const { category: _c, accountId: _a, accountRegisterId: _r, ...rest } = input;
  return { ...rest };
}

function parseEstimateFromCompletion(
  completion: ChatCompletion,
): z.infer<typeof vehicleValueEstimateAiResultSchema> {
  const raw = completion.choices[0]?.message?.content;
  if (!raw?.trim()) {
    throw createError({
      statusCode: 502,
      message: "Asset value estimate returned an empty response.",
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw createError({
      statusCode: 502,
      message: "Asset value estimate response was not valid JSON.",
    });
  }
  const res = vehicleValueEstimateAiResultSchema.safeParse(parsed);
  if (!res.success) {
    throw createError({
      statusCode: 502,
      message: "Asset value estimate could not be parsed.",
    });
  }
  let rationale = res.data.rationale.trim();
  if (rationale.length > RATIONALE_MAX) {
    rationale = rationale.slice(0, RATIONALE_MAX);
  }
  return { ...res.data, rationale };
}

export async function estimateAssetValue(params: {
  userId: number;
  input: AssetValueEstimateInput;
}): Promise<z.infer<typeof vehicleValueEstimateAiResultSchema>> {
  const { userId, input } = params;
  const category = input.category;
  const expectedTypeId = CATEGORY_TO_TYPE_ID[category];

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
    if (reg.typeId !== expectedTypeId) {
      throw createError({
        statusCode: 400,
        message:
          "Asset value estimate does not match this register's account type.",
      });
    }
  }

  const client = getOpenAIClient();
  const apiKey = env?.OPENAI_API_KEY?.trim();
  if (!client || !apiKey) {
    throw createError({
      statusCode: 503,
      message: "Asset value estimate is unavailable (OpenAI is not configured).",
    });
  }

  const model =
    env?.OPENAI_ASSET_VALUE_MODEL?.trim() ||
    env?.OPENAI_VEHICLE_VALUE_MODEL?.trim() ||
    "gpt-5-nano";

  const disclaimerRequired = disclaimerForCategory(category);
  const systemMsg = systemPromptForCategory(category);
  const label = userMessageLabel(category);
  const userPayload = buildUserPayload(input);
  const userMsg = `${label} (JSON):\n${JSON.stringify(userPayload, null, 2)}\n\nRequired disclaimer text for the disclaimer field (copy exactly):\n${disclaimerRequired}`;

  const baseMeta: Prisma.InputJsonValue = {
    userId,
    accountId: input.accountId,
    accountRegisterId: input.accountRegisterId ?? null,
    category,
    assetInputSummary: buildInputSummary(input),
  };

  let estimateResult:
    | z.infer<typeof vehicleValueEstimateAiResultSchema>
    | undefined;

  const purpose = PURPOSE_BY_CATEGORY[category];

  await loggedChatCompletion({
    client,
    purpose,
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
      message: "Asset value estimate did not return a result.",
    });
  }

  return estimateResult;
}
