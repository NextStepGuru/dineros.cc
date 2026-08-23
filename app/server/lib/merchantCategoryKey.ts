import { normalizePlaidDescription } from "~/server/lib/normalizePlaidDescription";

export type MerchantApplyMode = "ALWAYS" | "HINT";

export type CategorySource = "ai" | "rule" | "pfc" | "user" | "recurrence";

const HINT_MERCHANT_FRAGMENTS = [
  "shell",
  "chevron",
  "exxon",
  "mobil",
  "bp ",
  " bp",
  "marathon",
  "sunoco",
  "valero",
  "phillips",
  "circle k",
  "circlek",
  "wawa",
  "sheetz",
  "racetrac",
  "quiktrip",
  "quicktrip",
  " murphy",
  "arco",
  "sinclair",
  "citgo",
  "speedway",
  "pilot",
  "flying j",
  "love's",
  "loves",
  "buc-ee",
  "bucc-ee",
  "costco gas",
  "sam's club gas",
  "7-eleven",
  "7 eleven",
  "ampm",
  "thorntons",
  "kum & go",
  "casey's",
  "maverik",
  "starbucks",
  "dunkin",
  "uber",
  "lyft",
  "chipotle",
  "mcdonald",
  "wendy",
  "taco bell",
  "chick-fil-a",
  "chick fila",
];

const ALWAYS_BUSINESS_FRAGMENTS = [
  "adobe",
  "aws",
  "amazon web services",
  "google workspace",
  "microsoft 365",
  "quickbooks",
  "intuit",
  "gusto",
  "stripe",
  "github",
  "gitlab",
  "atlassian",
  "slack",
  "notion",
  "figma",
  "hubspot",
  "salesforce",
  "godaddy",
  "namecheap",
  "digitalocean",
  "heroku",
  "vercel",
  "cloudflare",
  "openai",
];

export function normalizeMerchantKey(raw: string): string {
  return normalizePlaidDescription(raw);
}

export function merchantEntityIdFromPlaid(
  source: Record<string, unknown> | null | undefined,
): string | null {
  if (!source) return null;
  const direct = source.merchant_entity_id;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const counterparties = source.counterparties;
  if (Array.isArray(counterparties)) {
    for (const row of counterparties) {
      if (!row || typeof row !== "object") continue;
      const entity = (row as { entity_id?: unknown }).entity_id;
      if (typeof entity === "string" && entity.trim()) return entity.trim();
    }
  }
  return null;
}

export function merchantNameFromPlaid(
  source: Record<string, unknown> | null | undefined,
): string {
  if (!source) return "";
  const merchant = source.merchant_name;
  if (typeof merchant === "string" && merchant.trim()) return merchant.trim();
  const counterparties = source.counterparties;
  if (Array.isArray(counterparties)) {
    for (const row of counterparties) {
      if (!row || typeof row !== "object") continue;
      const name = (row as { name?: unknown }).name;
      if (typeof name === "string" && name.trim()) return name.trim();
    }
  }
  const original = source.original_description;
  if (typeof original === "string" && original.trim()) return original.trim();
  const name = source.name;
  if (typeof name === "string" && name.trim()) return name.trim();
  return "";
}

export function defaultApplyModeForMerchant(
  merchantKey: string,
  categoryPath: string,
): MerchantApplyMode {
  const key = merchantKey.toLowerCase();
  if (ALWAYS_BUSINESS_FRAGMENTS.some((frag) => key.includes(frag))) {
    return "ALWAYS";
  }
  if (HINT_MERCHANT_FRAGMENTS.some((frag) => key.includes(frag))) {
    return "HINT";
  }
  const lowerPath = categoryPath.toLowerCase();
  if (
    lowerPath.includes("food & dining") ||
    lowerPath.includes("/ fuel") ||
    lowerPath.endsWith("fuel") ||
    lowerPath.includes("meals") ||
    lowerPath.includes("coffee") ||
    lowerPath.includes("rideshare") ||
    lowerPath.includes("restaurants")
  ) {
    return "HINT";
  }
  if (lowerPath.startsWith("business /")) {
    return "ALWAYS";
  }
  return "ALWAYS";
}
