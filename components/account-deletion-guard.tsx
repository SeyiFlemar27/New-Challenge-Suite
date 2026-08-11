"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

const pending = new Set(["deletion_requested", "deactivated", "scheduled_for_deletion", "auth_release_pending", "auth_release_failed", "finalization_failed"]);

export function AccountDeletionGuard({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const restricted = pending.has(String(profile?.accountStatus ?? profile?.deletionStatus ?? ""));
  useEffect(() => {
    if (!loading && restricted && pathname !== "/account/deletion-status") router.replace("/account/deletion-status");
  }, [loading, pathname, restricted, router]);
  if (!loading && restricted && pathname !== "/account/deletion-status") return null;
  return children;
}
