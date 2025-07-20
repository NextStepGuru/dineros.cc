import { addBackupJob } from "~/server/clients/queuesClient";

export default defineEventHandler(async () => {
  addBackupJob({ name: "Daily backup" });
});
