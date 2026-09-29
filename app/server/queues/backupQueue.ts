import type { Job } from "bullmq";
import { Storage } from "@google-cloud/storage";
import path from "path";
import fs, { writeFileSync } from "fs";
import archiver from "archiver";
import { prisma } from "~/server/clients/prismaClient";
import env from "~/server/env";
import { log } from "~/server/logger";
import { dateTimeService } from "../services/forecast/DateTimeService";

export type BackupJob = { name: string };
const queueName = "daily-backup";

function backupData(name: string, data: unknown): void {
  writeFileSync(
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

  const bucketName = process.env.BACKUP_BUCKET_NAME;
  if (!bucketName && env.DEPLOY_ENV !== "local") {
    // Otherwise the job would upload to a placeholder bucket and still report success.
    throw new Error("BACKUP_BUCKET_NAME is not set; refusing to run backup");
  }

  const storage = new Storage();
  const backupDir = "./temp/";
  const localBackupDir = "./prisma/backup/";

  // Ensure the working and local-copy directories exist (the runtime image does not ship prisma/backup)
  fs.mkdirSync(backupDir, { recursive: true });
  fs.mkdirSync(localBackupDir, { recursive: true });

  // Generate the current date string in yyyy-mm-dd format
  const date = dateTimeService.nowDate();
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

  // Dump files and the zip contain full user data — always remove working files when
  // the job ends, keeping copies in prisma/backup for the local workflow first.
  const cleanupWorkingFiles = () => {
    for (const file of fs.readdirSync(backupDir)) {
      if (file.endsWith(".ts")) {
        try {
          fs.copyFileSync(
            path.join(backupDir, file),
            path.join(localBackupDir, file)
          );
        } catch (error) {
          log({
            message: `Error copying ${file} to ${localBackupDir}:`,
            data: { error },
            level: "warn",
          });
        }
      }
      if (file.endsWith(".ts") || file === zipFileName) {
        fs.rmSync(path.join(backupDir, file), { force: true });
      }
    }
  };

  // Good practice to catch warnings (ie stat failures and other non-blocking errors)
  archive.on("warning", (err) => {
    if (err.code === "ENOENT") {
      log({ message: "Warning during archiving:", data: err, level: "warn" });
    } else {
      log({ message: "Error saving file", data: err, level: "error" });
    }
  });

  try {
    // Wait for the zip to be fully written before uploading it
    await new Promise<void>((resolve, reject) => {
      output.on("close", resolve);
      archive.on("error", reject);
      // Pipe archive data to the file
      archive.pipe(output);
      // Append files from the backup directory
      archive.glob("*.ts", { cwd: backupDir });
      // Finalize the archive (i.e., we are done appending files but streams have to finish yet)
      archive.finalize();
    });

    log({ message: `Archive created: ${archive.pointer()} total bytes` });

    if (bucketName) {
      await storage.bucket(bucketName).upload(zipFilePath, {
        destination: zipFileName,
      });
      log({ message: "File uploaded successfully" });
    } else {
      log({
        message: "BACKUP_BUCKET_NAME not set; local backup copy only",
        level: "warn",
      });
    }
  } finally {
    cleanupWorkingFiles();
  }
};

export default { queueName, processor };
