import { describe, it, expect } from "vitest";
import { paginateFutureRegisterWindow } from "../registerFuturePagination";

type Row = {
  isBalanceEntry?: boolean;
  isProjected?: boolean;
  typeId?: number | null;
  description?: string | null;
  sourceAccountRegisterId?: number | null;
};

function balance(): Row {
  return { isBalanceEntry: true, isProjected: true, typeId: null, description: "Bal" };
}

function t6(desc: string, src: number | null): Row {
  return {
    isProjected: true,
    typeId: 6,
    description: desc,
    sourceAccountRegisterId: src,
  };
}

describe("paginateFutureRegisterWindow", () => {
  it("extends first page when the first loan (by peer id) is after the default window end", () => {
    const peers = new Set([8, 9]);
    const rows: Row[] = [
      balance(),
      ...Array.from({ length: 549 }, () => t6("Transfer for Groceries", 70)),
      t6("Transfer for Payment to RV", 9),
    ];
    const { paginated, hasMore } = paginateFutureRegisterWindow(
      rows,
      0,
      500,
      peers,
    );
    expect(paginated.length).toBeGreaterThan(500);
    expect(paginated.some((e) => e.sourceAccountRegisterId === 9)).toBe(true);
    expect(hasMore).toBe(false);
  });

  it("does not anchor on a loan-looking row before the balance row (scan starts at anchorStart)", () => {
    const peers = new Set([8]);
    const rows: Row[] = [
      t6("Transfer for Payment to Old", 8),
      ...Array.from({ length: 40 }, () => t6("Pending", null)),
      balance(),
      ...Array.from({ length: 400 }, () => t6("Transfer for Fuel", 70)),
      t6("Transfer for Payment to Loan", 8),
    ];
    const balanceIdx = rows.findIndex((e) => e.isBalanceEntry);
    expect(balanceIdx).toBeGreaterThan(0);
    const { paginated, hasMore } = paginateFutureRegisterWindow(
      rows,
      0,
      200,
      peers,
    );
    const firstLoanAfterBalance = rows.findIndex(
      (e, i) => i > balanceIdx && e.sourceAccountRegisterId === 8,
    );
    expect(firstLoanAfterBalance).toBeGreaterThan(0);
    expect(
      paginated.some(
        (e) => e.description === "Transfer for Payment to Loan",
      ),
    ).toBe(true);
    expect(
      paginated.some((e) => e.description === "Transfer for Payment to Old"),
    ).toBe(false);
    expect(hasMore).toBe(false);
  });

  it("matches budget-style descriptions when sourceAccountRegisterId is a loan peer", () => {
    const peers = new Set([8]);
    const rows: Row[] = [
      balance(),
      ...Array.from({ length: 520 }, () => t6("Transfer for Fuel", 70)),
      t6("Transfer for Groceries", 8),
    ];
    const { paginated } = paginateFutureRegisterWindow(rows, 0, 500, peers);
    expect(paginated.some((e) => e.sourceAccountRegisterId === 8)).toBe(true);
  });

  it("matches loan rows by Payment to in description when peer set is empty", () => {
    const rows: Row[] = [
      balance(),
      ...Array.from({ length: 520 }, () => t6("Transfer for Fuel", 70)),
      t6("Payment to RV Loan", null),
    ];
    const { paginated } = paginateFutureRegisterWindow(rows, 0, 500, new Set());
    expect(paginated.some((d) => String(d.description).includes("Payment to"))).toBe(
      true,
    );
  });

  it("matches Transfer for Extra debt prefix", () => {
    const rows: Row[] = [
      balance(),
      ...Array.from({ length: 520 }, () => t6("Transfer for Fuel", 70)),
      t6("Transfer for Extra debt payoff", null),
    ];
    const { paginated } = paginateFutureRegisterWindow(rows, 0, 500, new Set());
    expect(
      paginated.some((d) =>
        String(d.description).startsWith("Transfer for Extra debt"),
      ),
    ).toBe(true);
  });

  it("does not use savings-goal type-6 as the loan anchor (skips to next peer match)", () => {
    const peers = new Set([8]);
    const rows: Row[] = [
      balance(),
      ...Array.from({ length: 520 }, () => t6("Transfer for Fuel", 70)),
      t6("Savings goal contribution — X", 8),
      t6("Transfer for Payment to Loan", 8),
    ];
    const { paginated } = paginateFutureRegisterWindow(rows, 0, 500, peers);
    expect(paginated.length).toBeGreaterThan(500);
    expect(
      paginated.some((e) => e.description === "Transfer for Payment to Loan"),
    ).toBe(true);
  });

  it("uses first projected row as anchor when there is no balance row", () => {
    const peers = new Set<number>();
    const rows: Row[] = [
      { isProjected: true, typeId: 1, description: "A" },
      { isProjected: true, typeId: 1, description: "B" },
    ];
    const { paginated, hasMore } = paginateFutureRegisterWindow(
      rows,
      0,
      1,
      peers,
    );
    expect(paginated).toHaveLength(1);
    expect(paginated[0]!.description).toBe("A");
    expect(hasMore).toBe(true);
  });
});
