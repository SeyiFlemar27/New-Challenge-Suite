"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

function safeInternalPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("://")) return "";
  return value;
}

export default function SignInAliasPage() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = safeInternalPath(params.get("next"));
    router.replace(next ? `/auth/login?next=${encodeURIComponent(next)}` : "/auth/login");
  }, [router]);

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-black px-5 text-white">
      <p className="text-sm font-bold text-slate-300">Opening sign in...</p>
    </main>
  );
}