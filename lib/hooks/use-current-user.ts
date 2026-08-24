"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { fetchBootstrapProfile } from "@/lib/api/services";
import type { AccountType, AppRole, UserPlanId } from "@/lib/types";
import type { ProfileCustomization } from "@/lib/customization/options";
import { resolveProfileIdentity } from "@/lib/profile-identity";

export interface CurrentUserProfile {
  uid: string;
  email: string;
  displayName: string;
  initials: string;
  role?: AppRole;
  accountType: AccountType;
  dashboardType?: string;
  selectedAccountType?: string;
  roleIntent?: string;
  planId?: UserPlanId;
  legacyPlanId?: string | null;
  planName?: string;
  planStatus?: string;
  doroBalance: number | null;
  verified: boolean;
  premium: boolean;
  isSponsor: boolean;
  isAdmin: boolean;
  sponsorOnboardingStatus?: string | null;
  sponsorOnboardingComplete?: boolean;
  creatorOnboardingComplete?: boolean;
  hostOnboardingComplete?: boolean;
  walkthroughCompleted?: boolean;
  hasSponsorProfile?: boolean;
  customization?: ProfileCustomization;
  kycRequired?: boolean;
  kycStatus?: string;
  premiumAccessState?: string;
  enterpriseAccessStatus?: string;
  enterpriseApprovalStatus?: string;
  enterpriseApplicationId?: string | null;
  enterpriseRole?: string | null;
  enterpriseScope?: string | null;
  enterpriseDepartment?: string | null;
  enterprisePermissions?: string[];
  enterpriseStaffStatus?: string | null;
  enterpriseOnboardingComplete?: boolean;
  activeWorkspace?: "personal" | "enterprise";
  availableWorkspaces?: Array<"personal" | "enterprise">;
}

function initialsFromName(name: string) {
  return name
    .split(" ")
    .map((part) => part.trim()[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function accountTypeFromProfile(profile: Record<string, unknown>) {
  if (profile.isAdmin || profile.accountType === "admin") return "admin" as const;
  if (profile.accountType === "sponsor" || profile.role === "sponsor" || profile.dashboardType === "sponsor_dashboard") return "sponsor" as const;
  return "user" as const;
}

export function useCurrentUser() {
  const auth = useAuth();
  const [currentUser, setCurrentUser] = useState<CurrentUserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentUser() {
      if (auth.loading) return;
      if (!auth.user) {
        setCurrentUser(null);
        setLoadingProfile(false);
        setError(null);
        return;
      }

      setLoadingProfile(true);
      setError(null);

      try {
        const result = await fetchBootstrapProfile();
        if (cancelled) return;
        if (!result.ok || !result.data?.user) {
          throw new Error(result.message || "Profile could not be loaded.");
        }

        const profile = result.data.user;
        const profileRecord = profile as Record<string, unknown>;
        const identity = resolveProfileIdentity(profileRecord, String(auth.user.email || profile.email || ""), String(auth.user.displayName || ""));
        const displayName = identity.displayName;
        const planId = typeof profile.planId === "string" ? profile.planId as UserPlanId : undefined;
        const accountType = accountTypeFromProfile(profileRecord);

        setCurrentUser({
          uid: auth.user.uid,
          email: String(auth.user.email || profile.email || ""),
          displayName,
          initials: identity.initials,
          role: typeof profile.role === "string" ? profile.role as AppRole : undefined,
          accountType,
          dashboardType: typeof profile.dashboardType === "string" ? profile.dashboardType : undefined,
          selectedAccountType: typeof profile.selectedAccountType === "string" ? profile.selectedAccountType : undefined,
          roleIntent: typeof profile.roleIntent === "string" ? profile.roleIntent : undefined,
          planId,
          legacyPlanId: typeof profile.legacyPlanId === "string" ? profile.legacyPlanId : null,
          planName: typeof profile.planName === "string" ? profile.planName : undefined,
          planStatus: typeof profile.planStatus === "string" ? profile.planStatus : typeof profile.subscriptionStatus === "string" ? profile.subscriptionStatus : undefined,
          doroBalance: typeof profile.doroBalance === "number" ? profile.doroBalance : null,
          verified: Boolean(profile.verified || profile.emailVerified),
          premium: Boolean(profile.premium || profile.isPremium || (planId && planId !== "free" && planId !== "observer")),
          isSponsor: Boolean(profile.isSponsor || accountType === "sponsor"),
          isAdmin: Boolean(profile.isAdmin || accountType === "admin"),
          sponsorOnboardingStatus: typeof profile.sponsorOnboardingStatus === "string" ? profile.sponsorOnboardingStatus : null,
          sponsorOnboardingComplete: Boolean(profile.sponsorOnboardingComplete),
          creatorOnboardingComplete: Boolean(profile.creatorOnboardingComplete),
          hostOnboardingComplete: Boolean(profile.hostOnboardingComplete),
          walkthroughCompleted: profile.walkthroughCompleted !== false,
          hasSponsorProfile: Boolean(profile.hasSponsorProfile),
          customization: profile.customization as ProfileCustomization | undefined,
          kycRequired: Boolean(profileRecord.kycRequired),
          kycStatus: typeof profileRecord.kycStatus === "string" ? profileRecord.kycStatus : undefined,
          premiumAccessState: typeof profileRecord.premiumAccessState === "string" ? profileRecord.premiumAccessState : undefined,
          enterpriseAccessStatus: typeof profileRecord.enterpriseAccessStatus === "string" ? profileRecord.enterpriseAccessStatus : undefined,
          enterpriseApprovalStatus: typeof profileRecord.enterpriseApprovalStatus === "string" ? profileRecord.enterpriseApprovalStatus : undefined,
          enterpriseApplicationId: typeof profileRecord.enterpriseApplicationId === "string" ? profileRecord.enterpriseApplicationId : null,
          enterpriseRole: typeof profileRecord.enterpriseRole === "string" ? profileRecord.enterpriseRole : null,
          enterpriseScope: typeof profileRecord.enterpriseScope === "string" ? profileRecord.enterpriseScope : null,
          enterpriseDepartment: typeof profileRecord.enterpriseDepartment === "string" ? profileRecord.enterpriseDepartment : null,
          enterprisePermissions: Array.isArray(profileRecord.enterprisePermissions) ? profileRecord.enterprisePermissions.filter((value): value is string => typeof value === "string") : [],
          enterpriseStaffStatus: typeof profileRecord.enterpriseStaffStatus === "string" ? profileRecord.enterpriseStaffStatus : null,
          enterpriseOnboardingComplete: Boolean(profileRecord.enterpriseOnboardingComplete),
          activeWorkspace: profileRecord.activeWorkspace === "enterprise" ? "enterprise" : "personal",
          availableWorkspaces: Array.isArray(profileRecord.availableWorkspaces) ? profileRecord.availableWorkspaces.filter((value): value is "personal" | "enterprise" => value === "personal" || value === "enterprise") : ["personal"]
        });
      } catch (caught) {
        if (!cancelled) {
          setCurrentUser(null);
          setError(caught instanceof Error ? caught.message : "Profile could not be loaded.");
        }
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    }

    void loadCurrentUser();

    return () => {
      cancelled = true;
    };
  }, [auth.loading, auth.user]);

  return useMemo(() => ({
    user: currentUser,
    loading: auth.loading || loadingProfile,
    signedOut: !auth.loading && !auth.user,
    error
  }), [auth.loading, auth.user, currentUser, error, loadingProfile]);
}


