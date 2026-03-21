import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia, defineStore } from "pinia";
import type { AccountRegister, Reoccurrence } from "~/types/types";

(globalThis as any).defineStore = defineStore;
const authStoreModule = await import("~/stores/authStore");
(globalThis as any).useAuthStore = authStoreModule.useAuthStore;
const { useListStore } = await import("~/stores/listStore");
const useAuthStore = authStoreModule.useAuthStore;

vi.stubGlobal("useNuxtApp", vi.fn(() => ({ $api: vi.fn() })));

describe("listStore archived registers (dropdown regression)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("getAccountRegisters excludes isArchived true", () => {
    const authStore = useAuthStore();
    authStore.setBudgetId(1);
    const listStore = useListStore();
    listStore.setAccountRegisters([
      {
        id: 1,
        accountId: "a",
        name: "Active",
        budgetId: 1,
        sortOrder: 0,
        isArchived: false,
      } as AccountRegister,
      {
        id: 2,
        accountId: "a",
        name: "Archived",
        budgetId: 1,
        sortOrder: 0,
        isArchived: true,
      } as AccountRegister,
    ]);
    expect(listStore.getAccountRegisters).toHaveLength(1);
    expect(listStore.getAccountRegisters[0].id).toBe(1);
  });

  it("getReoccurrencesForCurrentBudget omits reoccurrences tied to archived registers", () => {
    const authStore = useAuthStore();
    authStore.setBudgetId(1);
    const listStore = useListStore();
    listStore.setAccountRegisters([
      {
        id: 1,
        accountId: "a",
        name: "Active",
        budgetId: 1,
        sortOrder: 0,
        isArchived: false,
      } as AccountRegister,
      {
        id: 2,
        accountId: "a",
        name: "Archived",
        budgetId: 1,
        sortOrder: 0,
        isArchived: true,
      } as AccountRegister,
    ]);
    listStore.setReoccurrences([
      {
        id: 1,
        accountId: "a",
        accountRegisterId: 1,
        intervalId: 1,
        description: "Keep",
        amount: 100,
        lastAt: "2024-01-01" as any,
      } as Reoccurrence,
      {
        id: 2,
        accountId: "a",
        accountRegisterId: 2,
        intervalId: 1,
        description: "Drop",
        amount: 200,
        lastAt: "2024-01-01" as any,
      } as Reoccurrence,
    ]);
    const forBudget = listStore.getReoccurrencesForCurrentBudget;
    expect(forBudget).toHaveLength(1);
    expect(forBudget[0].description).toBe("Keep");
  });
});
