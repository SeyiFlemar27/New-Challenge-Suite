"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Clock3, PlayCircle, Trophy, Users, Vote } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ChallengeShare } from "@/components/challenge-share";
import { Button, Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { fetchChallengeDetails } from "@/lib/api/services";
import { normalizeChallenge, normalizeSubmission, type ChallengeApiRecord, type SubmissionApiRecord } from "@/lib/api/normalizers";
import { canVoteOnChallenge, getChallengeDisplayStatus } from "@/lib/challenge-status";

const reminderOptions = [
  { value: 60, label: "1 hour before" },
  { value: 30, label: "30 minutes before" },
  { value: 5, label: "5 minutes before" },
  { value: 0, label: "When it starts" }
];

export default function ChallengeWatchPage() {
  const params = useParams<{ id: string }>();
  const challengeId = params.id;
  const queryClient = useQueryClient();
  const [selectedReminders, setSelectedReminders] = useState<number[]>([60, 30, 5, 0]);
  const [notice, setNotice] = useState("");
  const query = useQuery({ queryKey: ["challenge-details", challengeId], queryFn: () => fetchChallengeDetails(challengeId), enabled: Boolean(challengeId), staleTime: 20_000 });
  const details = query.data?.ok ? query.data.data : null;
  const challenge = useMemo(() => details?.challenge ? normalizeChallenge(details.challenge as ChallengeApiRecord) : null, [details?.challenge]);
  const submissions = useMemo(() => challenge ? (details?.submissions ?? []).map((item) => normalizeSubmission(item as SubmissionApiRecord, challenge)).filter((item) => item.id).slice(0, 4) : [], [challenge, details?.submissions]);
  const reminderMutation = useMutation({
    mutationFn: () => apiRequest(`/api/challenges/${challengeId}/engagement`, { method: "POST", body: JSON.stringify({ action: "interested", enabled: true, reminderOffsetsMinutes: selectedReminders }) }),
    onSuccess: async (result) => {
      setNotice(result.message);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["challenge-details", challengeId] }),
        queryClient.invalidateQueries({ queryKey: ["engagements"] })
      ]);
    }
  });

  if (query.isLoading) return <AppShell><div className="mx-auto max-w-6xl"><Card className="h-[520px] animate-pulse" /></div></AppShell>;
  if (!challenge) return <AppShell><Card className="mx-auto max-w-3xl"><EmptyState icon={<PlayCircle />} title="Watch room unavailable" body={query.data?.message ?? "This challenge is not available."} action={<LinkButton href="/challenges">Explore Challenges</LinkButton>} /></Card></AppShell>;

  const status = getChallengeDisplayStatus(challenge);
  const votingOpen = canVoteOnChallenge(challenge);
  const startsAt = new Date(challenge.startsAt);
  const timeUntilStart = startsAt.getTime() - Date.now();
  const countdown = timeUntilStart > 0
    ? `${Math.ceil(timeUntilStart / 86_400_000)} day${Math.ceil(timeUntilStart / 86_400_000) === 1 ? "" : "s"} until start`
    : status === "Active" || status === "Voting Open" ? "Activity is underway" : "Follow final updates";
  const interestedCount = Number((details?.challenge as Record<string, unknown> | undefined)?.interestedCount ?? 0);

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <PageTitle title={challenge.title} subtitle="Watch submissions, voting, leaderboard movement, and winner announcements from one focused room." icon={<PlayCircle />} />
          <div className="flex flex-col gap-3 sm:flex-row"><ChallengeShare title={challenge.title} description={challenge.description} path={`/challenges/${challenge.id}/watch`} /><LinkButton href={`/challenges/${challenge.id}`}>View Full Details</LinkButton></div>
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
          <Card className="overflow-hidden">
            <div className="flex min-h-[320px] items-center justify-center bg-[#090909] p-8 text-center sm:min-h-[440px]">
              <div><PlayCircle className="mx-auto text-[var(--gold)]" size={58} /><h2 className="mt-6 text-2xl font-black">Live stream is not active yet</h2><p className="mx-auto mt-3 max-w-xl leading-7 text-slate-400">You can follow submissions, voting, leaderboard updates, and winner announcements here.</p></div>
            </div>
            <div className="grid gap-px bg-white/10 sm:grid-cols-4">{[[status, "Status"], [countdown, "Timeline"], [String(challenge.participants), "Participants"], [String(interestedCount), "Interested"]].map(([value, label]) => <div key={label} className="bg-[#121212] p-5"><p className="break-words text-lg font-black text-[var(--gold)]">{value}</p><p className="mt-1 text-xs uppercase text-slate-500">{label}</p></div>)}</div>
          </Card>
          <div className="space-y-5">
            <Card className="p-6"><CalendarClock className="text-[var(--gold)]" /><h2 className="mt-4 text-xl font-black">In-app reminders</h2><p className="mt-2 text-sm leading-6 text-slate-400">Choose when Challenge Suite should surface this event inside the app.</p><div className="mt-5 space-y-3">{reminderOptions.map((option) => <label key={option.value} className="flex min-h-11 items-center gap-3 rounded-[8px] border border-white/10 px-3"><input type="checkbox" checked={selectedReminders.includes(option.value)} onChange={(event) => setSelectedReminders((current) => event.target.checked ? [...new Set([...current, option.value])] : current.filter((value) => value !== option.value))} /><span className="text-sm font-bold">{option.label}</span></label>)}</div><Button className="mt-5 w-full" onClick={() => reminderMutation.mutate()} disabled={!selectedReminders.length || reminderMutation.isPending}><Clock3 size={17} /> {reminderMutation.isPending ? "Saving..." : "Save Reminders"}</Button>{notice ? <p className="mt-3 text-sm text-emerald-300">{notice}</p> : null}<p className="mt-4 text-xs leading-5 text-slate-500">Reminders are saved in-app. Push/email delivery will be enabled when notification delivery is connected.</p></Card>
            <Card className="p-6"><Vote className="text-[var(--gold)]" /><h2 className="mt-4 text-xl font-black">Voting</h2><p className="mt-2 text-sm text-slate-400">{votingOpen ? "Voting is open for eligible submissions." : "Voting is not currently open."}</p>{votingOpen ? <LinkButton href={`/challenges/${challenge.id}/votes`} className="mt-5 w-full">Vote Now</LinkButton> : null}</Card>
          </div>
        </div>
        <section className="mt-10"><h2 className="text-2xl font-black">Submission preview</h2>{submissions.length ? <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{submissions.map((submission) => <Card key={submission.id} className="p-5"><Users className="text-[var(--gold)]" /><h3 className="mt-4 break-words font-black">{submission.title}</h3><p className="mt-2 text-sm text-slate-400">@{submission.userName}</p><p className="mt-4 flex items-center gap-2 text-sm font-bold"><Trophy size={16} className="text-[var(--gold)]" /> {submission.likes} votes</p></Card>)}</div> : <Card className="mt-5"><EmptyState icon={<Users />} title="No submissions to preview" body="Eligible entries will appear here as the competition develops." /></Card>}</section>
      </div>
    </AppShell>
  );
}
