"use client";

import {
  createUserWithEmailAndPassword,
  browserLocalPersistence,
  browserSessionPersistence,
  deleteUser as deleteFirebaseUser,
  GoogleAuthProvider,
  onIdTokenChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  setPersistence,
  type User
} from "firebase/auth";
import { auth, isFirebaseConfigured } from "./client";
import { AuthFlowError, safeAuthError, type SignupEmailState } from "./auth-errors";
import type { AppRole, UserPlanId } from "@/lib/types";
import { parseApiResponse } from "@/lib/api/client";
import { getRememberMePreference, setRememberMePreference } from "@/lib/firebase/session-persistence";

export interface SignupInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: AppRole;
  referralCode?: string;
}

export interface AuthProfile {
  uid: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  role: AppRole;
  accountTypeSelectionComplete?: boolean;
  selectedAccountType?: string;
  dashboardType?: string;
  planId?: UserPlanId;
  doroBalance?: number;
  premium: boolean;
  verified: boolean;
  emailVerified?: boolean;
  isAdmin: boolean;
  accountStatus?: string;
  deletionStatus?: string;
}

interface BootstrapResponse {
  profileExists: boolean;
  user: AuthProfile;
}

export const demoAuthEnabled = false;

let sessionSyncVersion = 0;
let activeSessionSync: { controller: AbortController; promise: Promise<void>; uid: string; rememberMe: boolean } | null = null;

