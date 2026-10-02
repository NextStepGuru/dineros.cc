import { describe, expect, it } from "vitest";
import { csvEscape } from "../csvEscape";

describe("csvEscape", () => {
  it("leaves plain values untouched", () => {
    expect(csvEscape("hello")).toBe("hello");
    expect(csvEscape("")).toBe("");
    expect(csvEscape("ACME Corp")).toBe("ACME Corp");
  });

  it("quotes values containing commas", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
  });

  it("doubles embedded quotes and wraps the value", () => {
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });

  it("quotes values containing newlines", () => {
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });

  it("quotes values containing carriage returns", () => {
    expect(csvEscape("line1\r\nline2")).toBe('"line1\r\nline2"');
  });

  it("handles a value with every special character at once", () => {
    expect(csvEscape('a,"b"\nc')).toBe('"a,""b""\nc"');
  });
});
