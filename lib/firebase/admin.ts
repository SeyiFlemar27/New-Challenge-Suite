import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

export function getFirebaseAdminConfigStatus() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  const missing = [
    !projectId ? "NEXT_PUBLIC_FIREBASE_PROJECT_ID" : null,
    !storageBucket ? "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET" : null,
    !clientEmail ? "FIREBASE_CLIENT_EMAIL" : null,
    !privateKey ? "FIREBASE_PRIVATE_KEY" : null
  ].filter(Boolean) as string[];

  return {
    configured: missing.length === 0,
    missing,
    projectId,
    storageBucket
  };
}

export function getAdminDb() {
  if (!getApps().length) {
    const status = getFirebaseAdminConfigStatus();
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    if (!status.configured || !privateKey) {
      return null;
    }
    initializeApp({
      storageBucket: status.storageBucket,
      credential: cert({
        projectId: status.projectId,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey
      })
    });
  }
  return getFirestore();
}

export function getAdminAuth() {
  if (!getApps().length) {
    getAdminDb();
  }
  if (!getApps().length) return null;
  return getAuth();
}

export function getAdminStorage() {
  if (!getApps().length) {
    getAdminDb();
  }
  if (!getApps().length) return null;
  return getStorage();
}
