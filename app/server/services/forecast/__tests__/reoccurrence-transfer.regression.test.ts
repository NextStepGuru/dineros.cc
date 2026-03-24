import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { ReoccurrenceService } from "../ReoccurrenceService";
import { createTestDatabase, cleanupTestDatabase } from "./test-utils";
import type { PrismaClient, Reoccurrence } from "~/types/test-types";
import { dateTimeService } from "../DateTimeService";

describe("Reoccurrence transfer regressions", () => {
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
      mockDb as any,
      mockCache,
      mockEntryService as any,
      mockTransferService as any,
    );
  });

  afterEach(async () => {
    await cleanupTestDatabase(mockDb);
    vi.restoreAllMocks();
  });

  function baseReoccurrence(overrides: Partial<Reoccurrence> = {}): Reoccurrence {
    return {
      id: 10,
      accountId: "acc-1",
      accountRegisterId: 101,
      transferAccountRegisterId: 202,
      intervalId: 2, // weekly
      intervalCount: 1,
      lastAt: new Date("2024-01-01T00:00:00.000Z"),
      endAt: null,
      amount: 100,
      description: "Transfer recurrence",
      totalIntervals: null,
      elapsedIntervals: null,
      updatedAt: new Date("2024-01-01T00:00:00.000Z"),
      adjustBeforeIfOnWeekend: false,
      ...overrides,
    } as Reoccurrence;
  }

  it("maps source/target direction correctly for transfer recurrences", async () => {
    const reoccurrence = baseReoccurrence({
      accountRegisterId: 777,
      transferAccountRegisterId: 999,
      lastAt: new Date("2024-01-01T00:00:00.000Z"),
    });
    mockCache.reoccurrence.findOne.mockReturnValue(reoccurrence);
    mockCache.accountRegister.findOne.mockReturnValue({ id: 777, typeId: 1, balance: 1000 });

    await service.processReoccurrences([reoccurrence as any], new Date("2024-01-08T00:00:00.000Z"));

    expect(mockTransferService.transferBetweenAccounts).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceAccountRegisterId: 777,
        targetAccountRegisterId: 999,
        amount: 100,
      }),
    );
  });

  it("maps source/target correctly for multiple account combinations", async () => {
    const combos = [
      { source: 11, target: 22 },
      { source: 901, target: 77 },
      { source: 305, target: 1204 },
    ];

    for (const combo of combos) {
      const reoccurrence = baseReoccurrence({
        accountRegisterId: combo.source,
        transferAccountRegisterId: combo.target,
      });
      mockTransferService.transferBetweenAccounts.mockClear();
      mockCache.reoccurrence.findOne.mockReturnValue(reoccurrence);
      mockCache.accountRegister.findOne.mockReturnValue({
        id: combo.source,
        typeId: 1,
        balance: 1000,
      });

      await service.processReoccurrences(
        [reoccurrence as any],
        new Date("2024-01-08T00:00:00.000Z"),
      );

      expect(mockTransferService.transferBetweenAccounts).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceAccountRegisterId: combo.source,
          targetAccountRegisterId: combo.target,
        }),
      );
    }
  });

  it("does not drop negative transfer recurrence amounts before transfer service", async () => {
    const reoccurrence = baseReoccurrence({
      amount: -500,
      lastAt: new Date("2024-01-01T00:00:00.000Z"),
    });
    mockCache.reoccurrence.findOne.mockReturnValue(reoccurrence);
    mockCache.accountRegister.findOne.mockReturnValue({ id: 101, typeId: 1, balance: 1000 });

    await service.processReoccurrences([reoccurrence as any], new Date("2024-01-08T00:00:00.000Z"));

    expect(mockTransferService.transferBetweenAccounts).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: -500,
      }),
    );
  });

  it("passes through negative non-transfer amounts to createEntry", async () => {
    const reoccurrence = baseReoccurrence({
      transferAccountRegisterId: null,
      amount: -500,
      description: "Groceries",
    });
    mockCache.reoccurrence.findOne.mockReturnValue(reoccurrence);
    mockCache.accountRegister.findOne.mockReturnValue({ id: 101, typeId: 1, balance: 1000 });

    await service.processReoccurrences([reoccurrence as any], new Date("2024-01-08T00:00:00.000Z"));

    expect(mockEntryService.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: -500,
      }),
    );
  });

  it("caps transfer amount when accountRegisterId is debt type", async () => {
    const reoccurrence = baseReoccurrence({
      amount: 700,
    });
    mockCache.reoccurrence.findOne.mockReturnValue(reoccurrence);
    mockCache.accountRegister.findOne.mockReturnValue({ id: 101, typeId: 3, balance: -250 });

    await service.processReoccurrences([reoccurrence as any], new Date("2024-01-08T00:00:00.000Z"));

    expect(mockTransferService.transferBetweenAccounts).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 250,
      }),
    );
  });

  it("does not cap transfer amount when accountRegisterId is non-debt type", async () => {
    const reoccurrence = baseReoccurrence({
      amount: 700,
    });
    mockCache.reoccurrence.findOne.mockReturnValue(reoccurrence);
    mockCache.accountRegister.findOne.mockReturnValue({
      id: 101,
      typeId: 1,
      balance: -250,
    });

    await service.processReoccurrences([reoccurrence as any], new Date("2024-01-08T00:00:00.000Z"));

    expect(mockTransferService.transferBetweenAccounts).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 700,
      }),
    );
  });

  it("skips creation when debt is already paid off", async () => {
    const reoccurrence = baseReoccurrence({
      amount: 100,
      lastAt: new Date("2024-01-01T00:00:00.000Z"),
    });
    const cached = { ...reoccurrence };
    mockCache.reoccurrence.findOne.mockReturnValue(cached);
    mockCache.accountRegister.findOne.mockReturnValue({ id: 101, typeId: 3, balance: 0 });

    await service.processReoccurrences([reoccurrence as any], new Date("2024-01-08T00:00:00.000Z"));

    expect(mockTransferService.transferBetweenAccounts).not.toHaveBeenCalled();
    expect(mockEntryService.createEntry).not.toHaveBeenCalled();
    expect(mockCache.reoccurrence.update).toHaveBeenCalled();
  });

  it("applies weekend adjustment in transfer recurrence payload date", async () => {
    const reoccurrence = baseReoccurrence({
      adjustBeforeIfOnWeekend: true,
      lastAt: new Date("2024-01-06T00:00:00.000Z"), // Saturday -> next Saturday 2024-01-13
    });
    mockCache.reoccurrence.findOne.mockReturnValue(reoccurrence);
    mockCache.accountRegister.findOne.mockReturnValue({ id: 101, typeId: 1, balance: 1000 });

    await service.processReoccurrences([reoccurrence as any], new Date("2024-01-13T00:00:00.000Z"));

    const call = mockTransferService.transferBetweenAccounts.mock.calls[0][0];
    const adjusted = dateTimeService.createUTC(call.reoccurrence.lastAt);
    expect(adjusted.day()).toBe(5); // Friday
    const updated = mockCache.reoccurrence.update.mock.calls.at(-1)?.[0];
    expect(dateTimeService.createUTC(updated.lastAt).day()).toBe(6); // Saturday nominal date
  });

  it("applies weekend adjustment for sunday occurrence", async () => {
    const reoccurrence = baseReoccurrence({
      adjustBeforeIfOnWeekend: true,
      intervalId: 1,
      lastAt: new Date("2024-01-06T00:00:00.000Z"), // Saturday -> next day Sunday 2024-01-07
    });
    mockCache.reoccurrence.findOne.mockReturnValue(reoccurrence);
    mockCache.accountRegister.findOne.mockReturnValue({ id: 101, typeId: 1, balance: 1000 });

    await service.processReoccurrences([reoccurrence as any], new Date("2024-01-07T00:00:00.000Z"));

    const call = mockTransferService.transferBetweenAccounts.mock.calls[0][0];
    const adjusted = dateTimeService.createUTC(call.reoccurrence.lastAt);
    expect(adjusted.day()).toBe(5); // Friday
    const updated = mockCache.reoccurrence.update.mock.calls.at(-1)?.[0];
    expect(dateTimeService.createUTC(updated.lastAt).day()).toBe(0); // Sunday nominal date
  });

  it("processes multiple weekly transfer occurrences in a single run", async () => {
    const reoccurrence = baseReoccurrence({
      amount: 75,
      lastAt: new Date("2024-01-01T00:00:00.000Z"),
    });
    mockCache.reoccurrence.findOne.mockReturnValue({ ...reoccurrence });
    mockCache.accountRegister.findOne.mockReturnValue({ id: 101, typeId: 1, balance: 5000 });

    await service.processReoccurrences([reoccurrence as any], new Date("2024-01-29T00:00:00.000Z"));

    expect(mockTransferService.transferBetweenAccounts).toHaveBeenCalledTimes(4);
    const dates = mockTransferService.transferBetweenAccounts.mock.calls.map((c: any[]) =>
      dateTimeService.createUTC(c[0].reoccurrence.lastAt),
    );
    expect(dates[1].diff(dates[0], "days")).toBe(7);
    expect(dates[2].diff(dates[1], "days")).toBe(7);
    expect(dates[3].diff(dates[2], "days")).toBe(7);
  });
});
