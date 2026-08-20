"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { KeyRound, LockKeyhole } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Field, LinkButton, PageTitle, inputClass } from "@/components/ui";
import { checkPrivateInviteCode } from "@/lib/api/services";

export default function PrivateChallengeAccessPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  async function verify() {
    setSubmitting(true);
    setMessage("");
    const result = await checkPrivateInviteCode(code, id);
    setSubmitting(false);
    if (result.ok && result.data?.challengeId === id) {
      router.push(`/challenges/${id}`);
      return;
    }
    setMessage(result.message || "Access could not be verified.");
  }
  return <AppShell><div className="mx-auto max-w-2xl"><PageTitle title="Private Challenge Access" subtitle="This challenge uses Link + Code access. Eligibility, payment, and approval rules may still apply after access is verified." icon={<LockKeyhole />} /><Card className="mt-7 p-6 sm:p-8"><div className="flex items-start gap-4"><KeyRound className="mt-1 shrink-0 text-[var(--gold)]" /><div><h2 className="text-xl font-black">Enter access code</h2><p className="mt-2 text-sm leading-6 text-slate-400">Use the code shared by the creator or host. Forwarded links still require a valid code.</p></div></div><div className="mt-6"><Field label="Access code"><input className={inputClass} value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 8))} autoComplete="one-time-code" inputMode="text" /></Field></div>{message ? <p className="mt-4 rounded-[8px] border border-red-500/20 bg-red-950/20 p-3 text-sm text-red-200">{message}</p> : null}<div className="mt-6 flex flex-col gap-3 sm:flex-row"><Button onClick={() => void verify()} disabled={submitting || code.length < 5}>{submitting ? "Checking..." : "Unlock Challenge"}</Button><LinkButton href="/creator/private-challenges" variant="secondary">Back to Private Challenges</LinkButton></div></Card></div></AppShell>;
}
