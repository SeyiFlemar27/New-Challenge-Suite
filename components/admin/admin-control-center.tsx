"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowRight, BarChart3, Bell, ClipboardCheck, Coins, FileClock, Flag,
  FolderCog, Landmark, LifeBuoy, Megaphone, Radio, Search, ShieldAlert,
  ShieldCheck, SlidersHorizontal, Trophy, UserCog, UsersRound, WalletCards, X
} from "lucide-react";
import { Button, Card, EmptyState, LinkButton, PageTitle, textareaClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type AdminRecord = Record<string, unknown> & { id: string; status?: string };
type AdminData = {
  overview: Record<string, unknown> & { recentAuditEvents?: AdminRecord[]; safety?: Record<string, unknown> };
  sponsors: AdminRecord[]; hosts: AdminRecord[]; challenges: AdminRecord[]; submissions: AdminRecord[];
  participants: AdminRecord[]; winners: AdminRecord[]; withdrawals: AdminRecord[]; disputes: AdminRecord[];
  users: AdminRecord[]; creators: AdminRecord[]; hostWorkspaces: AdminRecord[]; sponsorBrands: AdminRecord[];
  events: AdminRecord[]; tournaments: AdminRecord[]; cashLedger: AdminRecord[]; adminNotifications: AdminRecord[];
  support: AdminRecord[]; announcements: AdminRecord[]; auditLogs: AdminRecord[];
  predictions: AdminRecord[]; predictionSettlements: AdminRecord[]; rewards: AdminRecord[]; prizeWheel: AdminRecord[]; kyc: AdminRecord[]; adRewards: AdminRecord[]; enterpriseLeads: AdminRecord[]; mediaModeration: AdminRecord[]; riskSafety: AdminRecord[];
  doroCoin: { wallets: AdminRecord[]; transactions: AdminRecord[]; conversionEnabled: false; adjustmentsEnabled: false };
  reports: Record<string, unknown>; settings: Record<string, unknown>;
};

const sectionMeta: Record<string, { title: string; description: string }> = {
  overview: { title: "Admin Dashboard", description: "A clear view of platform activity, risk, finances, and work requiring attention." },
  "action-centre": { title: "Action Centre", description: "Review real operational records that need a decision, follow-up, or escalation." },
  sponsors: { title: "Sponsor Approvals", description: "Review brand applications without bypassing paid Sponsor plan requirements." },
  hosts: { title: "Host Verification", description: "Verify Host workspaces without bypassing active Host subscription requirements." },
  challenges: { title: "Challenge Moderation", description: "Review competition rules, visibility, deadlines, voting, sponsors, and prizes." },
  submissions: { title: "Submission Moderation", description: "Review pending and flagged entries without permanently deleting source media." },
  participants: { title: "Participant Oversight", description: "Review registrations, check-ins, flags, disqualifications, and reinstatements." },
  winners: { title: "Winner Confirmation", description: "Approve announcements or hold results. Prize release and payouts remain inactive." },
  withdrawals: { title: "Withdrawal Review", description: "Review reserved eligible balances. Payout providers remain manual or disconnected." },
  disputes: { title: "Disputes", description: "Review challenge, submission, vote, winner, withdrawal, and Sponsor disputes." },
  users: { title: "User Oversight", description: "Inspect account type, effective tier, balances, subscriptions, safety, and activity." },
  creators: { title: "Creator Operations", description: "Review Creator accounts, challenge volume, boosts, Sponsor readiness, and earnings." },
  "host-workspaces": { title: "Host Workspaces", description: "Review verified workspaces, competitions, events, teams, and operational risk." },
  "sponsor-brands": { title: "Sponsor Brands", description: "Review brand profiles, subscriptions, campaigns, calls to action, and risk." },
  events: { title: "Events", description: "Review live-event records, registrations, status, and safety." },
  tournaments: { title: "Tournaments", description: "Review tournament plans and brackets from recorded competition data." },
  dorocoin: { title: "Spin Credits", description: "Inspect non-cash reward balances and transactions. Spin Credits cannot be withdrawn or converted to cash." },
  "cash-ledger": { title: "Cash Ledger", description: "Read-only immutable real-money balance events. No payout execution is available." },
  reports: { title: "Operational Reports", description: "Review current platform counts. Exports remain unavailable." },
  "audit-logs": { title: "Admin Audit Logs", description: "Append-only history for sensitive administrative and financial-review actions." },
  notifications: { title: "Admin Notifications", description: "In-app operational notification records. Email and push delivery are not implied." },
  support: { title: "Support Inbox", description: "Review account, payment, challenge, voting, and safety support tickets." },
  announcements: { title: "Announcements", description: "Draft platform, maintenance, policy, and feature announcements. Delivery is inactive." },
  categories: { title: "Categories", description: "Review challenge, submission, event, Sponsor, and risk categories." },
  "voting-rules": { title: "Voting Rules", description: "Review daily free votes, Challenge Credit additional votes, multipliers, and suspicious-vote thresholds." },
  "revenue-rules": { title: "Prize & Revenue Rules", description: "Review platform fees, winner splits, and withdrawal requirements without moving money." },
  "feature-flags": { title: "Feature Flags", description: "Read-only safety state for sensitive and incomplete platform systems." },
  roles: { title: "Admin Roles", description: "Review roles and permissions. Self-promotion and owner grants are unavailable." },
  settings: { title: "Admin Settings", description: "Review platform identity, policy, safety, access, system status, and legal settings." },
  search: { title: "Admin Search", description: "Search the currently loaded operational index across users, brands, challenges, submissions, and withdrawals." }
  ,
  predictions: { title: "Prediction Arena Market Review", description: "Review compliance-gated Prediction Arena records. Payment confirmation, age, region, and admin market approval remain required." },
  "prediction-settlements": { title: "Prediction Settlement & Refund Review", description: "Review settlements, cancellations, disputes, and refunds. No automatic payout or refund execution is available." },
  "risk-safety": { title: "Risk & Safety Dashboard", description: "Review suspicious votes, suspicious predictions, media risk, account risk, and safety queues." },
  settlements: { title: "Settlements", description: "Review settlement preparation and approval records without triggering an external payout." },
  refunds: { title: "Refunds", description: "Review refund requests and provider status. Refund execution requires the established protected workflow." },
  appeals: { title: "Appeals", description: "Review appeals separately from formal disputes and safety reports." },
  "sponsor-campaigns": { title: "Sponsor Campaigns", description: "Review real sponsor campaign records, approvals, and funding status." },
  "system-status": { title: "System Status", description: "Review recorded service and job status. Missing provider telemetry is shown as not connected." },
  "media-moderation": { title: "Upload & Media Moderation", description: "Review uploaded media metadata and moderation status without exposing private files publicly." },
  "ad-rewards": { title: "Ad Reward Verification Logs", description: "Review ad vote reward attempts. Provider verification is required and fake client grants are blocked." },
  "enterprise-leads": { title: "Enterprise Leads", description: "Review Contact Sales inquiries and handoff status." },
  rewards: { title: "Reward Fulfillment", description: "Review voter points, spin history, and manual reward fulfillment." },
  "prize-wheel": { title: "Prize Wheel Manager", description: "Manage prize wheel rewards. High-value and manual prizes require admin fulfillment." },
  kyc: { title: "Verification Records", description: "View historical provider metadata. Verification is not currently required for normal product actions, and no raw ID or face media is stored in Firebase." }
};

const queueActions: Record<string, Array<{ action: string; label: string; dangerous?: boolean }>> = {
  sponsors: [{ action: "approve", label: "Approve" }, { action: "request_changes", label: "Request changes" }, { action: "reject", label: "Reject", dangerous: true }, { action: "suspend", label: "Suspend", dangerous: true }, { action: "add_note", label: "Add note" }],
  hosts: [{ action: "verify", label: "Verify" }, { action: "request_changes", label: "Request changes" }, { action: "reject", label: "Reject", dangerous: true }, { action: "suspend", label: "Suspend", dangerous: true }, { action: "add_note", label: "Add note" }],
  challenges: [{ action: "approve", label: "Publish" }, { action: "flag", label: "Flag" }, { action: "reject", label: "Reject", dangerous: true }, { action: "archive", label: "Archive" }, { action: "suspend", label: "Suspend", dangerous: true }, { action: "add_note", label: "Add note" }],
  submissions: [{ action: "approve", label: "Approve" }, { action: "request_changes", label: "Request resubmission" }, { action: "flag", label: "Flag" }, { action: "reject", label: "Reject", dangerous: true }, { action: "add_note", label: "Add note" }],
  participants: [{ action: "approve", label: "Approve" }, { action: "reinstate", label: "Reinstate" }, { action: "flag", label: "Flag" }, { action: "reject", label: "Reject", dangerous: true }, { action: "disqualify", label: "Disqualify", dangerous: true }, { action: "add_note", label: "Add note" }],
  winners: [{ action: "approve", label: "Approve announcement" }, { action: "hold", label: "Hold" }, { action: "request_review", label: "Request review" }, { action: "flag", label: "Flag" }, { action: "add_note", label: "Add note" }],
  withdrawals: [{ action: "approve", label: "First approval" }, { action: "second_approve", label: "Second approval" }, { action: "mark_paid", label: "Mark paid manually" }, { action: "request_info", label: "Request information" }, { action: "reject", label: "Reject", dangerous: true }, { action: "add_note", label: "Add note" }]
};
const typeBySection: Record<string, string> = { sponsors: "sponsor", hosts: "host", challenges: "challenge", submissions: "submission", participants: "participant", winners: "winner", withdrawals: "withdrawal" };
const reasonRequired = new Set(["reject", "request_changes", "suspend", "flag", "disqualify", "hold", "request_review", "request_info"]);

function availableQueueActions(section: string, status: string) {
  return (queueActions[section] ?? []).filter((item) => {
    if (section !== "withdrawals") return true;
    if (item.action === "approve") return ["pending_review", "needs_kyc"].includes(status);
    if (item.action === "second_approve") return status === "pending_second_approval";
    if (item.action === "mark_paid") return status === "approved_for_manual_payout";
    return true;
  });
}

export function AdminControlCenter({ section = "overview" }: { section?: string }) {
  const normalizedSection = sectionMeta[section] ? section : "overview";
  const meta = sectionMeta[normalizedSection];
  const [data, setData] = useState<AdminData | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<AdminRecord | null>(null);
  const [pendingAction, setPendingAction] = useState<{ record: AdminRecord; action: string } | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    const result = await apiRequest<AdminData>("/api/admin/operations");
    setLoading(false);
    if (!result.ok || !result.data) return setNotice(result.message);
    setData(result.data);
    setNotice("");
  }
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFilter(params.get("status") ?? "all");
    setSearchQuery(params.get("q") ?? "");
    void load();
    const refresh = () => void load();
    window.addEventListener("admin:refresh", refresh);
    return () => window.removeEventListener("admin:refresh", refresh);
  }, []);

  const sourceRecords = useMemo(() => {
    if (!data) return [];
    const value = data[normalizedSection as keyof AdminData];
    return Array.isArray(value) ? value as AdminRecord[] : [];
  }, [data, normalizedSection]);
  const statuses = useMemo(() => [...new Set(sourceRecords.map(recordStatus))], [sourceRecords]);
  const filteredRecords = useMemo(() => filter === "all" ? sourceRecords : sourceRecords.filter((item) => recordStatus(item) === filter), [filter, sourceRecords]);

  function openAction(record: AdminRecord, action: string) {
    setPendingAction({ record, action });
    setReason("");
    setNote("");
  }
  async function confirmAction() {
    if (!pendingAction) return;
    if (reasonRequired.has(pendingAction.action) && !reason.trim()) return setNotice("A reason is required for this action.");
    if (pendingAction.action === "add_note" && !note.trim()) return setNotice("Enter an internal note.");
    setSubmitting(true);
    const result = await apiRequest("/api/admin/operations", { method: "PATCH", body: JSON.stringify({ type: typeBySection[normalizedSection], id: pendingAction.record.id, action: pendingAction.action, reason, note }) });
    setSubmitting(false);
    setNotice(result.message);
    if (result.ok) {
      setPendingAction(null);
      setSelected(null);
      await load();
    }
  }

  return (
    <>
      <PageTitle title={meta.title} subtitle={meta.description} icon={<ShieldCheck />} />
      {notice ? <Card className="mt-6 border-yellow-500/20 p-4 text-sm text-slate-200">{notice}</Card> : null}
      {loading ? <div className="mt-8 grid gap-5 md:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((item) => <Card key={item} className="h-36 animate-pulse" />)}</div> : null}
      {!loading && data && normalizedSection === "overview" ? <Overview data={data} /> : null}
      {!loading && data && normalizedSection === "action-centre" ? <ActionCentre data={data} onSelect={setSelected} /> : null}
      {!loading && data && queueActions[normalizedSection] ? <Queue records={filteredRecords} allRecords={sourceRecords} statuses={statuses} filter={filter} setFilter={setFilter} section={normalizedSection} onSelect={setSelected} onAction={openAction} /> : null}
      {!loading && data && normalizedSection === "reports" ? <Reports records={data.reports} /> : null}
      {!loading && data && normalizedSection === "audit-logs" ? <AuditLogs records={data.auditLogs} /> : null}
      {!loading && data && normalizedSection === "search" ? <SearchResults data={data} query={searchQuery} /> : null}
      {!loading && data && ["categories", "voting-rules", "revenue-rules", "feature-flags", "roles", "settings"].includes(normalizedSection) ? <Configuration section={normalizedSection} records={data.settings} /> : null}
      {!loading && data && !["overview", "action-centre", "reports", "audit-logs", "search", "categories", "voting-rules", "revenue-rules", "feature-flags", "roles", "settings"].includes(normalizedSection) && !queueActions[normalizedSection] ? <RecordsWorkspace section={normalizedSection} data={data} onSelect={setSelected} /> : null}
      {selected ? <DetailDrawer record={selected} section={normalizedSection} onClose={() => setSelected(null)} onAction={queueActions[normalizedSection] ? openAction : undefined} /> : null}
      {pendingAction ? <ActionDialog action={pendingAction.action} reason={reason} note={note} setReason={setReason} setNote={setNote} submitting={submitting} onCancel={() => setPendingAction(null)} onConfirm={confirmAction} /> : null}
    </>
  );
}

