import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { ReoccurrenceService } from "../ReoccurrenceService";
import { createTestDatabase, cleanupTestDatabase } from "./test-utils";
import type { PrismaClient } from "~/types/test-types";
import { dateTimeService } from "../DateTimeService";

type ServiceReoccurrence = Parameters<
  ReoccurrenceService["processReoccurrences"]
>[0][number];

describe("Date edge cases for recurrences", () => {
  let service: ReoccurrenceService;
  let mockDb: PrismaClient;
  let mockCache: any;
  let mockEntryService: { createEntry: any };
  let mockTransferService: { transferBetweenAccounts: any };

  beforeEach(async () => {
    mockDb = await createTestDatabase();
    mockCache = {
      reoccurrence: {
        findOne: vi.fn(),
        find: vi.fn(),
        update: vi.fn(),
      },
      accountRegister: {
        findOne: vi.fn(),
      },
    };
    mockEntryService = { createEntry: vi.fn() };
    mockTransferService = { transferBetweenAccounts: vi.fn() };

    service = new ReoccurrenceService(
      mockDb as unknown as ConstructorParameters<typeof ReoccurrenceService>[0],
      mockCache,
      mockEntryService as any,
      mockTransferService as any,
    );
  });

  afterEach(async () => {
    await cleanupTestDatabase(mockDb);
    vi.restoreAllMocks();
  });

  function recurrence(
    overrides: Partial<ServiceReoccurrence> = {},
  ): ServiceReoccurrence {
    return {
      id: 1,
      accountId: "test-account",
      accountRegisterId: 10,
      description: "Date Edge",
      amount: 100 as unknown as ServiceReoccurrence["amount"],
      intervalId: 3,
      intervalCount: 1,
      lastAt: new Date("2024-01-01T00:00:00.000Z"),
      endAt: null,
      totalIntervals: null,
      elapsedIntervals: null,
      transferAccountRegisterId: null,
      updatedAt: new Date("2024-01-01T00:00:00.000Z"),
      adjustBeforeIfOnWeekend: false,
      ...overrides,
    } as ServiceReoccurrence;
  }

  function ymd(date: Date | null): string {
    return dateTimeService.format(
      "YYYY-MM-DD",
      dateTimeService.createUTC(date as Date),
    );
  }

  describe("month-end rollover", () => {
    it("monthly Jan 31 2023 -> Feb 28", () => {
      const result = service.calculateNextOccurrence(
        recurrence({ lastAt: new Date("2023-01-31T00:00:00.000Z") }),
      );
      expect(ymd(result)).toBe("2023-02-28");
    });

    it("monthly Jan 31 2024 -> Feb 29", () => {
      const result = service.calculateNextOccurrence(
        recurrence({ lastAt: new Date("2024-01-31T00:00:00.000Z") }),
      );
      expect(ymd(result)).toBe("2024-02-29");
    });

    it("monthly Jan 31 2023 -> Feb 28 -> Mar 28", () => {
      const first = service.calculateNextOccurrence(
        recurrence({ lastAt: new Date("2023-01-31T00:00:00.000Z") }),
      );
      const second = service.calculateNextOccurrence(
        recurrence({ lastAt: first as Date }),
      );
      expect(ymd(first)).toBe("2023-02-28");
      expect(ymd(second)).toBe("2023-03-28");
    });

    it("monthly Jan 30 2023 -> Feb 28", () => {
      const result = service.calculateNextOccurrence(
        recurrence({ lastAt: new Date("2023-01-30T00:00:00.000Z") }),
      );
      expect(ymd(result)).toBe("2023-02-28");
    });

    it("monthly Jan 30 2024 -> Feb 29", () => {
      const result = service.calculateNextOccurrence(
        recurrence({ lastAt: new Date("2024-01-30T00:00:00.000Z") }),
      );
      expect(ymd(result)).toBe("2024-02-29");
    });

    it("monthly Mar 31 -> Apr 30", () => {
      const result = service.calculateNextOccurrence(
        recurrence({ lastAt: new Date("2024-03-31T00:00:00.000Z") }),
      );
      expect(ymd(result)).toBe("2024-04-30");
    });

    it("bi-monthly Jan 31 -> Mar 31", () => {
      const result = service.calculateNextOccurrence(
        recurrence({
          lastAt: new Date("2024-01-31T00:00:00.000Z"),
          intervalCount: 2,
        }),
      );
      expect(ymd(result)).toBe("2024-03-31");
    });

    it("every 3 months Nov 30 -> Feb 29 -> May 29", () => {
      const first = service.calculateNextOccurrence(
        recurrence({
          lastAt: new Date("2023-11-30T00:00:00.000Z"),
          intervalCount: 3,
        }),
      );
      const second = service.calculateNextOccurrence(
        recurrence({
          lastAt: first as Date,
          intervalCount: 3,
        }),
      );
      expect(ymd(first)).toBe("2024-02-29");
      expect(ymd(second)).toBe("2024-05-29");
    });
  });

  describe("leap year boundaries", () => {
    it("yearly Feb 29 2024 -> Feb 28 2025", () => {
      const result = service.calculateNextOccurrence(
        recurrence({
          intervalId: 4,
          lastAt: new Date("2024-02-29T00:00:00.000Z"),
        }),
      );
      expect(ymd(result)).toBe("2025-02-28");
    });

    it("yearly Feb 28 2025 -> Feb 28 2026", () => {
      const result = service.calculateNextOccurrence(
        recurrence({
          intervalId: 4,
          lastAt: new Date("2025-02-28T00:00:00.000Z"),
        }),
      );
      expect(ymd(result)).toBe("2026-02-28");
    });

    it("daily leap year Feb 28 -> Feb 29", () => {
      const result = service.calculateNextOccurrence(
        recurrence({
          intervalId: 1,
          lastAt: new Date("2024-02-28T00:00:00.000Z"),
        }),
      );
      expect(ymd(result)).toBe("2024-02-29");
    });

    it("daily leap year Feb 29 -> Mar 1", () => {
      const result = service.calculateNextOccurrence(
        recurrence({
          intervalId: 1,
          lastAt: new Date("2024-02-29T00:00:00.000Z"),
        }),
      );
      expect(ymd(result)).toBe("2024-03-01");
    });

    it("daily non-leap Feb 28 -> Mar 1", () => {
      const result = service.calculateNextOccurrence(
        recurrence({
          intervalId: 1,
          lastAt: new Date("2023-02-28T00:00:00.000Z"),
        }),
      );
      expect(ymd(result)).toBe("2023-03-01");
    });

    it("weekly crossing leap boundary remains seven days", () => {
      const result = service.calculateNextOccurrence(
        recurrence({
          intervalId: 2,
          lastAt: new Date("2024-02-24T00:00:00.000Z"),
        }),
      );
      expect(ymd(result)).toBe("2024-03-02");
    });
  });

  describe("weekend adjustment at month/year boundaries", () => {
    it("Saturday Mar 1 2025 adjusts to Friday Feb 28 2025", async () => {
      const r = recurrence({
        intervalId: 2,
        adjustBeforeIfOnWeekend: true,
        lastAt: new Date("2025-02-22T00:00:00.000Z"),
      });
      mockCache.reoccurrence.findOne.mockReturnValue({ ...r });
      mockCache.accountRegister.findOne.mockReturnValue({
        id: 10,
        typeId: 1,
        balance: 1000,
      });

      await service.processReoccurrences(
        [r],
        new Date("2025-03-01T00:00:00.000Z"),
      );

      const call = mockEntryService.createEntry.mock.calls[0][0];
      expect(call.reoccurrence.lastAt.toISOString().slice(0, 10)).toBe(
        "2025-02-28",
      );
      const update = mockCache.reoccurrence.update.mock.calls.at(-1)[0];
      expect(dateTimeService.createUTC(update.lastAt).day()).toBe(6);
    });

    it("Sunday Mar 1 2026 adjusts to Friday Feb 27 2026", async () => {
      const r = recurrence({
        intervalId: 2,
        adjustBeforeIfOnWeekend: true,
        lastAt: new Date("2026-02-22T00:00:00.000Z"),
      });
      mockCache.reoccurrence.findOne.mockReturnValue({ ...r });
      mockCache.accountRegister.findOne.mockReturnValue({
        id: 10,
        typeId: 1,
        balance: 1000,
      });

      await service.processReoccurrences(
        [r],
        new Date("2026-03-01T00:00:00.000Z"),
      );

      const call = mockEntryService.createEntry.mock.calls[0][0];
      expect(call.reoccurrence.lastAt.toISOString().slice(0, 10)).toBe(
        "2026-02-27",
      );
      const update = mockCache.reoccurrence.update.mock.calls.at(-1)[0];
      expect(dateTimeService.createUTC(update.lastAt).day()).toBe(0);
    });

    it("Saturday Jan 1 2028 adjusts to Thursday Dec 30 2027", async () => {
      const r = recurrence({
        intervalId: 2,
        adjustBeforeIfOnWeekend: true,
        lastAt: new Date("2027-12-25T00:00:00.000Z"),
      });
      mockCache.reoccurrence.findOne.mockReturnValue({ ...r });
      mockCache.accountRegister.findOne.mockReturnValue({
        id: 10,
        typeId: 1,
        balance: 1000,
      });

      await service.processReoccurrences(
        [r],
        new Date("2028-01-01T00:00:00.000Z"),
      );

      const call = mockEntryService.createEntry.mock.calls[0][0];
      expect(call.reoccurrence.lastAt.toISOString().slice(0, 10)).toBe(
        "2027-12-30",
      );
    });

    it("Sunday Jan 1 2023 adjusts to Friday Dec 30 2022", async () => {
      const r = recurrence({
        intervalId: 2,
        adjustBeforeIfOnWeekend: true,
        lastAt: new Date("2022-12-25T00:00:00.000Z"),
      });
      mockCache.reoccurrence.findOne.mockReturnValue({ ...r });
      mockCache.accountRegister.findOne.mockReturnValue({
        id: 10,
        typeId: 1,
        balance: 1000,
      });

      await service.processReoccurrences(
        [r],
        new Date("2023-01-01T00:00:00.000Z"),
      );

      const call = mockEntryService.createEntry.mock.calls[0][0];
      expect(call.reoccurrence.lastAt.toISOString().slice(0, 10)).toBe(
        "2022-12-30",
      );
    });

    it("transfer recurrence uses adjusted date in transfer payload and nominal date in cache", async () => {
      const r = recurrence({
        intervalId: 2,
        adjustBeforeIfOnWeekend: true,
        transferAccountRegisterId: 11,
        lastAt: new Date("2025-02-22T00:00:00.000Z"),
      });
      mockCache.reoccurrence.findOne.mockReturnValue({ ...r });
      mockCache.accountRegister.findOne.mockReturnValue({
        id: 10,
        typeId: 1,
        balance: 1000,
      });

      await service.processReoccurrences(
        [r],
        new Date("2025-03-01T00:00:00.000Z"),
      );

      const call = mockTransferService.transferBetweenAccounts.mock.calls[0][0];
      expect(call.reoccurrence.lastAt.toISOString().slice(0, 10)).toBe(
        "2025-02-28",
      );
      const update = mockCache.reoccurrence.update.mock.calls.at(-1)[0];
      expect(update.lastAt.toISOString().slice(0, 10)).toBe("2025-03-01");
    });

    it("Friday occurrence remains unchanged", async () => {
      const r = recurrence({
        intervalId: 1,
        adjustBeforeIfOnWeekend: true,
        lastAt: new Date("2025-02-27T00:00:00.000Z"),
      });
      mockCache.reoccurrence.findOne.mockReturnValue({ ...r });
      mockCache.accountRegister.findOne.mockReturnValue({
        id: 10,
        typeId: 1,
        balance: 1000,
      });

      await service.processReoccurrences(
        [r],
        new Date("2025-02-28T00:00:00.000Z"),
      );

      const call = mockEntryService.createEntry.mock.calls[0][0];
      expect(call.reoccurrence.lastAt.toISOString().slice(0, 10)).toBe(
        "2025-02-28",
      );
    });

    it("moves holiday occurrence to previous business day", async () => {
      const r = recurrence({
        intervalId: 2,
        adjustBeforeIfOnWeekend: true,
        // Next weekly run is 2025-07-04 (Friday, US federal holiday)
        lastAt: new Date("2025-06-27T00:00:00.000Z"),
      });
      mockCache.reoccurrence.findOne.mockReturnValue({ ...r });
      mockCache.accountRegister.findOne.mockReturnValue({
        id: 10,
        typeId: 1,
        balance: 1000,
      });

      await service.processReoccurrences(
        [r],
        new Date("2025-07-04T00:00:00.000Z"),
      );

      const call = mockEntryService.createEntry.mock.calls[0][0];
      expect(call.reoccurrence.lastAt.toISOString().slice(0, 10)).toBe(
        "2025-07-03",
      );
    });

    it("moves weekend then observed holiday to previous business day", async () => {
      const r = recurrence({
        intervalId: 2,
        adjustBeforeIfOnWeekend: true,
        // Next weekly run is 2026-07-04 (Saturday), observed holiday is 2026-07-03
        lastAt: new Date("2026-06-27T00:00:00.000Z"),
      });
      mockCache.reoccurrence.findOne.mockReturnValue({ ...r });
      mockCache.accountRegister.findOne.mockReturnValue({
        id: 10,
        typeId: 1,
        balance: 1000,
      });

      await service.processReoccurrences(
        [r],
        new Date("2026-07-04T00:00:00.000Z"),
      );

      const call = mockEntryService.createEntry.mock.calls[0][0];
      expect(call.reoccurrence.lastAt.toISOString().slice(0, 10)).toBe(
        "2026-07-02",
      );
    });

    it("allows weekend-adjusted occurrence when adjusted date equals endAt", async () => {
      const r = recurrence({
        intervalId: 2,
        adjustBeforeIfOnWeekend: true,
        endAt: new Date("2025-02-28T00:00:00.000Z"),
        lastAt: new Date("2025-02-22T00:00:00.000Z"),
      });
      mockCache.reoccurrence.findOne.mockReturnValue({ ...r });
      mockCache.accountRegister.findOne.mockReturnValue({
        id: 10,
        typeId: 1,
        balance: 1000,
      });

      await service.processReoccurrences(
        [r],
        new Date("2025-03-01T00:00:00.000Z"),
      );

      expect(mockEntryService.createEntry).toHaveBeenCalledTimes(1);
      const call = mockEntryService.createEntry.mock.calls[0][0];
      expect(call.reoccurrence.lastAt.toISOString().slice(0, 10)).toBe(
        "2025-02-28",
      );
    });
  });

  describe("DST transition safety (UTC)", () => {
    it("weekly recurrence around spring-forward date is not shifted", () => {
      const result = service.calculateNextOccurrence(
        recurrence({
          intervalId: 2,
          lastAt: new Date("2024-03-09T00:00:00.000Z"),
        }),
      );
      expect(ymd(result)).toBe("2024-03-16");
    });

    it("weekly recurrence around fall-back date is not shifted", () => {
      const result = service.calculateNextOccurrence(
        recurrence({
          intervalId: 2,
          lastAt: new Date("2024-11-02T00:00:00.000Z"),
        }),
      );
      expect(ymd(result)).toBe("2024-11-09");
    });

    it("monthly recurrence crossing March DST boundary remains same day-of-month", () => {
      const result = service.calculateNextOccurrence(
        recurrence({
          intervalId: 3,
          lastAt: new Date("2024-02-10T00:00:00.000Z"),
        }),
      );
      expect(ymd(result)).toBe("2024-03-10");
    });

    it("daily process across spring-forward produces one-day increments", async () => {
      const r = recurrence({
        intervalId: 1,
        lastAt: new Date("2024-03-07T00:00:00.000Z"),
      });
      mockCache.reoccurrence.findOne.mockReturnValue({ ...r });
      mockCache.accountRegister.findOne.mockReturnValue({
        id: 10,
        typeId: 1,
        balance: 1000,
      });

      await service.processReoccurrences(
        [r],
        new Date("2024-03-11T00:00:00.000Z"),
      );

      expect(mockEntryService.createEntry).toHaveBeenCalledTimes(4);
      const created = mockEntryService.createEntry.mock.calls.map((c: any[]) =>
        dateTimeService.createUTC(c[0].reoccurrence.lastAt),
      );
      expect(created[1].diff(created[0], "days")).toBe(1);
      expect(created[2].diff(created[1], "days")).toBe(1);
      expect(created[3].diff(created[2], "days")).toBe(1);
    });
  });

  describe("year boundary", () => {
    it("daily recurrence Dec 31 -> Jan 1", () => {
      const result = service.calculateNextOccurrence(
        recurrence({
          intervalId: 1,
          lastAt: new Date("2024-12-31T00:00:00.000Z"),
        }),
      );
      expect(ymd(result)).toBe("2025-01-01");
    });

    it("weekly recurrence Dec 30 -> Jan 6", () => {
      const result = service.calculateNextOccurrence(
        recurrence({
          intervalId: 2,
          lastAt: new Date("2024-12-30T00:00:00.000Z"),
        }),
      );
      expect(ymd(result)).toBe("2025-01-06");
    });

    it("monthly recurrence Dec 15 -> Jan 15", () => {
      const result = service.calculateNextOccurrence(
        recurrence({
          intervalId: 3,
          lastAt: new Date("2024-12-15T00:00:00.000Z"),
        }),
      );
      expect(ymd(result)).toBe("2025-01-15");
    });

    it("yearly recurrence Dec 31 -> Dec 31", () => {
      const result = service.calculateNextOccurrence(
        recurrence({
          intervalId: 4,
          lastAt: new Date("2024-12-31T00:00:00.000Z"),
        }),
      );
      expect(ymd(result)).toBe("2025-12-31");
    });

    it("endAt before first due date prevents generation across year boundary", async () => {
      const r = recurrence({
        intervalId: 3,
        lastAt: new Date("2024-12-01T00:00:00.000Z"),
        endAt: new Date("2024-12-31T00:00:00.000Z"),
      });
      mockCache.accountRegister.findOne.mockReturnValue({
        id: 10,
        typeId: 1,
        balance: 1000,
      });

      await service.processReoccurrences(
        [r],
        new Date("2025-01-31T00:00:00.000Z"),
      );
      expect(mockEntryService.createEntry).not.toHaveBeenCalled();
    });
  });

  describe("endAt precision", () => {
    it("generates entry when endAt equals occurrence date", async () => {
      const r = recurrence({
        intervalId: 3,
        lastAt: new Date("2024-01-01T00:00:00.000Z"),
        endAt: new Date("2024-02-01T00:00:00.000Z"),
      });
      mockCache.reoccurrence.findOne.mockReturnValue({ ...r });
      mockCache.accountRegister.findOne.mockReturnValue({
        id: 10,
        typeId: 1,
        balance: 1000,
      });

      await service.processReoccurrences(
        [r],
        new Date("2024-02-01T00:00:00.000Z"),
      );
      expect(mockEntryService.createEntry).toHaveBeenCalledTimes(1);
    });

    it("does not generate entry when endAt is before occurrence date", async () => {
      const r = recurrence({
        intervalId: 3,
        lastAt: new Date("2024-01-01T00:00:00.000Z"),
        endAt: new Date("2024-01-31T00:00:00.000Z"),
      });
      mockCache.accountRegister.findOne.mockReturnValue({
        id: 10,
        typeId: 1,
        balance: 1000,
      });

      await service.processReoccurrences(
        [r],
        new Date("2024-02-01T00:00:00.000Z"),
      );
      expect(mockEntryService.createEntry).not.toHaveBeenCalled();
    });

    it("generates entry when endAt is exact same midnight UTC instant", async () => {
      const r = recurrence({
        intervalId: 3,
        lastAt: new Date("2024-01-01T00:00:00.000Z"),
        endAt: new Date("2024-02-01T00:00:00.000Z"),
      });
      mockCache.reoccurrence.findOne.mockReturnValue({ ...r });
      mockCache.accountRegister.findOne.mockReturnValue({
        id: 10,
        typeId: 1,
        balance: 1000,
      });

      await service.processReoccurrences(
        [r],
        new Date("2024-02-01T00:00:00.000Z"),
      );
      const created = mockEntryService.createEntry.mock.calls[0][0];
      expect(created.reoccurrence.lastAt.toISOString()).toBe(
        "2024-02-01T00:00:00.000Z",
      );
    });
  });

  describe("intervalCount with short months", () => {
    it("every 2 months Jan 31 -> Mar 31", () => {
      const result = service.calculateNextOccurrence(
        recurrence({
          lastAt: new Date("2024-01-31T00:00:00.000Z"),
          intervalCount: 2,
        }),
      );
      expect(ymd(result)).toBe("2024-03-31");
    });

    it("every 2 months Mar 31 -> May 31", () => {
      const result = service.calculateNextOccurrence(
        recurrence({
          lastAt: new Date("2024-03-31T00:00:00.000Z"),
          intervalCount: 2,
        }),
      );
      expect(ymd(result)).toBe("2024-05-31");
    });

    it("every 3 months Jan 31 -> Apr 30", () => {
      const result = service.calculateNextOccurrence(
        recurrence({
          lastAt: new Date("2024-01-31T00:00:00.000Z"),
          intervalCount: 3,
        }),
      );
      expect(ymd(result)).toBe("2024-04-30");
    });

    it("every 6 months Aug 31 2023 -> Feb 29 2024", () => {
      const result = service.calculateNextOccurrence(
        recurrence({
          lastAt: new Date("2023-08-31T00:00:00.000Z"),
          intervalCount: 6,
        }),
      );
      expect(ymd(result)).toBe("2024-02-29");
    });

    it("intervalCount zero returns null and avoids non-advancing loops", () => {
      const result = service.calculateNextOccurrence(
        recurrence({
          intervalCount: 0,
        }),
      );
      expect(result).toBeNull();
    });

    it("intervalCount negative returns null and avoids backward loops", () => {
      const result = service.calculateNextOccurrence(
        recurrence({
          intervalCount: -1,
        }),
      );
      expect(result).toBeNull();
    });

    it("unsupported intervalName falls back to intervalId behavior", () => {
      const result = service.calculateNextOccurrence({
        ...recurrence({
          intervalId: 2,
          intervalCount: 1,
          lastAt: new Date("2024-01-01T00:00:00.000Z"),
        }),
        intervalName: "fortnightly",
      } as ServiceReoccurrence & { intervalName: string });
      expect(ymd(result)).toBe("2024-01-08");
    });
  });
});
