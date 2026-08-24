"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, ClipboardCheck, DollarSign, ExternalLink, Trophy, UserRound, Users, XCircle } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { formatChallengeDateTime } from "@/lib/challenge-date-time";
import { MonthlyBoostControl } from "@/components/challenge/monthly-boost-control";

type RecordRow = Record<string, unknown> & { id: string };
type Payload = {
  challenge: Record<string, unknown>;
  participants: RecordRow[];
  entryRequests: RecordRow[];
  submissions: RecordRow[];
  reports: RecordRow[];
  winnerProposals: RecordRow[];
  settlements: RecordRow[];
  sponsorships: RecordRow[];
  financialLedger: RecordRow[];
  prizePool: RecordRow | null;
  audits: RecordRow[];
  permissions: { isAdmin: boolean; canModerateSensitiveActions: boolean };
};
type RequestPayload = { requests: Array<RecordRow & { participantProfile?: Record<string, unknown> }> };
type TabId = "overview" | "participant-requests" | "participants" | "submissions" | "winners" | "prize-revenue" | "sponsors" | "schedule" | "voting" | "analytics" | "check-in" | "judges" | "bracket" | "rounds";
type Tab = { id: TabId; label: string; count?: number };

function text(value: unknown, fallback = "") { return typeof value === "string" && value.trim() ? value.trim() : fallback; }
function statusLabel(value: unknown) { return text(value, "pending").replaceAll("_", " "); }
function money(cents: unknown, currency: unknown = "USD") { return new Intl.NumberFormat("en-US", { style: "currency", currency: text(currency, "USD").toUpperCase() }).format(Number(cents ?? 0) / 100); }

function challengeKind(challenge: Record<string, unknown>) {
  const type = text(challenge.challengeType ?? challenge.type).toLowerCase();
  if (type.includes("tournament")) return "tournament";
  if (type.includes("live") || challenge.isLiveEvent === true) return "live";
  if (type.includes("private")) return "private";
  return "normal";
}

function nextDeadline(challenge: Record<string, unknown>) {
  const fields = [
    ["Registration closes", challenge.registrationDeadline ?? challenge.registrationClosesAt],
    ["Submissions open", challenge.submissionStartAt ?? challenge.startsAt],
    ["Submission deadline", challenge.submissionDeadline],
    ["Voting closes", challenge.votingDeadline ?? challenge.votingEndsAt],
    ["Results", challenge.winnerAnnouncementAt]
  ] as const;
  return fields.map(([label, value]) => ({ label, value, time: Date.parse(String(value ?? "")) })).filter((item) => Number.isFinite(item.time) && item.time > Date.now()).sort((left, right) => left.time - right.time)[0] ?? null;
}

