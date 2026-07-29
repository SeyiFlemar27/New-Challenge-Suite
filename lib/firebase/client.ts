import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { browserLocalPersistence, getAuth, initializeAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

function normalizeStorageBucket(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  return trimmed.replace(/^gs:\/\//i, "").replace(/\/+$/g, "");
}

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: normalizeStorageBucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};
const mediaUploadsDisabledByFlag = process.env.NEXT_PUBLIC_DISABLE_MEDIA_UPLOADS === "true";

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
export const isFirebaseStorageConfigured = Boolean(isFirebaseConfigured && firebaseConfig.storageBucket);
let app: FirebaseApp | null = null;
let initializationError = "";
let storageInitializationError = "";

try {
  app = isFirebaseConfigured ? (getApps().length ? getApps()[0] : initializeApp(firebaseConfig)) : null;
} catch (error) {
  initializationError = error instanceof Error ? error.name : "FirebaseInitializationError";
  app = null;
}

export const firebaseApp: FirebaseApp | null = app;
export const auth = firebaseApp ? (() => {
  try {
    return initializeAuth(firebaseApp, { persistence: browserLocalPersistence });
  } catch {
    return getAuth(firebaseApp);
  }
})() : null;
export const db = firebaseApp ? getFirestore(firebaseApp) : null;

let initializedStorage: ReturnType<typeof getStorage> | null = null;
try {
  initializedStorage = firebaseApp && isFirebaseStorageConfigured ? getStorage(firebaseApp, `gs://${firebaseConfig.storageBucket}`) : null;
} catch (error) {
  storageInitializationError = error instanceof Error ? error.name : "FirebaseStorageInitializationError";
  initializedStorage = null;
}

export const storage = initializedStorage;
export const firebaseClientConfigStatus = {
  authConfigured: Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId),
  firestoreConfigured: isFirebaseConfigured,
  appInitialized: Boolean(firebaseApp),
  storageConfigured: isFirebaseStorageConfigured,
  storageInitialized: Boolean(storage),
  mediaUploadsDisabled: mediaUploadsDisabledByFlag || !storage,
  mediaUploadAvailability: mediaUploadsDisabledByFlag ? "disabled_demo_mode" : !isFirebaseStorageConfigured ? "disabled_storage_not_configured" : !storage ? "disabled_storage_not_available" : "enabled",
  mediaUploadsDisabledEnvName: "NEXT_PUBLIC_DISABLE_MEDIA_UPLOADS",
  storageBucketEnvName: "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  storageBucketAcceptsFormats: "bucket-name only or gs://bucket-name",
  initializationError,
  storageInitializationError
};
