import { defineStore } from "pinia";
import type {
  Budget,
  AccountRegister,
  AccountType,
  Interval,
  Lists,
  Reoccurrence,
  Account,
} from "../types/types";

export const useListStore = defineStore("listStore", {
  state: () => ({
    reoccurrences: [] as Reoccurrence[],
    intervals: [] as Interval[],
    accountTypes: [] as AccountType[],
    accountRegisters: [] as AccountRegister[],
    budgets: [] as Budget[],
    accounts: [] as Account[],
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
    getIntervals: (state) => state.intervals,
    getAccountTypes: (state) => state.accountTypes,
    getAccountRegisters: (state) => {
      const authStore = useAuthStore();

      return state.accountRegisters
        .filter((item) => item.budgetId === authStore.getBudgetId)
        .sort((a, b) => (a.sortOrder > b.sortOrder ? 1 : -1));
    },
    getBudgets: (state) => state.budgets,
    getAccounts: (state) => state.accounts,
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
    setAccounts(accounts: Account[]) {
      this.accounts = accounts;
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
        }
      } catch (e) {
        throw e;
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
    },
  },
});
