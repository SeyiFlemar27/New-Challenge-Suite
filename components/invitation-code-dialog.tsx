"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { admitPrivateInvite, previewPrivateInvite } from "@/lib/api/services";
import { Button, inputClass } from "@/components/ui";

type Requirements = { requirements: string[]; acknowledgements: string[]; questions: string[] };
export function InvitationCodeDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requirements, setRequirements] = useState<Requirements | null>(null);
  const [accepted, setAccepted] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  async function unlock() {
    setBusy(true); setError("");
    try {
      const credential = code.trim().toUpperCase();
      if (!credential) { setError("Enter an invitation code."); return; }
      if (!requirements) {
        const preview = await previewPrivateInvite(credential);
        if (!preview.ok || !preview.data) { setError(preview.message || "This code could not be verified."); return; }
        const configured = preview.data.requirements;
        if (configured.requirements.length || configured.acknowledgements.length || configured.questions.length) {
          setRequirements(configured); return;
        }
      }
      const result = await admitPrivateInvite(credential, accepted, answers);
      if (!result.ok || !result.data) { setError(result.message || "Access could not be unlocked."); return; }
      setOpen(false);
      router.push(`/challenges/${encodeURIComponent(result.data.challengeId)}`);
    } catch { setError("Access could not be unlocked. Please try again."); }
    finally { setBusy(false); }
  }
  const checks = requirements ? [...requirements.requirements.map((label, i) => ({ label, id: `requirement-${i}` })), ...requirements.acknowledgements.map((label, i) => ({ label, id: `acknowledgement-${i}` }))] : [];
  return <Dialog.Root open={open} onOpenChange={(value) => { if (busy) return; setOpen(value); if (!value) { setCode(""); setError(""); setRequirements(null); setAccepted([]); setAnswers({}); } }}>
    <Dialog.Trigger asChild><Button variant="secondary">Enter Invitation Code</Button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[80] bg-black/70" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-[81] max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--panel)] p-6 text-[var(--foreground)] shadow-xl">
        <Dialog.Title className="pr-8 text-xl font-bold">Enter Invitation Code</Dialog.Title>
        <Dialog.Description className="mt-2 text-sm text-[var(--muted)]">Unlock access to a private challenge. Joining and any entry requirements remain separate.</Dialog.Description>
        <Dialog.Close disabled={busy} aria-label="Close invitation code" className="absolute right-4 top-4 rounded p-2 focus-visible:outline-2 focus-visible:outline-[var(--gold)]"><X size={20} /></Dialog.Close>
        <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); void unlock(); }}>
          <label className="block text-sm font-semibold">Invitation Code<input className={`${inputClass} mt-2`} autoComplete="off" spellCheck={false} maxLength={64} value={code} disabled={busy || !!requirements} onChange={(event) => setCode(event.target.value)} required aria-describedby={error ? "invitation-error" : undefined} /></label>
          {checks.map(({ id, label }) => <label key={id} className="flex gap-3 text-sm"><input type="checkbox" required disabled={busy} checked={accepted.includes(id)} onChange={(event) => setAccepted((current) => event.target.checked ? [...current, id] : current.filter((value) => value !== id))} />{label}</label>)}
          {requirements?.questions.map((question, i) => <label key={i} className="block text-sm">{question}<textarea className={`${inputClass} mt-2`} required disabled={busy} maxLength={2000} value={answers[`question-${i}`] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [`question-${i}`]: event.target.value }))} /></label>)}
          {error ? <p id="invitation-error" role="alert" className="text-sm text-red-500">{error}</p> : null}
          <Button type="submit" disabled={busy || !code.trim()}>{busy ? "Checking access…" : "Unlock Challenge"}</Button>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
