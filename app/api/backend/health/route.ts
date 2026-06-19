import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb, getAdminStorage, getFirebaseAdminConfigStatus } from "@/lib/firebase/admin";

export const runtime = "nodejs";

type CheckResult = {
  ok: boolean;
  message: string;
  details?: unknown;
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

export async function GET(request: Request) {
  const config = getFirebaseAdminConfigStatus();
  const checks: Record<string, CheckResult> = {
    adminConfig: {
      ok: config.configured,
      message: config.configured ? "Firebase Admin environment variables are present." : "Firebase Admin environment variables are missing.",
      details: {
        missing: config.missing,
        projectId: config.projectId ?? null,
        storageBucket: config.storageBucket ?? null
      }
    },
    adminInitialization: { ok: false, message: "Firebase Admin has not been initialized." },
    firestoreReadWrite: { ok: false, message: "Firestore read/write check has not run." },
    authTokenVerification: { ok: false, message: "No Firebase ID token was provided. Send Authorization: Bearer <idToken> to verify token validation." },
    storageConfig: { ok: false, message: "Firebase Storage bucket has not been verified." }
  };

  if (!config.configured) {
    return json({ ok: false, checks }, 503);
  }

  try {
    const db = getAdminDb();
    const auth = getAdminAuth();
    const storage = getAdminStorage();
    checks.adminInitialization = {
      ok: Boolean(db && auth && storage),
      message: db && auth && storage ? "Firebase Admin initialized Firestore, Auth, and Storage." : "Firebase Admin initialization failed."
    };

    if (!db || !auth || !storage) {
      return json({ ok: false, checks }, 503);
    }

    const healthRef = db.collection("_backendHealth").doc("latest");
    const marker = {
      checkedAt: new Date().toISOString(),
      source: "api/backend/health"
    };
    await healthRef.set(marker, { merge: true });
    const healthSnap = await healthRef.get();
    checks.firestoreReadWrite = {
      ok: healthSnap.exists && healthSnap.data()?.source === marker.source,
      message: healthSnap.exists ? "Firestore write/read check succeeded." : "Firestore write/read check failed."
    };

    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (token) {
      const decoded = await auth.verifyIdToken(token);
      checks.authTokenVerification = {
        ok: true,
        message: "Firebase Auth token verification succeeded.",
        details: {
          uid: decoded.uid,
          emailVerified: decoded.email_verified ?? false
        }
      };
    }

    const bucket = storage.bucket();
    const [exists] = await bucket.exists();
    checks.storageConfig = {
      ok: exists,
      message: exists ? "Firebase Storage bucket exists and is reachable." : "Firebase Storage bucket was configured but could not be found.",
      details: {
        bucket: bucket.name
      }
    };

    const ok = checks.adminInitialization.ok && checks.firestoreReadWrite.ok && checks.storageConfig.ok && (token ? checks.authTokenVerification.ok : true);
    return json({ ok, checks }, ok ? 200 : 503);
  } catch (error) {
    return json({
      ok: false,
      checks,
      error: error instanceof Error ? error.message : "Unknown Firebase Admin health check error."
    }, 500);
  }
}
