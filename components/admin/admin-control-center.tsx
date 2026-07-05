"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, BarChart3, ClipboardCheck, FileClock, Landmark, ShieldAlert, ShieldCheck, Trophy, UserCog, UsersRound } from "lucide-react";
import { Button, Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type AdminData = {
  overview: Record<string, unknown> & { recentAuditEvents?: AdminRecord[]; safety?: Record<string, unknown> };
  sponsors: AdminRecord[];
  hosts: AdminRecord[];
  challenges: AdminRecord[];
  submissions: AdminRecord[];
  participants: AdminRecord[];
  winners: AdminRecord[];
  withdrawals: AdminRecord[];
  reports: Record<string, unknown>;
  users: AdminRecord[];
  auditLogs: AdminRecord[];
  settings: Record<string, unknown>;
};
type AdminRecord = Record<string, unknown> & { id: string; status?: string };

const sectionMeta: Record<string, { title: string; description: string }> = {
  overview: { title: "Admin Command Center", description: "Operational review queues, platform safety, and recent administrative activity." },
  sponsors: { title: "Sponsor Approvals", description: "Review brand applications without unlocking paid tools unless subscription requirements are also met." },
  hosts: { title: "Host Verification", description: "Review Host workspaces. Verification never replaces an active Host subscription." },
  challenges: { title: "Challenge Moderation", description: "Review challenge rules, visibility, dates, sponsor readiness, and prize foundations." },
  submissions: { title: "Submission Moderation", description: "Review pending and flagged entries without deleting source media." },
  participants: { title: "Participant Oversight", description: "Review registration, check-in, disqualification, and reinstatement states." },
  winners: { title: "Winner Confirmation", description: "Approve announcements or hold results. No payout or prize release occurs here." },
  withdrawals: { title: "Withdrawal Review", description: "Review reserved eligible balances. No automatic payout provider is connected." },
  reports: { title: "Operational Reports", description: "Live record counts and review foundations. Exports are not active." },
  users: { title: "User Oversight", description: "Review account type, effective tier, subscriptions, verification, and activity." },
  "audit-logs": { title: "Admin Audit Logs", description: "Append-only history of sensitive administrative and financial-review actions." },
  settings: { title: "Admin Settings", description: "Review rules and safety configuration foundations." }
};

const actions: Record<string, Array<{ action: string; label: string; dangerous?: boolean }>> = {
  sponsors: [{ action: "approve", label: "Approve Sponsor" }, { action: "request_changes", label: "Request Changes" }, { action: "reject", label: "Reject", dangerous: true }, { action: "suspend", label: "Suspend", dangerous: true }],
  hosts: [{ action: "verify", label: "Verify Host" }, { action: "request_changes", label: "Request Changes" }, { action: "reject", label: "Reject", dangerous: true }, { action: "suspend", label: "Suspend", dangerous: true }],
  challenges: [{ action: "approve", label: "Approve Challenge" }, { action: "flag", label: "Flag" }, { action: "reject", label: "Reject", dangerous: true }, { action: "archive", label: "Archive" }, { action: "suspend", label: "Suspend", dangerous: true }],
  submissions: [{ action: "approve", label: "Approve" }, { action: "request_changes", label: "Request Changes" }, { action: "flag", label: "Flag" }, { action: "reject", label: "Reject", dangerous: true }],
  participants: [{ action: "approve", label: "Approve" }, { action: "reinstate", label: "Reinstate" }, { action: "flag", label: "Flag" }, { action: "reject", label: "Reject", dangerous: true }, { action: "disqualify", label: "Disqualify", dangerous: true }],
  winners: [{ action: "approve", label: "Approve Announcement" }, { action: "hold", label: "Hold" }, { action: "request_review", label: "Request Review" }, { action: "flag", label: "Flag" }],
  withdrawals: [{ action: "approve", label: "Approve After KYC" }, { action: "request_info", label: "Request Information" }, { action: "reject", label: "Reject", dangerous: true }]
};

const typeBySection: Record<string, string> = { sponsors: "sponsor", hosts: "host", challenges: "challenge", submissions: "submission", participants: "participant", winners: "winner", withdrawals: "withdrawal" };

export function AdminControlCenter({ section = "overview" }: { section?: string }) {
  const normalizedSection = sectionMeta[section] ? section : "overview";
  const meta = sectionMeta[normalizedSection];
  const [data, setData] = useState<AdminData | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  async function load() {
    setLoading(true);
    const result = await apiRequest<AdminData>("/api/admin/operations");
    setLoading(false);
    if (!result.ok || !result.data) return setNotice(result.message);
    setData(result.data);
  }
  useEffect(() => { void load(); }, []);

  const records = useMemo(() => {
    if (!data || !Array.isArray(data[normalizedSection as keyof AdminData])) return [];
    const list = data[normalizedSection as keyof AdminData] as AdminRecord[];
    return filter === "all" ? list : list.filter((item) => String(item.status ?? item.sponsorStatus ?? item.hostStatus) === filter);
  }, [data, filter, normalizedSection]);
  const statuses = useMemo(() => [...new Set(records.map((item) => String(item.status ?? item.sponsorStatus ?? item.hostStatus ?? "unknown")))], [records]);

  async function decide(record: AdminRecord, action: string) {
    const needsReason = ["reject", "request_changes", "suspend", "flag", "disqualify", "hold", "request_review", "request_info"].includes(action);
    const reason = needsReason ? window.prompt(`Reason required for ${action.replaceAll("_", " ")}:`)?.trim() : "";
    if (needsReason && !reason) return;
    if (!window.confirm(`Confirm ${action.replaceAll("_", " ")} for this ${typeBySection[normalizedSection]}?`)) return;
    const result = await apiRequest("/api/admin/operations", { method: "PATCH", body: JSON.stringify({ type: typeBySection[normalizedSection], id: record.id, action, reason }) });
    setNotice(result.message);
    if (result.ok) await load();
  }

  return (
    <>
      <PageTitle title={meta.title} subtitle={meta.description} icon={<ShieldCheck />} />
      {notice ? <Card className="mt-6 border-yellow-500/20 p-4 text-sm text-slate-200">{notice}</Card> : null}
      {loading ? <div className="mt-8 grid gap-5 md:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((item) => <Card key={item} className="h-36 animate-pulse" />)}</div> : null}
      {!loading && data && normalizedSection === "overview" ? <Overview data={data} /> : null}
      {!loading && data && actions[normalizedSection] ? <>
        <div className="mt-8 flex flex-wrap gap-2"><Button variant={filter === "all" ? "primary" : "secondary"} onClick={() => setFilter("all")}>All</Button>{statuses.map((status) => <Button key={status} variant={filter === status ? "primary" : "secondary"} onClick={() => setFilter(status)}>{status.replaceAll("_", " ")}</Button>)}</div>
        <div className="mt-6 grid gap-5 xl:grid-cols-2">{records.length ? records.map((record) => <RecordCard key={record.id} record={record} section={normalizedSection} onAction={decide} />) : <Card className="xl:col-span-2"><EmptyState icon={<ClipboardCheck />} title={`No ${normalizedSection} records`} body="The live Firestore queue is currently empty for this filter." /></Card>}</div>
      </> : null}
      {!loading && data && normalizedSection === "reports" ? <Reports records={data.reports} /> : null}
      {!loading && data && normalizedSection === "users" ? <Users records={data.users} /> : null}
      {!loading && data && normalizedSection === "audit-logs" ? <AuditLogs records={data.auditLogs} /> : null}
      {!loading && data && normalizedSection === "settings" ? <Settings records={data.settings} /> : null}
    </>
  );
}

function Overview({ data }: { data: AdminData }) {
  const cards = [
    ["Pending sponsor reviews", data.overview.pendingSponsorReviews, ShieldCheck],
    ["Pending host verifications", data.overview.pendingHostVerifications, UserCog],
    ["Pending challenge reviews", data.overview.pendingChallengeReviews, Trophy],
    ["Pending submissions", data.overview.pendingSubmissions, ClipboardCheck],
    ["Flagged submissions", data.overview.flaggedSubmissions, ShieldAlert],
    ["Participant approvals", data.overview.participantApprovals, UsersRound],
    ["Winner confirmations", data.overview.winnerConfirmations, Trophy],
    ["Open disputes", data.overview.openDisputes, Activity],
    ["Revenue review items", data.overview.revenueReviewItems, Landmark]
  ] as const;
  return <><div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{cards.map(([label, value, Icon]) => <Card key={label} className="p-5"><Icon className="text-[var(--gold)]" /><p className="mt-4 text-sm font-bold text-slate-400">{label}</p><p className="mt-2 text-3xl font-black">{String(value ?? 0)}</p></Card>)}</div><Card className="mt-8 border-emerald-500/20 p-6"><h2 className="text-xl font-black">System safety status</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{Object.entries(data.overview.safety ?? {}).map(([key, value]) => <div key={key} className="rounded-[8px] bg-white/[0.03] p-4"><p className="text-xs font-bold capitalize text-slate-500">{key.replaceAll(/([A-Z])/g, " $1")}</p><p className="mt-2 font-black capitalize text-emerald-300">{String(value).replaceAll("_", " ")}</p></div>)}</div></Card><Card className="mt-8 p-6"><h2 className="text-xl font-black">Recent audit events</h2><div className="mt-4 space-y-3">{(data.overview.recentAuditEvents ?? []).length ? (data.overview.recentAuditEvents ?? []).map((item) => <AuditRow key={item.id} record={item} />) : <p className="text-slate-400">No recent administrative events.</p>}</div></Card></>;
}

function RecordCard({ record, section, onAction }: { record: AdminRecord; section: string; onAction: (record: AdminRecord, action: string) => void }) {
  const title = String(record.brandName ?? record.title ?? record.displayName ?? record.challengeTitle ?? record.payoutMethodLabel ?? record.id);
  const status = String(record.status ?? record.sponsorStatus ?? record.hostStatus ?? "unknown");
  const hidden = new Set(["id", "brandName", "title", "displayName", "status", "sponsorStatus", "hostStatus", "mediaUrl", "adminNote", "internalNote"]);
  const details = Object.entries(record).filter(([key, value]) => !hidden.has(key) && value !== null && value !== "" && typeof value !== "object").slice(0, 8);
  return <Card className="flex flex-col p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">{section.replaceAll("-", " ")}</p><h2 className="mt-2 break-words text-xl font-black">{title}</h2></div><span className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-black capitalize text-slate-300">{status.replaceAll("_", " ")}</span></div>{section === "submissions" && record.mediaUrl ? <a href={String(record.mediaUrl)} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-[8px] border border-white/10 px-4 text-sm font-black text-[var(--gold)]">View Media</a> : null}<dl className="mt-5 grid gap-3 sm:grid-cols-2">{details.map(([key, value]) => <div key={key} className="rounded-[8px] bg-white/[0.025] p-3"><dt className="text-xs font-bold capitalize text-slate-500">{key.replaceAll(/([A-Z])/g, " $1")}</dt><dd className="mt-1 break-words text-sm font-bold capitalize">{typeof value === "boolean" ? value ? "Yes" : "No" : String(value).replaceAll("_", " ")}</dd></div>)}</dl>{section === "withdrawals" ? <p className="mt-4 text-xs leading-5 text-amber-200">Approval is blocked until KYC is genuinely verified. No payout or paid-state action exists.</p> : null}<div className="mt-auto flex flex-wrap gap-2 pt-6">{actions[section].map((item) => <Button key={item.action} variant={item.dangerous ? "secondary" : "primary"} onClick={() => onAction(record, item.action)}>{item.label}</Button>)}</div></Card>;
}

function Reports({ records }: { records: Record<string, unknown> }) {
  return <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{Object.entries(records).filter(([key]) => key !== "exportsEnabled").map(([key, value]) => <Card key={key} className="p-6"><BarChart3 className="text-[var(--gold)]" /><p className="mt-4 text-sm font-bold capitalize text-slate-400">{key.replaceAll(/([A-Z])/g, " $1")}</p><p className="mt-2 text-3xl font-black">{String(value)}</p><Button className="mt-5" variant="secondary" disabled>Export coming soon</Button></Card>)}</div>;
}

function Users({ records }: { records: AdminRecord[] }) {
  return <Card className="mt-8 overflow-hidden">{records.length ? records.map((record) => <div key={record.id} className="grid gap-3 border-b border-white/10 p-5 md:grid-cols-[1.2fr_1.3fr_1fr_1fr]"><div><p className="font-black">{String(record.displayName || "Unnamed user")}</p><p className="text-xs text-slate-500">{String(record.email || "")}</p></div><span className="capitalize">{String(record.accountType ?? "user")}</span><span>{String(record.effectiveTier ?? "Free Competitor")}</span><span className="capitalize text-slate-400">{String(record.subscriptionStatus ?? "none").replaceAll("_", " ")}</span></div>) : <EmptyState icon={<UsersRound />} title="No users found" body="User records will appear here when Firestore contains accounts." />}</Card>;
}

function AuditLogs({ records }: { records: AdminRecord[] }) {
  return <Card className="mt-8 p-5">{records.length ? records.map((record) => <AuditRow key={record.id} record={record} />) : <EmptyState icon={<FileClock />} title="No audit events" body="Sensitive admin actions will appear here." />}</Card>;
}

function AuditRow({ record }: { record: AdminRecord }) {
  return <div className="grid gap-2 border-b border-white/10 py-4 md:grid-cols-[180px_1fr_1fr]"><span className="text-sm text-slate-500">{record.createdAt ? new Date(String(record.createdAt)).toLocaleString() : "Pending"}</span><span className="font-black">{String(record.action ?? "admin action")}</span><span className="text-sm text-slate-300">{String(record.targetType ?? "record")} · {String(record.targetId ?? "")}</span></div>;
}

function Settings({ records }: { records: Record<string, unknown> }) {
  const foundations = ["Admin roles", "Review rules", "Challenge categories", "Safety rules", "Sponsor review checklist", "Host verification checklist", "Voting risk thresholds", "System notices"];
  return <><div className="mt-8 grid gap-5 md:grid-cols-2">{foundations.map((item) => <Card key={item} className="p-6"><h2 className="text-xl font-black">{item}</h2><p className="mt-3 text-sm leading-6 text-slate-400">Configuration foundation ready. Changes require a reviewed server-side implementation.</p><Button className="mt-5" variant="secondary" disabled>Foundation ready</Button></Card>)}</div><Card className="mt-8 p-6"><pre className="overflow-x-auto whitespace-pre-wrap text-sm text-slate-300">{JSON.stringify(records, null, 2)}</pre></Card></>;
}
