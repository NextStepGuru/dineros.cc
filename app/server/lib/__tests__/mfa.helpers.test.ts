import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const randomInt = vi.fn();

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return {
    ...actual,
    randomInt: (...args: [number, number]) => randomInt(...args),
  };
});

// eslint-disable-next-line import/first -- mocks must be registered first
import {
  generateNumericOtpCode,
  hashOtp,
} from "~/server/lib/mfa";

describe("mfa helpers", () => {
  beforeEach(() => {
    randomInt.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("generateNumericOtpCode uses randomInt per digit", () => {
    randomInt
      .mockReturnValueOnce(1)
      .mockReturnValueOnce(2)
      .mockReturnValueOnce(3)
      .mockReturnValueOnce(4)
      .mockReturnValueOnce(5)
      .mockReturnValueOnce(6);
    expect(generateNumericOtpCode(6)).toBe("123456");
    expect(randomInt).toHaveBeenCalledTimes(6);
    expect(randomInt).toHaveBeenCalledWith(0, 10);
  });

  it("hashOtp is stable hex sha256", () => {
    expect(hashOtp("abc")).toBe(hashOtp("abc"));
    expect(hashOtp("abc")).not.toBe(hashOtp("abd"));
  });
});
