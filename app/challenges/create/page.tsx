"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card, LinkButton } from "@/components/ui";
import { createChallengeDraft } from "@/lib/api/services";
import { useCurrentUser } from "@/lib/hooks/use-current-user";

export default function CreateChallengePage() {
  const router = useRouter();
  const { user, loading } = useCurrentUser();
  const [error, setError] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/auth/login?next=/challenges/create");
      return;
    }
    let cancelled = false;
    void createChallengeDraft().then((result) => {
      if (cancelled) return;
      const id = result.data?.challenge?.id;
      if (result.ok && id) router.replace(`/challenges/create/${id}`);
      else setError(result.message || "Challenge draft could not be created.");
    });
    return () => { cancelled = true; };
  }, [loading, router, user]);

  return (
    <AppShell>
      <Card className="mx-auto max-w-2xl p-8">
        <h1 className="text-3xl font-black text-[var(--gold)]">Create Challenge</h1>
        <p className="mt-3 text-slate-300">Preparing your draft...</p>
        {error ? <><p className="mt-4 rounded-[8px] bg-red-950/40 p-4 text-sm text-red-200">{error}</p><LinkButton href="/challenges" className="mt-5">Back to Challenges</LinkButton></> : null}
      </Card>
    </AppShell>
  );
}
