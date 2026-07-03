"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { BrandLogo } from "@/components/brand";
import { sendResetEmail } from "@/lib/firebase/auth-service";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setMessage("Enter a valid email address.");
      return;
    }
    await sendResetEmail(email).catch(() => null);
    setMessage("If an account exists for this email, a reset link has been sent.");
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-black px-5 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-20">
      <Card className="w-full max-w-md p-6 sm:p-8 lg:p-10">
        <BrandLogo className="mb-7" imageClassName="h-16 w-16 border-2 border-[var(--gold)] gold-glow sm:h-20 sm:w-20" />
        <h1 className="text-3xl font-black leading-tight sm:text-4xl">Reset Password</h1>
        <p className="mt-3 leading-7 text-slate-300">Enter your email to receive a reset link.</p>
        <form className="mt-8 space-y-6" onSubmit={submit}>
          <Field label="Email"><input className={inputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
          {message ? <p className="rounded-[8px] bg-[#181818] p-3 text-sm text-slate-200">{message}</p> : null}
          <Button className="w-full">Send Reset Link</Button>
        </form>
        <Link href="/auth/login" className="mt-6 block text-center text-sm font-bold text-[var(--gold)]">Back to sign in</Link>
      </Card>
    </main>
  );
}