function Overview({ data }: { data: AdminData }) {
  const cards = [
    ["Pending sponsor reviews", data.overview.pendingSponsorReviews, "/admin/sponsors?status=pending_review", ShieldCheck],
    ["Pending host verifications", data.overview.pendingHostVerifications, "/admin/hosts?status=pending_review", UserCog],
    ["Pending challenge reviews", data.overview.pendingChallengeReviews, "/admin/challenges?status=pending_review", Trophy],
    ["Pending submissions", data.overview.pendingSubmissions, "/admin/submissions?status=pending_review", ClipboardCheck],
    ["Flagged submissions", data.overview.flaggedSubmissions, "/admin/submissions?status=flagged", ShieldAlert],
    ["Participant approvals", data.overview.participantApprovals, "/admin/participants?status=pending", UsersRound],
    ["Winner confirmations", data.overview.winnerConfirmations, "/admin/winners?status=pending_admin_review", Trophy],
    ["Withdrawal reviews", data.overview.pendingWithdrawalReviews, "/admin/withdrawals?status=pending_review", Landmark],
    ["Open disputes", data.overview.openDisputes, "/admin/disputes?status=open", Flag],
    ["Revenue review items", data.overview.revenueReviewItems, "/admin/reports?type=revenue_review", BarChart3]
  ] as const;
  const urgent = [
    [Number(data.overview.pendingSponsorReviews ?? 0), "sponsor application", "/admin/sponsors?status=pending_review", "Review Sponsors"],
    [Number(data.overview.pendingSubmissions ?? 0), "submission", "/admin/submissions?status=pending_review", "Review Submissions"],
    [Number(data.overview.pendingWithdrawalReviews ?? 0), "withdrawal request", "/admin/withdrawals?status=pending_review", "Review Withdrawals"],
    [Number(data.overview.winnerConfirmations ?? 0), "winner announcement", "/admin/winners?status=pending_admin_review", "Review Winners"]
  ] as const;
  const activeUrgent = urgent.filter(([count]) => count > 0);
  return <>
    <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{cards.map(([label, value, href, Icon]) => <Link key={label} href={href} className="group"><Card className="h-full p-5 transition duration-200 group-hover:-translate-y-1 group-hover:border-[var(--gold)]/50 group-hover:bg-[var(--gold)]/[0.04]"><div className="flex items-start justify-between"><Icon className="text-[var(--gold)]" /><ArrowRight size={17} className="text-slate-600 transition group-hover:translate-x-1 group-hover:text-[var(--gold)]" /></div><p className="mt-4 text-sm font-bold text-slate-400">{label}</p><p className="mt-2 text-3xl font-black">{String(value ?? 0)}</p></Card></Link>)}</div>
    <Card className="mt-8 border-[var(--gold)]/20 p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Action Required</p><h2 className="mt-2 text-2xl font-black">Urgent operational queues</h2>{activeUrgent.length ? <div className="mt-6 grid gap-3 lg:grid-cols-2">{activeUrgent.map(([count, label, href, cta]) => <div key={label} className="flex flex-col gap-4 rounded-[8px] border border-white/10 bg-white/[0.025] p-5 sm:flex-row sm:items-center sm:justify-between"><p className="font-bold"><span className="text-[var(--gold)]">{count}</span> {label}{count === 1 ? "" : "s"} need review</p><LinkButton href={href} variant="secondary">{cta}</LinkButton></div>)}</div> : <div className="mt-6 rounded-[8px] border border-emerald-500/20 bg-emerald-500/5 p-6"><ShieldCheck className="text-emerald-300" /><p className="mt-3 text-lg font-black">All queues are clear.</p><p className="mt-1 text-sm text-slate-400">No urgent reviews are waiting right now.</p></div>}</Card>
    <Card className="mt-8 border-emerald-500/20 p-6"><h2 className="text-xl font-black">System Safety</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Object.entries(data.overview.safety ?? {}).map(([key, value]) => <div key={key} className="rounded-[8px] bg-white/[0.03] p-4"><p className="text-xs font-bold text-slate-500">{friendlyLabel(key)}</p><p className="mt-2 font-black text-emerald-300">{String(value)}</p></div>)}</div></Card>
    <Card className="mt-8 p-6"><h2 className="text-xl font-black">Recent Audit Events</h2><div className="mt-4 space-y-3">{(data.overview.recentAuditEvents ?? []).length ? (data.overview.recentAuditEvents ?? []).map((item) => <AuditRow key={item.id} record={item} />) : <p className="rounded-[8px] bg-white/[0.025] p-5 text-slate-400">No recent administrative events.</p>}</div></Card>
  </>;
}

