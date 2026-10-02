import { describe, it, expect, vi, beforeEach } from "vitest";
import { upsertMerchantCategoryRuleFromUserEdit } from "../merchantCategoryRuleService";
import { normalizeMerchantKey } from "~/server/lib/merchantCategoryKey";

function createMockDb() {
  return {
    category: { findMany: vi.fn() },
    merchantCategoryRule: { upsert: vi.fn() },
  };
}

function category(overrides: Record<string, unknown>) {
  return {
    id: "cat-1",
    name: "General",
    subCategoryId: null as string | null,
    accountId: "acct-1",
    isArchived: false,
    ...overrides,
  };
}

describe("merchantCategoryRuleService", () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
  });

  it("does nothing when categoryId is null", async () => {
    await upsertMerchantCategoryRuleFromUserEdit({
      accountId: "acct-1",
      categoryId: null,
      plaidJson: { merchant_name: "Starbucks" },
      db: db as any,
    });

    expect(db.category.findMany).not.toHaveBeenCalled();
    expect(db.merchantCategoryRule.upsert).not.toHaveBeenCalled();
  });

  it("does nothing when plaidJson yields no merchant name", async () => {
    await upsertMerchantCategoryRuleFromUserEdit({
      accountId: "acct-1",
      categoryId: "cat-1",
      plaidJson: {},
      db: db as any,
    });

    expect(db.category.findMany).not.toHaveBeenCalled();
    expect(db.merchantCategoryRule.upsert).not.toHaveBeenCalled();
  });

  it("does nothing when the merchant name normalizes to an empty key", async () => {
    await upsertMerchantCategoryRuleFromUserEdit({
      accountId: "acct-1",
      categoryId: "cat-1",
      plaidJson: { merchant_name: "   " },
      db: db as any,
    });

    expect(db.merchantCategoryRule.upsert).not.toHaveBeenCalled();
  });

  it("creates a rule keyed by the normalized merchant with the category path and entity id", async () => {
    db.category.findMany.mockResolvedValue([
      category({ id: "cat-parent", name: "Business", subCategoryId: null }),
      category({ id: "cat-1", name: "Software", subCategoryId: "cat-parent" }),
    ]);
    db.merchantCategoryRule.upsert.mockResolvedValue({});

    await upsertMerchantCategoryRuleFromUserEdit({
      accountId: "acct-1",
      categoryId: "cat-1",
      plaidJson: {
        merchant_name: "GitHub",
        merchant_entity_id: "entity-123",
      },
      db: db as any,
    });

    expect(db.category.findMany).toHaveBeenCalledWith({
      where: { accountId: "acct-1", isArchived: false },
    });
    expect(db.merchantCategoryRule.upsert).toHaveBeenCalledTimes(1);
    const args = db.merchantCategoryRule.upsert.mock.calls[0][0];
    expect(args.where).toEqual({
      accountId_merchantKey: {
        accountId: "acct-1",
        merchantKey: normalizeMerchantKey("GitHub"),
      },
    });
    expect(args.create).toMatchObject({
      accountId: "acct-1",
      categoryId: "cat-1",
      merchantEntityId: "entity-123",
      applyMode: "ALWAYS",
    });
    expect(args.update).toMatchObject({
      categoryId: "cat-1",
      applyMode: "ALWAYS",
      merchantEntityId: "entity-123",
    });
    expect(args.create.merchantKey).toBe(args.where.accountId_merchantKey.merchantKey);
  });

  it("derives the merchant name from counterparties when merchant_name is absent", async () => {
    db.category.findMany.mockResolvedValue([category({})]);
    db.merchantCategoryRule.upsert.mockResolvedValue({});

    await upsertMerchantCategoryRuleFromUserEdit({
      accountId: "acct-1",
      categoryId: "cat-1",
      plaidJson: {
        counterparties: [
          { name: "Starbucks", entity_id: "cp-entity-9" },
        ],
      },
      db: db as any,
    });

    const args = db.merchantCategoryRule.upsert.mock.calls[0][0];
    expect(args.where.accountId_merchantKey.merchantKey).toBe(
      normalizeMerchantKey("Starbucks"),
    );
    expect(args.create.merchantEntityId).toBe("cp-entity-9");
  });

  it("uses HINT apply mode for coffee shops categorized under food & dining", async () => {
    db.category.findMany.mockResolvedValue([
      category({ id: "cat-food", name: "Food & Dining", subCategoryId: null }),
      category({
        id: "cat-1",
        name: "Coffee",
        subCategoryId: "cat-food",
      }),
    ]);
    db.merchantCategoryRule.upsert.mockResolvedValue({});

    await upsertMerchantCategoryRuleFromUserEdit({
      accountId: "acct-1",
      categoryId: "cat-1",
      plaidJson: { merchant_name: "Starbucks" },
      db: db as any,
    });

    expect(db.merchantCategoryRule.upsert.mock.calls[0][0].create.applyMode).toBe(
      "HINT",
    );
  });

  it("uses HINT apply mode for fuel merchants via the HINT fragment list", async () => {
    db.category.findMany.mockResolvedValue([category({ name: "Auto" })]);
    db.merchantCategoryRule.upsert.mockResolvedValue({});

    await upsertMerchantCategoryRuleFromUserEdit({
      accountId: "acct-1",
      categoryId: "cat-1",
      plaidJson: { merchant_name: "Shell" },
      db: db as any,
    });

    expect(db.merchantCategoryRule.upsert.mock.calls[0][0].create.applyMode).toBe(
      "HINT",
    );
  });

  it("falls back to ALWAYS when the category is unknown", async () => {
    db.category.findMany.mockResolvedValue([category({})]);
    db.merchantCategoryRule.upsert.mockResolvedValue({});

    await upsertMerchantCategoryRuleFromUserEdit({
      accountId: "acct-1",
      categoryId: "cat-missing",
      plaidJson: { merchant_name: "Some Random Store" },
      db: db as any,
    });

    const args = db.merchantCategoryRule.upsert.mock.calls[0][0];
    expect(args.create.applyMode).toBe("ALWAYS");
    expect(args.create.categoryId).toBe("cat-missing");
  });

  it("omits merchantEntityId from the update branch when plaidJson has no entity id", async () => {
    db.category.findMany.mockResolvedValue([category({})]);
    db.merchantCategoryRule.upsert.mockResolvedValue({});

    await upsertMerchantCategoryRuleFromUserEdit({
      accountId: "acct-1",
      categoryId: "cat-1",
      plaidJson: { merchant_name: "Shell" },
      db: db as any,
    });

    const args = db.merchantCategoryRule.upsert.mock.calls[0][0];
    expect(args.create.merchantEntityId).toBeNull();
    expect(args.update).toEqual({
      categoryId: "cat-1",
      applyMode: "HINT",
      merchantEntityId: undefined,
    });
  });

  it("does not throw when plaidJson is a non-object", async () => {
    await upsertMerchantCategoryRuleFromUserEdit({
      accountId: "acct-1",
      categoryId: "cat-1",
      plaidJson: "not-an-object",
      db: db as any,
    });

    expect(db.merchantCategoryRule.upsert).not.toHaveBeenCalled();
  });
});
