import crypto from "crypto";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { fail, forbidden, ok, serverError, serverUnavailable, validationError } from "@/lib/server/responses";

const MAX_ATTEMPTS = 5;

function hashOtp(userId: string, email: string, code: string) {
  const secret = process.env.OTP_HASH_SECRET;
  if (!secret) throw new Error("OTP_HASH_SECRET is not configured.");
  return crypto.createHmac("sha256", secret).update(`${userId}:${email.toLowerCase()}:${code}`).digest("hex");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const { user, response } = await requireAuthenticatedUser(request);
  if (response) return response;
  const db = getAdminDb();
  const adminAuth = getAdminAuth();
  if (!db || !adminAuth) return serverUnavailable("Email verification");
  if (!user?.email) return fail("Your account does not have an email address.", 400, undefined, "EMAIL_REQUIRED");
  if (!process.env.OTP_HASH_SECRET) {
    return fail("Email verification is not configured.", 503, { missing: "OTP_HASH_SECRET" }, "EMAIL_VERIFICATION_CONFIGURATION_ERROR");
  }

  const body = await request.json().catch(() => null);
  const code = String(body?.code ?? "").trim();
  if (!/^\d{6}$/.test(code)) return validationError({ code: "Enter the 6-digit code from your email." });

  const snap = await db.collection("emailVerificationOtps").where("userId", "==", user.uid).where("email", "==", user.email).where("usedAt", "==", null).limit(10).get();
  const candidateRecords: Array<Record<string, unknown> & { ref: FirebaseFirestore.DocumentReference; id: string }> = snap.docs.map((doc) => ({ ref: doc.ref, id: doc.id, ...(doc.data() as Record<string, unknown>) }));
  const candidates = candidateRecords.sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
  const record = candidates[0];
  if (!record) return fail("Your code has expired. Request a new one.", 410, undefined, "OTP_EXPIRED");
  if (Number(record.attempts ?? 0) >= MAX_ATTEMPTS) return forbidden("Too many attempts. Request a new code.");
  if (new Date(String(record.expiresAt)).getTime() < Date.now()) {
    await record.ref.update({ usedAt: new Date().toISOString() });
    return fail("Your code has expired. Request a new one.", 410, undefined, "OTP_EXPIRED");
  }

  const expectedHash = String(record.hashedCode ?? "");
  const actualHash = hashOtp(user.uid, user.email, code);
  if (!expectedHash || !safeEqual(expectedHash, actualHash)) {
    const nextAttempts = Number(record.attempts ?? 0) + 1;
    await record.ref.update({ attempts: nextAttempts });
    if (nextAttempts >= MAX_ATTEMPTS) return forbidden("Too many attempts. Request a new code.");
    return fail("That code is not correct. Please try again.", 400, { attemptsRemaining: MAX_ATTEMPTS - nextAttempts }, "OTP_INVALID");
  }

  const now = new Date().toISOString();
  try {
    await Promise.all([
      record.ref.update({ usedAt: now, attempts: Number(record.attempts ?? 0) + 1 }),
      db.collection("profiles").doc(user.uid).set({ verified: true, emailVerified: true, updatedAt: now }, { merge: true }),
      db.collection("users").doc(user.uid).set({ emailVerified: true, verificationStatus: "verified", updatedAt: now }, { merge: true }),
      adminAuth.updateUser(user.uid, { emailVerified: true })
    ]);
    return ok({ verified: true }, "Email verified.");
  } catch (error) {
    return serverError("Email verification could not be completed.", error instanceof Error ? error.message : error);
  }
}



