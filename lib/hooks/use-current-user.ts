"use client";

import { useMemo } from "react";
import { useAuth } from "@/components/auth-provider";
import type { AuthProfile } from "@/lib/firebase/auth-service";
import type { AccountType, AppRole, UserPlanId } from "@/lib/types";
import type { ProfileCustomization } from "@/lib/customization/options";
import { resolveProfileIdentity } from "@/lib/profile-identity";

export interface CurrentUserProfile {
  uid: string;
  email: string;
  displayName: string;
  initials: string;
  avatarUrl?: string | null;
  role?: AppRole;
  accountType: AccountType;
  accountTypeSelectionComplete?: boolean;
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
  accountIntroOnboardingStatus?: "in_progress" | "complete" | null;
  accountIntroOnboardingType?: "creator" | "sponsor" | null;
  accountIntroOnboardingStep?: number;
  accountIntroOnboardingCompletedAt?: string | null;
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
  activeWorkspace?: "personal" | "sponsor" | "enterprise";
  availableWorkspaces?: Array<"personal" | "sponsor" | "enterprise">;
  sponsorOrganizationId?: string | null;
  sponsorOrganizationName?: string | null;
  sponsorOrganizationLogoUrl?: string | null;
}


function accountTypeFromProfile(profile: Record<string, unknown>) {
  if (profile.isAdmin || profile.accountType === "admin") return "admin" as const;
  if (profile.accountType === "sponsor" || profile.role === "sponsor" || profile.dashboardType === "sponsor_dashboard") return "sponsor" as const;
  return "user" as const;
}


function resolvedCurrentUser(profile: AuthProfile, identityUser: { uid: string; email: string | null; displayName: string | null }) {
  const auth = { user: identityUser };
        const profileRecord = profile as Record<string, unknown>;
        const identity = resolveProfileIdentity(profileRecord, String(auth.user.email || profile.email || ""), String(auth.user.displayName || ""));
        const displayName = identity.displayName;
        const planId = typeof profile.planId === "string" ? profile.planId as UserPlanId : undefined;
        const accountType = accountTypeFromProfile(profileRecord);

        return {
          uid: auth.user.uid,
          email: String(auth.user.email || profile.email || ""),
          displayName,
          initials: identity.initials,
          avatarUrl: typeof profileRecord.avatarUrl === "string" ? profileRecord.avatarUrl : typeof profileRecord.photoURL === "string" ? profileRecord.photoURL : null,
          role: typeof profile.role === "string" ? profile.role as AppRole : undefined,
          accountType,
          accountTypeSelectionComplete: profile.accountTypeSelectionComplete !== false,
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
          accountIntroOnboardingStatus: profile.accountIntroOnboardingStatus === "in_progress" || profile.accountIntroOnboardingStatus === "complete" ? profile.accountIntroOnboardingStatus : null,
          accountIntroOnboardingType: profile.accountIntroOnboardingType === "creator" || profile.accountIntroOnboardingType === "sponsor" ? profile.accountIntroOnboardingType : null,
          accountIntroOnboardingStep: Number.isInteger(profile.accountIntroOnboardingStep) ? Number(profile.accountIntroOnboardingStep) : 0,
          accountIntroOnboardingCompletedAt: typeof profile.accountIntroOnboardingCompletedAt === "string" ? profile.accountIntroOnboardingCompletedAt : null,
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
          availableWorkspaces: Array.isArray(profileRecord.availableWorkspaces) ? profileRecord.availableWorkspaces.filter((value): value is "personal" | "sponsor" | "enterprise" => value === "personal" || value === "sponsor" || value === "enterprise") : ["personal"],
          sponsorOrganizationId: typeof profileRecord.sponsorOrganizationId === "string" ? profileRecord.sponsorOrganizationId : null,
          sponsorOrganizationName: typeof profileRecord.sponsorOrganizationName === "string" ? profileRecord.sponsorOrganizationName : null,
          sponsorOrganizationLogoUrl: typeof profileRecord.sponsorOrganizationLogoUrl === "string" ? profileRecord.sponsorOrganizationLogoUrl : null
        } as CurrentUserProfile;
}

/** All consumers share AuthProvider's authenticated, UID-checked bootstrap. */
export function useCurrentUser() {
  const auth = useAuth();
  const user = useMemo(() => !auth.loading && !auth.error && auth.user && auth.profile?.uid === auth.user.uid
    ? resolvedCurrentUser(auth.profile, auth.user) : null, [auth.loading, auth.error, auth.user, auth.profile]);
  return { user, loading: auth.loading, signedOut: !auth.loading && !auth.user, error: auth.error, revision: auth.revision, refreshProfile: auth.refreshProfile };
}