export default function ChallengeManagePage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<TabId>("overview");
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["challenge-manage", id], queryFn: () => apiRequest<Payload>(`/api/challenges/${id}/manage`), enabled: Boolean(id), staleTime: 15_000 });
  const data = query.data?.ok ? query.data.data : null;
  const requestQuery = useQuery({ queryKey: ["entry-requests", id], queryFn: () => apiRequest<RequestPayload>(`/api/challenges/${id}/entry-request`), enabled: Boolean(id && tab === "participant-requests"), staleTime: 10_000 });
  const requestPayload = requestQuery.data?.ok ? requestQuery.data.data : null;
  const focus = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("focus") ?? "";

  const tabs = useMemo<Tab[]>(() => {
    if (!data) return [{ id: "overview", label: "Overview" }];
    const challenge = data.challenge;
    const kind = challengeKind(challenge);
    const approval = challenge.requiresParticipantApproval === true || challenge.participantApprovalMode === "manual" || data.entryRequests.length > 0;
    const noDigitalSubmission = kind === "live" && ["attendance_only", "competition_without_submission"].includes(text(challenge.eventFormat ?? challenge.challengeFormat).toLowerCase());
    const sponsorRelevant = challenge.sponsorEnabled === true || challenge.sponsorReady === true || data.sponsorships.length > 0;
    const votingRelevant = challenge.votingEnabled !== false && (challenge.votingSettings != null || challenge.votingDeadline != null || challenge.votingEndsAt != null);
    const result: Tab[] = [{ id: "overview", label: "Overview" }];
    if (approval) result.push({ id: "participant-requests", label: "Participant Requests", count: data.entryRequests.filter((item) => item.status === "pending").length });
    result.push({ id: "participants", label: "Participants", count: data.participants.length });
    if (kind === "live") result.push({ id: "check-in", label: "Check-In" });
    if (!noDigitalSubmission) result.push({ id: "submissions", label: "Submissions", count: data.submissions.length });
    if (kind === "live" && (challenge.judgingEnabled === true || challenge.winnerSelection === "judge_selection")) result.push({ id: "judges", label: "Judges" });
    if (kind === "tournament") result.push({ id: "bracket", label: "Bracket" }, { id: "rounds", label: "Rounds" });
    result.push({ id: "winners", label: "Winners", count: data.winnerProposals.length }, { id: "prize-revenue", label: "Prize & Revenue" });
    if (sponsorRelevant) result.push({ id: "sponsors", label: "Sponsors", count: data.sponsorships.length });
    result.push({ id: "schedule", label: "Schedule" });
    if (votingRelevant) result.push({ id: "voting", label: "Voting" });
    if (challenge.analyticsEnabled === true || challenge.creatorAnalyticsEnabled === true) result.push({ id: "analytics", label: "Analytics" });
    return result;
  }, [data]);

  useEffect(() => {
    if (!data) return;
    const requested = new URLSearchParams(window.location.search).get("tab") as TabId | null;
    if (requested && tabs.some((item) => item.id === requested)) setTab(requested);
    else if (!tabs.some((item) => item.id === tab)) setTab("overview");
  }, [data, tab, tabs]);

  const requestMutation = useMutation({
    mutationFn: async ({ requestId, action, reason }: { requestId: string; action: "approve" | "reject"; reason?: string }) => apiRequest(`/api/challenges/${id}/entry-request/${requestId}/${action}`, { method: "POST", body: JSON.stringify({ reason }) }),
    onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["challenge-manage", id] }), queryClient.invalidateQueries({ queryKey: ["entry-requests", id] })]); }
  });
  const operationMutation = useMutation({
    mutationFn: async ({ targetId, action }: { targetId: string; action: "check_in" }) => apiRequest(`/api/challenges/${id}/manage`, { method: "POST", body: JSON.stringify({ targetType: "participant", targetId, action }) }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["challenge-manage", id] }); }
  });

  function decide(requestId: string, action: "approve" | "reject") {
    if (action === "approve") {
      if (window.confirm("Approve this participant request? Capacity and payment status will be checked again.")) requestMutation.mutate({ requestId, action });
      return;
    }
    const reason = window.prompt("Why are you rejecting this request?")?.trim();
    if (reason) requestMutation.mutate({ requestId, action, reason });
  }

  return <AppShell><div className="mx-auto max-w-7xl">
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><PageTitle title={text(data?.challenge.title, "Challenge Management")} subtitle="Operate this challenge without changing its public participant experience." icon={<ClipboardCheck />} /><div className="flex flex-col gap-2 sm:flex-row"><LinkButton href={`/challenges/${id}`} variant="secondary"><ExternalLink size={16} /> View Public Page</LinkButton>{data?.challenge.status === "draft" || data?.challenge.status === "changes_requested" ? <LinkButton href={`/challenges/create/${id}`} variant="secondary">Edit Challenge</LinkButton> : null}</div></div>
    <div className="mt-6 flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Challenge management sections">{tabs.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`min-h-11 shrink-0 rounded-[8px] border px-4 text-sm font-black ${tab === item.id ? "border-[var(--gold)] bg-[var(--gold)] text-black" : "border-white/10 bg-white/[0.03] text-slate-300"}`}>{item.label}{item.count !== undefined ? ` · ${item.count}` : ""}</button>)}</div>
    {query.isLoading ? <Card className="mt-6 h-72 animate-pulse" /> : !data ? <Card className="mt-6 border-red-500/30 p-5 text-red-200">{query.data?.message ?? "Challenge management could not load."}</Card> : <ManagementContent tab={tab} data={data} requestPayload={requestPayload} requestLoading={requestQuery.isLoading} requestMessage={requestMutation.data?.message ?? ""} requestBusy={requestMutation.isPending} operationMessage={operationMutation.data?.message ?? ""} operationBusy={operationMutation.isPending} focus={focus} id={id} decide={decide} checkIn={(targetId) => { if (window.confirm("Check in this participant?")) operationMutation.mutate({ targetId, action: "check_in" }); }} />}
  </div></AppShell>;
}