function ActionCentre({ data, onSelect }: { data: AdminData; onSelect: (record: AdminRecord) => void }) {
  const taskGroups = [
    ["Sponsor applications", data.sponsors.filter((item) => ["pending", "pending_review", "needs_changes"].includes(recordStatus(item))), "/admin/sponsors"],
    ["Challenge reviews", data.challenges.filter((item) => ["pending", "pending_review", "flagged"].includes(recordStatus(item))), "/admin/challenges"],
    ["Submission reviews", data.submissions.filter((item) => ["pending", "pending_review", "flagged"].includes(recordStatus(item))), "/admin/submissions"],
    ["Winner reviews", data.winners.filter((item) => ["pending", "pending_admin_review", "held"].includes(recordStatus(item))), "/admin/winners"],
    ["Withdrawal reviews", data.withdrawals.filter((item) => ["pending", "pending_review", "needs_kyc"].includes(recordStatus(item))), "/admin/withdrawals"],
    ["Open disputes", data.disputes.filter((item) => !["resolved", "closed", "rejected"].includes(recordStatus(item))), "/admin/disputes"]
  ] as const;
  const total = taskGroups.reduce((sum, [, records]) => sum + records.length, 0);
  return <div className="mt-8 space-y-6"><Card className="p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-bold text-slate-400">Tasks requiring action</p><p className="mt-2 text-4xl font-black">{total}</p></div><p className="max-w-xl text-sm leading-6 text-slate-300">These tasks come from current stored records. Nothing is generated to fill an empty queue.</p></div></Card><div className="grid gap-5 lg:grid-cols-2">{taskGroups.map(([label, records, href]) => <Card key={label} className="p-5"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-black">{label}</h2><Status value={records.length ? "needs attention" : "clear"} /></div><p className="mt-3 text-3xl font-black">{records.length}</p>{records.length ? <div className="mt-5 space-y-2">{records.slice(0, 3).map((record) => <button key={record.id} type="button" onClick={() => onSelect(record)} className="flex w-full items-center justify-between rounded-[8px] border border-white/10 p-3 text-left text-sm font-bold"><span className="min-w-0 truncate">{recordTitle(record)}</span><ArrowRight size={16} /></button>)}</div> : <p className="mt-4 text-sm text-slate-400">No records currently need action.</p>}<LinkButton href={href} variant="secondary" className="mt-5">Open queue</LinkButton></Card>)}</div></div>;
}

function Queue({ records, allRecords, statuses, filter, setFilter, section, onSelect, onAction }: { records: AdminRecord[]; allRecords: AdminRecord[]; statuses: string[]; filter: string; setFilter: (value: string) => void; section: string; onSelect: (record: AdminRecord) => void; onAction: (record: AdminRecord, action: string) => void }) {
  return <><div className="scrollbar-dark mt-8 flex gap-2 overflow-x-auto pb-2"><Button variant={filter === "all" ? "primary" : "secondary"} onClick={() => setFilter("all")}>All <span className="ml-1 opacity-70">{allRecords.length}</span></Button>{statuses.map((status) => <Button key={status} variant={filter === status ? "primary" : "secondary"} onClick={() => setFilter(status)}>{friendlyLabel(status)} <span className="ml-1 opacity-70">{allRecords.filter((item) => recordStatus(item) === status).length}</span></Button>)}</div><div className="mt-6 grid gap-5 xl:grid-cols-2">{records.length ? records.map((record) => <RecordCard key={record.id} record={record} section={section} onSelect={onSelect} onAction={onAction} />) : <Card className="xl:col-span-2"><EmptyState icon={<ClipboardCheck />} title={`No ${friendlyLabel(filter === "all" ? section : filter).toLowerCase()} records`} body="The live Firestore queue is currently empty for this filter." /></Card>}</div></>;
}

function RecordCard({ record, section, onSelect, onAction }: { record: AdminRecord; section: string; onSelect: (record: AdminRecord) => void; onAction: (record: AdminRecord, action: string) => void }) {
  const title = recordTitle(record);
  const status = recordStatus(record);
  const details = displayEntries(record).slice(0, 8);
  return <Card className="flex min-w-0 flex-col p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">{friendlyLabel(section)}</p><h2 className="mt-2 break-words text-xl font-black">{title}</h2></div><Status value={status} /></div><dl className="mt-5 grid gap-3 sm:grid-cols-2">{details.map(([key, value]) => <DataPoint key={key} label={key} value={value} />)}</dl>{section === "withdrawals" ? <p className="mt-4 text-xs leading-5 text-amber-200">Two different administrator approvals remain required. Marking a request paid records a manual status only and never calls a payout provider.</p> : null}<div className="mt-auto flex flex-wrap gap-2 pt-6"><Button variant="secondary" onClick={() => onSelect(record)}>View details</Button>{availableQueueActions(section, status).slice(0, 3).map((item) => <Button key={item.action} variant={item.dangerous ? "secondary" : "primary"} onClick={() => onAction(record, item.action)}>{item.label}</Button>)}</div></Card>;
}

function DetailDrawer({ record, section, onClose, onAction }: { record: AdminRecord; section: string; onClose: () => void; onAction?: (record: AdminRecord, action: string) => void }) {
  const technical = technicalEntries(record);
  return <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label={`${recordTitle(record)} details`}><button className="absolute inset-0 bg-black/80" onClick={onClose} aria-label="Close details" /><aside className="absolute inset-y-0 right-0 w-full max-w-2xl overflow-y-auto border-l border-[var(--gold)]/20 bg-[#0b0b0b] p-6 text-white sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">{friendlyLabel(section)}</p><h2 className="mt-2 text-2xl font-black">{recordTitle(record)}</h2><div className="mt-3"><Status value={recordStatus(record)} /></div></div><button onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] border border-white/10" aria-label="Close details"><X /></button></div><div className="mt-8 grid gap-3 sm:grid-cols-2">{displayEntries(record, true).map(([key, value]) => <DataPoint key={key} label={key} value={value} />)}</div>{technical.length ? <details className="mt-6 rounded-[8px] border border-white/10 p-4"><summary className="cursor-pointer font-bold">Technical details</summary><dl className="mt-4 grid gap-3 sm:grid-cols-2">{technical.map(([key, value]) => <DataPoint key={key} label={key} value={value} />)}</dl></details> : null}<Card className="mt-8 p-5"><h3 className="font-black">Related operations</h3><div className="mt-4 flex flex-wrap gap-2">{relatedLinks(record, section).map((item) => <LinkButton key={item.href} href={item.href} variant="secondary">{item.label}</LinkButton>)}{!relatedLinks(record, section).length ? <p className="text-sm text-slate-400">Related records will appear as their data becomes available.</p> : null}</div></Card>{onAction ? <div className="mt-8 flex flex-wrap gap-2">{availableQueueActions(section, recordStatus(record)).map((item) => <Button key={item.action} variant={item.dangerous ? "secondary" : "primary"} onClick={() => onAction(record, item.action)}>{item.label}</Button>)}</div> : null}</aside></div>;
}

function ActionDialog({ action, reason, note, setReason, setNote, submitting, onCancel, onConfirm }: { action: string; reason: string; note: string; setReason: (value: string) => void; setNote: (value: string) => void; submitting: boolean; onCancel: () => void; onConfirm: () => void }) {
  const needsReason = reasonRequired.has(action);
  const noteOnly = action === "add_note";
  return <div className="fixed inset-0 z-[100] flex items-center justify-center p-5" role="dialog" aria-modal="true" aria-label="Confirm admin action"><button className="absolute inset-0 bg-black/85" onClick={onCancel} aria-label="Cancel admin action" /><Card className="relative z-10 w-full max-w-xl border-[var(--gold)]/25 p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Review decision</p><h2 className="mt-3 text-2xl font-black">{friendlyLabel(action)}</h2><div className="mt-4 rounded-[8px] border border-white/10 p-4"><h3 className="font-black">What happens next</h3><p className="mt-2 text-sm leading-6 text-slate-300">The server will verify your permission and the record's current state, save the decision, and add an audit event. This control does not execute an external payment, payout, or refund.</p></div>{needsReason ? <label className="mt-6 block"><span className="mb-2 block text-sm font-bold">Reason required</span><textarea className={textareaClass} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why this action is required." /></label> : null}<label className="mt-5 block"><span className="mb-2 block text-sm font-bold">{noteOnly ? "Internal note required" : "Internal note (optional)"}</span><textarea className={textareaClass} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Visible only to authorized administrators." /></label><div className="mt-6 grid gap-3 sm:grid-cols-2"><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button onClick={onConfirm} disabled={submitting}>{submitting ? "Saving..." : `Confirm ${friendlyLabel(action)}`}</Button></div></Card></div>;
}

