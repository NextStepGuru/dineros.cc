import { describe, it, expect } from "vitest";

// Note: We'll import actual utility functions when they're available
// For now, creating tests for common utility patterns

describe("Utility Functions", () => {
  describe("Array Utilities", () => {
    it("should handle empty arrays gracefully", () => {
      const emptyArray: any[] = [];
      expect(emptyArray.length).toBe(0);
      expect(emptyArray.filter((x) => x)).toEqual([]);
      expect(emptyArray.map((x) => x)).toEqual([]);
    });

    it("should handle array chunking", () => {
      // Test chunking functionality if it exists
      const chunkArray = <T>(array: T[], size: number): T[][] => {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += size) {
          chunks.push(array.slice(i, i + size));
        }
        return chunks;
      };

      const testArray = [1, 2, 3, 4, 5, 6, 7, 8, 9];
      const chunks = chunkArray(testArray, 3);

      expect(chunks).toEqual([
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ]);
      expect(chunks.length).toBe(3);
    });

    it("should handle array deduplication", () => {
      const deduplicate = <T>(array: T[]): T[] => {
        return Array.from(new Set(array));
      };

      const duplicateArray = [1, 2, 2, 3, 3, 3, 4, 5, 5];
      const unique = deduplicate(duplicateArray);

      expect(unique).toEqual([1, 2, 3, 4, 5]);
      expect(unique.length).toBe(5);
    });
  });

  describe("Object Utilities", () => {
    it("should handle deep object cloning", () => {
      const deepClone = <T>(obj: T): T => {
        return JSON.parse(JSON.stringify(obj));
      };

      const original = {
        name: "Test",
        data: {
          values: [1, 2, 3],
          nested: { count: 5 },
        },
      };

      const cloned = deepClone(original);
      cloned.data.values.push(4);
      cloned.data.nested.count = 10;

      expect(original.data.values).toEqual([1, 2, 3]);
      expect(original.data.nested.count).toBe(5);
      expect(cloned.data.values).toEqual([1, 2, 3, 4]);
      expect(cloned.data.nested.count).toBe(10);
    });

    it("should handle object property existence checks", () => {
      const hasProperty = (obj: any, prop: string): boolean => {
        return Object.prototype.hasOwnProperty.call(obj, prop);
      };

      const testObj = { name: "test", value: 0, flag: false };

      expect(hasProperty(testObj, "name")).toBe(true);
      expect(hasProperty(testObj, "value")).toBe(true);
      expect(hasProperty(testObj, "flag")).toBe(true);
      expect(hasProperty(testObj, "nonexistent")).toBe(false);
    });

    it("should handle object merging", () => {
      const mergeObjects = <T extends object>(
        target: T,
        ...sources: Partial<T>[]
      ): T => {
        return Object.assign({}, target, ...sources);
      };

      const base = { a: 1, b: 2, c: 3 };
      const override1 = { b: 20, d: 4 };
      const override2 = { c: 30, e: 5 };

      const merged = mergeObjects(base, override1, override2);

      expect(merged).toEqual({ a: 1, b: 20, c: 30, d: 4, e: 5 });
      expect(base).toEqual({ a: 1, b: 2, c: 3 }); // Original unchanged
    });
  });

  describe("String Utilities", () => {
    it("should handle string formatting", () => {
      const formatString = (
        template: string,
        values: Record<string, any>
      ): string => {
        return template.replace(/\{(\w+)\}/g, (match, key) => {
          return values[key] !== undefined ? String(values[key]) : match;
        });
      };

      const template = "Hello {name}, you have {count} messages";
      const values = { name: "John", count: 5 };
      const result = formatString(template, values);

      expect(result).toBe("Hello John, you have 5 messages");
    });

    it("should handle string validation", () => {
      const isValidEmail = (email: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
      };

      expect(isValidEmail("test@example.com")).toBe(true);
      expect(isValidEmail("user.name+tag@domain.co.uk")).toBe(true);
      expect(isValidEmail("invalid.email")).toBe(false);
      expect(isValidEmail("@domain.com")).toBe(false);
      expect(isValidEmail("user@")).toBe(false);
    });

    it("should handle string truncation", () => {
      const truncateString = (
        str: string,
        maxLength: number,
        suffix = "..."
      ): string => {
        if (str.length <= maxLength) return str;
        return str.substring(0, maxLength - suffix.length) + suffix;
      };

      expect(truncateString("Hello World", 10)).toBe("Hello W...");
      expect(truncateString("Short", 10)).toBe("Short");
      expect(truncateString("Long text here", 8, "…")).toBe("Long te…");
    });
  });

  describe("Number Utilities", () => {
    it("should handle number formatting", () => {
      const formatCurrency = (amount: number, currency = "USD"): string => {
        return new Intl.NumberFormat("en-US", {
          style: "currency",
          currency,
        }).format(amount);
      };

      expect(formatCurrency(1234.56)).toBe("$1,234.56");
      expect(formatCurrency(0)).toBe("$0.00");
      expect(formatCurrency(-500.25)).toBe("-$500.25");
    });

    it("should handle number validation", () => {
      const isValidNumber = (value: any): value is number => {
        return typeof value === "number" && !isNaN(value) && isFinite(value);
      };

      expect(isValidNumber(123)).toBe(true);
      expect(isValidNumber(0)).toBe(true);
      expect(isValidNumber(-45.67)).toBe(true);
      expect(isValidNumber(NaN)).toBe(false);
      expect(isValidNumber(Infinity)).toBe(false);
      expect(isValidNumber("123")).toBe(false);
    });

    it("should handle number range operations", () => {
      const clampNumber = (value: number, min: number, max: number): number => {
        return Math.min(Math.max(value, min), max);
      };

      expect(clampNumber(5, 0, 10)).toBe(5);
      expect(clampNumber(-5, 0, 10)).toBe(0);
      expect(clampNumber(15, 0, 10)).toBe(10);
      expect(clampNumber(7.5, 2.5, 8.5)).toBe(7.5);
    });
  });

  describe("Date Utilities", () => {
    it("should handle date formatting", () => {
      const formatDate = (date: Date, format = "YYYY-MM-DD"): string => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");

        return format
          .replace("YYYY", String(year))
          .replace("MM", month)
          .replace("DD", day);
      };

      const testDate = new Date(2023, 5, 15); // June 15, 2023
      expect(formatDate(testDate)).toBe("2023-06-15");
      expect(formatDate(testDate, "DD/MM/YYYY")).toBe("15/06/2023");
    });

    it("should handle date comparison", () => {
      const isSameDay = (date1: Date, date2: Date): boolean => {
        return (
          date1.getFullYear() === date2.getFullYear() &&
          date1.getMonth() === date2.getMonth() &&
          date1.getDate() === date2.getDate()
        );
      };

      const date1 = new Date(2023, 5, 15, 10, 30);
      const date2 = new Date(2023, 5, 15, 14, 45);
      const date3 = new Date(2023, 5, 16, 10, 30);

      expect(isSameDay(date1, date2)).toBe(true);
      expect(isSameDay(date1, date3)).toBe(false);
    });

    it("should handle date arithmetic", () => {
      const addDays = (date: Date, days: number): Date => {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
      };

      const baseDate = new Date(2023, 5, 15); // June 15, 2023
      const futureDate = addDays(baseDate, 7);
      const pastDate = addDays(baseDate, -3);

      expect(futureDate.getDate()).toBe(22);
      expect(pastDate.getDate()).toBe(12);
    });
  });

  describe("Promise Utilities", () => {
    it("should handle promise delay", async () => {
      const delay = (ms: number): Promise<void> => {
        return new Promise((resolve) => setTimeout(resolve, ms));
      };

      const start = Date.now();
      await delay(100);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(95); // Allow some tolerance
      expect(elapsed).toBeLessThan(200);
    });

    it("should handle promise timeout", async () => {
      const withTimeout = <T>(
        promise: Promise<T>,
        timeoutMs: number
      ): Promise<T> => {
        return Promise.race([
          promise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), timeoutMs)
          ),
        ]);
      };

      const slowPromise = new Promise((resolve) => setTimeout(resolve, 200));

      await expect(withTimeout(slowPromise, 100)).rejects.toThrow("Timeout");
      await expect(withTimeout(Promise.resolve("fast"), 100)).resolves.toBe(
        "fast"
      );
    });

    it("should handle promise retry logic", async () => {
      const retryAsync = async <T>(
        fn: () => Promise<T>,
        maxAttempts: number = 3,
        delay: number = 100
      ): Promise<T> => {
        let lastError: Error = new Error("No attempts made");

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            return await fn();
          } catch (error) {
            lastError = error as Error;
            if (attempt < maxAttempts) {
              await new Promise((resolve) => setTimeout(resolve, delay));
            }
          }
        }

        throw lastError;
      };

      let attemptCount = 0;
      const flakyFunction = async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error(`Attempt ${attemptCount} failed`);
        }
        return "success";
      };

      const result = await retryAsync(flakyFunction, 3, 10);
      expect(result).toBe("success");
      expect(attemptCount).toBe(3);
    });
  });
});
