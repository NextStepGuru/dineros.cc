import type { Job } from "bullmq";
import { Storage } from "@google-cloud/storage";
import path from "path";
import fs, { writeFileSync } from "fs";
import archiver from "archiver";
import { prisma } from "~/server/clients/prismaClient";
import env from "~/server/env";
import { log } from "~/server/logger";

export type BackupJob = { name: string };
const queueName = "daily-backup";

function backupData(name: string, data: unknown): void {
  return writeFileSync(
    `./temp/${name}.ts`,
    `export const ${name} = ${JSON.stringify(data)}`,
    "utf8"
  );
}

const processor = async (job: Job<BackupJob>) => {
  log({
    level: "debug",
    message: `Start BackupJob ${job.id} with data:`,
    data: job.data,
  });
  const storage = new Storage();
  const bucketName = "backup-dineros";
  const backupDir = "./temp/";

  // Ensure the backup directory exists
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // Generate the current date string in yyyy-mm-dd format
  const date = new Date();
  const dateString = date.toISOString().split("T")[0];
  const zipFileName = `${dateString}-${env.DEPLOY_ENV}-backup.zip`;
  const zipFilePath = path.join(backupDir, zipFileName);
  // Create a file to stream archive data to
  const output = fs.createWriteStream(zipFilePath);
  const archive = archiver("zip", {
    zlib: { level: 9 }, // Sets the compression level
  });

  backupData("accounts", await prisma.account.findMany({}));
  backupData("accountRegisters", await prisma.accountRegister.findMany({}));
  backupData("reoccurrences", await prisma.reoccurrence.findMany({}));
  backupData("reoccurrenceSkips", await prisma.reoccurrenceSkip.findMany({}));
  backupData("registerEntry", await prisma.registerEntry.findMany({}));
  backupData("budgets", await prisma.budget.findMany({}));
  backupData("users", await prisma.user.findMany({}));
  backupData("userSocials", await prisma.userSocial.findMany({}));
  backupData("categories", await prisma.category.findMany({}));
  backupData("userAccounts", await prisma.userAccount.findMany({}));
  backupData("intervals", await prisma.interval.findMany({}));
  backupData("accountTypes", await prisma.accountType.findMany({}));
  backupData("rsa", await prisma.rsa.findMany({}));

  // Listen for all archive data to be written
  output.on("close", async () => {
    log({ message: `Archive created: ${archive.pointer()} total bytes` });

    // Upload the zip file to Google Cloud Storage
    try {
      await storage.bucket(bucketName).upload(zipFilePath, {
        destination: zipFileName,
      });

      log({ message: "File uploaded successfully" });
    } catch (error) {
      log({
        message: "Error uploading file:",
        data: { error },
        level: "error",
      });
    } finally {
      // Clean up the zip file after upload
      fs.unlinkSync(zipFilePath);

      // if (env.DEPLOY_ENV === "local") {
      // Delete all *.ts files in the backup directory
      const files = fs.readdirSync(backupDir);
      for (const file of files) {
        if (file.endsWith(".ts")) {
          fs.copyFileSync(
            path.join(backupDir, file),
            path.join("./prisma/backup", file)
          );
          fs.unlinkSync(path.join(backupDir, file));
        }
      }
    }
    // }
  });

  // Good practice to catch warnings (ie stat failures and other non-blocking errors)
  archive.on("warning", (err) => {
    if (err.code === "ENOENT") {
      log({ message: "Warning during archiving:", data: err, level: "warn" });
    } else {
      log({ message: "Error saving file", data: err, level: "error" });
    }
  });

  // Catch errors explicitly
  archive.on("error", (err) => {
    log({ message: "Error archiving:", data: err, level: "error" });
  });

  // Pipe archive data to the file
  archive.pipe(output);

  // Append files from the backup directory
  archive.glob("*.ts", { cwd: backupDir });

  // Finalize the archive (i.e., we are done appending files but streams have to finish yet)
  archive.finalize();
};

export default { queueName, processor };