function RecordsWorkspace({ section, data, onSelect }: { section: string; data: AdminData; onSelect: (record: AdminRecord) => void }) {
  let records: AdminRecord[] = [];
  if (section === "dorocoin") records = [...data.doroCoin.wallets, ...data.doroCoin.transactions];
  else if (section === "host-workspaces") records = data.hostWorkspaces;
  else if (section === "sponsor-brands") records = data.sponsorBrands;
  else if (section === "cash-ledger") records = data.cashLedger;
  else if (section === "notifications") records = data.adminNotifications;
  else if (section === "prize-wheel") records = data.prizeWheel;
  else if (section === "prediction-settlements") records = data.predictionSettlements;
  else if (section === "ad-rewards") records = data.adRewards;
  else if (section === "enterprise-leads") records = data.enterpriseLeads;
  else if (section === "media-moderation") records = data.mediaModeration;
  else if (section === "risk-safety") records = data.riskSafety;
  else {
    const value = data[section as keyof AdminData];
    if (Array.isArray(value)) records = value as AdminRecord[];
  }
  const emptyCopy: Record<string, string> = {
    disputes: "No disputes have been opened.", creators: "No Creator accounts are available.", "host-workspaces": "No Host workspaces are available.",
    "sponsor-brands": "No Sponsor brands are available.", events: "No event records are available.", tournaments: "No tournament plans are available.",
    dorocoin: "No DoroCoin wallet or transaction records are available.", "cash-ledger": "No cash ledger entries are available.",
    notifications: "No admin notifications are waiting.", support: "No support tickets are open.", announcements: "No announcements have been drafted.",
    predictions: "No Prediction Arena records are waiting.", "prediction-settlements": "No prediction settlement or refund reviews are waiting.", rewards: "No reward fulfillment records are waiting.", "prize-wheel": "No prize wheel prizes have been configured.", kyc: "No KYC metadata records are available.", "ad-rewards": "No ad reward logs are available.", "enterprise-leads": "No enterprise leads have been submitted.", "media-moderation": "No media uploads are queued for moderation.", "risk-safety": "No risk or safety records are queued."
  };
  return <><Card className="mt-8 border-yellow-500/20 bg-yellow-500/[0.03] p-5 text-sm leading-6 text-slate-300"><strong className="text-white">Current availability:</strong> this page shows real stored records only. Actions that depend on an unconfigured provider stay unavailable and explain what is needed.</Card><div className="mt-6 grid gap-5 xl:grid-cols-2">{records.length ? records.map((record, index) => <button key={`${section}_${record.id}_${String(record.type ?? index)}`} onClick={() => onSelect(record)} className="text-left"><Card className="h-full p-5 transition hover:border-[var(--gold)]/40"><div className="flex items-start justify-between gap-3"><h2 className="break-words text-lg font-black">{recordTitle(record)}</h2><Status value={recordStatus(record)} /></div><dl className="mt-4 grid gap-3 sm:grid-cols-2">{displayEntries(record).slice(0, 6).map(([key, value]) => <DataPoint key={key} label={key} value={value} />)}</dl><p className="mt-5 text-sm font-black text-[var(--gold)]">View details</p></Card></button>) : <Card className="xl:col-span-2"><EmptyState icon={sectionIcon(section)} title={emptyCopy[section] ?? "No records yet"} body="Real records will appear here when they are created." /></Card>}</div></>;
}

