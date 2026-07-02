import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

export function getFirebaseAdminConfigStatus() {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const publicStorageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || publicStorageBucket;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  const missing = [
    !projectId ? "FIREBASE_PROJECT_ID or NEXT_PUBLIC_FIREBASE_PROJECT_ID" : null,
    !storageBucket ? "FIREBASE_STORAGE_BUCKET or NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET" : null,
    !clientEmail ? "FIREBASE_CLIENT_EMAIL" : null,
    !privateKey ? "FIREBASE_PRIVATE_KEY" : null
  ].filter(Boolean) as string[];

  return {
    configured: missing.length === 0,
    missing,
    projectId,
    storageBucket,
    publicStorageBucket,
    projectIdSource: process.env.FIREBASE_PROJECT_ID ? "FIREBASE_PROJECT_ID" : "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    storageBucketSource: process.env.FIREBASE_STORAGE_BUCKET ? "FIREBASE_STORAGE_BUCKET" : "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"
  };
}

export function getAdminDb() {
  if (!getApps().length) {
    const status = getFirebaseAdminConfigStatus();
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim().replace(/\\n/g, "\n");
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
