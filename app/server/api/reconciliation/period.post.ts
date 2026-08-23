import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { openReconciliationPeriod } from "~/server/services/reconciliationService";
import { openReconciliationPeriodSchema } from "~/schema/reconciliation";

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const body = openReconciliationPeriodSchema.parse(await readBody(event));
    return await openReconciliationPeriod({
      userId,
      budgetId: body.budgetId,
      accountRegisterId: body.accountRegisterId,
      startDate: body.startDate,
      endDate: body.endDate,
      statementOpeningBalance: body.statementOpeningBalance,
      statementEndingBalance: body.statementEndingBalance,
      statementIncomeTotal: body.statementIncomeTotal,
      statementExpenseTotal: body.statementExpenseTotal,
      statementLines: body.statementLines?.map((line) => ({
        date: line.date,
        description: line.description,
        amount: line.amount,
        lineType: line.lineType ?? null,
      })),
    });
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
