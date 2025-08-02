/**
 * Calculates the adjusted balance by subtracting pocket balances from the main balance
 */
export function calculateAdjustedBalance(
  mainBalance: any, // Prisma Decimal or number
  pocketBalances: Array<{ balance: any }> | null | undefined // Array of pocket balance entries
): number {
  // Validate mainBalance - handle null/undefined as 0
  const mainBalanceNum =
    mainBalance === null || mainBalance === undefined ? 0 : Number(mainBalance);
  if (isNaN(mainBalanceNum)) {
    throw new Error(
      `Invalid mainBalance: ${mainBalance}. Expected a valid number.`
    );
  }

  // Validate pocketBalances array
  const balancesArray = pocketBalances || [];
  if (!Array.isArray(balancesArray)) {
    throw new Error(
      `Invalid pocketBalances: ${pocketBalances}. Expected an array.`
    );
  }

  const pocketBalanceSum = balancesArray.reduce((sum, pocket, index) => {
    if (!pocket || typeof pocket !== "object" || !("balance" in pocket)) {
      throw new Error(
        `Invalid pocket balance at index ${index}: ${pocket}. Expected object with 'balance' property.`
      );
    }

    // Handle null/undefined balance as 0
    const balance =
      pocket.balance === null || pocket.balance === undefined
        ? 0
        : Number(pocket.balance);
    if (isNaN(balance)) {
      throw new Error(
        `Invalid balance at index ${index}: ${pocket.balance}. Expected a valid number.`
      );
    }

    // Only include positive balances, set negative balances to 0
    return sum + Math.max(0, balance);
  }, 0);

  return mainBalanceNum - pocketBalanceSum;
}
