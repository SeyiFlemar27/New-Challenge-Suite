"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { BrandLogo } from "@/components/brand";
import { fetchBootstrapProfile } from "@/lib/api/services";
import { getAuthenticatedDestination } from "@/lib/account-routing";
import { loginWithEmail, loginWithGoogle, logout } from "@/lib/firebase/auth-service";
import { useLanguage } from "@/lib/i18n/use-language";
import { useAuth } from "@/components/auth-provider";

const googleAuthEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";

function safeInternalPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("://")) return "";
  return value;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const authState = useAuth();
  const [form, setForm] = useState({ email: "", password: "", rememberMe: false });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [redirectError, setRedirectError] = useState("");
  const [loading, setLoading] = useState(false);
  const routedUserId = useRef("");
  const interactiveLoginInProgress = useRef(false);
  const nextPath = safeInternalPath(searchParams.get("next") ?? searchParams.get("returnTo"));

  const routeAfterLogin = useCallback(async (resolvedProfile?: object | null) => {
    let profile = resolvedProfile;
    if (!profile) {
      const response = await fetchBootstrapProfile();
      if (!response.ok || !response.data?.user) {
        throw new Error(response.message || "Profile could not be loaded.");
      }
      profile = response.data.user;
    }
    router.replace(getAuthenticatedDestination(profile, nextPath));
  }, [nextPath, router]);

  useEffect(() => {
    const uid = authState.user?.uid;
    if (authState.loading) return;
    if (interactiveLoginInProgress.current) return;
    if (!uid) {
      routedUserId.current = "";
      return;
    }
    if (routedUserId.current === uid) return;
    routedUserId.current = uid;
    let active = true;
    void routeAfterLogin(authState.profile).catch((caught: unknown) => {
      if (!active) return;
      routedUserId.current = "";
      setRedirectError(caught instanceof Error ? caught.message : "Your workspace could not be opened.");
    });
    return () => { active = false; };
  }, [authState.loading, authState.profile, authState.user?.uid, routeAfterLogin]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(form.email)) {
      setError(t("Enter a valid email address."));
      return;
    }
    if (!form.password) {
      setError(t("Password is required."));
      return;
    }
    setError("");
    setLoading(true);
    interactiveLoginInProgress.current = true;
    try {
      const result = await loginWithEmail(form.email, form.password, form.rememberMe);
      const destination = nextPath;
      if (result.mode === "firebase" && !result.emailVerified) {
        localStorage.setItem("challenge_suite_signup_email", form.email);
        router.push(destination ? `/auth/verify-email?returnUrl=${encodeURIComponent(destination)}` : "/auth/verify-email");
        return;
      }
      routedUserId.current = result.user.uid;
      try {
        await routeAfterLogin(result.profile);
      } catch (caught) {
        interactiveLoginInProgress.current = false;
        routedUserId.current = "";
        setRedirectError(caught instanceof Error ? caught.message : "Your workspace could not be opened.");
        setLoading(false);
      }
    } catch (error) {
      interactiveLoginInProgress.current = false;
      setError(error instanceof Error ? error.message : "Could not sign in.");
      setLoading(false);
    }
  }

  async function googleSignIn() {
    setError("");
    setLoading(true);
    interactiveLoginInProgress.current = true;
    try {
      const result = await loginWithGoogle(form.rememberMe);
      routedUserId.current = result.user.uid;
      try {
        await routeAfterLogin();
      } catch (caught) {
        setRedirectError(caught instanceof Error ? caught.message : "Your workspace could not be opened.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign in with Google.");
    } finally {
      interactiveLoginInProgress.current = false;
      setLoading(false);
    }
  }

  if ((authState.loading || authState.user) && !redirectError) return null;

  if (authState.user && redirectError) {
    return (
        <main className="auth-shell theme-workspace flex min-h-[100dvh] items-center justify-center bg-[var(--background)] px-5 py-10 text-[var(--foreground)] sm:px-6 sm:py-14 lg:px-8 lg:py-20">
        <Card className="w-full max-w-[480px] rounded-[12px] p-6 text-center sm:p-9">
          <BrandLogo className="mb-7" imageClassName="h-20 w-20 border-2 border-[var(--gold)] gold-glow" />
          <h1 className="text-2xl font-black">We couldn&apos;t open your workspace</h1>
          <p role="alert" className="mt-3 text-sm leading-6 text-red-700">{redirectError}</p>
          <div className="mt-7 grid gap-3"><Button onClick={() => { setRedirectError(""); void routeAfterLogin(authState.profile).catch((caught: unknown) => setRedirectError(caught instanceof Error ? caught.message : "Your workspace could not be opened.")); }}>Try again</Button><Button variant="secondary" onClick={() => void logout()}>Sign out to switch account</Button></div>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-black px-5 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-20">
      <Card className="w-full max-w-[450px] rounded-[12px] p-6 sm:p-8 lg:p-10">
        <div className="mb-7 flex justify-center"><BrandLogo imageClassName="h-20 w-20 border-2 border-[var(--gold)] gold-glow sm:h-24 sm:w-24" /></div>
        <h1 className="text-center text-3xl font-black leading-tight sm:text-4xl">{t(nextPath ? "Sign in to continue" : "Sign In")}</h1>
        <p className="mx-auto mt-3 max-w-sm text-center text-base leading-7 text-slate-300 sm:text-lg">{t(nextPath ? "Continue to Challenge Suite." : "Welcome back to Challenge Suite")}</p>
        <form className="mt-8 space-y-6 sm:mt-10" onSubmit={submit}>
          <Field label={t("Email Address")}><input className={inputClass} value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="name@example.com" type="email" /></Field>
          <Field label={t("Password")}>
            <div className="relative">
              <input className={`${inputClass} pr-12`} value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} placeholder="Password" type={showPassword ? "text" : "password"} />
              <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300" aria-label={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </Field>
          <label className="flex min-h-11 items-center gap-3 text-sm font-bold text-slate-300"><input type="checkbox" checked={form.rememberMe} onChange={(event) => setForm((current) => ({ ...current, rememberMe: event.target.checked }))} className="h-4 w-4 accent-[var(--gold)]" /> Remember me on this device</label>
          {error ? <p className="rounded-[8px] bg-red-950/50 p-3 text-sm text-red-200">{error}</p> : null}
          <Button className="w-full" disabled={loading}>{t(loading ? "Signing in..." : "Sign In")}</Button>
        </form>
        {googleAuthEnabled ? <Button type="button" variant="secondary" className="mt-4 w-full" disabled={loading} onClick={() => void googleSignIn()}>{t("Continue with Google")}</Button> : null}
        <div className="mt-8 flex flex-col items-center justify-center gap-3 text-center text-sm sm:flex-row sm:justify-between">
          <Link href="/auth/forgot-password" className="text-[var(--gold)]">{t("Forgot password?")}</Link>
          <Link href="/auth/register" className="font-bold text-[var(--gold)]">{t("Create account")}</Link>
        </div>
      </Card>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<main className="flex min-h-[100dvh] items-center justify-center bg-black px-5 text-sm text-slate-300">Loading sign-in…</main>}><LoginForm /></Suspense>;
}
