"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { AccountResolutionState } from "@/components/account-resolution-state";
import { getAccountRouteRedirect, isRestrictedAccount } from "@/lib/account-routing";
import { Button, Card, LinkButton } from "@/components/ui";
import { logout } from "@/lib/firebase/auth-service";

export function AccountRouteGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const target = auth.profile ? getAccountRouteRedirect(auth.profile, pathname, search.toString()) : "";
  useEffect(() => { if (target && target !== pathname) router.replace(target); }, [pathname, router, target]);
  if (target && target !== pathname) return <AccountResolutionState />;
  if (auth.profile && isRestrictedAccount(auth.profile)) return <main className="theme-workspace grid min-h-screen place-items-center bg-[var(--background)] px-5"><Card className="max-w-lg p-7 text-center"><h1 className="text-2xl font-black">Account access restricted</h1><p className="mt-3 text-sm text-[var(--muted)]">Your account cannot open this workspace. Contact support to review your access.</p><div className="mt-6 flex justify-center gap-3"><LinkButton href="/contact">Contact Support</LinkButton><Button variant="secondary" onClick={() => void logout()}>Sign out</Button></div></Card></main>;
  return children;
}
