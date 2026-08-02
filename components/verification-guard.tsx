"use client";

import { usePathname } from "next/navigation";
import { Card, LinkButton } from "@/components/ui";
import { BrandLogo } from "@/components/brand";
import { useAuth } from "@/components/auth-provider";

const publicPrefixes = ["/auth", "/categories", "/mobile-preview"];
const publicRoutes = new Set([
  "/",
  "/landing",
  "/explore",
  "/for-talent",
  "/subscriptions",
  "/challenges",
  "/leaderboards",
  "/privacy",
  "/terms",
  "/community-guidelines",
  "/refund-policy",
  "/cookie-policy",
  "/contact",
  "/about"
]);

function isPublicRoute(pathname: string) {
  if (publicRoutes.has(pathname)) return true;
  if (publicPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return true;
  return /^\/challenges\/[^/]+$/.test(pathname);
}

export function VerificationGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { loading, firebaseConfigured, user, verified } = useAuth();
  const publicPage = isPublicRoute(pathname);

  if (publicPage || !firebaseConfigured) return <>{children}</>;
  if (loading) return <LoadingGate />;
  if (!user) return <Gate title="Sign in required" body="Please sign in before continuing into Challenge Suite." actionHref={`/auth/login?next=${encodeURIComponent(pathname)}`} actionLabel="Sign In" />;
  if (!verified) return <Gate title="Check your email" body="Enter the 6-digit code we sent to continue into Challenge Suite." actionHref="/auth/verify-email" actionLabel="Enter Code" />;
  return <>{children}</>;
}

function LoadingGate() {
  return (
    <main className="theme-workspace flex min-h-screen items-center justify-center bg-[var(--background)] px-6 text-[var(--foreground)]">
      <Card className="w-full max-w-md p-8 text-center">
        <BrandLogo className="mb-5" imageClassName="h-20 w-20 border-2 border-[var(--gold)] gold-glow" />
        <h1 className="text-2xl font-black">Restoring your session...</h1>
      </Card>
    </main>
  );
}

function Gate({ title, body, actionHref, actionLabel }: { title: string; body: string; actionHref: string; actionLabel: string }) {
  return (
    <main className="theme-workspace flex min-h-screen items-center justify-center bg-[var(--background)] px-6 text-[var(--foreground)]">
      <Card className="w-full max-w-md p-8 text-center">
        <BrandLogo className="mb-5" imageClassName="h-20 w-20 border-2 border-[var(--gold)] gold-glow" />
        <h1 className="text-3xl font-black">{title}</h1>
        <p className="mt-3 text-slate-300">{body}</p>
        <LinkButton href={actionHref} className="mt-8 w-full">{actionLabel}</LinkButton>
      </Card>
    </main>
  );
}
