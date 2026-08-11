"use client";

import {
  createUserWithEmailAndPassword,
  deleteUser as deleteFirebaseUser,
  onIdTokenChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User
} from "firebase/auth";
import { auth, isFirebaseConfigured } from "./client";
import { AuthFlowError, safeAuthError, type SignupEmailState } from "./auth-errors";
import type { AppRole, UserPlanId } from "@/lib/types";

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

export async function syncServerSession(user: User) {
  const response = await fetch("/api/auth/session", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await user.getIdToken()}`
    }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message || "Your session could not be restored.");
  }
}

async function clearServerSession() {
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
  const body = await response.json().catch(() => ({ ok: false, message: "Invalid server response." }));
  if (!response.ok || !body.ok) {
    throw new Error(typeof body.message === "string" ? body.message : "Profile could not be prepared.");
  }
  return body.data as BootstrapResponse;
}

export async function signUpWithProfile(input: SignupInput) {
  if (!isFirebaseConfigured) throw new Error("Account creation is not configured yet.");
  if (!auth) throw new Error("Authentication is not configured yet.");

  const availability = await fetch("/api/auth/account-availability", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: input.email }) });
  const availabilityBody = await availability.json().catch(() => null) as { message?: string; data?: { state?: SignupEmailState; available?: boolean } } | null;
  if (!availability.ok) throw new AuthFlowError("unknown_conflict", "Account availability could not be confirmed. Please try again or contact support.");
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

export async function loginWithEmail(email: string, password: string) {
  if (!isFirebaseConfigured) throw new Error("Sign in is not configured yet.");
  if (!auth) throw new Error("Authentication is not configured yet.");
  let credential;
  try {
    credential = await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    const code = String((error as { code?: string })?.code ?? "");
    if (["auth/user-not-found", "auth/invalid-credential"].includes(code)) throw new Error("No active account was found for this email. Create a new account or contact support.");
    throw safeAuthError(error);
  }
  const [, profile] = await Promise.all([
    syncServerSession(credential.user),
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
  }
}

export async function getCurrentProfile(uid: string) {
  if (!auth?.currentUser || auth.currentUser.uid !== uid) return null;
  const result = await callProfileBootstrap(auth.currentUser, { method: "GET" });
  return result.user;
}
