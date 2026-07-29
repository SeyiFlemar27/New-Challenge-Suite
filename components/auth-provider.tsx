"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { demoAuthEnabled, getCurrentProfile, listenToAuth, syncServerSession, type AuthProfile } from "@/lib/firebase/auth-service";

interface AuthContextValue {
  user: User | null;
  profile: AuthProfile | null;
  loading: boolean;
  firebaseConfigured: boolean;
  verified: boolean;
  refreshProfile: () => Promise<AuthProfile | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    const activeUser = user;
    if (!activeUser) {
      setProfile(null);
      return null;
    }
    const nextProfile = await getCurrentProfile(activeUser.uid).catch(() => null);
    setProfile(nextProfile);
    return nextProfile;
  }, [user]);

  useEffect(() => {
    const unsubscribe = listenToAuth(async (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        const [, nextProfile] = await Promise.all([
          syncServerSession(nextUser).catch(() => undefined),
          getCurrentProfile(nextUser.uid).catch(() => null)
        ]);
        setProfile(nextProfile);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    function handleProfileUpdated() {
      void refreshProfile();
    }
    window.addEventListener("challenge-suite-profile-updated", handleProfileUpdated);
    return () => window.removeEventListener("challenge-suite-profile-updated", handleProfileUpdated);
  }, [refreshProfile]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    profile,
    loading,
    firebaseConfigured: !demoAuthEnabled,
    verified: demoAuthEnabled ? true : Boolean(profile?.verified || profile?.emailVerified || user?.emailVerified),
    refreshProfile
  }), [loading, profile, refreshProfile, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