function ManagementContent(props: { tab: TabId; data: Payload; requestPayload: RequestPayload | null | undefined; requestLoading: boolean; requestMessage: string; requestBusy: boolean; operationMessage: string; operationBusy: boolean; focus: string; id: string; decide: (id: string, action: "approve" | "reject") => void; checkIn: (id: string) => void }) {
  const { tab, data, id } = props;
  if (tab === "overview") return <Overview data={data} id={id} />;
  if (tab === "participant-requests") return <ParticipantRequests {...props} />;
  if (tab === "participants") return <RecordList title="Participants" rows={data.participants} empty="No participants yet." primary="displayName" secondary="status" link={(row) => `/profile/${text(row.username ?? row.userId)}`} />;
  if (tab === "submissions") return <RecordList title="Submissions" rows={data.submissions} empty="No submissions yet." primary="title" secondary="status" link={(row) => `/submissions/${row.id}`} />;
  if (tab === "winners") return <Winners data={data} id={id} />;
  if (tab === "prize-revenue") return <PrizeRevenue data={data} />;
  if (tab === "sponsors") return <RecordList title="Sponsors" rows={data.sponsorships} empty="No sponsor activity yet." primary="brandName" secondary="status" />;
  if (tab === "schedule") return <Schedule challenge={data.challenge} />;
  if (tab === "voting") return <OperationalLink title="Voting" body="Voting windows and visibility remain governed by the canonical challenge lifecycle." href={`/challenges/${id}/votes`} label="View Voting" />;
  if (tab === "analytics") return <OperationalLink title="Analytics" body="Open creator analytics for recorded challenge activity." href="/creator/analytics" label="Open Analytics" />;
  if (tab === "check-in") return <CheckIn participants={data.participants} busy={props.operationBusy} message={props.operationMessage} checkIn={props.checkIn} />;
  if (tab === "judges") return <OperationalLink title="Judges" body="Assigned judges use server-authorized judging controls. Ordinary participants cannot access judge actions." href={`/host/participants?challengeId=${encodeURIComponent(id)}`} label="Manage Judges" />;
  if (tab === "bracket" || tab === "rounds") return <OperationalLink title={tab === "bracket" ? "Bracket" : "Rounds"} body="Tournament progression uses confirmed participants and server-authoritative match results." href={`/tournaments/${id}/manage`} label="Open Tournament Operations" />;
  return null;
}

