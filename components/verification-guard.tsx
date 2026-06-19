"use client";

import { usePathname } from "next/navigation";
import { Card, LinkButton } from "@/components/ui";
import { BrandLogo } from "@/components/brand";
import { useAuth } from "@/components/auth-provider";

const publicPrefixes = ["/landing", "/auth"];

export function VerificationGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { loading, firebaseConfigured, user, verified } = useAuth();
  const publicPage = publicPrefixes.some((prefix) => pathname.startsWith(prefix)) || pathname === "/";

  if (publicPage || !firebaseConfigured) return <>{children}</>;
  if (loading) return <LoadingGate />;
  if (!user) return <Gate title="Sign in required" body="Please sign in before continuing into Challenge Suite." actionHref="/auth/login" actionLabel="Sign In" />;
  if (!verified) return <Gate title="Verify your email" body="You need to verify your email before continuing with the app." actionHref="/auth/verify-email" actionLabel="Verify Email" />;
  return <>{children}</>;
}

function LoadingGate() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6">
      <Card className="w-full max-w-md p-8 text-center">
        <BrandLogo className="mb-5" imageClassName="h-20 w-20 border-2 border-[var(--gold)] gold-glow" />
        <h1 className="text-2xl font-black">Checking account status...</h1>
      </Card>
    </main>
  );
}

function Gate({ title, body, actionHref, actionLabel }: { title: string; body: string; actionHref: string; actionLabel: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6">
      <Card className="w-full max-w-md p-8 text-center">
        <BrandLogo className="mb-5" imageClassName="h-20 w-20 border-2 border-[var(--gold)] gold-glow" />
        <h1 className="text-3xl font-black">{title}</h1>
        <p className="mt-3 text-slate-300">{body}</p>
        <LinkButton href={actionHref} className="mt-8 w-full">{actionLabel}</LinkButton>
      </Card>
    </main>
  );
}
