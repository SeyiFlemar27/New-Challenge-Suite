import { normalizeAccountType } from "@/lib/plan-access";
import { getDefaultAuthenticatedRoute, resolveAuthenticatedDestination, type AuthDestinationState } from "@/lib/auth-destination";

const unavailableAccountStatuses = new Set(["deletion_requested", "deactivated", "scheduled_for_deletion", "auth_release_pending", "auth_release_failed", "finalization_failed"]);

function destinationState(profileValue: object): AuthDestinationState {
  const profile = profileValue as Record<string, unknown>;
  const availableWorkspaces = Array.isArray(profile.availableWorkspaces) ? profile.availableWorkspaces : [];
  const selectedAccountType = profile.account_type ?? profile.selectedAccountType;
  const sponsorAccount = selectedAccountType === "sponsor" ? true : normalizeAccountType(profile) === "sponsor";
  return {
    accountUnavailable: unavailableAccountStatuses.has(String(profile.accountStatus ?? profile.deletionStatus ?? "")),
    accountTypeSelectionComplete: profile.accountTypeSelectionComplete !== false,
    accountIntroOnboardingInProgress: profile.accountIntroOnboardingStatus === "in_progress",
    sponsorAccount,
    enterpriseWorkspaceActive: profile.activeWorkspace === "enterprise" && availableWorkspaces.includes("enterprise")
  };
}

export function getDefaultRouteForAccount(profile: object = {}) {
  return getDefaultAuthenticatedRoute(destinationState(profile));
}

export function getAuthenticatedDestination(profile: object, requestedPath = "") {
  return resolveAuthenticatedDestination(destinationState(profile), requestedPath);
}

export function isSponsorAccount(profileValue: object = {}) {
  const profile = profileValue as Record<string, unknown>;
  return profile.account_type === "sponsor" || profile.selectedAccountType === "sponsor" || normalizeAccountType(profile) === "sponsor";
}
