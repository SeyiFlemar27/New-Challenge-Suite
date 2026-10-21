import { getUserPlanAccess, normalizeAccountType } from "@/lib/plan-access";
import { getDefaultAuthenticatedRoute, resolveAuthenticatedDestination, type AuthDestinationState } from "@/lib/auth-destination";

const unavailableAccountStatuses = new Set(["deletion_requested", "deactivated", "scheduled_for_deletion", "auth_release_pending", "auth_release_failed", "finalization_failed"]);

function destinationState(profileValue: object): AuthDestinationState {
  const profile = profileValue as Record<string, unknown>;
  const availableWorkspaces = Array.isArray(profile.availableWorkspaces) ? profile.availableWorkspaces : [];
  const selectedAccountType = profile.account_type ?? profile.selectedAccountType;
  const sponsorAccount = selectedAccountType === "sponsor" ? true : normalizeAccountType(profile) === "sponsor";
  const plan = getUserPlanAccess(profile);
  return {
    accountUnavailable: unavailableAccountStatuses.has(String(profile.accountStatus ?? profile.deletionStatus ?? "")),
    accountTypeSelectionComplete: profile.accountTypeSelectionComplete !== false,
    accountIntroOnboardingInProgress: profile.accountIntroOnboardingStatus === "in_progress",
    sponsorAccount: sponsorAccount || profile.activeWorkspace === "sponsor",
    enterpriseWorkspaceActive: profile.activeWorkspace === "enterprise" && availableWorkspaces.includes("enterprise"),
    adminAccount: profile.isAdmin === true && profile.accountType === "admin",
    emailVerificationRequired: profile.verified === false && profile.emailVerified !== true,
    subscriptionActivationPending: ["incomplete", "pending", "processing", "activation_pending"].includes(String(profile.planStatus ?? profile.subscriptionStatus ?? "")),
    hostAccount: plan.isHost,
    hostOnboardingComplete: profile.hostOnboardingComplete === true,
    creatorAccount: plan.isCreator || plan.isPro,
    creatorOnboardingComplete: profile.creatorOnboardingComplete === true,
    sponsorOnboardingRequired: sponsorAccount && profile.sponsorOnboardingComplete === false && !profile.sponsorOrganizationId
  };
}

export function getDefaultRouteForAccount(profile: object = {}) {
  return getDefaultAuthenticatedRoute(destinationState(profile));
}

export function getAuthenticatedDestination(profile: object, requestedPath = "") {
  const state = destinationState(profile);
  const requested = safeInternalDestination(requestedPath);
  const permitted = requested && requestedWorkspaceAllowed(profile, requested) ? requested : "";
  const destination = resolveAuthenticatedDestination(state, permitted);
  if (state.emailVerificationRequired && permitted) return `/auth/verify-email?returnUrl=${encodeURIComponent(permitted)}`;
  return permitted && destination.startsWith("/onboarding/") ? `${destination}?returnTo=${encodeURIComponent(permitted)}` : destination;
}

export function requestedAccountDestination(search: string) {
  const params = new URLSearchParams(search);
  return safeInternalDestination(params.get("returnTo") ?? params.get("returnUrl") ?? params.get("next"));
}

/** One normalization policy for login, verification and internal return links. */
export function safeInternalDestination(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || /[\\\u0000-\u0020\u007f]/.test(value)) return "";
  let decoded = value;
  try {
    for (let i = 0; i < 3; i++) {
      if (decoded.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(decoded)) return "";
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
    if (decoded.startsWith("//") || decoded.includes("://") || /[\\\u0000-\u0020\u007f]/.test(decoded)) return "";
    const url = new URL(value, "https://challenge-suite.invalid");
    if (url.origin !== "https://challenge-suite.invalid" || /^\/(api|auth)(\/|$)/.test(url.pathname)) return "";
    return url.pathname + url.search + url.hash;
  } catch { return ""; }
}

function requestedWorkspaceAllowed(profileValue: object, path: string) {
  const p = profileValue as Record<string, unknown>;
  const pathname = new URL(path, "https://challenge-suite.invalid").pathname;
  if (/^\/admin(\/|$)/.test(pathname)) return destinationState(p).adminAccount === true;
  if (/^\/enterprise(\/|$)/.test(pathname) && !/^\/enterprise\/(apply|status|application|contact)(\/|$)/.test(pathname)) return Array.isArray(p.availableWorkspaces) && p.availableWorkspaces.includes("enterprise");
  if (/^\/sponsor(\/|$)/.test(pathname) && !/^\/sponsor\/(start|apply|onboarding)(\/|$)/.test(pathname)) return hasSponsorPanelContext(p);
  if (/^\/(dashboard\/host|host)(\/|$)/.test(pathname)) return getUserPlanAccess(p).isHost;
  return true;
}

export function isRestrictedAccount(profile: object) {
  const p = profile as Record<string, unknown>;
  return ["suspended", "restricted", "banned", "disabled"].includes(String(p.accountStatus ?? "")) || p.accountRestricted === true;
}

/** Dashboard/onboarding transitions are decided before their children mount. */
export function getAccountRouteRedirect(profile: object, pathname: string, search = "") {
  const destination = getDefaultRouteForAccount(profile);
  const p = profile as Record<string, unknown>;
  if (destination === "/account/deletion-status") return pathname === destination ? "" : destination;
  if (isRestrictedAccount(profile)) return "";
  if (destination.startsWith("/onboarding/") && ![destination, "/subscriptions", "/settings/billing", "/contact"].includes(pathname)) {
    return /^\/(dashboard|onboarding)(\/|$)/.test(pathname) ? destination : getAuthenticatedDestination(profile, pathname + (search ? `?${search}` : ""));
  }
  if (pathname === "/dashboard") {
    if (getUserPlanAccess(p).isHost && new URLSearchParams(search).get("view") === "creator") return "";
    return destination === pathname ? "" : destination;
  }
  if (pathname === "/dashboard/host" && (!getUserPlanAccess(p).isHost || p.hostOnboardingComplete !== true)) return destination;
  if (pathname === "/onboarding/host" && (!getUserPlanAccess(p).isHost || p.hostOnboardingComplete === true)) return destination;
  if (pathname === "/onboarding/creator" && ((!getUserPlanAccess(p).isCreator && !getUserPlanAccess(p).isPro) || p.creatorOnboardingComplete === true)) return destination;
  if ((pathname === "/admin" || pathname.startsWith("/admin/")) && !destinationState(p).adminAccount) return destination;
  if (pathname === "/sponsor/dashboard" && !requestedWorkspaceAllowed(profile, pathname)) return destination;
  return "";
}

export function isSponsorAccount(profileValue: object = {}) {
  const profile = profileValue as Record<string, unknown>;
  return profile.account_type === "sponsor" || profile.selectedAccountType === "sponsor" || normalizeAccountType(profile) === "sponsor";
}

/** UI entry only; each Sponsor API still verifies organization membership and permissions. */
export function hasSponsorPanelContext(profileValue: object = {}) {
  const p = profileValue as Record<string, unknown>;
  return p.isSponsor === true || isSponsorAccount(p) || p.hasSponsorProfile === true || Boolean(p.sponsorOrganizationId) || Boolean(p.sponsorOnboardingStatus);
}
