import { normalizeAccountType } from "@/lib/plan-access";

export function getDefaultRouteForAccount(profile: Record<string, unknown> = {}) {
  if (["deletion_requested", "deactivated", "scheduled_for_deletion", "auth_release_pending", "auth_release_failed", "finalization_failed"].includes(String(profile.accountStatus ?? profile.deletionStatus ?? ""))) return "/account/deletion-status";
  if (profile.accountTypeSelectionComplete === false) return "/onboarding/account-type";
  if (profile.accountIntroOnboardingStatus === "in_progress") return "/onboarding/welcome";
  const selectedAccountType = profile.account_type ?? profile.selectedAccountType;
  const accountType = selectedAccountType === "sponsor" ? "sponsor" : normalizeAccountType(profile);
  if (accountType === "sponsor") {
    return "/sponsor/dashboard";
  }
  return "/dashboard";
}

export function getAuthenticatedDestination(profile: Record<string, unknown>, requestedPath = "") {
  const defaultRoute = getDefaultRouteForAccount(profile);
  const setupPending = profile.accountTypeSelectionComplete === false
    || profile.accountIntroOnboardingStatus === "in_progress"
    || defaultRoute === "/account/deletion-status";
  return setupPending || !requestedPath ? defaultRoute : requestedPath;
}

export function isSponsorAccount(profile: Record<string, unknown> = {}) {
  return profile.account_type === "sponsor" || profile.selectedAccountType === "sponsor" || normalizeAccountType(profile) === "sponsor";
}
