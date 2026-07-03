"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { BrandLogo } from "@/components/brand";
import { fetchBootstrapProfile } from "@/lib/api/services";
import { getDefaultRouteForAccount } from "@/lib/account-routing";
import { loginWithEmail } from "@/lib/firebase/auth-service";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function routeAfterLogin() {
    const profile = await fetchBootstrapProfile();
    if (!profile.ok || !profile.data?.user) {
      throw new Error(profile.message || "Profile could not be loaded.");
    }
    router.push(getDefaultRouteForAccount(profile.data.user));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(form.email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!form.password) {
      setError("Password is required.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const result = await loginWithEmail(form.email, form.password);
      if (result.mode === "firebase" && !result.emailVerified) {
        localStorage.setItem("challenge_suite_signup_email", form.email);
        router.push("/auth/verify-email");
        return;
      }
      await routeAfterLogin();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not sign in.");
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-black px-5 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-20">
      <Card className="w-full max-w-[450px] rounded-[12px] p-6 sm:p-8 lg:p-10">
        <BrandLogo className="mb-7" imageClassName="h-20 w-20 border-2 border-[var(--gold)] gold-glow sm:h-24 sm:w-24" />
        <h1 className="text-center text-3xl font-black leading-tight sm:text-4xl">Sign In</h1>
        <p className="mx-auto mt-3 max-w-sm text-center text-base leading-7 text-slate-300 sm:text-lg">Welcome back to Challenge Suite</p>
        <form className="mt-8 space-y-6 sm:mt-10" onSubmit={submit}>
          <Field label="Email Address"><input className={inputClass} value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="name@example.com" type="email" /></Field>
          <Field label="Password">
            <div className="relative">
              <input className={`${inputClass} pr-12`} value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} placeholder="Password" type={showPassword ? "text" : "password"} />
              <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300" aria-label={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </Field>
          {error ? <p className="rounded-[8px] bg-red-950/50 p-3 text-sm text-red-200">{error}</p> : null}
          <Button className="w-full" disabled={loading}>{loading ? "Signing in..." : "Sign In"}</Button>
        </form>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 text-center text-sm sm:flex-row sm:justify-between">
          <Link href="/auth/forgot-password" className="text-[var(--gold)]">Forgot password?</Link>
          <Link href="/auth/register" className="font-bold text-[var(--gold)]">Create account</Link>
        </div>
      </Card>
    </main>
  );
}
