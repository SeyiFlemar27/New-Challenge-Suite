"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { legalDocuments } from "@/lib/legal";
import { BrandLogo } from "@/components/brand";
import { signUpWithProfile } from "@/lib/firebase/auth-service";
import { LanguageSelector } from "@/components/i18n/language-selector";
import { useLanguage } from "@/lib/i18n/use-language";

function safeInternalPath(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.includes("://") ? value : "";
}

function requestedReturnPath() {
  if (typeof window === "undefined") return "";
  return safeInternalPath(new URLSearchParams(window.location.search).get("next"));
}

export default function RegisterPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [accepted, setAccepted] = useState({ terms: false, privacy: false, community: false });
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "", confirmPassword: "", referralCode: typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("ref") ?? "" });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  }

  function validate() {
    const next: Record<string, string> = {};
    if (!form.firstName.trim()) next.firstName = "First name is required.";
    if (!form.lastName.trim()) next.lastName = "Last name is required.";
    if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = "Enter a valid email address.";
    if (form.password.length < 8 || !/[A-Z]/.test(form.password) || !/[0-9]/.test(form.password)) {
      next.password = "Use at least 8 characters with a number and uppercase letter.";
    }
    if (form.confirmPassword !== form.password) next.confirmPassword = "Passwords do not match.";
    if (!accepted.terms || !accepted.privacy || !accepted.community) next.agreements = "Accept all account agreements to continue.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const result = await signUpWithProfile({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        password: form.password,
        role: "user",
        referralCode: form.referralCode.trim() || undefined
      });
      localStorage.setItem("challenge_suite_signup_email", form.email);
      localStorage.setItem("challenge_suite_auth_mode", result.mode);
      const returnPath = requestedReturnPath();
      router.push(returnPath ? `/auth/verify-email?returnUrl=${encodeURIComponent(returnPath)}` : "/auth/verify-email");
    } catch (error) {
      setErrors({ submit: error instanceof Error ? error.message : "Could not create account." });
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-black px-5 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-20">
      <Card className="w-full max-w-[600px] rounded-[12px] p-6 sm:p-8 lg:p-10">
        <div className="mb-7 flex items-center justify-between gap-4"><span className="w-28" /><BrandLogo imageClassName="h-20 w-20 border-2 border-[var(--gold)] gold-glow sm:h-24 sm:w-24" /><div className="flex w-28 justify-end"><LanguageSelector compact /></div></div>
        <h1 className="text-center text-3xl font-black leading-tight sm:text-4xl">{t("createAccount")}</h1>
        <p className="mx-auto mt-3 max-w-md text-center text-base leading-7 text-slate-300 sm:text-lg">Join the Challenge Suite community today</p>
        <form className="mt-8 space-y-6" onSubmit={submit}>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="First Name"><input className={inputClass} value={form.firstName} onChange={(event) => update("firstName", event.target.value)} placeholder="First name" /></Field>
            <Field label="Last Name"><input className={inputClass} value={form.lastName} onChange={(event) => update("lastName", event.target.value)} placeholder="Last name" /></Field>
          </div>
          <Field label="Email Address"><input className={inputClass} value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="name@example.com" type="email" /></Field>
          <Field label="Referral code (optional)"><input className={inputClass} value={form.referralCode} onChange={(event) => update("referralCode", event.target.value)} placeholder="Referral code" autoComplete="off" /></Field>
          <Card className="border-[var(--gold)]/20 bg-[var(--gold)]/5 p-4 text-sm leading-6 text-slate-300">After email verification, you will choose whether this account is for competing, creating, hosting, or sponsoring.</Card>
          <PasswordField label="Password" shown={showPassword} onToggle={() => setShowPassword((value) => !value)} value={form.password} onChange={(value) => update("password", value)} />
          <PasswordField label="Confirm Password" shown={showConfirmPassword} onToggle={() => setShowConfirmPassword((value) => !value)} value={form.confirmPassword} onChange={(value) => update("confirmPassword", value)} />
          {Object.values(errors).filter(Boolean).map((error) => <p key={error} className="rounded-[8px] bg-red-950/50 p-3 text-sm text-red-200">{error}</p>)}
          <Agreement checked={accepted.terms} onChange={(terms) => setAccepted((current) => ({ ...current, terms }))} text="I accept the Terms of Service" />
          <Agreement checked={accepted.privacy} onChange={(privacy) => setAccepted((current) => ({ ...current, privacy }))} text="I accept the Privacy Policy" />
          <Agreement checked={accepted.community} onChange={(community) => setAccepted((current) => ({ ...current, community }))} text="I accept the Community Guidelines" />
          <p className="rounded-[8px] border border-yellow-500/20 bg-yellow-500/5 p-3 text-xs text-slate-300">{legalDocuments.master_account.body}</p>
          <Button className="mt-3 w-full" disabled={loading}>{loading ? "Creating account..." : t("signUp")}</Button>
        </form>
        <div className="mt-8 border-t border-white/10 pt-6 text-center text-slate-300">Already have an account? <Link href="/auth/login" className="font-bold text-[var(--gold)]">Sign In</Link></div>
      </Card>
    </main>
  );
}

function Agreement({ checked, onChange, text }: { checked: boolean; onChange: (checked: boolean) => void; text: string }) {
  return <label className="flex items-start gap-3 rounded-[8px] border border-white/10 p-3 font-bold"><input className="mt-1 h-4 w-4 shrink-0 accent-[var(--gold)]" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /> <span className="leading-6">{text}</span></label>;
}

function PasswordField({ label, shown, onToggle, value, onChange }: { label: string; shown: boolean; onToggle: () => void; value: string; onChange: (value: string) => void }) {
  const Icon = shown ? EyeOff : Eye;
  return (
    <Field label={label}>
      <div className="relative">
        <input className={`${inputClass} pr-12`} placeholder="Password" type={shown ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} />
        <button type="button" onClick={onToggle} aria-label={shown ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300">
          <Icon size={18} />
        </button>
      </div>
    </Field>
  );
}

