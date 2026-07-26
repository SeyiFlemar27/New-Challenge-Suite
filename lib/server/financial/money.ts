export const SUPPORTED_FINANCIAL_CURRENCIES = ["USD"] as const;
export type SupportedFinancialCurrency = typeof SUPPORTED_FINANCIAL_CURRENCIES[number];

export function normalizeCurrency(value: unknown): SupportedFinancialCurrency {
  const currency = String(value ?? "USD").trim().toUpperCase();
  if (!SUPPORTED_FINANCIAL_CURRENCIES.includes(currency as SupportedFinancialCurrency)) throw new Error("UNSUPPORTED_CURRENCY");
  return currency as SupportedFinancialCurrency;
}

export function toMinorUnits(value: unknown) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("INVALID_MONEY_AMOUNT");
    return Math.round(value * 100);
  }
  const raw = String(value ?? "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new Error("INVALID_MONEY_AMOUNT");
  const [whole, fraction = ""] = raw.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function formatMinorUnits(amountMinor: number, currency: SupportedFinancialCurrency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Math.trunc(Number(amountMinor) || 0) / 100);
}

export function addMinorUnits(...amounts: number[]) {
  return amounts.reduce((sum, value) => sum + Math.trunc(Number(value) || 0), 0);
}

export function subtractMinorUnits(amountMinor: number, ...deductions: number[]) {
  return Math.trunc(Number(amountMinor) || 0) - addMinorUnits(...deductions);
}

export function calculatePercentMinor(amountMinor: number, percent: number) {
  return Math.floor(Math.trunc(Number(amountMinor) || 0) * Math.trunc(Number(percent) || 0) / 100);
}
