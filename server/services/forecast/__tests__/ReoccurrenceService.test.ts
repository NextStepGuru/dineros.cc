import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { ReoccurrenceService } from "../ReoccurrenceService";
import { ModernCacheService } from "../ModernCacheService";
import { RegisterEntryService } from "../RegisterEntryService";
import { TransferService } from "../TransferService";
import { createTestDatabase, cleanupTestDatabase } from "./test-utils";
import type { PrismaClient, Reoccurrence } from "~/types/test-types";
import { forecastLogger } from "../logger";
import { dateTimeService } from "../DateTimeService";

describe("ReoccurrenceService", () => {
  let service: ReoccurrenceService;
  let mockDb: PrismaClient;
  let mockCache: { reoccurrence: any };
  let mockEntryService: { createEntry: any };
  let mockTransferService: { transferBetweenAccounts: any };

  beforeEach(async () => {
    mockDb = await createTestDatabase();

    // Create mock services
    mockCache = {
      reoccurrence: {
        findOne: vi.fn(),
        find: vi.fn(),
        update: vi.fn(),
      },
    };

    mockEntryService = {
      createEntry: vi.fn(),
    };

    mockTransferService = {
      transferBetweenAccounts: vi.fn(),
    };

    service = new ReoccurrenceService(
      mockDb,
      mockCache as any,
      mockEntryService as any,
      mockTransferService as any
    );

    // Mock forecastLogger to avoid test output
    vi.spyOn(forecastLogger, "service").mockImplementation(() => {});
    vi.spyOn(forecastLogger, "serviceDebug").mockImplementation(() => {});
  });

  afterEach(async () => {
    await cleanupTestDatabase(mockDb);
    vi.restoreAllMocks();
  });

  function createMockReoccurrence(
    overrides: Partial<Reoccurrence> = {}
  ): Reoccurrence {
    return {
      id: 1,
      accountId: "test-account",
      accountRegisterId: 1,
      description: "Test Reoccurrence",
      amount: 100,
      intervalId: 3, // Monthly
      intervalCount: 1,
      lastAt: new Date("2024-01-01T00:00:00.000Z"),
      endAt: null,
      totalIntervals: null,
      elapsedIntervals: null,
      transferAccountRegisterId: null,
      updatedAt: new Date(),
      adjustBeforeIfOnWeekend: false,
      ...overrides,
    } as Reoccurrence;
  }

  // Recurrence regression matrix: due-date gating, next-occurrence progression, cache lastAt/lastRunAt,
  // monthly stepping, transfer vs entry path, endAt boundary (see also DataPersisterService + integration tests).
  describe("processReoccurrences", () => {
    it("should process multiple reoccurrences up to end date", async () => {
      const reoccurrence1 = createMockReoccurrence({
        id: 1,
        lastAt: new Date("2024-01-01T00:00:00.000Z"),
        intervalId: 3, // Monthly
      });
      const reoccurrence2 = createMockReoccurrence({
        id: 2,
        lastAt: new Date("2024-01-01T00:00:00.000Z"),
        intervalId: 2, // Weekly
      });

      mockCache.reoccurrence.findOne.mockReturnValue(reoccurrence1);

      await service.processReoccurrences(
        [reoccurrence1, reoccurrence2],
        new Date("2024-03-01T00:00:00.000Z")
      );

      expect(mockEntryService.createEntry).toHaveBeenCalled();
      expect(forecastLogger.service).toHaveBeenCalledWith(
        "ReoccurrenceService",
        expect.stringContaining("Processing 2 reoccurrences")
      );
    });

    it("should create transfer for reoccurrence with transfer account", async () => {
      const reoccurrence = createMockReoccurrence({
        lastAt: new Date("2024-01-01T00:00:00.000Z"),
        transferAccountRegisterId: 2,
        intervalId: 3,
      });

      mockCache.reoccurrence.findOne.mockReturnValue(reoccurrence);

      await service.processReoccurrences(
        [reoccurrence],
        new Date("2024-02-01T00:00:00.000Z")
      );

      // First occurrence is next after lastAt (2024-02-01), not replay of lastAt
      expect(mockTransferService.transferBetweenAccounts).toHaveBeenCalledWith({
        targetAccountRegisterId: 2,
        sourceAccountRegisterId: 1,
        amount: 100,
        description: "Test Reoccurrence",
        reoccurrence: expect.objectContaining({
          id: 1,
          accountId: "test-account",
          accountRegisterId: 1,
          description: "Test Reoccurrence",
          amount: 100,
          intervalId: 3,
          intervalCount: 1,
          lastAt: new Date("2024-02-01T00:00:00.000Z"),
          endAt: null,
          totalIntervals: null,
          elapsedIntervals: null,
          transferAccountRegisterId: 2,
          adjustBeforeIfOnWeekend: false,
        }),
      });
    });

    it("should create entry for reoccurrence without transfer account", async () => {
      const reoccurrence = createMockReoccurrence({
        lastAt: new Date("2024-01-01T00:00:00.000Z"),
        transferAccountRegisterId: null,
        intervalId: 3,
      });

      mockCache.reoccurrence.findOne.mockReturnValue(reoccurrence);

      await service.processReoccurrences(
        [reoccurrence],
        new Date("2024-02-01T00:00:00.000Z")
      );

      // First occurrence is next after lastAt (2024-02-01), not replay of lastAt
      expect(mockEntryService.createEntry).toHaveBeenCalledWith({
        accountRegisterId: 1,
        description: "Test Reoccurrence",
        amount: 100,
        reoccurrence: expect.objectContaining({
          id: 1,
          accountId: "test-account",
          accountRegisterId: 1,
          description: "Test Reoccurrence",
          amount: 100,
          intervalId: 3,
          intervalCount: 1,
          lastAt: new Date("2024-02-01T00:00:00.000Z"),
          endAt: null,
          totalIntervals: null,
          elapsedIntervals: null,
          transferAccountRegisterId: null,
          adjustBeforeIfOnWeekend: false,
        }),
        typeId: 9,
      });
    });

    it("should not create entry when first next occurrence is after endAt", async () => {
      const reoccurrence = createMockReoccurrence({
        lastAt: new Date("2024-01-01T00:00:00.000Z"),
        endAt: new Date("2024-01-15T00:00:00.000Z"),
        intervalId: 3,
      });

      await service.processReoccurrences(
        [reoccurrence],
        new Date("2024-03-01T00:00:00.000Z")
      );

      // First next occurrence is 2024-02-01, which is after endAt 2024-01-15, so we break before creating any entry
      expect(mockEntryService.createEntry).toHaveBeenCalledTimes(0);
    });

    it("should skip processing when lastAt is after endAt", async () => {
      const reoccurrence = createMockReoccurrence({
        lastAt: new Date("2024-02-01T00:00:00.000Z"),
        endAt: new Date("2024-01-15T00:00:00.000Z"),
        intervalId: 3,
      });

      await service.processReoccurrences(
        [reoccurrence],
        new Date("2024-03-01T00:00:00.000Z")
      );

      expect(mockEntryService.createEntry).not.toHaveBeenCalled();
    });

    it("should update reoccurrence in cache", async () => {
      const reoccurrence = createMockReoccurrence({
        lastAt: new Date("2024-01-01T00:00:00.000Z"),
        intervalId: 3,
      });

      mockCache.reoccurrence.findOne.mockReturnValue(reoccurrence);

      await service.processReoccurrences(
        [reoccurrence],
        new Date("2024-02-01T00:00:00.000Z")
      );

      expect(mockCache.reoccurrence.update).toHaveBeenCalled();
    });

    it("should not create entry when endDate is before first next occurrence (due-date gating)", async () => {
      const reoccurrence = createMockReoccurrence({
        lastAt: new Date("2024-01-01T00:00:00.000Z"),
        intervalId: 3,
      });

      await service.processReoccurrences(
        [reoccurrence],
        new Date("2024-01-15T00:00:00.000Z")
      );

      // First next occurrence would be 2024-02-01, which is after endDate 2024-01-15
      expect(mockEntryService.createEntry).not.toHaveBeenCalled();
      expect(mockTransferService.transferBetweenAccounts).not.toHaveBeenCalled();
    });

    it("should set lastRunAt on cache only when occurrence date is in the past", async () => {
      dateTimeService.setNowOverride(new Date("2024-03-15T12:00:00.000Z"));
      try {
        const reoccurrence = createMockReoccurrence({
          lastAt: new Date("2024-01-01T00:00:00.000Z"),
          intervalId: 3,
        });
        mockCache.reoccurrence.findOne.mockReturnValue(reoccurrence);

        await service.processReoccurrences(
          [reoccurrence],
          new Date("2024-03-01T00:00:00.000Z")
        );

        // Processed 2024-02-01 and 2024-03-01; both are <= now (2024-03-15), so lastRunAt should be set to 2024-03-01 on final update
        expect(mockCache.reoccurrence.update).toHaveBeenCalled();
        const lastUpdate = (mockCache.reoccurrence.update as any).mock.calls.at(-1)[0];
        expect(lastUpdate.lastRunAt).toEqual(new Date("2024-03-01T00:00:00.000Z"));
      } finally {
        dateTimeService.clearNowOverride();
      }
    });

    it("should not set lastRunAt when occurrence date is in the future relative to now", async () => {
      dateTimeService.setNowOverride(new Date("2024-01-15T12:00:00.000Z"));
      try {
        const reoccurrence = createMockReoccurrence({
          lastAt: new Date("2024-01-01T00:00:00.000Z"),
          intervalId: 3,
        });
        mockCache.reoccurrence.findOne.mockReturnValue(reoccurrence);

        await service.processReoccurrences(
          [reoccurrence],
          new Date("2024-02-01T00:00:00.000Z")
        );

        // First occurrence 2024-02-01 is after now (2024-01-15), so lastRunAt must not be set
        expect(mockCache.reoccurrence.update).toHaveBeenCalled();
        const lastUpdate = (mockCache.reoccurrence.update as any).mock.calls.at(-1)[0];
        expect(lastUpdate.lastRunAt).toBeUndefined();
      } finally {
        dateTimeService.clearNowOverride();
      }
    });

    it("should advance monthly from seed date and update cache with last processed occurrence", async () => {
      const reoccurrence = createMockReoccurrence({
        lastAt: new Date("2024-01-01T00:00:00.000Z"),
        intervalId: 3,
      });
      mockCache.reoccurrence.findOne.mockReturnValue(reoccurrence);

      await service.processReoccurrences(
        [reoccurrence],
        new Date("2024-04-01T00:00:00.000Z")
      );

      expect(mockEntryService.createEntry).toHaveBeenCalledTimes(3);
      const calls = (mockEntryService.createEntry as any).mock.calls;
      expect(calls[0][0].reoccurrence.lastAt).toEqual(new Date("2024-02-01T00:00:00.000Z"));
      expect(calls[1][0].reoccurrence.lastAt).toEqual(new Date("2024-03-01T00:00:00.000Z"));
      expect(calls[2][0].reoccurrence.lastAt).toEqual(new Date("2024-04-01T00:00:00.000Z"));
      const lastUpdate = (mockCache.reoccurrence.update as any).mock.calls.at(-1)[0];
      expect(lastUpdate.lastAt).toEqual(new Date("2024-04-01T00:00:00.000Z"));
    });
  });

  describe("initReoccurrenceSchedule", () => {
    it("builds schedule map with correct date keys", () => {
      const reoccurrences = [
        createMockReoccurrence({
          id: 1,
          lastAt: new Date("2024-01-01T00:00:00.000Z"),
          intervalId: 2,
          intervalCount: 1,
        }),
      ];
      mockCache.reoccurrence.find.mockReturnValue(reoccurrences);

      service.initReoccurrenceSchedule(
        new Date("2024-01-01T00:00:00.000Z"),
        new Date("2024-01-31T00:00:00.000Z"),
      );

      const schedule = (service as any)._scheduleByDate as Map<string, Reoccurrence[]>;
      const expectedKey = dateTimeService.format(
        "YYYY-MM-DD",
        service.calculateNextOccurrence(reoccurrences[0])!,
      );
      expect(schedule.has(expectedKey)).toBe(true);
      expect(schedule.get(expectedKey)?.[0].id).toBe(1);
    });

    it("skips once recurrences that have null next occurrence", () => {
      const reoccurrences = [
        createMockReoccurrence({
          id: 1,
          intervalId: 5,
        }),
      ];
      mockCache.reoccurrence.find.mockReturnValue(reoccurrences);

      service.initReoccurrenceSchedule(
        new Date("2024-01-01T00:00:00.000Z"),
        new Date("2024-01-31T00:00:00.000Z"),
      );

      const schedule = (service as any)._scheduleByDate as Map<string, Reoccurrence[]>;
      expect(schedule.size).toBe(0);
    });

    it("skips recurrences whose next date is beyond endDate", () => {
      const reoccurrences = [
        createMockReoccurrence({
          id: 1,
          lastAt: new Date("2024-01-01T00:00:00.000Z"),
          intervalId: 3,
          intervalCount: 1,
        }),
      ];
      mockCache.reoccurrence.find.mockReturnValue(reoccurrences);

      service.initReoccurrenceSchedule(
        new Date("2024-01-01T00:00:00.000Z"),
        new Date("2024-01-15T00:00:00.000Z"),
      );

      const schedule = (service as any)._scheduleByDate as Map<string, Reoccurrence[]>;
      expect(schedule.size).toBe(0);
    });

    it("stores multiple recurrences on the same schedule date", () => {
      const reoccurrences = [
        createMockReoccurrence({
          id: 1,
          lastAt: new Date("2024-01-01T00:00:00.000Z"),
          intervalId: 2,
        }),
        createMockReoccurrence({
          id: 2,
          lastAt: new Date("2024-01-01T00:00:00.000Z"),
          intervalId: 2,
        }),
      ];
      mockCache.reoccurrence.find.mockReturnValue(reoccurrences);

      service.initReoccurrenceSchedule(
        new Date("2024-01-01T00:00:00.000Z"),
        new Date("2024-01-31T00:00:00.000Z"),
      );

      const schedule = (service as any)._scheduleByDate as Map<string, Reoccurrence[]>;
      const expectedKey = dateTimeService.format(
        "YYYY-MM-DD",
        service.calculateNextOccurrence(reoccurrences[0])!,
      );
      const sameDay = schedule.get(expectedKey) || [];
      expect(sameDay).toHaveLength(2);
      expect(sameDay.map((r) => r.id)).toEqual([1, 2]);
    });
  });

  describe("calculateNextOccurrence", () => {
    it("should calculate next daily occurrence", () => {
      const reoccurrence = createMockReoccurrence({
        lastAt: new Date("2024-01-01T00:00:00.000Z"),
        intervalId: 1, // Daily
        intervalCount: 2,
      });

      const result = service.calculateNextOccurrence(reoccurrence);

      expect(result).toEqual(new Date("2024-01-03T00:00:00.000Z"));
    });

    it("should calculate next weekly occurrence", () => {
      const reoccurrence = createMockReoccurrence({
        lastAt: new Date("2024-01-01T00:00:00.000Z"),
        intervalId: 2, // Weekly
        intervalCount: 1,
      });

      const result = service.calculateNextOccurrence(reoccurrence);

      expect(result).toEqual(new Date("2024-01-08T00:00:00.000Z"));
    });

    it("should calculate next monthly occurrence", () => {
      const reoccurrence = createMockReoccurrence({
        lastAt: new Date("2024-01-01T00:00:00.000Z"),
        intervalId: 3, // Monthly
        intervalCount: 1,
      });

      const result = service.calculateNextOccurrence(reoccurrence);

      expect(result).toEqual(new Date("2024-02-01T00:00:00.000Z"));
    });

    it("should calculate next yearly occurrence", () => {
      const reoccurrence = createMockReoccurrence({
        lastAt: new Date("2024-01-01T00:00:00.000Z"),
        intervalId: 4, // Yearly
        intervalCount: 1,
      });

      const result = service.calculateNextOccurrence(reoccurrence);

      expect(result).toEqual(new Date("2025-01-01T00:00:00.000Z"));
    });

    it("should return null for once interval", () => {
      const reoccurrence = createMockReoccurrence({
        lastAt: new Date("2024-01-01T00:00:00.000Z"),
        intervalId: 5, // Once
        intervalCount: 1,
      });

      const result = service.calculateNextOccurrence(reoccurrence);

      expect(result).toBeNull();
    });

    it("should throw error for invalid interval ID", () => {
      const reoccurrence = createMockReoccurrence({
        lastAt: new Date("2024-01-01T00:00:00.000Z"),
        intervalId: 99, // Invalid
        intervalCount: 1,
      });

      expect(() => service.calculateNextOccurrence(reoccurrence)).toThrow(
        "Invalid intervalId: 99"
      );
    });

    it("should handle multiple interval counts", () => {
      const reoccurrence = createMockReoccurrence({
        lastAt: new Date("2024-01-01T00:00:00.000Z"),
        intervalId: 3, // Monthly
        intervalCount: 3, // Every 3 months
      });

      const result = service.calculateNextOccurrence(reoccurrence);

      expect(result).toEqual(new Date("2024-04-01T00:00:00.000Z"));
    });

    it("should use intervalName over intervalId when present", () => {
      const reoccurrence = {
        ...createMockReoccurrence({
          lastAt: new Date("2024-01-02T00:00:00.000Z"),
          intervalId: 4,
          intervalCount: 1,
        }),
        intervalName: "Month",
      } as ReturnType<typeof createMockReoccurrence> & { intervalName: string };

      const result = service.calculateNextOccurrence(reoccurrence);

      expect(result).toEqual(new Date("2024-02-02T00:00:00.000Z"));
    });

    it("should handle intervalCount 2 with intervalName", () => {
      const reoccurrence = {
        ...createMockReoccurrence({
          lastAt: new Date("2024-01-01T00:00:00.000Z"),
          intervalId: 3,
          intervalCount: 2,
        }),
        intervalName: "months",
      } as ReturnType<typeof createMockReoccurrence> & { intervalName: string };

      const result = service.calculateNextOccurrence(reoccurrence);

      expect(result).toEqual(new Date("2024-03-01T00:00:00.000Z"));
    });

    it("maps capitalized intervalName Day", () => {
      const reoccurrence = {
        ...createMockReoccurrence({
          lastAt: new Date("2024-01-01T00:00:00.000Z"),
          intervalId: 4,
          intervalCount: 1,
        }),
        intervalName: "Day",
      } as ReturnType<typeof createMockReoccurrence> & { intervalName: string };

      const result = service.calculateNextOccurrence(reoccurrence);

      expect(result).toEqual(new Date("2024-01-02T00:00:00.000Z"));
    });

    it("maps capitalized intervalName Week", () => {
      const reoccurrence = {
        ...createMockReoccurrence({
          lastAt: new Date("2024-01-01T00:00:00.000Z"),
          intervalId: 4,
          intervalCount: 1,
        }),
        intervalName: "Week",
      } as ReturnType<typeof createMockReoccurrence> & { intervalName: string };

      const result = service.calculateNextOccurrence(reoccurrence);

      expect(result).toEqual(new Date("2024-01-08T00:00:00.000Z"));
    });

    it("falls back to intervalId for unsupported intervalName values", () => {
      const reoccurrence = {
        ...createMockReoccurrence({
          lastAt: new Date("2024-01-01T00:00:00.000Z"),
          intervalId: 5,
          intervalCount: 1,
        }),
        intervalName: "One-Time",
      } as ReturnType<typeof createMockReoccurrence> & { intervalName: string };

      const result = service.calculateNextOccurrence(reoccurrence);

      expect(result).toBeNull();
    });

    it("returns null when intervalCount is zero", () => {
      const reoccurrence = createMockReoccurrence({
        intervalId: 2,
        intervalCount: 0,
      });

      const result = service.calculateNextOccurrence(reoccurrence);
      expect(result).toBeNull();
    });

    it("returns null when intervalCount is negative", () => {
      const reoccurrence = createMockReoccurrence({
        intervalId: 2,
        intervalCount: -1,
      });

      const result = service.calculateNextOccurrence(reoccurrence);
      expect(result).toBeNull();
    });

    it("trims intervalName whitespace", () => {
      const reoccurrence = {
        ...createMockReoccurrence({
          lastAt: new Date("2024-01-01T00:00:00.000Z"),
          intervalId: 1,
          intervalCount: 1,
        }),
        intervalName: " months ",
      } as ReturnType<typeof createMockReoccurrence> & { intervalName: string };

      const result = service.calculateNextOccurrence(reoccurrence);

      expect(result).toEqual(new Date("2024-02-01T00:00:00.000Z"));
    });

    it("falls back to intervalId when intervalName is empty", () => {
      const reoccurrence = {
        ...createMockReoccurrence({
          lastAt: new Date("2024-01-01T00:00:00.000Z"),
          intervalId: 2,
          intervalCount: 1,
        }),
        intervalName: "",
      } as ReturnType<typeof createMockReoccurrence> & { intervalName: string };

      const result = service.calculateNextOccurrence(reoccurrence);

      expect(result).toEqual(new Date("2024-01-08T00:00:00.000Z"));
    });

    describe("weekend adjustment", () => {
      it("should not adjust dates in calculateNextOccurrence - adjustment happens during processing", () => {
        const reoccurrence = createMockReoccurrence({
          lastAt: new Date("2024-01-28T00:00:00.000Z"), // Sunday
          intervalId: 2, // Weekly
          intervalCount: 1,
          adjustBeforeIfOnWeekend: true,
        });

        // calculateNextOccurrence should return the raw next occurrence without adjustment
        const result = service.calculateNextOccurrence(reoccurrence);

        expect(result).toEqual(new Date("2024-02-04T00:00:00.000Z")); // Sunday (unadjusted)
      });

      it("should calculate next Saturday occurrence without adjustment", () => {
        const reoccurrence = createMockReoccurrence({
          lastAt: new Date("2024-01-27T00:00:00.000Z"), // Saturday
          intervalId: 2, // Weekly
          intervalCount: 1,
          adjustBeforeIfOnWeekend: true,
        });

        // calculateNextOccurrence should return raw next occurrence
        const result = service.calculateNextOccurrence(reoccurrence);

        expect(result).toEqual(new Date("2024-02-03T00:00:00.000Z")); // Saturday (unadjusted)
      });

      it("should calculate next weekday occurrence normally", () => {
        const reoccurrence = createMockReoccurrence({
          lastAt: new Date("2024-01-01T00:00:00.000Z"), // Monday
          intervalId: 1, // Daily
          intervalCount: 1,
          adjustBeforeIfOnWeekend: true,
        });

        // Next occurrence - weekday, no adjustment needed anyway
        const result = service.calculateNextOccurrence(reoccurrence);

        expect(result).toEqual(new Date("2024-01-02T00:00:00.000Z")); // Tuesday
      });

      it("should ignore adjustBeforeIfOnWeekend flag in calculateNextOccurrence", () => {
        const reoccurrence = createMockReoccurrence({
          lastAt: new Date("2024-01-28T00:00:00.000Z"), // Sunday
          intervalId: 2, // Weekly
          intervalCount: 1,
          adjustBeforeIfOnWeekend: false,
        });

        // Should return raw next occurrence regardless of flag
        const result = service.calculateNextOccurrence(reoccurrence);

        expect(result).toEqual(new Date("2024-02-04T00:00:00.000Z")); // Sunday
      });

      it("should calculate monthly occurrence without weekend consideration", () => {
        const reoccurrence = createMockReoccurrence({
          lastAt: new Date("2024-11-30T00:00:00.000Z"), // Saturday
          intervalId: 3, // Monthly
          intervalCount: 1,
          adjustBeforeIfOnWeekend: true,
        });

        // Should return raw next month occurrence
        const result = service.calculateNextOccurrence(reoccurrence);

        expect(result).toEqual(new Date("2024-12-30T00:00:00.000Z")); // Monday
      });

      it("should calculate yearly occurrence without weekend consideration", () => {
        const reoccurrence = createMockReoccurrence({
          lastAt: new Date("2023-01-01T00:00:00.000Z"), // Sunday
          intervalId: 4, // Yearly
          intervalCount: 1,
          adjustBeforeIfOnWeekend: true,
        });

        // Should return raw next year occurrence
        const result = service.calculateNextOccurrence(reoccurrence);

        expect(result).toEqual(new Date("2024-01-01T00:00:00.000Z")); // Monday
      });
    });
  });

  describe("getReoccurrencesDue", () => {
    it("should return reoccurrences due before or on max date", () => {
      const reoccurrences = [
        createMockReoccurrence({
          id: 1,
          lastAt: new Date("2024-01-14T00:00:00.000Z"),
          intervalId: 1,
        }),
        createMockReoccurrence({
          id: 2,
          lastAt: new Date("2024-01-08T00:00:00.000Z"),
          intervalId: 2,
        }),
        createMockReoccurrence({
          id: 3,
          lastAt: new Date("2024-01-02T00:00:00.000Z"),
          intervalId: 3,
        }),
      ];

      mockCache.reoccurrence.find.mockImplementation((filter: any) => {
        return reoccurrences.filter(filter);
      });

      const result = service.getReoccurrencesDue(new Date("2024-01-15T00:00:00.000Z"));

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id)).toEqual([1, 2]);
    });

    it("should filter out reoccurrences with null lastAt", () => {
      const reoccurrences = [
        createMockReoccurrence({
          id: 1,
          lastAt: new Date("2024-01-14T00:00:00.000Z"),
          intervalId: 1,
        }),
        createMockReoccurrence({ id: 2, lastAt: null }),
      ];

      mockCache.reoccurrence.find.mockImplementation((filter: any) => {
        return reoccurrences.filter(filter);
      });

      const result = service.getReoccurrencesDue(new Date("2024-01-15T00:00:00.000Z"));

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });

    it("should return due reoccurrences when using intervalName", () => {
      const reoccurrences = [
        {
          ...createMockReoccurrence({
            id: 1,
            lastAt: new Date("2024-01-14T00:00:00.000Z"),
            intervalId: 4,
            intervalCount: 1,
          }),
          intervalName: "Day",
        } as ReturnType<typeof createMockReoccurrence> & { intervalName: string },
      ];

      mockCache.reoccurrence.find.mockImplementation((filter: any) => {
        return reoccurrences.filter(filter);
      });

      const result = service.getReoccurrencesDue(new Date("2024-01-15T00:00:00.000Z"));

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });
  });

  describe("isReoccurrenceActive", () => {
    it("should return true for active reoccurrence", () => {
      const reoccurrence = createMockReoccurrence({
        lastAt: new Date("2024-01-01T00:00:00.000Z"),
        endAt: null,
      });

      const result = service.isReoccurrenceActive(
        reoccurrence,
        new Date("2024-01-15T00:00:00.000Z")
      );

      expect(result).toBe(true);
    });

    it("should return false when lastAt is after current date", () => {
      const reoccurrence = createMockReoccurrence({
        lastAt: new Date("2024-02-01T00:00:00.000Z"),
        endAt: null,
      });

      const result = service.isReoccurrenceActive(
        reoccurrence,
        new Date("2024-01-15T00:00:00.000Z")
      );

      expect(result).toBe(false);
    });

    it("should return false when current date is after endAt", () => {
      const reoccurrence = createMockReoccurrence({
        lastAt: new Date("2024-01-01T00:00:00.000Z"),
        endAt: new Date("2024-01-10T00:00:00.000Z"),
      });

      const result = service.isReoccurrenceActive(
        reoccurrence,
        new Date("2024-01-15T00:00:00.000Z")
      );

      expect(result).toBe(false);
    });

    it("should return true when endAt is null", () => {
      const reoccurrence = createMockReoccurrence({
        lastAt: new Date("2024-01-01T00:00:00.000Z"),
        endAt: null,
      });

      const result = service.isReoccurrenceActive(
        reoccurrence,
        new Date("2024-01-15T00:00:00.000Z")
      );

      expect(result).toBe(true);
    });
  });

  describe("filterActiveReoccurrences", () => {
    it("should filter out inactive reoccurrences", () => {
      const reoccurrences = [
        createMockReoccurrence({
          id: 1,
          lastAt: new Date("2024-01-01T00:00:00.000Z"),
          endAt: null,
        }),
        createMockReoccurrence({
          id: 2,
          lastAt: new Date("2024-02-01T00:00:00.000Z"),
          endAt: null,
        }), // Future
        createMockReoccurrence({
          id: 3,
          lastAt: new Date("2024-01-01T00:00:00.000Z"),
          endAt: new Date("2024-01-10T00:00:00.000Z"),
        }), // Ended
      ];

      const result = service.filterActiveReoccurrences(
        reoccurrences,
        new Date("2024-01-15T00:00:00.000Z")
      );

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });
  });

  describe("getIntervalDescription", () => {
    it("should return correct descriptions for all interval types", () => {
      expect(service.getIntervalDescription(1)).toBe("daily");
      expect(service.getIntervalDescription(2)).toBe("weekly");
      expect(service.getIntervalDescription(3)).toBe("monthly");
      expect(service.getIntervalDescription(4)).toBe("yearly");
      expect(service.getIntervalDescription(5)).toBe("once");
      expect(service.getIntervalDescription(99)).toBe("unknown");
    });
  });
});
