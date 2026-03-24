import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { getCategoryReport } from "~/server/services/reports/CategoryReportService";
import { categoryReportQuerySchema } from "~/server/services/reports/types";

export default defineEventHandler(async (event) => {
  try {
    const user = getUser(event);
    const query = categoryReportQuerySchema.parse(getQuery(event));
    return await getCategoryReport({ userId: user.userId, query });
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
