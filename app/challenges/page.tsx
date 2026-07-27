"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock3, PencilLine, Trophy, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ChallengeMediaFrame } from "@/components/media-display";
import { Button, Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { fetchDashboard } from "@/lib/api/services";
import { normalizeChallenge, type ChallengeApiRecord } from "@/lib/api/normalizers";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { getChallengeDisplayStatus, statusClassName } from "@/lib/challenge-status";

type ManagementState = "active" | "pending_review" | "requires_changes" | "scheduled" | "draft" | "completed" | "cancelled";
const tabs: Array<{ id: ManagementState; label: string; empty: string }> = [
  { id: "active", label: "Active", empty: "No active challenges yet." },
  { id: "pending_review", label: "Pending Review", empty: "No challenges currently awaiting review." },
  { id: "requires_changes", label: "Requires Changes", empty: "Nothing needs your attention." },
  { id: "scheduled", label: "Scheduled", empty: "No scheduled challenges yet." },
  { id: "draft", label: "Drafts", empty: "No draft challenges yet." },
  { id: "completed", label: "Completed", empty: "No completed challenges yet." },
  { id: "cancelled", label: "Cancelled", empty: "No cancelled challenges yet." }
];

function managementState(challenge: Record<string, unknown>): ManagementState {
  const status = String(challenge.managementState ?? challenge.status ?? challenge.lifecycleStatus ?? "active").toLowerCase();
  const reviewStatus = String(challenge.reviewStatus ?? challenge.adminDecision ?? challenge.adminReviewStatus ?? "").toLowerCase();
  if (reviewStatus === "changes_requested" || status === "changes_requested") return "requires_changes";
  if (status === "draft") return "draft";
  if (status === "pending_review") return "pending_review";
  if (status === "scheduled" || status === "approved") return "scheduled";
  if (status === "cancelled" || status === "canceled") return "cancelled";
  if (status === "completed" || status === "winners_announced") return "completed";
  return "active";
}

export default function ChallengesPage() {
  const { user } = useCurrentUser();
  const { data, isLoading } = useQuery({ queryKey: ["dashboard", "owned-challenges"], queryFn: fetchDashboard, staleTime: 30_000 });
  const [activeTab, setActiveTab] = useState<ManagementState>("active");
  const challenges = useMemo(() => {
    if (!data?.ok) return [];
    return (data.data?.hostedChallenges ?? [])
      .map((item) => ({ ...(item as Record<string, unknown>), ...normalizeChallenge(item as ChallengeApiRecord) }))
      .filter((item) => item.id);
  }, [data]);
  const accountType = String(user?.selectedAccountType ?? user?.accountType ?? user?.role ?? "user").toLowerCase();
  const canCreate = accountType !== "sponsor";
  const errorMessage = !isLoading && data && !data.ok ? data.message : "";
  const counts = useMemo(() => Object.fromEntries(tabs.map((tab) => [tab.id, challenges.filter((challenge) => managementState(challenge as Record<string, unknown>) === tab.id).length])) as Record<ManagementState, number>, [challenges]);
  const visible = challenges.filter((challenge) => managementState(challenge as Record<string, unknown>) === activeTab);

  return (
    <AppShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageTitle title="Challenges" subtitle="Create and manage your challenges." icon={<Trophy className="text-[var(--gold)]" />} />
        {canCreate ? <LinkButton href="/challenges/create" className="w-full sm:w-auto">Create Challenge</LinkButton> : null}
      </div>

      <Card className="mt-7 p-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {tabs.map((tab) => <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={(activeTab === tab.id ? "bg-[var(--gold)] text-black" : "bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]") + " min-h-11 shrink-0 rounded-[8px] px-4 text-sm font-black uppercase tracking-[0.08em]"}>{tab.label} ({counts[tab.id] ?? 0})</button>)}
        </div>
      </Card>

      {isLoading ? (
        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((item) => <Card key={item} className="h-[340px] animate-pulse bg-[#171717]" />)}
        </div>
      ) : errorMessage ? (
        <Card className="mt-8 max-w-3xl p-6"><h2 className="text-2xl font-black text-[var(--gold-2)]">Challenges could not load</h2><p className="mt-3 text-slate-300">{errorMessage}</p></Card>
      ) : visible.length ? (
        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((challenge) => <OwnedChallengeCard key={String(challenge.id)} challenge={challenge as Record<string, unknown>} state={activeTab} />)}
        </div>
      ) : (
        <Card className="mt-8 p-8"><EmptyState icon={<Trophy />} title={tabs.find((tab) => tab.id === activeTab)?.empty ?? "No challenges yet."} body={activeTab === "draft" ? "Start a challenge draft and continue editing whenever you are ready." : ""} action={activeTab === "draft" && canCreate ? <LinkButton href="/challenges/create">Create Challenge</LinkButton> : undefined} /></Card>
      )}
    </AppShell>
  );
}

