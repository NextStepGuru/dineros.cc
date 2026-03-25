import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { migrate } from "../AccountRegister";

const dir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(dir, "../AccountRegister.ts"), "utf8");

describe("AccountRegister reencrypt", () => {
  it("exports migrate", () => {
    expect(typeof migrate).toBe("function");
  });

  it("internal model comment includes category relation fields", () => {
    expect(source).toContain("paymentCategory");
    expect(source).toContain("interestCategory");
  });
});
