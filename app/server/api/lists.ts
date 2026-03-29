import { getUser } from "../lib/getUser";
import { defineEventHandler } from "h3";
import { handleApiError } from "~/server/lib/handleApiError";
import { accountListsRepository } from "~/server/repositories/accountListsRepository.singleton";
import {
  filterListsByMembership,
  membershipSummariesForClient,
} from "~/server/lib/filterListsByMembership";

export default defineEventHandler(async (event) => {
  try {
    const user = getUser(event);

    const memberships = await accountListsRepository.loadMemberships(
      user.userId,
    );

    const raw = await accountListsRepository.loadRawLists(user.userId);

    const filtered = filterListsByMembership(memberships, {
      reoccurrences: raw.reoccurrences,
      budgets: raw.budgets,
      accountRegisters: raw.accountRegisters,
      categories: raw.categories,
      savingsGoals: raw.savingsGoals,
      accounts: raw.accounts,
    });

    return {
      reoccurrences: filtered.reoccurrences,
      intervals: raw.intervals,
      accountTypes: raw.accountTypes,
      accountRegisters: filtered.accountRegisters,
      budgets: filtered.budgets,
      accounts: filtered.accounts,
      categories: filtered.categories,
      savingsGoals: filtered.savingsGoals,
      memberships: membershipSummariesForClient(memberships),
    };
  } catch (error) {
    handleApiError(error);

    throw new Error("An error occurred while fetching lists.");
  }
});