export async function syncServerSession(user: User, rememberMe = getRememberMePreference()) {
  const current = activeSessionSync;
  if (current && !current.controller.signal.aborted && current.uid === user.uid && current.rememberMe === rememberMe) return current.promise;
  current?.controller.abort();
  const version = ++sessionSyncVersion;
  const controller = new AbortController();
  const promise = (async () => {
    const idToken = await user.getIdToken();
    if (version !== sessionSyncVersion || auth?.currentUser?.uid !== user.uid) return;
    const response = await fetch("/api/auth/session", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`
    },
      body: JSON.stringify({ rememberMe }),
      signal: controller.signal
    });
    if (version !== sessionSyncVersion) return;
    const result = await parseApiResponse<unknown>(response);
    if (!result.ok) throw new Error(result.message || "Your session could not be restored.");
  })().finally(() => {
    if (activeSessionSync?.promise === promise) activeSessionSync = null;
  });
  activeSessionSync = { controller, promise, uid: user.uid, rememberMe };
  return promise;
}

async function clearServerSession() {
  ++sessionSyncVersion;
  const current = activeSessionSync;
  current?.controller.abort();
  await current?.promise.catch(() => undefined);
  activeSessionSync = null;
  await fetch("/api/auth/session", {
    method: "DELETE",
    credentials: "same-origin"
  }).catch(() => undefined);
}

export function listenToAuth(callback: (user: User | null) => void) {
  if (!isFirebaseConfigured) {
    callback(null);
    return () => undefined;
  }
  if (!auth) throw new Error("Authentication is not configured yet.");
  return onIdTokenChanged(auth, callback);
}

async function callProfileBootstrap(user: User, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", headers.get("Content-Type") || "application/json");
  headers.set("Authorization", `Bearer ${await user.getIdToken(true)}`);

  const response = await fetch("/api/auth/profile/bootstrap", { ...init, headers });
  const body = await parseApiResponse<BootstrapResponse>(response);
  if (!body.ok || !body.data) {
    throw new Error(body.message || "Profile could not be prepared.");
  }
  return body.data;
}

export async function signUpWithProfile(input: SignupInput) {
  if (!isFirebaseConfigured) throw new Error("Account creation is not configured yet.");
  if (!auth) throw new Error("Authentication is not configured yet.");
  setRememberMePreference(false);

  const availability = await fetch("/api/auth/account-availability", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: input.email }) });
  const availabilityBody = await parseApiResponse<{ state?: SignupEmailState; available?: boolean }>(availability);
  if (!availabilityBody.ok) throw new AuthFlowError("unknown_conflict", availabilityBody.message || "Account availability could not be confirmed. Please try again or contact support.");
  const availabilityState = availabilityBody?.data?.state ?? "unknown_conflict";
  if (availabilityBody?.data?.available !== true || !["available", "deleted_email_reuse_allowed"].includes(availabilityState)) {
    throw new AuthFlowError(availabilityState, availabilityBody?.message);
  }
  let credential;
  try {
    credential = await createUserWithEmailAndPassword(auth, input.email, input.password);
  } catch (error) {
    throw safeAuthError(error, availabilityState);
  }
  try {
    await syncServerSession(credential.user);
    await callProfileBootstrap(credential.user, {
      method: "POST",
      body: JSON.stringify({ firstName: input.firstName, lastName: input.lastName, role: input.role, referralCode: input.referralCode || undefined })
    });
  } catch (error) {
    await deleteFirebaseUser(credential.user).catch(() => undefined);
    throw safeAuthError(error);
  }
  return { mode: "firebase" as const, user: credential.user };
}

async function ensureGoogleProfile(user: User) {
  const existing = await callProfileBootstrap(user, { method: "GET" });
  if (existing.profileExists) return existing.user;
  const names = String(user.displayName ?? "").trim().split(/\s+/).filter(Boolean);
  const firstName = names[0] ?? "Challenge";
  const lastName = names.slice(1).join(" ") || "Suite";
  const created = await callProfileBootstrap(user, { method: "POST", body: JSON.stringify({ firstName, lastName, role: "user" }) });
  return created.user;
}

export async function loginWithEmail(email: string, password: string, rememberMe = false) {
  if (!isFirebaseConfigured) throw new Error("Sign in is not configured yet.");
  if (!auth) throw new Error("Authentication is not configured yet.");
  setRememberMePreference(rememberMe);
  await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
  let credential;
  try {
    credential = await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    const code = String((error as { code?: string })?.code ?? "");
    if (["auth/user-not-found", "auth/invalid-credential"].includes(code)) throw new Error("No active account was found for this email. Create a new account or contact support.");
    throw safeAuthError(error);
  }
  const [, profile] = await Promise.all([
    syncServerSession(credential.user, rememberMe),
    getCurrentProfile(credential.user.uid).catch(() => null)
  ]);
  return { mode: "firebase" as const, user: credential.user, emailVerified: Boolean(profile?.verified || profile?.emailVerified || credential.user.emailVerified) };
}

export async function sendResetEmail(email: string) {
  if (!isFirebaseConfigured) throw new Error("Password reset is not configured yet.");
  if (!auth) throw new Error("Authentication is not configured yet.");
  await sendPasswordResetEmail(auth, email);
  return { mode: "firebase" as const };
}

export async function logout() {
  if (!isFirebaseConfigured) return;
  if (!auth) throw new Error("Authentication is not configured yet.");
  try {
    await clearServerSession();
  } finally {
    await signOut(auth);
    setRememberMePreference(false);
  }
}

export async function loginWithGoogle(rememberMe = false) {
  if (!isFirebaseConfigured) throw new Error("Sign in is not configured yet.");
  if (!auth) throw new Error("Authentication is not configured yet.");
  setRememberMePreference(rememberMe);
  await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
  let credential;
  try {
    credential = await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (error) {
    throw safeAuthError(error);
  }
  const [, profile] = await Promise.all([
    syncServerSession(credential.user, rememberMe),
    ensureGoogleProfile(credential.user)
  ]);
  return { mode: "firebase" as const, user: credential.user, emailVerified: Boolean(profile.verified || profile.emailVerified || credential.user.emailVerified) };
}

export async function getCurrentProfile(uid: string) {
  if (!auth?.currentUser || auth.currentUser.uid !== uid) return null;
  const result = await callProfileBootstrap(auth.currentUser, { method: "GET" });
  return result.user;
}
