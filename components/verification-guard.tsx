"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AccountResolutionState } from "@/components/account-resolution-state";
import { AccountRouteGate } from "@/components/account-route-gate";
import { Card, LinkButton } from "@/components/ui";
import { BrandLogo } from "@/components/brand";
import { useAuth } from "@/components/auth-provider";
import { isPublicTournamentRoute } from "@/lib/tournament-public-route-policy";
import { isPublicLiveEventRoute } from "@/lib/live-event-public-route-policy";
import { safeInternalDestination } from "@/lib/account-routing";

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
  if (/^\/private\/preview\/[^/]+$/.test(pathname)) return true;
  if (isPublicLiveEventRoute(pathname)) return true;
  if (isPublicTournamentRoute(pathname)) return true;
  if (publicRoutes.has(pathname)) return true;
  if (publicPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return true;
  return /^\/challenges\/[^/]+$/.test(pathname);
}

export function VerificationGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { loading, error, refreshProfile, firebaseConfigured, user, verified } = useAuth();
  const publicPage = isPublicRoute(pathname);

  if (publicPage || !firebaseConfigured) return <>{children}</>;
  if (loading) return <AccountResolutionState />;
  if (error) return <AccountResolutionState error={error} onRetry={() => void refreshProfile()} />;
  if (!user || !verified) return <Suspense fallback={<AccountResolutionState />}><AuthenticationGate pathname={pathname} verification={Boolean(user)} /></Suspense>;
  return <Suspense fallback={<AccountResolutionState />}><AccountRouteGate>{children}</AccountRouteGate></Suspense>;
}

function AuthenticationGate({ pathname, verification }: { pathname: string; verification: boolean }) {
  const search = useSearchParams().toString();
  const destination = safeInternalDestination(pathname + (search ? `?${search}` : "")) || "/dashboard";
  return verification
    ? <Gate title="Check your email" body="Enter the 6-digit code we sent to continue into Challenge Suite." actionHref={`/auth/verify-email?returnUrl=${encodeURIComponent(destination)}`} actionLabel="Enter Code" />
    : <Gate title="Sign in required" body="Please sign in before continuing into Challenge Suite." actionHref={`/auth/login?next=${encodeURIComponent(destination)}`} actionLabel="Sign In" />;
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