function SearchResults({ data, query }: { data: AdminData; query: string }) {
  const q = query.trim().toLowerCase();
  const groups = [
    ["Users", data.users], ["Sponsors", data.sponsors], ["Hosts", data.hosts], ["Challenges", data.challenges],
    ["Submissions", data.submissions], ["Withdrawals", data.withdrawals]
  ] as const;
  const results = groups.map(([label, records]) => [label, q ? records.filter((record) => JSON.stringify(record).toLowerCase().includes(q)).slice(0, 25) : []] as const);
  return <>{!q ? <Card className="mt-8"><EmptyState icon={<Search />} title="Enter a search term" body="Use the global admin search to find users, emails, brands, challenges, submissions, and withdrawal references." /></Card> : <div className="mt-8 space-y-7">{results.map(([label, records]) => <section key={label}><h2 className="text-xl font-black">{label} <span className="text-sm text-slate-500">{records.length}</span></h2><div className="mt-3 grid gap-3 md:grid-cols-2">{records.length ? records.map((record) => <Card key={record.id} className="p-4"><p className="font-black">{recordTitle(record)}</p><p className="mt-2 break-all text-xs text-slate-500">{record.id}</p></Card>) : <p className="text-sm text-slate-500">No matching {label.toLowerCase()}.</p>}</div></section>)}</div>}</>;
}

