"use client";

import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
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

export const demoAuthEnabled = !isFirebaseConfigured;

export function listenToAuth(callback: (user: User | null) => void) {
  if (!isFirebaseConfigured) {
    callback(null);
    return () => undefined;
  }
  if (!auth) throw new Error("Firebase Auth is not initialized.");
  return onAuthStateChanged(auth, callback);
}

export async function signUpWithProfile(input: SignupInput) {
  if (!isFirebaseConfigured) {
    persistDemoAuth(input.email, `${input.firstName} ${input.lastName}`, input.role, false);
    return { mode: "demo" as const, email: input.email };
  }
  if (!auth) throw new Error("Firebase Auth is not initialized.");

  const credential = await createUserWithEmailAndPassword(auth, input.email, input.password);
  await createOrUpdateUserProfile(credential.user, input);
  await sendEmailVerification(credential.user);
  return { mode: "firebase" as const, user: credential.user };
}

export async function loginWithEmail(email: string, password: string) {
  if (!isFirebaseConfigured) {
    persistDemoAuth(email, "Demo User", "user", true);
    return { mode: "demo" as const, emailVerified: true };
  }
  if (!auth) throw new Error("Firebase Auth is not initialized.");
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return { mode: "firebase" as const, user: credential.user, emailVerified: credential.user.emailVerified };
}

export async function resendCurrentVerificationEmail() {
  if (!isFirebaseConfigured) return { mode: "demo" as const };
  if (!auth) throw new Error("Firebase Auth is not initialized.");
  if (!auth.currentUser) throw new Error("No signed-in user found.");
  await sendEmailVerification(auth.currentUser);
  return { mode: "firebase" as const };
}

export async function sendResetEmail(email: string) {
  if (!isFirebaseConfigured) return { mode: "demo" as const };
  if (!auth) throw new Error("Firebase Auth is not initialized.");
  await sendPasswordResetEmail(auth, email);
  return { mode: "firebase" as const };
}

export async function logout() {
  if (!isFirebaseConfigured) {
    localStorage.removeItem("challenge_suite_demo_auth");
    return;
  }
  if (!auth) throw new Error("Firebase Auth is not initialized.");
  await signOut(auth);
}

export async function getCurrentProfile(uid: string) {
  if (!db) return null;
  const snap = await getDoc(doc(db, "profiles", uid));
  return snap.exists() ? (snap.data() as AuthProfile) : null;
}

async function createOrUpdateUserProfile(user: User, input: SignupInput) {
  if (!db) throw new Error("Firestore is not initialized.");
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
    verified: user.emailVerified,
    isAdmin
  };

  await setDoc(doc(db, "users", user.uid), {
    uid: user.uid,
    email: input.email,
    role: input.role,
    isAdmin,
    emailVerified: user.emailVerified,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });

  await setDoc(doc(db, "profiles", user.uid), {
    ...profile,
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

function persistDemoAuth(email: string, displayName: string, role: AppRole, verified: boolean) {
  localStorage.setItem("challenge_suite_demo_auth", JSON.stringify({ email, displayName, role, verified }));
}
