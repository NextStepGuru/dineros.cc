import { defineEventHandler, setResponseStatus } from "h3";
import { handleApiError } from "~/server/lib/handleApiError";
import { seedE2EUser } from "~/server/services/e2eSeedService";
import { assertE2EAllowed } from "./_guard";

export default defineEventHandler(async (event) => {
  try {
    assertE2EAllowed(event);
    const result = await seedE2EUser();
    setResponseStatus(event, 201);
    return result;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
