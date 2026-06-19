"use client";

import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User
} from "firebase/auth";
import { auth, isFirebaseConfigured } from "./client";
import type { AppRole, UserPlanId } from "@/lib/types";

export interface SignupInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: AppRole;
}

export interface AuthProfile {
  uid: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  role: AppRole;
  planId?: UserPlanId;
  doroBalance?: number;
  premium: boolean;
  verified: boolean;
  emailVerified?: boolean;
  isAdmin: boolean;
}

interface BootstrapResponse {
  profileExists: boolean;
  user: AuthProfile;
}

export const demoAuthEnabled = false;

export function listenToAuth(callback: (user: User | null) => void) {
  if (!isFirebaseConfigured) {
    callback(null);
    return () => undefined;
  }
  if (!auth) throw new Error("Authentication is not configured yet.");
  return onAuthStateChanged(auth, callback);
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

  const credential = await createUserWithEmailAndPassword(auth, input.email, input.password);
  await callProfileBootstrap(credential.user, {
    method: "POST",
    body: JSON.stringify({ firstName: input.firstName, lastName: input.lastName, role: input.role })
  });
  return { mode: "firebase" as const, user: credential.user };
}

export async function loginWithEmail(email: string, password: string) {
  if (!isFirebaseConfigured) throw new Error("Sign in is not configured yet.");
  if (!auth) throw new Error("Authentication is not configured yet.");
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const profile = await getCurrentProfile(credential.user.uid).catch(() => null);
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
  await signOut(auth);
}

export async function getCurrentProfile(uid: string) {
  if (!auth?.currentUser || auth.currentUser.uid !== uid) return null;
  const result = await callProfileBootstrap(auth.currentUser, { method: "GET" });
  return result.user;
}
