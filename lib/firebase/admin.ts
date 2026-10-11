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
  const emulatorRequested = process.env.CHALLENGE_SUITE_USE_FIREBASE_EMULATORS === "true";
  const emulatorReady = Boolean(
    emulatorRequested && projectId?.startsWith("demo-") &&
    process.env.FIRESTORE_EMULATOR_HOST &&
    process.env.FIREBASE_AUTH_EMULATOR_HOST &&
    process.env.FIREBASE_STORAGE_EMULATOR_HOST
  );
  if (emulatorRequested && !emulatorReady) {
    throw new Error("Firebase Admin emulator mode requires a demo-* project and Auth, Firestore, and Storage emulator hosts.");
  }

  const missing = [
    !projectId ? "FIREBASE_PROJECT_ID or NEXT_PUBLIC_FIREBASE_PROJECT_ID" : null,
    !storageBucket ? "FIREBASE_STORAGE_BUCKET or NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET" : null,
    !emulatorReady && !clientEmail ? "FIREBASE_CLIENT_EMAIL" : null,
    !emulatorReady && !privateKey ? "FIREBASE_PRIVATE_KEY" : null
  ].filter(Boolean) as string[];

  return {
    configured: missing.length === 0,
    emulator: emulatorReady,
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
    if (status.emulator && status.projectId && status.storageBucket) {
      initializeApp({ projectId: status.projectId, storageBucket: status.storageBucket });
      return getFirestore();
    }
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
