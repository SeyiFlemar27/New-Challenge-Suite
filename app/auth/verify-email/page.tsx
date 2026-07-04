"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { BrandLogo } from "@/components/brand";
import { useAuth } from "@/components/auth-provider";
import { fetchBootstrapProfile, requestEmailVerificationCode, verifyEmailCode } from "@/lib/api/services";
import { getDefaultRouteForAccount } from "@/lib/account-routing";
import { auth } from "@/lib/firebase/client";

const RESEND_SECONDS = 60;

function getSafeReturnUrl() {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("returnUrl");
  return value && value.startsWith("/") && !value.startsWith("//") ? value : null;
}

async function getVerifiedDestination() {
  const explicitReturnUrl = getSafeReturnUrl();
  if (explicitReturnUrl) return explicitReturnUrl;
  const profile = await fetchBootstrapProfile();
  if (!profile.ok || !profile.data?.user) return "/dashboard";
  return getDefaultRouteForAccount(profile.data.user);
}

export default function VerifyEmailPage() {
  const router = useRouter();
  const authState = useAuth();
  const requestedInitialCode = useRef(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [verified, setVerified] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const maskedEmail = useMemo(() => email || "your email", [email]);

  useEffect(() => {
    const storedEmail = localStorage.getItem("challenge_suite_signup_email") || auth?.currentUser?.email || "";
    setEmail(storedEmail);
  }, []);

  useEffect(() => {
    if (authState.loading) return;
    if (authState.verified) {
      setVerified(true);
      setRedirecting(true);
      const timer = window.setTimeout(() => {
        void getVerifiedDestination().then((destination) => router.replace(destination));
      }, 900);
      return () => window.clearTimeout(timer);
    }
    if (!authState.user || requestedInitialCode.current) return;
    requestedInitialCode.current = true;
    void requestCode(false);
  }, [authState.loading, authState.user, authState.verified, router]);

  useEffect(() => {
    if (verified || seconds <= 0) return;
    const timer = window.setTimeout(() => setSeconds((value) => Math.max(value - 1, 0)), 1000);
    return () => window.clearTimeout(timer);
  }, [seconds, verified]);

  async function requestCode(showSuccess = true) {
    if (verified || redirecting) return;
    setRequesting(true);
    setError("");
    setNotice("");
    const result = await requestEmailVerificationCode();
    setRequesting(false);

    if (!result.ok || !result.data) {
      const retryAfter = (result as any).details?.retryAfterSeconds;
      if (typeof retryAfter === "number") setSeconds(retryAfter);
      setError(result.message || "We couldn't send a code right now. Please try again.");
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

    if (!result.ok) {
      setVerifying(false);
      if ((result as any).code === "OTP_EXPIRED") {
        setError("Your code has expired. Request a new one.");
      } else if ((result as any).code === "OTP_INVALID") {
        setError("That code is not correct. Please try again.");
      } else {
        setError(result.message || "We couldn't verify that code. Please try again.");
      }
      return;
    }

    await auth?.currentUser?.reload().catch(() => undefined);
    await auth?.currentUser?.getIdToken(true).catch(() => undefined);
    window.dispatchEvent(new Event("challenge-suite-profile-updated"));
    await authState.refreshProfile().catch(() => null);
    const destination = await getVerifiedDestination();
    localStorage.removeItem("challenge_suite_signup_email");
    setVerified(true);
    setRedirecting(true);
    setVerifying(false);
    setNotice("Email verified successfully. Redirecting...");
    window.setTimeout(() => router.replace(destination), 900);
  }

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-black px-5 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-20">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[linear-gradient(180deg,rgba(245,217,10,.09),transparent)]" />
      <Card className="relative w-full max-w-[560px] rounded-[8px] border-[var(--gold)]/20 p-6 text-center shadow-2xl sm:p-9 lg:p-12">
        <BrandLogo className="mb-7" imageClassName="h-14 w-14 border border-[var(--gold)] sm:h-16 sm:w-16" />
        {verified ? (
          <div className="py-6">
            <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-400" />
            <p className="mt-7 text-xs font-black uppercase text-[var(--gold)]">Identity confirmed</p>
            <h1 className="mt-3 text-3xl font-black sm:text-4xl">Email verified</h1>
            <p className="mt-4 text-slate-300">Your Challenge Suite account is ready. We are opening your workspace now.</p>
            <Button className="mt-8 w-full" onClick={() => void getVerifiedDestination().then((destination) => router.replace(destination))}>Continue</Button>
          </div>
        ) : (
          <>
            <p className="text-xs font-black uppercase text-[var(--gold)]">Secure account setup</p>
            <h1 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">Verify your email</h1>
            <p className="mx-auto mt-4 max-w-md leading-7 text-slate-300">Enter the 6-digit code sent to <b className="text-white">{maskedEmail}</b>. The code expires in 10 minutes.</p>
            <form className="mt-8 space-y-5 text-left" onSubmit={verify}>
              <Field label="Verification Code">
                <input
                  className={`${inputClass} h-14 text-center text-xl font-black tracking-[.3em] sm:text-2xl sm:tracking-[.45em]`}
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
              <Button className="w-full" disabled={verifying || redirecting}>{verifying ? "Checking code..." : "Verify Code"}</Button>
            </form>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Button type="button" variant="secondary" onClick={() => requestCode(true)} disabled={requesting || seconds > 0 || redirecting}>
                {requesting ? "Sending..." : seconds > 0 ? `Resend in ${seconds}s` : "Resend Code"}
              </Button>
              <Link href="/auth/register" className="inline-flex h-11 items-center justify-center rounded-[8px] border border-white/10 bg-[#1d1d1d] px-5 text-sm font-bold text-white transition hover:bg-[#242424]">Change Email</Link>
            </div>
            <div className="mt-7 flex items-center justify-center gap-2 border-t border-white/10 pt-6 text-xs font-bold text-slate-500">
              <ShieldCheck size={14} /> Didn't receive it? Check spam or request a new code.
            </div>
          </>
        )}
      </Card>
    </main>
  );
}
