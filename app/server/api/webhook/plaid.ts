import { log } from "../../logger";
export default defineEventHandler(async (event) => {
  const qry = getQuery(event);
  log({ message: "Query:", data: qry, level: "info" });
  return {};
});
