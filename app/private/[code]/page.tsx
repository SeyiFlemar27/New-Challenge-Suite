"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button, Card, LinkButton } from "@/components/ui";
import { checkPrivateInviteCode } from "@/lib/api/services";
import { KeyRound, LockKeyhole } from "lucide-react";

export default function PrivateInvitePage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const [status, setStatus] = useState("Validating invite code...");
  const [challengeId, setChallengeId] = useState("");

  useEffect(() => {
    const code = String(params.code ?? "");
    if (!code) {
      setStatus("Invite code is missing.");
      return;
    }
    checkPrivateInviteCode(code).then((result) => {
      if (result.ok && result.data?.challengeId) {
        setChallengeId(result.data.challengeId);
        setStatus("Private challenge access granted.");
      } else {
        setStatus(result.message || "Invite code could not be validated.");
      }
    });
  }, [params.code]);

  return (
    <AppShell>
      <Card className="mx-auto mt-10 max-w-2xl p-6 text-center sm:p-8 lg:p-10">
        <KeyRound className="mx-auto h-12 w-12 text-[var(--gold)]" />
        <h1 className="mt-5 text-3xl font-black">Private Challenge Invite</h1>
        <p className="mt-3 leading-7 text-slate-300">{status}</p>
        <div className="mt-7 grid gap-3 sm:flex sm:justify-center">
          {challengeId ? <Button onClick={() => router.push(`/challenges/${challengeId}`)}>Open Private Challenge</Button> : <LinkButton href="/private-exclusive" variant="secondary">Enter Another Code</LinkButton>}
          <LinkButton href="/challenges" variant="ghost">Explore Public Challenges</LinkButton>
        </div>
        <p className="mt-6 text-xs leading-5 text-slate-500"><LockKeyhole className="mr-1 inline h-3 w-3" /> Private challenges are not listed publicly. Access is recorded for audit and review.</p>
      </Card>
    </AppShell>
  );
}
