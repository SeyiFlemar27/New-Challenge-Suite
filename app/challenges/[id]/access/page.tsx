"use client";

import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card, Field, inputClass, LinkButton } from "@/components/ui";
import { LockKeyhole } from "lucide-react";

export default function ChallengeAccessPage() {
  const params = useParams<{ id: string }>();
  return (
    <AppShell>
      <Card className="mx-auto mt-10 max-w-2xl p-6 sm:p-8 lg:p-10">
        <LockKeyhole className="h-12 w-12 text-[var(--gold)]" />
        <h1 className="mt-5 text-3xl font-black">Private Challenge Access</h1>
        <p className="mt-3 leading-7 text-slate-300">Enter a valid invite code or request access from the host. Private records are never shown in public discovery, feeds, search, or sitemap output.</p>
        <div className="mt-7 grid gap-4 sm:grid-cols-[1fr_auto]">
          <Field label="Invite code"><input className={inputClass} placeholder="Enter invite code" onKeyDown={(event) => {
            if (event.key === "Enter") {
              const code = (event.currentTarget as HTMLInputElement).value.trim();
              if (code) window.location.href = `/private/${encodeURIComponent(code)}`;
            }
          }} /></Field>
          <LinkButton href="/private-exclusive" className="self-end">Request Access</LinkButton>
        </div>
        <p className="mt-5 text-xs text-slate-500">Challenge ID: {params.id}</p>
      </Card>
    </AppShell>
  );
}
