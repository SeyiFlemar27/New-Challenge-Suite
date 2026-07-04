import { normalizeAccountType } from "@/lib/plan-access";

export function getDefaultRouteForAccount(profile: Record<string, unknown> = {}) {
  if (profile.accountTypeSelectionComplete === false) return "/onboarding/account-type";
  const accountType = normalizeAccountType(profile);
  if (accountType === "sponsor") {
    return "/sponsor/dashboard";
  }
  return "/dashboard";
}

export function isSponsorAccount(profile: Record<string, unknown> = {}) {
  return normalizeAccountType(profile) === "sponsor";
}
