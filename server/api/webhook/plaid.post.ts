import { log } from "../../logger";
export default defineEventHandler(async (event) => {
  const body = readBody(event);
  log({ message: "Body:", data: body, level: "info" });
  return {};
});
