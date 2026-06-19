"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { useAuth } from "@/components/auth-provider";
import { db } from "@/lib/firebase/client";
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
      if (!db) {
        setCurrentUser(null);
        setLoadingProfile(false);
        setError("Firestore is not configured.");
        return;
      }

      setLoadingProfile(true);
      setError(null);

      try {
        const [profileSnap, userSnap, walletSnap] = await Promise.all([
          getDoc(doc(db, "profiles", auth.user.uid)),
          getDoc(doc(db, "users", auth.user.uid)),
          getDoc(doc(db, "doroCoinWallets", auth.user.uid))
        ]);

        if (cancelled) return;

        const profile = profileSnap.exists() ? profileSnap.data() : {};
        const user = userSnap.exists() ? userSnap.data() : {};
        const wallet = walletSnap.exists() ? walletSnap.data() : {};
        const displayName = String(profile.displayName || auth.user.displayName || auth.user.email || "");
        const planId = typeof user.planId === "string" ? user.planId as UserPlanId : undefined;

        setCurrentUser({
          uid: auth.user.uid,
          email: String(auth.user.email || profile.email || user.email || ""),
          displayName,
          initials: initialsFromName(displayName || auth.user.email || ""),
          role: typeof user.role === "string" ? user.role as AppRole : typeof profile.role === "string" ? profile.role as AppRole : undefined,
          planId,
          doroBalance: typeof wallet.balance === "number" ? wallet.balance : null,
          verified: Boolean(profile.verified ?? auth.user.emailVerified),
          premium: Boolean(profile.premium || (planId && planId !== "observer")),
          isAdmin: Boolean(user.isAdmin || profile.isAdmin)
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
