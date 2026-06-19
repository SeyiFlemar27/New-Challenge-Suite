"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { fetchBootstrapProfile } from "@/lib/api/services";
import type { AppRole, UserPlanId } from "@/lib/types";

export interface CurrentUserProfile {
  uid: string;
  email: string;
  displayName: string;
  initials: string;
  role?: AppRole;
  planId?: UserPlanId;
  doroBalance: number | null;
  verified: boolean;
  premium: boolean;
  isAdmin: boolean;
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
        const displayName = String(profile.displayName || auth.user.displayName || auth.user.email || "");
        const planId = typeof profile.planId === "string" ? profile.planId as UserPlanId : undefined;

        setCurrentUser({
          uid: auth.user.uid,
          email: String(auth.user.email || profile.email || ""),
          displayName,
          initials: profile.initials || initialsFromName(displayName || auth.user.email || ""),
          role: typeof profile.role === "string" ? profile.role as AppRole : undefined,
          planId,
          doroBalance: typeof profile.doroBalance === "number" ? profile.doroBalance : null,
          verified: Boolean(profile.verified || profile.emailVerified || auth.user.emailVerified),
          premium: Boolean(profile.premium || (planId && planId !== "observer")),
          isAdmin: Boolean(profile.isAdmin)
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
