import { CHALLENGE_TIME_ZONE_OPTIONS } from "@/lib/challenge-date-time";
import { NORMAL_CHALLENGE_CATEGORIES, NORMAL_ELIGIBLE_COUNTRIES } from "@/lib/normal-challenge-config";
import { sponsorCategories } from "@/lib/sponsor-foundation";

export type CanonicalOption<T extends string | number = string> = { value: T; label: string };

export const CHALLENGE_TYPES = [
  { value: "normal", label: "Normal Challenge" },
  { value: "private", label: "Private Challenge" },
  { value: "live_event", label: "Live Event Challenge" },
  { value: "tournament", label: "Tournament Challenge" }
] as const;
export const CAPACITY_MODES = [{ value: "unlimited", label: "Unlimited" }, { value: "limited", label: "Limited" }] as const;
export const CHALLENGE_CATEGORY_OPTIONS = NORMAL_CHALLENGE_CATEGORIES.map((item) => ({ value: item.label, label: item.label }));
export function challengeSubcategoryOptions(category: string) { return (NORMAL_CHALLENGE_CATEGORIES.find((item) => item.label === category)?.subcategories ?? []).map((value) => ({ value, label: value })); }
export const COUNTRY_OPTIONS = NORMAL_ELIGIBLE_COUNTRIES.map(([value, label]) => ({ value, label }));
export const TIMEZONE_OPTIONS = CHALLENGE_TIME_ZONE_OPTIONS.map((item) => ({ ...item }));
export function isCanonicalTimezone(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0)); return true; } catch { return false; }
}
export function normalizeCountryCode(value: unknown) {
  const text = String(value ?? "").trim();
  return COUNTRY_OPTIONS.find((option) => option.value === text.toUpperCase() || option.label.toLowerCase() === text.toLowerCase())?.value ?? text;
}
export function isCanonicalCountryCode(value: unknown) { return typeof value === "string" && COUNTRY_OPTIONS.some((option) => option.value === value); }

function slug(value: string) { return value.trim().toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
export const SPONSOR_CATEGORY_OPTIONS = sponsorCategories.map((label) => ({ value: slug(label), label }));
const sponsorCategoryByAlias = new Map(SPONSOR_CATEGORY_OPTIONS.flatMap((option) => [[option.value, option.value], [option.label.toLowerCase(), option.value]] as const));
export function normalizeSponsorCategories(value: unknown, maximum = 3) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\n]/) : [];
  return Array.from(new Set(source.map((item) => sponsorCategoryByAlias.get(String(item).trim().toLowerCase())).filter((item): item is string => Boolean(item)))).slice(0, maximum);
}
export function isCanonicalSponsorCategory(value: unknown) { return typeof value === "string" && SPONSOR_CATEGORY_OPTIONS.some((option) => option.value === value); }
export function normalizeSponsorCategory(value: unknown) { return normalizeSponsorCategories(value, 1)[0] ?? ""; }

export const TOURNAMENT_BRACKET_SIZES = [4, 8, 16, 32, 64, 128].map((value) => ({ value, label: `${value} participants` }));
export const TOURNAMENT_PARTICIPATION_TYPES = [{ value: "individual", label: "Individual" }, { value: "team", label: "Team" }] as const;
export const TOURNAMENT_ELIMINATION_TYPES = [{ value: "single_elimination", label: "Single Elimination" }, { value: "double_elimination", label: "Double Elimination" }] as const;
export const FUNDING_PURPOSES = ["challenge_base_funding", "challenge_additional_prize", "sponsor_prize_contribution", "sponsor_campaign", "plan_upgrade", "challenge_entry", "tournament_entry", "live_event_ticket", "wallet_funding"] as const;
export const PAYOUT_METHOD_OPTIONS = [{ value: "bank_transfer", label: "Bank Transfer" }, { value: "paypal", label: "PayPal" }, { value: "payoneer", label: "Payoneer" }] as const;
export function optionIncludes<T extends string | number>(options: readonly CanonicalOption<T>[], value: unknown): value is T { return options.some((option) => option.value === value); }
