import type { Prisma } from "@prisma/client";
import { formatUnits } from "viem";
import env from "~/server/env";
import { log } from "~/server/logger";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { dateTimeService } from "~/server/services/forecast";

type AlchemyTokenPrice = {
  currency?: string;
  value?: string;
  lastUpdatedAt?: string;
};

type AlchemyTokenMetadata = {
  decimals?: number;
  logo?: string;
  name?: string;
  symbol?: string;
  /** Alchemy may flag spam tokens */
  spam?: boolean;
};

type AlchemyTokenRow = {
  address?: string;
  network?: string;
  tokenAddress?: string | null;
  tokenBalance?: string;
  tokenMetadata?: AlchemyTokenMetadata | null;
  tokenPrices?: AlchemyTokenPrice[] | null;
  error?: string | null;
};

type AlchemyTokensByAddressResponse = {
  data?: {
    tokens?: AlchemyTokenRow[];
    pageKey?: string;
  };
};

const DUST_USD = 0.01;

function usdPriceFromRow(row: AlchemyTokenRow): number | null {
  const prices = row.tokenPrices;
  if (!prices?.length) return null;
  const usd = prices.find((p) => p.currency?.toLowerCase() === "usd");
  if (!usd?.value) return null;
  const n = Number(usd.value);
  return Number.isFinite(n) ? n : null;
}

/** Position USD from Alchemy per-unit USD price × display balance; else from fallback price. */
function valueUsdForToken(
  row: AlchemyTokenRow,
  displayBalance: number,
  pricePerUnit: number | null,
): number | null {
  const prices = row.tokenPrices;
  if (prices?.length) {
    const usd = prices.find((p) => p.currency?.toLowerCase() === "usd");
    if (usd?.value) {
      const v = Number(usd.value);
      if (Number.isFinite(v) && v > 0 && Number.isFinite(displayBalance)) {
        return displayBalance * v;
      }
    }
  }
  if (pricePerUnit != null && Number.isFinite(displayBalance)) {
    return displayBalance * pricePerUnit;
  }
  return null;
}

export async function syncWalletPortfolio(
  accountRegisterId: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!env?.ALCHEMY_API_KEY) {
    return { ok: false, message: "Alchemy is not configured (ALCHEMY_API_KEY)." };
  }

  const register = await PrismaDb.accountRegister.findFirst({
    where: { id: accountRegisterId },
    include: {
      type: true,
      cryptoRegisterChains: { include: { evmChain: true } },
    },
  });

  if (!register) {
    return { ok: false, message: "Account register not found." };
  }
  if (register.type.registerClass !== "crypto") {
    return { ok: false, message: "Not a crypto wallet register." };
  }
  if (!register.walletAddress) {
    return { ok: false, message: "Wallet address is not set." };
  }

  const networks = register.cryptoRegisterChains.map((c) => c.evmChain.networkId);
  if (networks.length === 0) {
    return { ok: false, message: "No EVM chains selected for this wallet." };
  }

  const url = `https://api.g.alchemy.com/data/v1/${env.ALCHEMY_API_KEY}/assets/tokens/by-address`;
  const body = {
    addresses: [
      {
        address: register.walletAddress,
        networks,
      },
    ],
    withMetadata: true,
    withPrices: true,
    includeNativeTokens: true,
    includeErc20Tokens: true,
  };

  let json: AlchemyTokensByAddressResponse;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      log({
        message: "Alchemy tokens by address failed",
        level: "error",
        data: { status: res.status, body: text.slice(0, 500) },
      });
      return {
        ok: false,
        message: `Alchemy request failed (${res.status}).`,
      };
    }
    json = (await res.json()) as AlchemyTokensByAddressResponse;
  } catch (e) {
    log({
      message: "Alchemy tokens by address network error",
      level: "error",
      data: e,
    });
    return { ok: false, message: "Could not reach Alchemy." };
  }

  const rawTokens = json.data?.tokens ?? [];
  await PrismaDb.$transaction(async (tx) => {
    await tx.cryptoTokenBalance.deleteMany({ where: { accountRegisterId } });

    const rows: Prisma.CryptoTokenBalanceCreateManyInput[] = [];
    let totalUsd = 0;
    const now = dateTimeService.nowDate();

    for (const row of rawTokens) {
      if (row.error) continue;
      if (row.tokenMetadata?.spam === true) continue;

      const decimals = row.tokenMetadata?.decimals ?? 18;
      let displayBalance = 0;
      try {
        const raw = (row.tokenBalance ?? "0").trim();
        displayBalance = Number(formatUnits(BigInt(raw), decimals));
      } catch {
        continue;
      }

      const priceUsd = usdPriceFromRow(row);
      const valueUsd = valueUsdForToken(row, displayBalance, priceUsd);
      if (valueUsd != null && valueUsd < DUST_USD) continue;

      if (valueUsd != null && Number.isFinite(valueUsd)) {
        totalUsd += valueUsd;
      }

      const sym = row.tokenMetadata?.symbol?.trim() || "???";
      const name = row.tokenMetadata?.name?.trim() || sym;

      rows.push({
        accountRegisterId,
        network: row.network ?? "",
        tokenAddress: row.tokenAddress ?? null,
        tokenName: name,
        tokenSymbol: sym,
        tokenDecimals: decimals,
        tokenBalance: row.tokenBalance ?? "0",
        displayBalance,
        priceUsd:
          priceUsd != null && Number.isFinite(priceUsd) ? priceUsd : null,
        valueUsd:
          valueUsd != null && Number.isFinite(valueUsd) ? valueUsd : null,
        logoUrl: row.tokenMetadata?.logo ?? null,
        syncedAt: now,
      });
    }

    if (rows.length > 0) {
      await tx.cryptoTokenBalance.createMany({ data: rows });
    }

    await tx.accountRegister.update({
      where: { id: accountRegisterId },
      data: {
        balance: totalUsd,
        latestBalance: totalUsd,
        alchemyLastSyncAt: now,
        alchemyJson: json as unknown as Prisma.InputJsonValue,
      },
    });
  });

  return { ok: true };
}
