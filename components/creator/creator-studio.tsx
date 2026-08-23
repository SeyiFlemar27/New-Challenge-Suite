import Link from "next/link";
import { AlertCircle, ArrowRight, BarChart3, CalendarClock, ClipboardCheck, DollarSign, Sparkles, UsersRound } from "lucide-react";
import { Card, LinkButton, PageTitle } from "@/components/ui";
import { formatChallengeDateTime } from "@/lib/challenge-date-time";

export type CreatorStudioChallenge = Record<string, unknown> & { id: string };

const ACTIVE_KPI_STATUSES = new Set(["active", "submission_open", "voting_open", "voting_closed"]);

function statusOf(challenge: CreatorStudioChallenge) {
  return String(challenge.status ?? challenge.lifecycleStatus ?? challenge.managementState ?? "draft").toLowerCase();
}

function count(challenge: CreatorStudioChallenge, keys: string[]) {
  for (const key of keys) {
    const value = Number(challenge[key]);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return 0;
}

function actionFor(challenge: CreatorStudioChallenge) {
  const status = statusOf(challenge);
  if (status === "draft") return { label: "Continue Setup", href: `/challenges/create/${challenge.id}` };
  if (["changes_requested", "requires_changes"].includes(status)) return { label: "Review Changes", href: `/challenges/create/${challenge.id}` };
  if (status === "submission_open") return { label: "Review Submissions", href: `/challenges/${challenge.id}/manage?tab=submissions` };
  if (status === "voting_open") return { label: "View Voting", href: `/challenges/${challenge.id}/votes` };
  if (["completed", "winners_announced"].includes(status)) return { label: "View Results", href: `/challenges/${challenge.id}` };
  return { label: "Manage Challenge", href: `/challenges/${challenge.id}/manage` };
}

function nextTime(challenge: CreatorStudioChallenge) {
  const rows = [challenge.registrationDeadline, challenge.submissionStartAt, challenge.submissionDeadline, challenge.votingDeadline, challenge.winnerAnnouncementAt]
    .map((value) => ({ value, time: Date.parse(String(value ?? "")) }))
    .filter((item) => Number.isFinite(item.time) && item.time > Date.now())
    .sort((a, b) => a.time - b.time);
  return rows[0]?.value ?? null;
}

export function CreatorStudio({ displayName, challenges, availableEarningsCents, pendingEarningsCents = 0 }: { displayName: string; challenges: CreatorStudioChallenge[]; availableEarningsCents: number; pendingEarningsCents?: number }) {
  const active = challenges.filter((challenge) => ACTIVE_KPI_STATUSES.has(statusOf(challenge)));
  const participants = active.reduce((sum, challenge) => sum + count(challenge, ["participantCount", "participants"]), 0);
  const submissions = active.reduce((sum, challenge) => sum + count(challenge, ["submissionCount", "submissions"]), 0);
  const attention = challenges.flatMap((challenge) => {
    const status = statusOf(challenge);
    const title = String(challenge.title ?? "Untitled challenge");
    const pending = count(challenge, ["pendingSubmissionCount", "pendingEntryRequestCount", "pendingRequestCount"]);
    if (["changes_requested", "requires_changes"].includes(status)) return [{ priority: 1, title: `${title} needs changes`, body: "Challenge Suite requested updates before approval.", href: `/challenges/create/${challenge.id}` }];
    if (pending > 0) return [{ priority: 2, title: `${pending} item${pending === 1 ? "" : "s"} need review`, body: title, href: `/challenges/${challenge.id}/manage` }];
    const deadline = nextTime(challenge);
    const time = Date.parse(String(deadline ?? ""));
    if (Number.isFinite(time) && time - Date.now() <= 24 * 60 * 60 * 1000) return [{ priority: 3, title: `${title} has a deadline soon`, body: formatChallengeDateTime(deadline, challenge) ?? "Review the schedule.", href: `/challenges/${challenge.id}/manage?tab=schedule` }];
    return [];
  }).sort((a, b) => a.priority - b.priority).slice(0, 3);
  const preview = [...challenges].sort((a, b) => Number(b.recommendationScore ?? 0) - Number(a.recommendationScore ?? 0) || Date.parse(String(b.updatedAt ?? b.createdAt ?? "")) - Date.parse(String(a.updatedAt ?? a.createdAt ?? ""))).slice(0, 6);
  const currency = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

  return <div className="mx-auto max-w-7xl" data-creator-studio>
    <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><PageTitle title="Creator Studio" subtitle="Manage your challenges, audience and earnings." /><LinkButton href="/challenges/create" className="w-full sm:w-auto">Create Challenge</LinkButton></div>
    {displayName ? <p className="mt-3 text-sm text-slate-400">Welcome back, {displayName.split(" ")[0]}.</p> : null}

    <section className="mt-8 grid overflow-hidden rounded-[8px] border border-white/10 bg-[#151515] sm:grid-cols-2 xl:grid-cols-4" aria-label="Creator metrics">
      {[["Active Challenges", active.length], ["Participants", participants], ["Submissions", submissions], ["Available Earnings", currency(availableEarningsCents)]].map(([label, value], index) => <div key={String(label)} className={`p-5 ${index ? "border-t border-white/10 sm:border-l sm:border-t-0" : ""}`}><p className="text-sm text-slate-400">{label}</p><p className="mt-2 text-3xl font-black">{typeof value === "number" ? value.toLocaleString() : value}</p></div>)}
    </section>

    <section className="mt-9"><div className="flex items-end justify-between gap-4"><div><h2 className="text-2xl font-black">Today</h2><p className="mt-1 text-sm text-slate-400">{attention.length ? `${attention.length} thing${attention.length === 1 ? "" : "s"} need your attention` : "You’re all caught up."}</p></div>{attention.length === 3 ? <Link href="/creator/challenges" className="text-sm font-black text-[var(--gold)]">View all</Link> : null}</div>{attention.length ? <div className="mt-4 grid gap-3">{attention.map((item) => <Link key={`${item.href}-${item.title}`} href={item.href} className="flex min-h-16 items-center gap-4 rounded-[8px] border border-white/10 bg-[#151515] p-4 hover:border-[var(--gold)]/40"><AlertCircle className="shrink-0 text-[var(--gold)]" /><span className="min-w-0"><b className="block">{item.title}</b><small className="mt-1 block text-slate-400">{item.body}</small></span><ArrowRight className="ml-auto shrink-0" size={18} /></Link>)}</div> : null}</section>

    <section className="mt-9"><div className="flex items-end justify-between gap-4"><div><h2 className="text-2xl font-black">Your Challenges</h2><p className="mt-1 text-sm text-slate-400">Recent creator-owned work and its next operational action.</p></div><Link href="/creator/challenges" className="text-sm font-black text-[var(--gold)]">View all challenges <ArrowRight className="inline" size={15} /></Link></div>{preview.length ? <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{preview.map((challenge) => <CreatorCard key={challenge.id} challenge={challenge} />)}</div> : <div className="mt-5 rounded-[8px] border border-white/10 p-6"><p className="font-black">No challenges yet.</p><p className="mt-2 text-sm text-slate-400">Choose a challenge type to begin.</p><LinkButton href="/challenges/create" className="mt-4">Create Challenge</LinkButton></div>}</section>

    <section className="mt-9 grid gap-5 lg:grid-cols-2"><Card className="p-6"><BarChart3 className="text-[var(--gold)]" /><h2 className="mt-4 text-xl font-black">Performance</h2><div className="mt-5 grid grid-cols-3 gap-3"><Metric label="Participants" value={participants} /><Metric label="Submissions" value={submissions} /><Metric label="Votes" value={active.reduce((sum, challenge) => sum + count(challenge, ["voteCount", "weightedVoteCount"]), 0)} /></div><LinkButton href="/creator/analytics" variant="secondary" className="mt-5">View Analytics</LinkButton></Card><Card className="p-6"><DollarSign className="text-[var(--gold)]" /><h2 className="mt-4 text-xl font-black">Earnings</h2><p className="mt-4 text-3xl font-black">{currency(availableEarningsCents)}</p><p className="text-sm text-slate-400">Available to withdraw</p>{pendingEarningsCents > 0 ? <p className="mt-3 text-sm text-slate-400">{currency(pendingEarningsCents)} pending review</p> : null}<LinkButton href="/earnings" variant="secondary" className="mt-5">View Earnings</LinkButton></Card></section>
  </div>;
}

function CreatorCard({ challenge }: { challenge: CreatorStudioChallenge }) {
  const action = actionFor(challenge);
  const status = statusOf(challenge);
  const deadline = nextTime(challenge);
  return <Card className="flex min-h-[250px] flex-col p-5"><p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--gold)]">{status.replaceAll("_", " ")}</p><h3 className="mt-3 line-clamp-2 text-xl font-black">{String(challenge.title ?? "Untitled challenge")}</h3><div className="mt-5 grid gap-2 text-sm text-slate-400"><span className="flex items-center gap-2"><UsersRound size={16} /> {count(challenge, ["participantCount"])} participants</span><span className="flex items-center gap-2"><ClipboardCheck size={16} /> {count(challenge, ["submissionCount"])} submissions</span>{deadline ? <span className="flex items-center gap-2"><CalendarClock size={16} /> {formatChallengeDateTime(deadline, challenge)}</span> : null}</div><LinkButton href={action.href} className="mt-auto w-full pt-6">{action.label}</LinkButton></Card>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div><p className="text-2xl font-black">{value.toLocaleString()}</p><p className="text-xs text-slate-400">{label}</p></div>; }
