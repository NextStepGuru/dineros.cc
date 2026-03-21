import { defineStore } from "pinia";
import type {
  Budget,
  AccountRegister,
  AccountType,
  Category,
  Interval,
  Lists,
  Reoccurrence,
  Account,
  SavingsGoal,
} from "../types/types";

export const useListStore = defineStore("listStore", {
  state: () => ({
    reoccurrences: [] as Reoccurrence[],
    intervals: [] as Interval[],
    accountTypes: [] as AccountType[],
    accountRegisters: [] as AccountRegister[],
    budgets: [] as Budget[],
    accounts: [] as Account[],
    categories: [] as Category[],
    savingsGoals: [] as SavingsGoal[],
    isLoading: false,
  }),
  getters: {
    getReoccurrences: (state) => {
      return state.reoccurrences.sort((a, b) => {
        if (a.lastAt < b.lastAt) return -1;
        if (a.lastAt > b.lastAt) return 1;
        if (a.description < b.description) return -1;
        if (a.description > b.description) return 1;
        return 0;
      });
    },
    getReoccurrencesForCurrentBudget: (state) => {
      const authStore = useAuthStore();
      const registerIds = new Set(
        state.accountRegisters
          .filter(
            (ar) =>
              ar.budgetId === authStore.getBudgetId && ar.isArchived !== true,
          )
          .map((ar) => ar.id),
      );
      return state.reoccurrences
        .filter((r) => registerIds.has(r.accountRegisterId))
        .sort((a, b) => {
          if (a.lastAt < b.lastAt) return -1;
          if (a.lastAt > b.lastAt) return 1;
          if (a.description < b.description) return -1;
          if (a.description > b.description) return 1;
          return 0;
        });
    },
    getIntervals: (state) => state.intervals,
    getAccountTypes: (state) => state.accountTypes,
    getAccountRegisters: (state) => {
      const authStore = useAuthStore();

      return state.accountRegisters
        .filter(
          (item) =>
            item.budgetId === authStore.getBudgetId && item.isArchived !== true,
        )
        .sort(
          (a, b) =>
            (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.id ?? 0) - (b.id ?? 0)
        );
    },
    getBudgets: (state) => state.budgets,
    getDefaultBudget: (state) =>
      state.budgets.find((b) => b.isDefault) ?? state.budgets[0] ?? null,
    getAccounts: (state) => state.accounts,
    getCategories: (state) => state.categories,
    getSavingsGoals: (state) =>
      [...state.savingsGoals].sort((a, b) => a.sortOrder - b.sortOrder),
    getSavingsGoalsForCurrentBudget: (state) => {
      const authStore = useAuthStore();
      return state.savingsGoals
        .filter((g) => g.budgetId === authStore.getBudgetId)
        .sort((a, b) => a.sortOrder - b.sortOrder);
    },
    getIsListsLoading: (state) => state.isLoading,
  },
  actions: {
    setReoccurrences(reoccurrences: Reoccurrence[]) {
      this.reoccurrences = reoccurrences;
    },
    setIntervals(intervals: Interval[]) {
      this.intervals = intervals;
    },
    setAccountTypes(accountTypes: AccountType[]) {
      this.accountTypes = accountTypes;
    },
    setAccountRegisters(accountRegisters: AccountRegister[]) {
      this.accountRegisters = accountRegisters;
    },
    setBudgets(budgets: Budget[]) {
      this.budgets = budgets;
    },
    addBudget(budget: Budget) {
      if (!this.budgets.some((b) => b.id === budget.id)) {
        this.budgets.push(budget);
      }
    },
    removeBudget(budgetId: number) {
      this.budgets = this.budgets.filter((b) => b.id !== budgetId);
      this.accountRegisters = this.accountRegisters.filter(
        (ar) => ar.budgetId !== budgetId,
      );
    },
    updateBudget(budget: Budget) {
      const index = this.budgets.findIndex((b) => b.id === budget.id);
      if (index >= 0) {
        this.budgets[index] = { ...budget };
      }
    },
    setAccounts(accounts: Account[]) {
      this.accounts = accounts;
    },
    setCategories(categories: Category[]) {
      this.categories = categories;
    },
    setSavingsGoals(savingsGoals: SavingsGoal[]) {
      this.savingsGoals = savingsGoals;
    },
    addSavingsGoal(savingsGoal: SavingsGoal) {
      if (!this.savingsGoals.some((g) => g.id === savingsGoal.id)) {
        this.savingsGoals.push(savingsGoal);
      }
    },
    removeSavingsGoal(goalId: number) {
      this.savingsGoals = this.savingsGoals.filter((g) => g.id !== goalId);
    },
    patchSavingsGoal(savingsGoal: SavingsGoal) {
      const index = this.savingsGoals.findIndex((g) => g.id === savingsGoal.id);
      if (index >= 0) {
        this.savingsGoals[index] = { ...savingsGoal };
      } else {
        this.savingsGoals.push(savingsGoal);
      }
    },
    updateSavingsGoalsOrder(goalIds: number[]) {
      goalIds.forEach((id, index) => {
        const g = this.savingsGoals.find((x) => x.id === id);
        if (g) g.sortOrder = index;
      });
    },
    patchAccountRegister(accountRegister: AccountRegister) {
      const index = this.accountRegisters.findIndex(
        (item) => item.id === accountRegister.id
      );
      if (index >= 0) {
        this.accountRegisters[index] = { ...accountRegister };
      } else {
        this.accountRegisters.push(accountRegister);
      }
    },
    updateAccountRegistersOrder(accountRegisters: AccountRegister[]) {
      // Update the sort order of account registers in the store
      accountRegisters.forEach((accountRegister) => {
        const index = this.accountRegisters.findIndex(
          (item) => item.id === accountRegister.id
        );
        if (index >= 0) {
          this.accountRegisters[index] = {
            ...this.accountRegisters[index],
            sortOrder: accountRegister.sortOrder,
          };
        }
      });
    },
    patchReoccurrence(reoccurrence: Reoccurrence) {
      const index = this.reoccurrences.findIndex(
        (item) => item.id === reoccurrence.id
      );
      if (index >= 0) {
        this.reoccurrences[index] = { ...reoccurrence };
      } else {
        this.reoccurrences.push(reoccurrence);
      }
    },
    async fetchLists() {
      this.isLoading = true;
      // Use $api (not useAPI) when called after mount to avoid Nuxt 4 useFetch warning
      try {
        const data = await (useNuxtApp().$api as typeof $fetch)<Lists>("/api/lists");
        if (data) {
          this.setReoccurrences(data.reoccurrences);
          this.setIntervals(data.intervals);
          this.setAccountTypes(data.accountTypes);
          this.setAccountRegisters(data.accountRegisters);
          this.setBudgets(data.budgets);
          this.setAccounts(data.accounts);
          this.setCategories(data.categories);
          this.setSavingsGoals(data.savingsGoals ?? []);
        }
      } finally {
        this.isLoading = false;
      }
    },
    resetList() {
      this.reoccurrences = [];
      this.intervals = [];
      this.accountTypes = [];
      this.accountRegisters = [];
      this.budgets = [];
      this.accounts = [];
      this.categories = [];
      this.savingsGoals = [];
    },
  },
});
