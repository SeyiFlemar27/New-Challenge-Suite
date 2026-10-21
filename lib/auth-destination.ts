export type AuthDestinationState = {
  accountUnavailable: boolean;
  accountTypeSelectionComplete: boolean;
  accountIntroOnboardingInProgress: boolean;
  sponsorAccount: boolean;
  enterpriseWorkspaceActive: boolean;
  adminAccount?: boolean;
  emailVerificationRequired?: boolean;
  subscriptionActivationPending?: boolean;
  hostAccount?: boolean;
  hostOnboardingComplete?: boolean;
  creatorAccount?: boolean;
  creatorOnboardingComplete?: boolean;
  sponsorOnboardingRequired?: boolean;
};

export function getDefaultAuthenticatedRoute(state: AuthDestinationState) {
  if (state.accountUnavailable) return "/account/deletion-status";
  if (state.emailVerificationRequired) return "/auth/verify-email";
  if (state.adminAccount) return "/admin";
  if (!state.accountTypeSelectionComplete) return "/onboarding/account-type";
  if (state.accountIntroOnboardingInProgress) return "/onboarding/welcome";
  if (state.enterpriseWorkspaceActive) return "/enterprise";
  if (state.sponsorOnboardingRequired) return "/sponsor/onboarding";
  if (state.sponsorAccount) return "/sponsor/dashboard";
  if (state.subscriptionActivationPending) return "/onboarding/premium";
  if (state.hostAccount) return state.hostOnboardingComplete ? "/dashboard/host" : "/onboarding/host";
  if (state.creatorAccount && !state.creatorOnboardingComplete) return "/onboarding/creator";
  return "/dashboard";
}

export function resolveAuthenticatedDestination(state: AuthDestinationState, requestedPath = "") {
  const defaultRoute = getDefaultAuthenticatedRoute(state);
  const setupPending = state.accountUnavailable
    || !state.accountTypeSelectionComplete
    || state.accountIntroOnboardingInProgress
    || state.emailVerificationRequired
    || state.subscriptionActivationPending
    || state.sponsorOnboardingRequired
    || (state.hostAccount && !state.hostOnboardingComplete)
    || (!state.hostAccount && state.creatorAccount && !state.creatorOnboardingComplete);
  return setupPending || !requestedPath ? defaultRoute : requestedPath;
}
