import { normalizeAccountType } from "@/lib/plan-access";

export function getDefaultRouteForAccount(profile: Record<string, unknown> = {}) {
  const accountType = normalizeAccountType(profile);
  if (accountType === "sponsor") {
    const onboardingComplete = Boolean(profile.sponsorOnboardingComplete || profile.brandProfileComplete);
    return onboardingComplete ? "/sponsor/dashboard" : "/sponsor/onboarding";
  }
  return "/dashboard";
}

export function isSponsorAccount(profile: Record<string, unknown> = {}) {
  return normalizeAccountType(profile) === "sponsor";
}
