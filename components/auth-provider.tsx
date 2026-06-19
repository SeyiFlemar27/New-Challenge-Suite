"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { demoAuthEnabled, getCurrentProfile, listenToAuth, type AuthProfile } from "@/lib/firebase/auth-service";

interface AuthContextValue {
  user: User | null;
  profile: AuthProfile | null;
  loading: boolean;
  firebaseConfigured: boolean;
  verified: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = listenToAuth(async (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        const nextProfile = await getCurrentProfile(nextUser.uid).catch(() => null);
        setProfile(nextProfile);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    profile,
    loading,
    firebaseConfigured: !demoAuthEnabled,
    verified: demoAuthEnabled ? true : Boolean(user?.emailVerified)
  }), [loading, profile, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
