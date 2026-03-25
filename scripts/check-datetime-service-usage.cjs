#!/usr/bin/env node
/**
 * Verification gate: ensure no direct Date/Date.now in server production code
 * outside DateTimeService/DateTime. Exits 1 if any violation (so CI can fail).
 * Run: node scripts/check-datetime-service-usage.cjs
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const serverDir = path.join(root, "server");

const allowed = new Set([
  "DateTime.ts",
  "DateTimeService.ts",
]);
const regex = /new Date\s*\(|Date\.now\s*\(/;

function walk(dir, list = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = path.relative(root, full);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "__tests__") continue;
      walk(full, list);
    } else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) {
      if (allowed.has(e.name)) continue;
      const content = fs.readFileSync(full, "utf-8");
      if (regex.test(content)) list.push(rel);
    }
  }
  return list;
}

const violations = walk(serverDir);
if (violations.length > 0) {
  console.error(
    "error: server code must use dateTimeService only. No direct new Date() or Date.now():"
  );
  violations.forEach((f) => console.error("  " + f));
  process.exit(1);
}
process.exit(0);
