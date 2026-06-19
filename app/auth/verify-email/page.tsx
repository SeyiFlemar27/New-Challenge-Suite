"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, MailCheck, ShieldCheck } from "lucide-react";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { BrandLogo } from "@/components/brand";
import { requestEmailVerificationCode, verifyEmailCode } from "@/lib/api/services";
import { auth } from "@/lib/firebase/client";

const RESEND_SECONDS = 60;

export default function VerifyEmailPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [verified, setVerified] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const maskedEmail = useMemo(() => email || "your email", [email]);

  useEffect(() => {
    const storedEmail = localStorage.getItem("challenge_suite_signup_email") || auth?.currentUser?.email || "";
    setEmail(storedEmail);
    void requestCode(false);
  }, []);

  useEffect(() => {
    if (verified || seconds <= 0) return;
    const timer = window.setTimeout(() => setSeconds((value) => Math.max(value - 1, 0)), 1000);
    return () => window.clearTimeout(timer);
  }, [seconds, verified]);

  async function requestCode(showSuccess = true) {
    setRequesting(true);
    setError("");
    setNotice("");
    const result = await requestEmailVerificationCode();
    setRequesting(false);

    if (!result.ok || !result.data) {
      const retryAfter = (result as any).details?.retryAfterSeconds;
      if (typeof retryAfter === "number") setSeconds(retryAfter);
      setError(result.message || "We couldn’t send a code right now. Please try again.");
      return;
    }

    setEmail(result.data.email);
    localStorage.setItem("challenge_suite_signup_email", result.data.email);
    setSeconds(result.data.resendCooldownSeconds || RESEND_SECONDS);
    if (showSuccess) setNotice("We sent a fresh code to your email.");
  }

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = code.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setError("Enter the 6-digit code from your email.");
      return;
    }

    setVerifying(true);
    setError("");
    setNotice("");
    const result = await verifyEmailCode(trimmed);
    setVerifying(false);

    if (!result.ok) {
      if ((result as any).code === "OTP_EXPIRED") {
        setError("Your code has expired. Request a new one.");
      } else if ((result as any).code === "OTP_INVALID") {
        setError("That code is not correct. Please try again.");
      } else {
        setError(result.message || "We couldn’t verify that code. Please try again.");
      }
      return;
    }

    await auth?.currentUser?.getIdToken(true).catch(() => undefined);
    setVerified(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 py-10">
      <Card className="w-full max-w-[540px] rounded-[16px] p-8 text-center md:p-10">
        <BrandLogo className="mb-5" imageClassName="h-20 w-20 border-2 border-[var(--gold)] gold-glow" />
        {verified ? (
          <div className="py-6">
            <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 180 }}>
              <CheckCircle2 className="mx-auto h-20 w-20 text-emerald-400" />
            </motion.div>
            <h1 className="mt-6 text-4xl font-black">Email Verified</h1>
            <p className="mt-3 text-slate-300">Your account is ready. Continue to your dashboard.</p>
            <Button className="mt-8 w-full" onClick={() => router.push("/dashboard")}>Continue to Dashboard</Button>
          </div>
        ) : (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-yellow-500/30 bg-yellow-500/10 text-[var(--gold)]">
              <MailCheck className="h-8 w-8" />
            </div>
            <h1 className="mt-6 text-4xl font-black">We sent a verification code to your email</h1>
            <p className="mt-4 text-slate-300">We sent a 6-digit code to <b className="text-white">{maskedEmail}</b>.</p>
            <p className="mt-2 text-sm text-slate-400">Enter the code below to continue. The code expires in 10 minutes.</p>
            <form className="mt-8 space-y-5 text-left" onSubmit={verify}>
              <Field label="Verification Code">
                <input
                  className={`${inputClass} h-14 text-center text-2xl font-black tracking-[.45em]`}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                />
              </Field>
              {error ? <p className="rounded-[8px] bg-red-950/50 p-3 text-sm text-red-200">{error}</p> : null}
              {notice ? <p className="rounded-[8px] bg-emerald-950/40 p-3 text-sm text-emerald-200">{notice}</p> : null}
              <Button className="w-full" disabled={verifying}>{verifying ? "Checking code..." : "Verify Code"}</Button>
            </form>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Button type="button" variant="secondary" onClick={() => requestCode(true)} disabled={requesting || seconds > 0}>
                {requesting ? "Sending..." : seconds > 0 ? `Resend in ${seconds}s` : "Resend Code"}
              </Button>
              <Link href="/auth/register" className="inline-flex h-11 items-center justify-center rounded-[8px] border border-white/10 bg-[#1d1d1d] px-5 text-sm font-bold text-white transition hover:bg-[#242424]">Change Email</Link>
            </div>
            <div className="mt-6 flex items-center justify-center gap-2 text-xs font-bold text-slate-500">
              <ShieldCheck size={14} /> Didn’t receive it? Check spam or request a new code.
            </div>
          </>
        )}
      </Card>
    </main>
  );
}
