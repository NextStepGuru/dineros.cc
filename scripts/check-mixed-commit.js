import { execSync } from "child_process";

try {
  const stagedFiles = execSync("git diff --cached --name-only", {
    encoding: "utf-8",
  })
    .split("\n")
    .filter(Boolean);

  const hasMigrationFiles = stagedFiles.some((file) =>
    file.startsWith("prisma/migration/")
  );
  const hasOtherFiles = stagedFiles.some(
    (file) =>
      !file.startsWith("prisma/migration/") && !file.includes("schema.prisma")
  );

  if (hasMigrationFiles && hasOtherFiles) {
    console.error("Error: Cannot commit migration files with other changes.");
    process.exit(1);
  }
} catch (error) {
  console.error("Error checking staged files:", error);
  process.exit(1);
}
