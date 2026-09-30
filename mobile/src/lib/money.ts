/** Prisma Decimal fields serialize as strings over JSON — normalize to numbers. */
export function num(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatMoney(value: number): string {
  return currency.format(value);
}

export function formatDate(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** YYYY-MM-DD for date inputs (defaults to today, UTC like the server). */
export function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}