function OwnedChallengeCard({ challenge, state }: { challenge: Record<string, unknown>; state: ManagementState }) {
  const id = String(challenge.id ?? "");
  const status = getChallengeDisplayStatus(challenge);
  const participants = Number(challenge.participantCount ?? challenge.participants ?? 0);
  const submissions = Number(challenge.submissionCount ?? challenge.submissions ?? 0);
  const progress = Math.max(0, Math.min(100, Number(challenge.completionPercentage ?? 0)));
  const nextIncomplete = String(challenge.nextIncompleteSection ?? "Review");
  const lastEdited = String(challenge.lastAutosavedAt ?? challenge.updatedAt ?? "");
  return (
    <Card className="flex h-full flex-col overflow-hidden p-0">
      <ChallengeMediaFrame src={String(challenge.imageUrl ?? challenge.coverImageUrl ?? "")} alt={String(challenge.title ?? "Challenge")} className="rounded-none border-0" placeholder="Challenge Suite" />
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase ${statusClassName(status)}`}>{state === "draft" ? "Draft" : status}</span>
          <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-black uppercase text-slate-300">{String(challenge.category ?? "General") || "General"}</span>
        </div>
        <h2 className="mt-4 line-clamp-2 text-xl font-black">{String(challenge.title ?? "") || "Untitled Challenge"}</h2>
        <p className="mt-2 line-clamp-2 flex-1 text-sm leading-6 text-slate-300">{String(challenge.description ?? "") || (state === "draft" ? "Draft details are still being completed." : "")}</p>
        {state === "draft" ? <div className="mt-5 rounded-[8px] bg-black/30 p-4"><div className="flex items-center justify-between text-sm font-bold"><span>Progress</span><span>{progress}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[var(--gold)]" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-xs text-slate-400">Next: {nextIncomplete}</p>{lastEdited ? <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Clock3 size={13} /> Last edited {new Date(lastEdited).toLocaleDateString()}</p> : null}</div> : <div className="mt-5 grid gap-3 text-sm text-slate-300 sm:grid-cols-2"><span className="flex items-center gap-2"><Users size={16} className="text-[var(--gold)]" /> {participants.toLocaleString()} participants</span><span className="flex items-center gap-2"><CalendarDays size={16} className="text-[var(--gold)]" /> {submissions.toLocaleString()} entries</span></div>}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {state === "draft" ? <LinkButton href={`/challenges/create/${id}`} className="w-full"><PencilLine size={16} /> Continue Editing</LinkButton> : <LinkButton href={`/challenges/${id}`} className="w-full">View Challenge</LinkButton>}
          {state === "draft" ? <LinkButton href={`/challenges/${id}`} variant="secondary" className="w-full">Preview Draft</LinkButton> : <LinkButton href={`/challenges/${id}/propose-winners`} variant="secondary" className="w-full">Propose Winners</LinkButton>}
        </div>
      </div>
    </Card>
  );
}
