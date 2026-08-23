import type { Transaction } from "plaid";

/** Prefer `merchant_name` / `original_description` over deprecated `name`. */
export function transactionDisplayLabel(tx: Transaction): string {
  const merchant = tx.merchant_name?.trim();
  if (merchant) return merchant;
  const original = tx.original_description?.trim();
  if (original) return original;
  return "";
}