function Reports({ records }: { records: Record<string, unknown> }) {
  const reports = ["Challenge report", "Submission report", "Participant report", "Voting report", "Winner report", "Revenue review report", "Sponsor interest report", "Withdrawal report", "Safety report"];
  return <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{reports.map((label) => { const key = label.split(" ")[0].toLowerCase() + "Count"; return <Card key={label} className="p-6"><BarChart3 className="text-[var(--gold)]" /><h2 className="mt-4 text-xl font-black">{label}</h2><p className="mt-3 text-3xl font-black">{String(records[key] ?? "—")}</p><p className="mt-2 text-sm text-slate-400">Current stored records where available.</p><Button className="mt-5" variant="secondary" disabled>No data to export</Button></Card>; })}</div>;
}

function AuditLogs({ records }: { records: AdminRecord[] }) {
  return <Card className="mt-8 p-5 sm:p-7">{records.length ? records.map((record) => <AuditRow key={record.id} record={record} />) : <EmptyState icon={<FileClock />} title="No audit events yet" body="Sensitive administrative actions will appear here." />}</Card>;
}

function AuditRow({ record }: { record: AdminRecord }) {
  return <div className="grid gap-3 border-b border-white/10 py-5 lg:grid-cols-[170px_1fr_1fr]"><span className="text-sm text-slate-500">{relativeTime(record.createdAt)}</span><div><p className="font-black">{String(record.actorName ?? "Administrator")} <span className="font-normal text-slate-400">{friendlyLabel(String(record.action ?? "admin action"))}</span></p><p className="mt-1 text-xs text-slate-500">{String(record.actorEmail ?? "")}</p></div><div className="text-sm text-slate-300"><p>{friendlyLabel(String(record.targetType ?? "record"))}: {String(record.targetId ?? "")}</p>{record.reason ? <p className="mt-1">Reason: {String(record.reason)}</p> : null}{record.previousStatus || record.newStatus ? <p className="mt-1 text-xs text-slate-500">{friendlyLabel(String(record.previousStatus ?? "unknown"))} → {friendlyLabel(String(record.newStatus ?? "unknown"))}</p> : null}</div></div>;
}

