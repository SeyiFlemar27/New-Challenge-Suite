"use client";

import { BrandLogo } from "@/components/brand";
import { Button, Card } from "@/components/ui";
import { logout } from "@/lib/firebase/auth-service";

export function AccountResolutionState({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  return <main className="theme-workspace grid min-h-[100dvh] place-items-center bg-[var(--background)] px-5 text-[var(--foreground)]" data-account-resolution>
    <Card className="w-full max-w-md p-7 text-center">
      <BrandLogo className="mb-5" imageClassName="h-14 w-14" />
      <h1 className="text-xl font-black">{error ? "We couldn’t confirm your account" : "Preparing your workspace"}</h1>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]" role={error ? "alert" : "status"}>{error || "Checking your account and access…"}</p>
      {error && onRetry ? <div className="mt-5 flex justify-center gap-3"><Button onClick={onRetry}>Try again</Button><Button variant="secondary" onClick={() => void logout()}>Sign out</Button></div> : null}
    </Card>
  </main>;
}
