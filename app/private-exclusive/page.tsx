"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ChallengeCard } from "@/components/domain-cards";
import { Button, Card, EmptyState, Field, inputClass, LinkButton, PageTitle } from "@/components/ui";
import { CheckCircle2, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { checkPrivateInviteCode, fetchPrivateExclusiveChallenges, requestPrivateAccess } from "@/lib/api/services";
import { normalizeChallenge } from "@/lib/api/normalizers";
import type { Challenge } from "@/lib/types";

export default function PrivateExclusivePage() {
  const [inviteCode, setInviteCode] = useState("");
  const [status, setStatus] = useState("");
  const [privateChallenges, setPrivateChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);

  async function loadPrivateChallenges() {
    setLoading(true);
    setError(null);
    setUnauthorized(false);
    const result = await fetchPrivateExclusiveChallenges(30);
    if (!result.ok || !result.data) {
      const code = (result as any).code;
      setPrivateChallenges([]);
      setUnauthorized(code === "AUTHENTICATION_REQUIRED" || code === "PERMISSION_DENIED");
      setError(result.message || "Private challenges could not be loaded.");
      setLoading(false);
      return;
    }
    setPrivateChallenges(result.data.challenges.map((challenge) => normalizeChallenge(challenge as any)));
    setLoading(false);
  }

  useEffect(() => {
    loadPrivateChallenges();
  }, []);

  async function checkCode() {
    setSubmitting(true);
    const result = await checkPrivateInviteCode(inviteCode);
    setStatus(result.message || (result.ok ? "Access granted. Private challenge unlocked." : "Invalid invite code. Request access or try again."));
    setSubmitting(false);
    if (result.ok) loadPrivateChallenges();
  }

  async function requestAccess() {
    setSubmitting(true);
    const result = await requestPrivateAccess();
    setStatus(result.message || (result.ok ? "Access request sent. Status: Pending Review." : "Access request could not be sent."));
    setSubmitting(false);
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <PageTitle title="Private / Exclusive" subtitle="Invite-only competitions, premium creator drops, and locked challenge access." icon={<LockKeyhole className="text-[var(--gold)]" />} />
        <div className="flex flex-wrap gap-3">
          <LinkButton href="/subscriptions" variant="secondary">Check Access</LinkButton>
          <LinkButton href="/challenges/create?mode=private">Create Private Challenge</LinkButton>
        </div>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
        <Card className="p-7">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-[8px] bg-yellow-500/10 text-[var(--gold)]"><ShieldCheck /></div>
            <div>
              <h2 className="text-2xl font-black">Access Status</h2>
              <p className="mt-2 text-slate-300">Your current account can request invites and join with valid invite codes. Premium locked events may require an upgraded plan.</p>
            </div>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {["Invite-only competitions", "Access required badge", "Locked challenge preview"].map((item) => <div key={item} className="rounded-[8px] border border-white/10 bg-black/30 p-4 font-bold">{item}</div>)}
          </div>
        </Card>

        <Card className="p-7">
          <h2 className="flex items-center gap-2 text-2xl font-black"><KeyRound className="text-[var(--gold)]" /> Join With Invite Code</h2>
          <div className="mt-5 space-y-4">
            <Field label="Invite Code"><input className={inputClass} value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} placeholder="Enter invite code" /></Field>
            <div className="flex gap-3">
              <Button className="flex-1" onClick={checkCode} disabled={submitting}>Check Code</Button>
              <Button variant="secondary" className="flex-1" onClick={requestAccess} disabled={submitting}>Request Access</Button>
            </div>
            {status ? <p className={`flex items-center gap-2 rounded-[8px] p-3 text-sm font-bold ${status.startsWith("Invalid") ? "bg-red-950/40 text-red-200" : "bg-emerald-950/40 text-emerald-200"}`}><CheckCircle2 size={17} /> {status}</p> : null}
          </div>
        </Card>
      </div>

      <h2 className="mt-10 text-2xl font-black">Private Challenges</h2>
      {loading ? (
        <div className="mt-6 grid gap-7 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((item) => <Card key={item} className="h-[390px] animate-pulse bg-[#151515]" />)}
        </div>
      ) : unauthorized ? (
        <Card className="mt-6"><EmptyState icon={<LockKeyhole />} title="Sign in required" body={error ?? "Sign in with a verified account to view private and exclusive challenges."} action={<LinkButton href="/auth/login">Sign In</LinkButton>} /></Card>
      ) : error ? (
        <Card className="mt-6"><EmptyState icon={<LockKeyhole />} title="Private challenges unavailable" body={error} action={<Button onClick={loadPrivateChallenges}>Retry</Button>} /></Card>
      ) : privateChallenges.length ? (
        <div className="mt-6 grid gap-7 md:grid-cols-2 xl:grid-cols-3">
          {privateChallenges.map((challenge) => <ChallengeCard key={challenge.id} challenge={challenge} />)}
        </div>
      ) : (
        <Card className="mt-6"><EmptyState icon={<LockKeyhole />} title="No private challenges available" body="Request an invite or check back when exclusive creator challenges open." action={<Button onClick={requestAccess} disabled={submitting}>Request Access</Button>} /></Card>
      )}
    </AppShell>
  );
}
