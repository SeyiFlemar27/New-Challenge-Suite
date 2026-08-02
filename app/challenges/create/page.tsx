"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card, LinkButton } from "@/components/ui";
import { useAuth } from "@/components/auth-provider";
import { createChallengeDraft } from "@/lib/api/services";
import { auth as firebaseAuth } from "@/lib/firebase/client";

const createChallengePath = "/challenges/create";

function currentCreatePath() {
  if (typeof window === "undefined") return createChallengePath;
  return window.location.pathname === createChallengePath ? `${createChallengePath}${window.location.search}` : createChallengePath;
}

function loginContinuationPath() {
  return `/auth/login?next=${encodeURIComponent(currentCreatePath())}`;
}

export default function CreateChallengePage() {
  const router = useRouter();
  const authState = useAuth();
  const [error, setError] = useState("");
  const creatingDraftRef = useRef(false);

  useEffect(() => {
    if (authState.loading) return;
    const activeUser = authState.user ?? firebaseAuth?.currentUser ?? null;
    if (!activeUser) {
      router.replace(loginContinuationPath());
      return;
    }
    if (creatingDraftRef.current) return;

    creatingDraftRef.current = true;
    let cancelled = false;

    void createChallengeDraft().then((result) => {
      if (cancelled) return;
      const id = result.data?.challenge?.id;
      if (result.ok && id) {
        const calculator = new URLSearchParams(window.location.search).get("calculator");
        if (calculator) window.sessionStorage.setItem(`challenge-calculator-prefill:${id}`, calculator);
        router.replace(`/challenges/create/${id}`);
        return;
      }

      creatingDraftRef.current = false;
      if ((result as { code?: string }).code === "UNAUTHENTICATED") {
        router.replace(loginContinuationPath());
        return;
      }
      setError(result.message || "Challenge draft could not be created.");
    });

    return () => {
      cancelled = true;
    };
  }, [authState.loading, authState.user, router]);

  return (
    <AppShell>
      <Card className="mx-auto max-w-2xl p-8">
        <h1 className="text-3xl font-black text-[var(--gold)]">Create Challenge</h1>
        <p className="mt-3 text-slate-300">Preparing your draft...</p>
        {error ? (
          <>
            <p className="mt-4 rounded-[8px] bg-red-950/40 p-4 text-sm text-red-200">{error}</p>
            <LinkButton href="/challenges" className="mt-5">Back to Challenges</LinkButton>
          </>
        ) : null}
      </Card>
    </AppShell>
  );
}
