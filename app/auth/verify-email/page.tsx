"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, MailCheck } from "lucide-react";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { BrandLogo } from "@/components/brand";
import { demoAuthEnabled, resendCurrentVerificationEmail } from "@/lib/firebase/auth-service";

const RESEND_SECONDS = 60;

export default function VerifyEmailPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    setEmail(localStorage.getItem("challenge_suite_signup_email") || "your email address");
  }, []);

  useEffect(() => {
    if (verified || seconds <= 0) return;
    const timer = window.setTimeout(() => setSeconds((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [seconds, verified]);

  function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!demoAuthEnabled) {
      setError("Check your email verification link, then sign in again.");
      return;
    }
    const expected = localStorage.getItem("challenge_suite_verification_code") || "246810";
    if (code.trim() !== expected) {
      setError("Incorrect code. Please check and try again.");
      return;
    }
    setError("");
    setVerified(true);
  }

  async function resend() {
    try {
      if (demoAuthEnabled) localStorage.setItem("challenge_suite_verification_code", "246810");
      else await resendCurrentVerificationEmail();
      setSeconds(RESEND_SECONDS);
      setNotice(demoAuthEnabled ? "A new verification code was sent." : "A new Firebase verification email was sent.");
      setError("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not resend verification.");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6">
      <Card className="w-full max-w-[520px] rounded-[16px] p-8 text-center md:p-10">
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
            <MailCheck className="mx-auto h-16 w-16 text-[var(--gold)]" />
            <h1 className="mt-6 text-4xl font-black">Verify Your Email</h1>
            <p className="mt-3 text-slate-300">{demoAuthEnabled ? "A verification code was sent to" : "A Firebase verification link was sent to"} <b className="text-white">{email}</b>.</p>
            <form className="mt-8 space-y-5 text-left" onSubmit={verify}>
              {demoAuthEnabled ? <Field label="Verification Code"><input className={`${inputClass} text-center text-xl tracking-[.35em]`} value={code} onChange={(event) => setCode(event.target.value)} maxLength={6} placeholder="246810" /></Field> : <p className="rounded-[8px] border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-slate-200">Open the verification link in your email. After verifying, return to sign in.</p>}
              {error ? <p className="rounded-[8px] bg-red-950/50 p-3 text-sm text-red-200">{error}</p> : null}
              {notice ? <p className="rounded-[8px] bg-emerald-950/40 p-3 text-sm text-emerald-200">{notice}</p> : null}
              <Button className="w-full">{demoAuthEnabled ? "Verify" : "I Verified My Email"}</Button>
            </form>
            <div className="mt-6 flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <button onClick={resend} disabled={seconds > 0} className="font-bold text-[var(--gold)] disabled:text-slate-500">
                {seconds > 0 ? `Resend code in ${seconds}s` : "Resend code"}
              </button>
              <Link href="/auth/register" className="font-bold text-[var(--gold)]">Go back and change email</Link>
            </div>
          </>
        )}
      </Card>
    </main>
  );
}
