import { prisma } from "~/server/clients/prismaClient";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const accountRegisterId = query.accountRegisterId as string;

  if (!accountRegisterId) {
    throw createError({
      statusCode: 400,
      statusMessage: "accountRegisterId is required"
    });
  }

  // Get the account register details
  const accountRegister = await prisma.accountRegister.findUnique({
    where: { id: parseInt(accountRegisterId) },
    select: {
      id: true,
      name: true,
      balance: true,
      latestBalance: true,
    }
  });

  if (!accountRegister) {
    throw createError({
      statusCode: 404,
      statusMessage: "Account register not found"
    });
  }

  // Get the balance entry for this account register
  const balanceEntry = await prisma.registerEntry.findFirst({
    where: {
      accountRegisterId: parseInt(accountRegisterId),
      isBalanceEntry: true,
    },
    select: {
      id: true,
      accountRegisterId: true,
      description: true,
      amount: true,
      balance: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  return {
    accountRegister,
    balanceEntry,
    summary: {
      accountRegisterId: parseInt(accountRegisterId),
      accountName: accountRegister.name,
      accountBalance: accountRegister.balance,
      accountLatestBalance: accountRegister.latestBalance,
      balanceEntryAmount: balanceEntry?.amount || 0,
      balanceEntryBalance: balanceEntry?.balance || 0,
      hasBalanceEntry: !!balanceEntry,
    }
  };
});
