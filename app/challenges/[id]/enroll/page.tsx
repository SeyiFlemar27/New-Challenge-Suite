"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, LinkButton, PageTitle } from "@/components/ui";
import { fetchChallengeDetails } from "@/lib/api/services";
import { normalizeChallenge, type ChallengeApiRecord } from "@/lib/api/normalizers";
import { Bell, CheckCircle2 } from "lucide-react";

export default function ChallengeEnrollPage() {
  const params = useParams<{ id: string }>();
  const challengeId = params.id;
  const { data, isLoading } = useQuery({
    queryKey: ["challenge-enroll", challengeId],
    queryFn: () => fetchChallengeDetails(challengeId),
    enabled: Boolean(challengeId),
    staleTime: 30_000
  });

  const challenge = useMemo(() => {
    const raw = data?.ok ? data.data?.challenge as (ChallengeApiRecord & Record<string, unknown>) | undefined : undefined;
    return raw ? normalizeChallenge(raw) : null;
  }, [data]);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <PageTitle title="Enrolled for updates" subtitle="Join when you are ready to submit." icon={<Bell className="text-[var(--gold)]" />} />
        <Card className="mt-8 overflow-hidden border-[var(--gold)]/25 bg-[#111]">
          <div className="h-2 bg-[var(--gold)]" />
          <div className="p-6 text-center sm:p-10">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--gold)]/10 text-[var(--gold)]"><CheckCircle2 size={34} /></div>
            <h2 className="mt-5 text-2xl font-black sm:text-3xl">You are enrolled for updates</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-300">Enrollment tracking will be connected later. No challenge entry is created from this step.</p>
            <div className="mt-6 rounded-[8px] bg-white/[0.04] p-4 text-left">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">Challenge</p>
              <p className="mt-2 text-lg font-black">{isLoading ? "Loading challenge..." : challenge?.title ?? "Challenge"}</p>
              <p className="mt-2 text-sm text-slate-400">Join Challenge is the official entry flow for submissions.</p>
            </div>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <LinkButton href={`/challenges/${challengeId}/join`} className="w-full">Join Challenge</LinkButton>
              <LinkButton href={`/challenges/${challengeId}`} variant="secondary" className="w-full">Done</LinkButton>
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
