"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { useQueryClient } from "@tanstack/react-query";
import { demoAuthEnabled, getCurrentProfile, invalidateCurrentProfileRead, listenToAuth, syncServerSession, type AuthProfile } from "@/lib/firebase/auth-service";

interface AuthContextValue {
  user: User | null;
  profile: AuthProfile | null;
  loading: boolean;
  firebaseConfigured: boolean;
  verified: boolean;
  error: string | null;
  revision: number;
  refreshProfile: () => Promise<AuthProfile | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<{ user: User | null; profile: AuthProfile | null; loading: boolean; error: string | null; revision: number }>({ user: null, profile: null, loading: true, error: null, revision: 0 });
  const currentUser = useRef<User | null>(null);
  const resolvedScope = useRef<string | null>(null);
  const authCallbackGeneration = useRef(0);
  const pending = useRef<{ uid: string; promise: Promise<AuthProfile | null> } | null>(null);
  const resolveUser = useCallback((activeUser: User | null, force = false): Promise<AuthProfile | null> => {
    if (!force && activeUser && pending.current?.uid === activeUser.uid) return pending.current.promise;
    const generation = ++authCallbackGeneration.current;
    const identityChanged = currentUser.current?.uid !== activeUser?.uid;
    currentUser.current = activeUser;
    if (identityChanged || !activeUser) {
      void queryClient.cancelQueries();
      queryClient.clear();
    }
    setState(previous => ({ user: activeUser, profile: null, loading: Boolean(activeUser), error: null, revision: previous.revision }));
    if (!activeUser) { pending.current = null; resolvedScope.current = null; return Promise.resolve(null); }
    const promise = (async () => {
      try {
        const [, profile] = await Promise.all([syncServerSession(activeUser), getCurrentProfile(activeUser.uid)]);
        if (generation !== authCallbackGeneration.current || currentUser.current?.uid !== activeUser.uid) return null;
        if (!profile || profile.uid !== activeUser.uid) throw new Error("Your account could not be confirmed. Please try again.");
        const scope = JSON.stringify([profile.uid, profile.activeWorkspace, profile.sponsorOrganizationId, profile.planId, profile.planStatus, profile.isAdmin, profile.enterprisePermissions, profile.accountStatus]);
        if (resolvedScope.current && resolvedScope.current !== scope) { void queryClient.cancelQueries(); queryClient.clear(); }
        resolvedScope.current = scope;
        setState(previous => ({ user: activeUser, profile, loading: false, error: null, revision: previous.revision + 1 }));
        return profile;
      } catch (error) {
        if (generation === authCallbackGeneration.current) setState(previous => ({ ...previous, profile: null, loading: false, error: error instanceof Error ? error.message : "Your account could not be confirmed. Please try again." }));
        return null;
      }
    })().finally(() => { if (pending.current?.promise === promise) pending.current = null; });
    pending.current = { uid: activeUser.uid, promise };
    return promise;
  }, [queryClient]);
  const refreshProfile = useCallback(() => resolveUser(currentUser.current), [resolveUser]);
  const cancelResolution = useCallback(() => { ++authCallbackGeneration.current; }, []);

  useEffect(() => {
    const unsubscribe = listenToAuth(nextUser => { void resolveUser(nextUser); }, () => {
      ++authCallbackGeneration.current;
      pending.current = null;
      setState(previous => ({ ...previous, profile: null, loading: false, error: "Your session could not be restored. Please sign in again." }));
    });
    return () => { cancelResolution(); unsubscribe(); };
  }, [cancelResolution, resolveUser]);

  useEffect(() => {
    function handleProfileUpdated() {
      invalidateCurrentProfileRead();
      void queryClient.cancelQueries();
      queryClient.clear();
      void resolveUser(currentUser.current, true);
    }
    function handleTransition() {
      ++authCallbackGeneration.current;
      pending.current = null;
      void queryClient.cancelQueries(); queryClient.clear();
      setState(previous => ({ ...previous, profile: null, loading: true, error: null }));
    }
    window.addEventListener("challenge-suite-profile-updated", handleProfileUpdated);
    window.addEventListener("challenge-suite-auth-transition", handleTransition);
    return () => { window.removeEventListener("challenge-suite-profile-updated", handleProfileUpdated); window.removeEventListener("challenge-suite-auth-transition", handleTransition); };
  }, [queryClient, resolveUser]);

  const value = useMemo<AuthContextValue>(() => ({
    ...state,
    firebaseConfigured: !demoAuthEnabled,
    verified: demoAuthEnabled ? true : Boolean(state.profile?.verified || state.profile?.emailVerified || state.user?.emailVerified),
    refreshProfile
  }), [state, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
