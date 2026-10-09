"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button, Card, LinkButton } from "@/components/ui";
import { admitPrivateInvite, previewPrivateInvite } from "@/lib/api/services";
import { KeyRound, LockKeyhole } from "lucide-react";

type Preview = { challengeId: string; accessMethod: string; alreadyAdmitted: boolean; challenge: { id: string; title: string }; requirements: { requirements: string[]; acknowledgements: string[]; questions: string[] } };

export function PrivateAdmission({ credential, label }: { credential: string; label: "code" | "invitation" }) {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [status, setStatus] = useState("Checking private invitation...");
  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const requirementIds = useMemo(() => preview ? [
    ...preview.requirements.requirements.map((_, index) => `requirement-${index}`),
    ...preview.requirements.acknowledgements.map((_, index) => `acknowledgement-${index}`)
  ] : [], [preview]);

  useEffect(() => {
    let active = true;
    previewPrivateInvite(credential).then((result) => {
      if (!active) return;
      if (result.ok && result.data) {
        setPreview(result.data);
        setStatus(result.data.alreadyAdmitted ? "Access is already active for your account." : "Review the participant requirements to continue.");
      } else setStatus(result.message || "This invitation could not be validated.");
    });
    return () => { active = false; };
  }, [credential]);

  async function admit() {
    if (!preview) return;
    setSubmitting(true);
    const result = await admitPrivateInvite(credential, acknowledged, answers);
    setSubmitting(false);
    if (result.ok && result.data?.challengeId) router.push(`/challenges/${result.data.challengeId}`);
    else setStatus(result.message || "Private access could not be granted.");
  }

  return <AppShell><Card className="mx-auto mt-10 max-w-2xl p-6 sm:p-8">
    <KeyRound className="mx-auto h-10 w-10 text-[var(--gold)]" />
    <h1 className="mt-4 text-center text-3xl font-black">Private Challenge Invitation</h1>
    <p className="mt-3 text-center leading-7 text-slate-300">{preview?.challenge.title ?? status}</p>
    {preview ? <div className="mt-6 space-y-4">
      {preview.requirements.requirements.map((text, index) => {
        const id = `requirement-${index}`;
        return <label key={id} className="flex gap-3 rounded-[8px] border border-white/10 p-4 text-sm"><input type="checkbox" checked={acknowledged.includes(id)} onChange={(event) => setAcknowledged((current) => event.target.checked ? [...current, id] : current.filter((item) => item !== id))} /><span>{text}</span></label>;
      })}
      {preview.requirements.acknowledgements.map((text, index) => {
        const id = `acknowledgement-${index}`;
        return <label key={id} className="flex gap-3 rounded-[8px] border border-white/10 p-4 text-sm"><input type="checkbox" checked={acknowledged.includes(id)} onChange={(event) => setAcknowledged((current) => event.target.checked ? [...current, id] : current.filter((item) => item !== id))} /><span>{text}</span></label>;
      })}
      {preview.requirements.questions.map((question, index) => <label key={`question-${index}`} className="block text-sm font-bold">{question}<textarea className="mt-2 min-h-20 w-full rounded-[8px] border border-white/10 bg-[#11151d] p-3 font-normal" value={answers[`question-${index}`] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [`question-${index}`]: event.target.value }))} /></label>)}
      {preview.alreadyAdmitted ? <div className="mt-6 text-center"><Button onClick={() => router.push(`/challenges/${preview.challengeId}`)}>Open Private Challenge</Button></div> : <div className="mt-6 text-center"><Button disabled={submitting || acknowledged.length !== requirementIds.length || preview.requirements.questions.some((_, index) => !answers[`question-${index}`]?.trim())} onClick={admit}>{submitting ? "Validating..." : "Accept Requirements and Join"}</Button></div>}
    </div> : null}
    <p className="mt-5 text-center text-sm text-slate-400">{status}</p>
    <div className="mt-6 flex justify-center gap-3"><LinkButton href="/private-exclusive" variant="secondary">Private Access</LinkButton><LinkButton href="/challenges" variant="ghost">Explore Challenges</LinkButton></div>
    <p className="mt-6 text-center text-xs text-slate-500"><LockKeyhole className="mr-1 inline h-3 w-3" /> {label === "code" ? "Access codes" : "Invitation links"} are checked against your verified account and the challenge&apos;s current eligibility rules.</p>
  </Card></AppShell>;
}
