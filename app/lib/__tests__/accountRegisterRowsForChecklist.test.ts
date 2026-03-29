import { describe, expect, it } from "vitest";
import type { AccountRegister } from "~/types/types";
import { accountRegisterRowsForChecklist } from "~/lib/utils";

const acc = "acc-1";
const b = 1;

function reg(
  partial: Pick<AccountRegister, "id" | "name"> &
    Partial<Pick<AccountRegister, "sortOrder" | "subAccountRegisterId" | "isArchived">>,
): AccountRegister {
  return {
    accountId: acc,
    budgetId: b,
    subAccountRegisterId: null,
    sortOrder: 0,
    isArchived: false,
    ...partial,
  } as AccountRegister;
}

describe("accountRegisterRowsForChecklist", () => {
  it("orders masters by sortOrder then name then id", () => {
    const rows = accountRegisterRowsForChecklist([
      reg({ id: 2, name: "B", sortOrder: 1 }),
      reg({ id: 1, name: "A", sortOrder: 1 }),
    ]);
    expect(rows.map((r) => r.register.id)).toEqual([1, 2]);
    expect(rows.every((r) => !r.isPocket)).toBe(true);
  });

  it("nests pockets under master in pocket sort order", () => {
    const rows = accountRegisterRowsForChecklist([
      reg({ id: 10, name: "M", sortOrder: 0 }),
      reg({
        id: 11,
        name: "P2",
        sortOrder: 2,
        subAccountRegisterId: 10,
      }),
      reg({
        id: 12,
        name: "P1",
        sortOrder: 1,
        subAccountRegisterId: 10,
      }),
    ]);
    expect(rows.map((r) => [r.register.id, r.isPocket])).toEqual([
      [10, false],
      [12, true],
      [11, true],
    ]);
  });

  it("shows pocket as top-level when master not in list", () => {
    const rows = accountRegisterRowsForChecklist([
      reg({
        id: 20,
        name: "Orphan",
        subAccountRegisterId: 999,
      }),
    ]);
    expect(rows).toEqual([{ register: expect.objectContaining({ id: 20 }), isPocket: false }]);
  });

  it("excludes archived registers", () => {
    const rows = accountRegisterRowsForChecklist([
      reg({ id: 1, name: "A", isArchived: true }),
      reg({ id: 2, name: "B" }),
    ]);
    expect(rows.map((r) => r.register.id)).toEqual([2]);
  });
});