function Configuration({ section, records }: { section: string; records: Record<string, unknown> }) {
  const content: unknown = section === "categories" ? records.categories : section === "voting-rules" ? records.votingRules : section === "revenue-rules" ? records.revenueRules : section === "feature-flags" ? records.featureFlags : section === "roles" ? records.roles : records;
  const entries = Array.isArray(content) ? content.map((value) => [String(value), "Not configured"] as const) : Object.entries((content ?? {}) as Record<string, unknown>);
  return <><Card className="mt-8 border-yellow-500/20 p-6"><h2 className="text-xl font-black">Protected configuration</h2><p className="mt-3 leading-7 text-slate-300">These values are informational. Sensitive features cannot be activated from this page.</p></Card><div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{entries.map(([key, value]) => <Card key={key} className="p-5"><p className="text-sm font-bold text-slate-500">{friendlyLabel(key)}</p><p className="mt-3 break-words text-lg font-black">{typeof value === "object" ? JSON.stringify(value) : friendlyLabel(String(value))}</p><Button className="mt-5" variant="secondary" disabled>Read only</Button></Card>)}</div></>;
}

function DataPoint({ label, value }: { label: string; value: unknown }) {
  return <div className="min-w-0 rounded-[8px] bg-white/[0.025] p-3"><dt className="text-xs font-bold text-slate-500">{friendlyLabel(label)}</dt><dd className="mt-1 break-words text-sm font-bold">{formatValue(value, label)}</dd></div>;
}
function Status({ value }: { value: string }) {
  return <span className="inline-flex rounded-full border border-white/10 px-3 py-1.5 text-xs font-black text-slate-300">{friendlyLabel(value)}</span>;
}
function recordStatus(record: AdminRecord) {
  return String(record.status ?? record.sponsorStatus ?? record.hostStatus ?? record.verificationStatus ?? "recorded");
}
function recordTitle(record: AdminRecord) {
  return String(record.brandName ?? record.workspaceName ?? record.organizationName ?? record.title ?? record.subject ?? record.userName ?? record.displayName ?? record.challengeTitle ?? record.payoutMethodLabel ?? record.type ?? record.id);
}
function displayEntries(record: AdminRecord, all = false) {
  const hidden = new Set(["id", "brandName", "workspaceName", "organizationName", "title", "subject", "userName", "displayName", "challengeTitle", "payoutMethodLabel", "status", "sponsorStatus", "hostStatus", "verificationStatus", "mediaUrl", "adminNote", "internalNote"]);
  return Object.entries(record).filter(([key, value]) => !hidden.has(key) && !isTechnicalKey(key) && value !== null && value !== "" && typeof value !== "object").slice(0, all ? 30 : 10);
}
function technicalEntries(record: AdminRecord) {
  return Object.entries(record).filter(([key, value]) => isTechnicalKey(key) && value !== null && value !== "" && typeof value !== "object").slice(0, 24);
}
function isTechnicalKey(key: string) {
  return key === "id" || /(?:Id|Ids|Reference)$/.test(key);
}
function formatValue(value: unknown, label = "") {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString();
  if (/(?:At|Date|Time|Deadline)$/.test(label)) {
    const date = new Date(String(value ?? ""));
    if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(date);
  }
  return friendlyLabel(String(value ?? "Not available"));
}
function friendlyLabel(value: string) {
  return value.replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function relativeTime(value: unknown) {
  const time = Date.parse(String(value ?? ""));
  if (!Number.isFinite(time)) return "Time unavailable";
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
function relatedLinks(record: AdminRecord, section: string) {
  const links: Array<{ href: string; label: string }> = [];
  if (record.challengeId) links.push({ href: `/challenges/${record.challengeId}`, label: "View Challenge" });
  if (section === "challenges") links.push({ href: `/challenges/${record.id}`, label: "View Challenge" });
  if (record.userId) links.push({ href: `/admin/search?q=${encodeURIComponent(String(record.userId))}`, label: "Find User" });
  if (section === "withdrawals") links.push({ href: "/admin/cash-ledger", label: "View Cash Ledger" });
  return links;
}
function sectionIcon(section: string) {
  const icons: Record<string, React.ReactNode> = { disputes: <Flag />, creators: <UserCog />, "host-workspaces": <UsersRound />, "sponsor-brands": <ShieldCheck />, events: <Radio />, tournaments: <Trophy />, dorocoin: <Coins />, "cash-ledger": <WalletCards />, notifications: <Bell />, support: <LifeBuoy />, announcements: <Megaphone />, predictions: <Coins />, "prediction-settlements": <Landmark />, rewards: <Trophy />, "prize-wheel": <Trophy />, kyc: <ShieldCheck />, "ad-rewards": <Bell />, "enterprise-leads": <FolderCog />, "media-moderation": <ClipboardCheck />, "risk-safety": <ShieldAlert /> };
  return icons[section] ?? <Activity />;
}
