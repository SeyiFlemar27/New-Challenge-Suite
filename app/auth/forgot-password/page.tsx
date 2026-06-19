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
    <main className="flex min-h-screen items-center justify-center bg-black px-6">
      <Card className="w-full max-w-md p-10">
        <BrandLogo className="mb-6" imageClassName="h-20 w-20 border-2 border-[var(--gold)] gold-glow" />
        <h1 className="text-3xl font-black">Reset Password</h1>
        <p className="mt-3 text-slate-300">Enter your email to receive a reset link.</p>
        <form className="mt-8 space-y-5" onSubmit={submit}>
          <Field label="Email"><input className={inputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
          {message ? <p className="rounded-[8px] bg-[#181818] p-3 text-sm text-slate-200">{message}</p> : null}
          <Button className="w-full">Send Reset Link</Button>
        </form>
        <Link href="/auth/login" className="mt-6 block text-center text-sm font-bold text-[var(--gold)]">Back to sign in</Link>
      </Card>
    </main>
  );
}
