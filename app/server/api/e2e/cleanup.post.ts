import { defineEventHandler } from "h3";
import { handleApiError } from "~/server/lib/handleApiError";
import {
  deleteE2EUserByEmail,
  E2E_USER_EMAIL,
} from "~/server/services/e2eSeedService";
import { assertE2EAllowed } from "./_guard";

export default defineEventHandler(async (event) => {
  try {
    assertE2EAllowed(event);
    const { deleted } = await deleteE2EUserByEmail(E2E_USER_EMAIL);
    return { ok: true, deleted };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
