"use client";

import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "./client";
import type { AppRole } from "@/lib/types";

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
  premium: boolean;
  verified: boolean;
  isAdmin: boolean;
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

export async function signUpWithProfile(input: SignupInput) {
  if (!isFirebaseConfigured) throw new Error("Account creation is not configured yet.");
  if (!auth) throw new Error("Authentication is not configured yet.");

  const credential = await createUserWithEmailAndPassword(auth, input.email, input.password);
  await createOrUpdateUserProfile(credential.user, input);
  return { mode: "firebase" as const, user: credential.user };
}

export async function loginWithEmail(email: string, password: string) {
  if (!isFirebaseConfigured) throw new Error("Sign in is not configured yet.");
  if (!auth) throw new Error("Authentication is not configured yet.");
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return { mode: "firebase" as const, user: credential.user, emailVerified: credential.user.emailVerified };
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
  if (!db) return null;
  const snap = await getDoc(doc(db, "profiles", uid));
  return snap.exists() ? (snap.data() as AuthProfile) : null;
}

async function createOrUpdateUserProfile(user: User, input: SignupInput) {
  if (!db) throw new Error("Account setup is not configured yet.");
  const displayName = `${input.firstName} ${input.lastName}`.trim();
  const adminEmails = (process.env.NEXT_PUBLIC_INITIAL_ADMIN_EMAILS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const isAdmin = adminEmails.includes(input.email.toLowerCase());
  const profile: AuthProfile = {
    uid: user.uid,
    firstName: input.firstName,
    lastName: input.lastName,
    displayName,
    email: input.email,
    role: input.role,
    premium: false,
    verified: false,
    isAdmin
  };

  await setDoc(doc(db, "users", user.uid), {
    uid: user.uid,
    email: input.email,
    role: input.role,
    isAdmin,
    emailVerified: false,
    verificationStatus: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });

  await setDoc(doc(db, "profiles", user.uid), {
    ...profile,
    emailVerified: false,
    verificationStatus: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });

  await setDoc(doc(db, "doroCoinWallets", user.uid), {
    userId: user.uid,
    balance: 0,
    lockedBalance: 0,
    updatedAt: serverTimestamp()
  }, { merge: true });
}
