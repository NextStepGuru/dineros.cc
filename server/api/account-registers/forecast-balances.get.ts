import { z } from "zod";
import { createError } from "h3";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import {
  forecastBalanceAtMonthEnd,
  futureRegisterEntryOr,
  registerBelongsToUserAccountWhere,
  stripRegisterEntryPlaidJson,
} from "~/server/lib/registerLedgerFuture";
import { dateTimeService } from "~/server/services/forecast";
import { budgetWhereForAccountMember } from "~/server/lib/accountAccess";

const querySchema = z.object({
  accountId: z.string().min(1),
  budgetId: z.coerce.number().int().positive(),
  monthsAhead: z.coerce.number().int().min(0).max(24),
});

export default defineEventHandler(async (event) => {
  try {
    const user = getUser(event);
    const q = querySchema.parse(getQuery(event));

    const budget = await PrismaDb.budget.findFirst({
      where: budgetWhereForAccountMember(user.userId, q.budgetId),
      select: { id: true },
    });
    if (!budget) {
      throw createError({
        statusCode: 403,
        statusMessage: "Budget not found or access denied",
      });
    }

    const link = await PrismaDb.userAccount.findFirst({
      where: { userId: user.userId, accountId: q.accountId },
      select: { accountId: true },
    });
    if (!link) {
      throw createError({
        statusCode: 403,
        statusMessage: "Account not found or access denied",
      });
    }

    const registers = await PrismaDb.accountRegister.findMany({
      where: {
        accountId: q.accountId,
        budgetId: q.budgetId,
        isArchived: false,
        account: {
          userAccounts: { some: { userId: user.userId } },
        },
      },
      select: {
        id: true,
        balance: true,
        latestBalance: true,
        subAccountRegisterId: true,
        type: { select: { isCredit: true } },
      },
    });

    if (registers.length === 0) {
      const asOfEmpty = dateTimeService.toDate(
        dateTimeService.endOf(
          "month",
          dateTimeService.add(q.monthsAhead, "month"),
        ),
      );
      return {
        asOf: asOfEmpty.toISOString(),
        balances: {} as Record<number, number>,
      };
    }

    const registerIds = registers.map((r) => r.id);

    const allEntries = await PrismaDb.registerEntry.findMany({
      where: {
        accountRegisterId: { in: registerIds },
        OR: [...futureRegisterEntryOr],
        ...registerBelongsToUserAccountWhere(q.accountId, user.userId),
      },
      orderBy: [{ seq: "asc" }, { createdAt: "asc" }],
    });

    const byRegisterId = new Map<number, typeof allEntries>();
    for (const e of allEntries) {
      const list = byRegisterId.get(e.accountRegisterId) ?? [];
      list.push(e);
      byRegisterId.set(e.accountRegisterId, list);
    }

    const asOf = dateTimeService.toDate(
      dateTimeService.endOf(
        "month",
        dateTimeService.add(q.monthsAhead, "month"),
      ),
    );

    const balances: Record<number, number> = {};
    for (const reg of registers) {
      const pocketBalances = registers
        .filter((r) => r.subAccountRegisterId === reg.id)
        .map((r) => ({ balance: r.balance }));

      const rows = byRegisterId.get(reg.id) ?? [];
      const stripped = stripRegisterEntryPlaidJson(rows);

      balances[reg.id] = forecastBalanceAtMonthEnd({
        registerEntriesWithoutPlaidJson: stripped,
        latestBalance: reg.latestBalance,
        pocketBalances,
        isCredit: reg.type.isCredit,
        asOf,
      });
    }

    return {
      asOf: asOf.toISOString(),
      balances,
    };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
