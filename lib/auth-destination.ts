export type AuthDestinationState = {
  accountUnavailable: boolean;
  accountTypeSelectionComplete: boolean;
  accountIntroOnboardingInProgress: boolean;
  sponsorAccount: boolean;
  enterpriseWorkspaceActive: boolean;
};

export function getDefaultAuthenticatedRoute(state: AuthDestinationState) {
  if (state.accountUnavailable) return "/account/deletion-status";
  if (!state.accountTypeSelectionComplete) return "/onboarding/account-type";
  if (state.accountIntroOnboardingInProgress) return "/onboarding/welcome";
  if (state.enterpriseWorkspaceActive) return "/enterprise";
  if (state.sponsorAccount) return "/sponsor/dashboard";
  return "/dashboard";
}

export function resolveAuthenticatedDestination(state: AuthDestinationState, requestedPath = "") {
  const defaultRoute = getDefaultAuthenticatedRoute(state);
  const setupPending = state.accountUnavailable
    || !state.accountTypeSelectionComplete
    || state.accountIntroOnboardingInProgress;
  return setupPending || !requestedPath ? defaultRoute : requestedPath;
}
