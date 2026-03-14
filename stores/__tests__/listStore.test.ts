import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia, defineStore } from "pinia";

(globalThis as any).defineStore = defineStore;
const authStoreModule = await import("../authStore");
(globalThis as any).useAuthStore = authStoreModule.useAuthStore;
const { useListStore } = await import("../listStore");
const useAuthStore = authStoreModule.useAuthStore;
import type {
  Reoccurrence,
  Interval,
  AccountType,
  AccountRegister,
  Budget,
  Account,
} from "~/types/types";

vi.stubGlobal("useNuxtApp", vi.fn(() => ({ $api: vi.fn() })));

describe("listStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("getters reflect initial empty state", () => {
    const store = useListStore();
    expect(store.getReoccurrences).toEqual([]);
    expect(store.getIntervals).toEqual([]);
    expect(store.getAccountTypes).toEqual([]);
    expect(store.getAccountRegisters).toEqual([]);
    expect(store.getBudgets).toEqual([]);
    expect(store.getAccounts).toEqual([]);
    expect(store.getIsListsLoading).toBe(false);
  });

  it("setReoccurrences and getReoccurrences", () => {
    const store = useListStore();
    const items: Reoccurrence[] = [
      {
        id: 1,
        accountId: "a",
        accountRegisterId: 1,
        intervalId: 1,
        description: "Salary",
        amount: 5000,
        lastAt: "2024-01-01" as any,
      } as Reoccurrence,
      {
        id: 2,
        accountId: "a",
        accountRegisterId: 1,
        intervalId: 1,
        description: "Rent",
        amount: -1000,
        lastAt: "2024-01-15" as any,
      } as Reoccurrence,
    ];
    store.setReoccurrences(items);
    expect(store.getReoccurrences).toHaveLength(2);
    expect(store.getReoccurrences[0].description).toBe("Salary");
  });

  it("setBudgets and getBudgets", () => {
    const store = useListStore();
    const budgets: Budget[] = [
      { id: 1, accountId: "a", name: "Default", isArchived: false, isDefault: true, userId: 1 } as Budget,
    ];
    store.setBudgets(budgets);
    expect(store.getBudgets).toHaveLength(1);
    expect(store.getBudgets[0].name).toBe("Default");
  });

  it("getAccountRegisters filters by authStore budgetId", () => {
    const authStore = useAuthStore();
    authStore.setBudgetId(2);
    const listStore = useListStore();
    const registers: AccountRegister[] = [
      { id: 1, accountId: "a", name: "Reg1", budgetId: 1, sortOrder: 0 } as AccountRegister,
      { id: 2, accountId: "a", name: "Reg2", budgetId: 2, sortOrder: 0 } as AccountRegister,
    ];
    listStore.setAccountRegisters(registers);
    expect(listStore.getAccountRegisters).toHaveLength(1);
    expect(listStore.getAccountRegisters[0].budgetId).toBe(2);
  });

  it("patchAccountRegister updates existing item", () => {
    const authStore = useAuthStore();
    authStore.setBudgetId(1);
    const store = useListStore();
    store.setAccountRegisters([
      { id: 1, accountId: "a", name: "Old", budgetId: 1, sortOrder: 0 } as AccountRegister,
    ]);
    store.patchAccountRegister({
      id: 1,
      accountId: "a",
      name: "Updated",
      budgetId: 1,
      sortOrder: 0,
    } as AccountRegister);
    expect(store.getAccountRegisters[0].name).toBe("Updated");
  });

  it("resetList clears all lists", () => {
    const store = useListStore();
    store.setReoccurrences([{ id: 1 } as Reoccurrence]);
    store.setIntervals([{ id: 1, type: "m", name: "Month" } as Interval]);
    store.resetList();
    expect(store.getReoccurrences).toEqual([]);
    expect(store.getIntervals).toEqual([]);
    expect(store.getAccountRegisters).toEqual([]);
    expect(store.getBudgets).toEqual([]);
    expect(store.getAccounts).toEqual([]);
  });

  it("fetchLists sets data from API", async () => {
    const store = useListStore();
    const mockData = {
      reoccurrences: [],
      intervals: [{ id: 1, type: "m", name: "Month" }],
      accountTypes: [],
      accountRegisters: [],
      budgets: [],
      accounts: [],
    };
    const mockApi = vi.fn().mockResolvedValue(mockData);
    vi.stubGlobal("useNuxtApp", vi.fn(() => ({ $api: mockApi })));

    await store.fetchLists();

    expect(store.getIntervals).toHaveLength(1);
    expect(store.getIsListsLoading).toBe(false);
  });

  it("fetchLists rethrows and sets isLoading false when API throws", async () => {
    const store = useListStore();
    const mockApi = vi.fn().mockRejectedValue(new Error("Network error"));
    vi.stubGlobal("useNuxtApp", vi.fn(() => ({ $api: mockApi })));

    await expect(store.fetchLists()).rejects.toThrow("Network error");
    expect(store.getIsListsLoading).toBe(false);
  });

  it("patchAccountRegister pushes when id not found", () => {
    const authStore = useAuthStore();
    authStore.setBudgetId(1);
    const store = useListStore();
    store.setAccountRegisters([
      { id: 1, accountId: "a", name: "One", budgetId: 1, sortOrder: 0 } as AccountRegister,
    ]);

    store.patchAccountRegister({
      id: 2,
      accountId: "a",
      name: "New",
      budgetId: 1,
      sortOrder: 1,
    } as AccountRegister);

    expect(store.getAccountRegisters).toHaveLength(2);
    expect(store.getAccountRegisters[1].name).toBe("New");
  });

  it("updateAccountRegistersOrder updates sortOrder for matching ids", () => {
    const authStore = useAuthStore();
    authStore.setBudgetId(1);
    const store = useListStore();
    store.setAccountRegisters([
      { id: 1, accountId: "a", name: "A", budgetId: 1, sortOrder: 0 } as AccountRegister,
      { id: 2, accountId: "a", name: "B", budgetId: 1, sortOrder: 1 } as AccountRegister,
    ]);

    store.updateAccountRegistersOrder([
      { id: 1, accountId: "a", name: "A", budgetId: 1, sortOrder: 2 } as AccountRegister,
      { id: 2, accountId: "a", name: "B", budgetId: 1, sortOrder: 0 } as AccountRegister,
    ]);

    const sorted = store.getAccountRegisters;
    expect(sorted.find((r) => r.id === 1)?.sortOrder).toBe(2);
    expect(sorted.find((r) => r.id === 2)?.sortOrder).toBe(0);
  });

  it("patchReoccurrence updates existing and pushes new", () => {
    const store = useListStore();
    store.setReoccurrences([
      { id: 1, accountId: "a", accountRegisterId: 1, intervalId: 1, description: "Old", amount: 100, lastAt: "2024-01-01" as any } as Reoccurrence,
    ]);

    store.patchReoccurrence({
      id: 1,
      accountId: "a",
      accountRegisterId: 1,
      intervalId: 1,
      description: "Updated",
      amount: 200,
      lastAt: "2024-01-01" as any,
    } as Reoccurrence);
    expect(store.getReoccurrences[0].description).toBe("Updated");
    expect(store.getReoccurrences[0].amount).toBe(200);

    store.patchReoccurrence({
      id: 2,
      accountId: "a",
      accountRegisterId: 1,
      intervalId: 1,
      description: "New",
      amount: 50,
      lastAt: "2024-02-01" as any,
    } as Reoccurrence);
    expect(store.getReoccurrences).toHaveLength(2);
    expect(store.getReoccurrences[1].description).toBe("New");
  });

  it("getReoccurrences sorts by lastAt then description", () => {
    const store = useListStore();
    store.setReoccurrences([
      { id: 2, accountId: "a", accountRegisterId: 1, intervalId: 1, description: "Rent", amount: -1000, lastAt: "2024-02-01" as any } as Reoccurrence,
      { id: 1, accountId: "a", accountRegisterId: 1, intervalId: 1, description: "Salary", amount: 5000, lastAt: "2024-01-01" as any } as Reoccurrence,
      { id: 3, accountId: "a", accountRegisterId: 1, intervalId: 1, description: "Bonus", amount: 500, lastAt: "2024-01-01" as any } as Reoccurrence,
    ]);

    const sorted = store.getReoccurrences;
    expect(sorted[0].lastAt).toBe("2024-01-01");
    expect(sorted[1].lastAt).toBe("2024-01-01");
    expect(sorted[0].description).toBe("Bonus");
    expect(sorted[1].description).toBe("Salary");
    expect(sorted[2].description).toBe("Rent");
  });
});
