"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { BrandLogo } from "@/components/brand";
import { fetchBootstrapProfile } from "@/lib/api/services";
import { getDefaultRouteForAccount } from "@/lib/account-routing";
import { loginWithEmail, logout } from "@/lib/firebase/auth-service";
import { useLanguage } from "@/lib/i18n/use-language";
import { useAuth } from "@/components/auth-provider";

function safeInternalPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("://")) return "";
  return value;
}

function getNextPath() {
  if (typeof window === "undefined") return "";
  return safeInternalPath(new URLSearchParams(window.location.search).get("next"));
}

export default function LoginPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const authState = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [nextPath, setNextPath] = useState("");

  useEffect(() => {
    setNextPath(getNextPath());
  }, []);

  async function routeAfterLogin() {
    const profile = await fetchBootstrapProfile();
    if (!profile.ok || !profile.data?.user) {
      throw new Error(profile.message || "Profile could not be loaded.");
    }
    const destination = getNextPath() || getDefaultRouteForAccount(profile.data.user);
    router.replace(destination);
  }

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
    try {
      const result = await loginWithEmail(form.email, form.password);
      const destination = getNextPath();
      if (result.mode === "firebase" && !result.emailVerified) {
        localStorage.setItem("challenge_suite_signup_email", form.email);
        router.push(destination ? `/auth/verify-email?returnUrl=${encodeURIComponent(destination)}` : "/auth/verify-email");
        return;
      }
      await routeAfterLogin();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not sign in.");
      setLoading(false);
    }
  }

  if (!authState.loading && authState.user) {
    const identity = authState.profile?.displayName || authState.user.displayName || authState.user.email || "Account";
    const accountProfile = (authState.profile ?? {}) as unknown as Record<string, unknown>;
    const destination = nextPath || (authState.profile?.isAdmin ? "/dashboard" : getDefaultRouteForAccount(accountProfile));
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-black px-5 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-20">
        <Card className="w-full max-w-[480px] rounded-[12px] p-6 text-center sm:p-9">
          <BrandLogo className="mb-7" imageClassName="h-20 w-20 border-2 border-[var(--gold)] gold-glow" />
          <p className="text-xs font-black uppercase text-[var(--gold)]">Already signed in</p>
          <h1 className="mt-3 break-words text-3xl font-black">{identity}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">Continue with this account or sign out to use a different one.</p>
          <Button className="mt-7 w-full" onClick={() => router.replace(destination)}>Continue to dashboard</Button>
          <Button className="mt-3 w-full" variant="secondary" onClick={() => void logout().then(() => window.location.reload())}>Switch account / Sign out</Button>
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
          {error ? <p className="rounded-[8px] bg-red-950/50 p-3 text-sm text-red-200">{error}</p> : null}
          <Button className="w-full" disabled={loading}>{t(loading ? "Signing in..." : "Sign In")}</Button>
        </form>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 text-center text-sm sm:flex-row sm:justify-between">
          <Link href="/auth/forgot-password" className="text-[var(--gold)]">{t("Forgot password?")}</Link>
          <Link href="/auth/register" className="font-bold text-[var(--gold)]">{t("Create account")}</Link>
        </div>
      </Card>
    </main>
  );
}
