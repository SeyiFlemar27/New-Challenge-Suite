"use client";

import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card, LinkButton } from "@/components/ui";
import { KeyRound } from "lucide-react";

export default function ChallengeInviteManagerPage() {
  const params = useParams<{ id: string }>();
  const inviteLink = typeof window !== "undefined" ? `${window.location.origin}/private/YOUR-CODE` : "/private/YOUR-CODE";
  return (
    <AppShell>
      <Card className="mx-auto mt-10 max-w-3xl p-6 sm:p-8 lg:p-10">
        <KeyRound className="h-12 w-12 text-[var(--gold)]" />
        <h1 className="mt-5 text-3xl font-black">Private Invite Settings</h1>
        <p className="mt-3 leading-7 text-slate-300">Private challenges generate invite records server-side when published. Invite code management includes max uses, current uses, expiry, enabled status, optional approval, and audit events.</p>
        <div className="mt-6 rounded-[8px] border border-white/10 bg-black/30 p-4">
          <p className="text-xs font-black uppercase text-slate-500">Invite link format</p>
          <p className="mt-2 break-all font-mono text-sm text-[var(--gold)]">{inviteLink}</p>
        </div>
        <p className="mt-5 text-sm leading-6 text-slate-400">Invite-code management is not available yet. Challenge ID: {params.id}</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <LinkButton href={`/challenges/${params.id}`}>Back to Challenge</LinkButton>
          <LinkButton href="/private-exclusive" variant="secondary">Private Workspace</LinkButton>
        </div>
      </Card>
    </AppShell>
  );
}
