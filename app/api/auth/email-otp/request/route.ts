import crypto from "crypto";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { getEmailConfigStatus, logEmailDeliveryError, safeEmailErrorDetails, sendEmail } from "@/lib/server/email";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";

const OTP_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;

function createOtpCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashOtp(userId: string, email: string, code: string) {
  const secret = process.env.OTP_HASH_SECRET;
  if (!secret) throw new Error("OTP_HASH_SECRET is not configured.");
  return crypto.createHmac("sha256", secret).update(`${userId}:${email.toLowerCase()}:${code}`).digest("hex");
}

function verificationEmailHtml(code: string) {
  return `
    <div style="background:#050505;color:#f8fafc;font-family:Arial,sans-serif;padding:32px">
      <div style="max-width:520px;margin:0 auto;border:1px solid rgba(234,179,8,.35);border-radius:18px;padding:28px;background:#111">
        <h1 style="margin:0;color:#facc15;font-size:28px">Your Challenge Suite code</h1>
        <p style="color:#cbd5e1;font-size:16px;line-height:1.6">Enter this 6-digit code to finish setting up your account.</p>
        <div style="font-size:36px;letter-spacing:10px;font-weight:800;color:#fff;background:#050505;border-radius:12px;padding:18px;text-align:center">${code}</div>
        <p style="color:#94a3b8;font-size:14px;line-height:1.6">This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>
      </div>
    </div>
  `;
}

export async function POST(request: Request) {
  const { user, response } = await requireAuthenticatedUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Email verification");
  if (!user?.email) return fail("Your account does not have an email address.", 400, undefined, "EMAIL_REQUIRED");
  if (!process.env.OTP_HASH_SECRET) {
    return fail("Email verification is not configured.", 503, { missing: "OTP_HASH_SECRET" }, "EMAIL_VERIFICATION_CONFIGURATION_ERROR");
  }
  const emailStatus = getEmailConfigStatus();
  if (!emailStatus.configured) {
    console.error("[email] configuration error", {
      provider: emailStatus.provider,
      missing: emailStatus.missing,
      invalid: emailStatus.invalid,
      hasResendApiKey: emailStatus.hasResendApiKey,
      hasEmailFrom: emailStatus.hasEmailFrom,
      fromDomain: emailStatus.fromDomain,
      fromUsesResendTestingDomain: emailStatus.fromUsesResendTestingDomain
    });
    return fail("Email delivery is not configured.", 503, { missing: emailStatus.missing, invalid: emailStatus.invalid }, "EMAIL_CONFIGURATION_ERROR");
  }

  const now = new Date();
  const recentSnap = await db.collection("emailVerificationOtps").where("userId", "==", user.uid).where("email", "==", user.email).where("usedAt", "==", null).limit(10).get();
  const recentRecords: Array<Record<string, unknown> & { id: string }> = recentSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }));
  const recent = recentRecords.sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))[0];
  if (recent?.createdAt) {
    const createdAt = new Date(String(recent.createdAt));
    const secondsSinceLast = Math.floor((now.getTime() - createdAt.getTime()) / 1000);
    if (secondsSinceLast < RESEND_COOLDOWN_SECONDS) {
      return fail("Please wait before requesting another code.", 429, { retryAfterSeconds: RESEND_COOLDOWN_SECONDS - secondsSinceLast }, "OTP_RESEND_COOLDOWN");
    }
  }

  const code = createOtpCode();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000).toISOString();
  const ref = db.collection("emailVerificationOtps").doc();
  const record = {
    id: ref.id,
    userId: user.uid,
    email: user.email,
    hashedCode: hashOtp(user.uid, user.email, code),
    expiresAt,
    attempts: 0,
    createdAt: now.toISOString(),
    usedAt: null
  };

  try {
    await ref.set(record);
    await sendEmail({
      to: user.email,
      subject: "Your Challenge Suite verification code",
      html: verificationEmailHtml(code),
      text: `Your Challenge Suite verification code is ${code}. It expires in 10 minutes.`
    });
    return ok({ email: user.email, expiresAt, resendCooldownSeconds: RESEND_COOLDOWN_SECONDS }, "Verification code sent.");
  } catch (error) {
    await ref.delete().catch(() => undefined);
    const details = safeEmailErrorDetails(error);
    logEmailDeliveryError("verification-code-send-failed", error, {
      fromDomain: emailStatus.fromDomain,
      fromUsesResendTestingDomain: emailStatus.fromUsesResendTestingDomain,
      recipientDomain: user.email.split("@").pop()?.toLowerCase() ?? null
    });
    return fail("Verification code could not be sent.", 502, details, "EMAIL_SEND_FAILED");
  }
}