function CheckIn({ participants, busy, message, checkIn }: { participants: RecordRow[]; busy: boolean; message: string; checkIn: (id: string) => void }) {
  if (!participants.length) return <Card className="mt-6"><EmptyState icon={<UserRound />} title="No registered participants" body="Confirmed event participants will appear here for QR or manual check-in." /></Card>;
  return <div className="mt-6 space-y-3"><div><h2 className="text-2xl font-black">Event Check-In</h2><p className="mt-1 text-sm text-slate-400">Use manual check-in when QR scanning is unavailable. Duplicate check-ins are rejected server-side.</p></div>{participants.map((participant) => { const checkedIn = participant.checkInStatus === "checked_in" || Boolean(participant.checkedInAt); return <Card key={participant.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black">{text(participant.displayName ?? participant.userName, "Participant")}</p><p className="mt-1 text-sm text-slate-400">{checkedIn ? `Checked in ${participant.checkedInAt ? new Date(String(participant.checkedInAt)).toLocaleString() : ""}` : "Not checked in"}</p></div><Button disabled={busy || checkedIn} onClick={() => checkIn(participant.id)}>{checkedIn ? <CheckCircle2 size={16} /> : null}{checkedIn ? "Checked In" : "Manual Check-In"}</Button></Card>; })}{message ? <p className="text-sm text-slate-300">{message}</p> : null}</div>;
}

function Overview({ data, id }: { data: Payload; id: string }) {
  const milestone = nextDeadline(data.challenge);
  const pending = data.entryRequests.filter((item) => item.status === "pending").length;
  const status = statusLabel(data.challenge.status ?? data.challenge.lifecycleStatus);
  return <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_340px]"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[["Current phase", status], ["Participants", data.participants.length], ["Pending requests", pending], ["Submissions", data.submissions.length], ["Prize funding", text(data.prizePool?.status, "Not confirmed")], ["Sponsors", data.sponsorships.length]].map(([label, value]) => <Card key={String(label)} className="p-5"><p className="text-sm text-slate-400">{label}</p><p className="mt-2 text-2xl font-black capitalize">{value}</p></Card>)}</div><aside className="space-y-4"><Card className="p-5"><p className="text-xs font-black uppercase text-[var(--gold)]">Next operational milestone</p><h2 className="mt-2 text-xl font-black">{milestone?.label ?? "No upcoming milestone"}</h2><p className="mt-2 text-sm text-slate-400">{milestone ? formatChallengeDateTime(milestone.value, data.challenge) : "This challenge has no future scheduled milestone."}</p></Card><MonthlyBoostControl challengeId={id} /><div className="grid gap-2"><LinkButton href={`/challenges/${id}/entry-requests`} variant="secondary">Participant Requests</LinkButton><LinkButton href={`/challenges/${id}/propose-winners`} variant="secondary">Winner Proposal</LinkButton></div></aside></div>;
}

function ParticipantRequests(props: { requestPayload: RequestPayload | null | undefined; requestLoading: boolean; requestMessage: string; requestBusy: boolean; focus: string; decide: (id: string, action: "approve" | "reject") => void }) {
  const requests = props.requestPayload?.requests ?? [];
  if (props.requestLoading) return <Card className="mt-6 h-56 animate-pulse" />;
  if (!requests.length) return <Card className="mt-6"><EmptyState icon={<UserRound />} title="No pending requests" body="New requests will appear here when participants ask to join." /></Card>;
  return <div className="mt-6 grid gap-4">{requests.map((request) => { const profile = request.participantProfile ?? {}; const pending = request.status === "pending"; const paid = request.paidEntryRequired === true; return <Card key={request.id} className={`p-5 ${props.focus === request.id ? "border-[var(--gold)] ring-2 ring-[var(--gold)]/25" : ""}`}><div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-black">{text(profile.displayName, "Participant")}</h2><span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black capitalize">{statusLabel(request.status)}</span></div><p className="mt-2 text-sm text-slate-400">Requested {request.createdAt ? new Date(String(request.createdAt)).toLocaleDateString() : "date unavailable"} · Eligibility {text(request.eligibilityStatus, "confirmed at request")}</p><p className={`mt-2 text-sm font-black ${paid && request.paymentWindowStatus === "confirmed" ? "text-emerald-300" : "text-slate-300"}`}>{paid ? request.paymentWindowStatus === "confirmed" ? "Payment confirmed" : `Payment ${statusLabel(request.paymentWindowStatus)}` : "No entry payment required"}</p></div><div className="flex flex-col gap-2 sm:flex-row">{profile.profileUrl ? <LinkButton href={String(profile.profileUrl)} variant="secondary">View Profile</LinkButton> : null}{pending ? <><Button disabled={props.requestBusy} onClick={() => props.decide(request.id, "approve")}><CheckCircle2 size={16} /> Approve</Button><Button disabled={props.requestBusy} variant="secondary" onClick={() => props.decide(request.id, "reject")}><XCircle size={16} /> Reject</Button></> : null}</div></div></Card>; })}{props.requestMessage ? <p className="text-sm text-slate-300">{props.requestMessage}</p> : null}</div>;
}

function Winners({ data, id }: { data: Payload; id: string }) {
  return <div className="mt-6 space-y-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-2xl font-black">Winner Proposals</h2><p className="mt-1 text-sm text-slate-400">Proposals remain separate from official results until admin approval.</p></div><LinkButton href={`/challenges/${id}/propose-winners`}><Trophy size={16} /> Propose Winners</LinkButton></div>{data.winnerProposals.length ? data.winnerProposals.map((proposal) => <Card key={proposal.id} className="p-5"><div className="flex flex-col gap-3 sm:flex-row sm:justify-between"><div><p className="font-black capitalize">{statusLabel(proposal.status)}</p><p className="mt-2 text-sm text-slate-400">Updated {proposal.updatedAt ? new Date(String(proposal.updatedAt)).toLocaleString() : "time unavailable"}</p>{proposal.adminNote ? <p className="mt-3 rounded-[8px] bg-amber-500/10 p-3 text-sm text-amber-100">Admin response: {String(proposal.adminNote)}</p> : null}</div></div></Card>) : <Card><EmptyState icon={<Trophy />} title="No winner proposal" body="Eligible winner candidates appear after the required competition phase closes." /></Card>}</div>;
}

function PrizeRevenue({ data }: { data: Payload }) {
  const totals = data.financialLedger.reduce<Record<string, number>>((sum, item) => { const key = text(item.shareType, "unallocated"); sum[key] = (sum[key] ?? 0) + Number(item.amountCents ?? 0); return sum; }, {});
  return <div className="mt-6"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Confirmed prize pool", money(data.prizePool?.confirmedAmountCents ?? data.prizePool?.confirmedPrizePoolCents, data.prizePool?.currency)], ["Winner allocation", money(totals.winner_share ?? totals.challenge_winner_prize)], ["Creator allocation", money(totals.creator_host_share ?? totals.creator_challenge_earning)], ["Platform allocation", money(totals.platform_share ?? totals.platform_challenge_fee)]].map(([label, value]) => <Card key={String(label)} className="p-5"><DollarSign className="text-[var(--gold)]" /><p className="mt-3 text-sm text-slate-400">{label}</p><p className="mt-2 text-xl font-black">{value}</p></Card>)}</div>{data.settlements.length ? <section className="mt-6" aria-labelledby="settlement-history-title"><h2 id="settlement-history-title" className="text-xl font-black">Internal settlement history</h2><div className="mt-3 grid gap-3">{data.settlements.map((settlement) => <Card key={settlement.id} className="p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black capitalize">{statusLabel(settlement.status)}</p><p className="mt-1 text-sm text-slate-400">Winner pool {money(settlement.winnerPoolAmount, settlement.currency)} · Creator / host {money(settlement.creatorHostAmount, settlement.currency)}</p></div><span className="text-xs font-bold text-slate-400">Internal credits only</span></div></Card>)}</div></section> : <Card className="mt-6"><EmptyState icon={<DollarSign />} title="No settlement prepared" body="A confirmed internal settlement will appear after final winner approval." /></Card>}<Card className="mt-5 p-5"><h2 className="text-xl font-black">Financial safety</h2><p className="mt-2 text-sm leading-6 text-slate-400">Only confirmed challenge revenue appears here. Creator-funded prizes and sponsor funding remain separate, and no external payout is executed from this workspace.</p></Card></div>;
}

function Schedule({ challenge }: { challenge: Record<string, unknown> }) {
  const rows: Array<[string, unknown]> = [["Registration closes", challenge.registrationDeadline ?? challenge.registrationClosesAt], ["Challenge / submissions start", challenge.submissionStartAt ?? challenge.startsAt], ["Submission deadline", challenge.submissionDeadline], ["Voting / review closes", challenge.votingDeadline ?? challenge.votingEndsAt], ["Winner announcement", challenge.winnerAnnouncementAt]];
  return <div className="mt-6 grid gap-3">{rows.map(([label, value]) => <Card key={String(label)} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between"><span className="flex items-center gap-2 font-black"><CalendarClock size={17} className="text-[var(--gold)]" /> {label}</span><span className="text-sm text-slate-300">{formatChallengeDateTime(value, challenge) ?? "Not scheduled"}</span></Card>)}</div>;
}

function RecordList({ title, rows, empty, primary, secondary, link }: { title: string; rows: RecordRow[]; empty: string; primary: string; secondary: string; link?: (row: RecordRow) => string }) {
  if (!rows.length) return <Card className="mt-6"><EmptyState icon={<Users />} title={empty} body="Real challenge activity will appear here." /></Card>;
  return <div className="mt-6 space-y-3"><h2 className="text-2xl font-black">{title}</h2>{rows.map((row) => <Card key={row.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black">{text(row[primary], text(row.userName, row.id))}</p><p className="mt-1 text-sm capitalize text-slate-400">{statusLabel(row[secondary])}</p></div>{link ? <LinkButton href={link(row)} variant="secondary">Open</LinkButton> : null}</Card>)}</div>;
}

function OperationalLink({ title, body, href, label }: { title: string; body: string; href: string; label: string }) { return <Card className="mt-6 p-6"><h2 className="text-2xl font-black">{title}</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">{body}</p><LinkButton className="mt-5" href={href}>{label}</LinkButton></Card>; }
