"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Search, ShieldCheck, UserPlus, Users } from "lucide-react";
import { apiRequest } from "@/lib/api/client";
import { Button, Card, EmptyState, Field, inputClass } from "@/components/ui";

type Identity = { id: string; displayName: string; username: string };
type Team = { id: string; name: string; captainUserId: string; memberUserIds: string[]; status: string; paymentStatus: string; rosterLockedAt: string | null };
type TeamBundle = {
  viewerTeam: Team | null;
  viewerCanManage: boolean;
  invitations: Array<Record<string, unknown> & { id: string }>;
  requests: Array<Record<string, unknown> & { id: string }>;
  captainTransfers: Array<Record<string, unknown> & { id: string }>;
  identities: Record<string, Identity>;
};

export function TournamentTeamManager({ tournamentId, minimumSize, maximumSize }: { tournamentId: string; minimumSize: number; maximumSize: number }) {
  const [bundle, setBundle] = useState<TeamBundle | null>(null);
  const [message, setMessage] = useState("");
  const [teamName, setTeamName] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Identity[]>([]);
  const [busy, setBusy] = useState(false);
  const team = bundle?.viewerTeam ?? null;
  const locked = Boolean(team?.rosterLockedAt);
  const remaining = Math.max(0, maximumSize - (team?.memberUserIds.length ?? 0));
  const isCaptain = Boolean(bundle?.viewerCanManage);
  const pendingInvites = useMemo(() => bundle?.invitations.filter((item) => item.teamId === team?.id && item.status === "pending") ?? [], [bundle, team?.id]);
  const pendingRequests = useMemo(() => bundle?.requests.filter((item) => item.teamId === team?.id && item.status === "pending") ?? [], [bundle, team?.id]);
  const pendingCaptainTransfer = useMemo(() => bundle?.captainTransfers.find((item) => item.teamId === team?.id && item.toUserId && item.status === "pending") ?? null, [bundle, team?.id]);

  async function load() {
    const result = await apiRequest<TeamBundle>(`/api/tournaments/${encodeURIComponent(tournamentId)}/teams`);
    if (!result.ok || !result.data) return setMessage(result.message || "Team details could not be loaded.");
    setBundle(result.data);
    setMessage("");
  }

  useEffect(() => { void load(); }, [tournamentId]);

  async function action(actionName: string, values: Record<string, unknown> = {}) {
    setBusy(true);
    const result = await apiRequest(`/api/tournaments/${encodeURIComponent(tournamentId)}/teams`, { method: "POST", body: JSON.stringify({ action: actionName, teamId: team?.id, ...values }) });
    setBusy(false);
    setMessage(result.message);
    if (result.ok) await load();
  }

  async function search() {
    if (!team || query.trim().length < 2) return;
    const result = await apiRequest<{ members: Identity[] }>(`/api/tournaments/${encodeURIComponent(tournamentId)}/teams?q=${encodeURIComponent(query)}&teamId=${encodeURIComponent(team.id)}`);
    setResults(result.ok ? result.data?.members ?? [] : []);
    if (!result.ok) setMessage(result.message);
  }

  if (bundle === null) return <Card className="mt-6 h-48 animate-pulse" aria-busy="true" />;
  if (!team) {
    const invitations = bundle.invitations.filter((item) => item.status === "pending");
    return <div className="mt-6 space-y-5"><Card className="p-6"><EmptyState icon={<Users />} title="Create your Tournament Team" body={`Create a Team with ${minimumSize}-${maximumSize} members. The Captain manages payment, readiness, and check-in.`} /><div className="mx-auto mt-5 flex max-w-lg flex-col gap-3 sm:flex-row"><input className={inputClass} value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Team name" /><Button disabled={busy || teamName.trim().length < 2} onClick={() => void action("create", { name: teamName })}>Create Team</Button></div>{message ? <p className="mt-4 text-center text-sm font-bold text-slate-600">{message}</p> : null}</Card>{invitations.length ? <Card className="p-5 sm:p-6"><h2 className="text-xl font-black">Team Invitations</h2><div className="mt-4 grid gap-3">{invitations.map((invitation) => <div key={invitation.id} className="flex flex-col gap-3 rounded-[8px] border border-black/10 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black">Tournament Team invitation</p><p className="text-sm text-slate-500">Accept to join this Team roster.</p></div><Button disabled={busy} onClick={() => void action("accept_invite", { teamId: invitation.teamId })}>Accept Invitation</Button></div>)}</div></Card> : null}</div>;
  }

  const identity = (userId: unknown) => bundle.identities[String(userId ?? "")] ?? { id: String(userId ?? ""), displayName: "Tournament member", username: "" };
  return <section className="mt-6 space-y-5" aria-label="Tournament Team management">
    <Card className="p-5 sm:p-6"><div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-amber-700">Your Team</p><h2 className="mt-2 text-2xl font-black">{team.name}</h2><p className="mt-2 text-sm text-slate-600">{team.memberUserIds.length} of {maximumSize} members. Minimum {minimumSize}. {remaining} place{remaining === 1 ? "" : "s"} remaining.</p></div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black capitalize">{team.status.replaceAll("_", " ")}</span><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black capitalize">Payment {team.paymentStatus.replaceAll("_", " ")}</span><span className={`rounded-full px-3 py-1 text-xs font-black ${locked ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>{locked ? "Roster Locked" : "Roster Open"}</span></div></div>{message ? <p className="mt-4 rounded-[8px] bg-slate-50 p-3 text-sm font-bold text-slate-700">{message}</p> : null}{pendingCaptainTransfer ? <div className="mt-5 rounded-[8px] border border-amber-300 bg-amber-50 p-4"><p className="font-black text-amber-950">Captain transfer requested</p><p className="mt-1 text-sm text-amber-900">Accepting makes you responsible for Team readiness, payment, and check-in.</p><Button className="mt-3" disabled={busy} onClick={() => void action("confirm_captain_transfer")}>Accept Captain Role</Button></div> : null}<div className="mt-6 grid gap-3">{team.memberUserIds.map((memberId) => { const member = identity(memberId); const captain = memberId === team.captainUserId; return <div key={memberId} className="flex flex-col gap-3 rounded-[8px] border border-black/10 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black">{member.displayName}</p><p className="text-sm text-slate-500">{captain ? "Team Captain" : "Team member"}{member.username ? ` · @${member.username}` : ""}</p></div>{isCaptain && !captain && !locked ? <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={busy} onClick={() => window.confirm(`Transfer the Captain role to ${member.displayName}? They must accept before the role changes.`) && void action("transfer_captain", { userId: memberId })}>Transfer Captain</Button><Button variant="ghost" disabled={busy} onClick={() => window.confirm(`Remove ${member.displayName} from this Team?`) && void action("remove_member", { userId: memberId })}>Remove</Button></div> : null}</div>; })}</div>{!locked ? <div className="mt-6 flex flex-wrap gap-3"><Button disabled={busy || team.memberUserIds.length < minimumSize} onClick={() => void action("ready")}><Check size={16} /> Mark Team Ready</Button></div> : null}</Card>
    {isCaptain && !locked ? <Card className="p-5 sm:p-6"><h2 className="text-xl font-black">Invite Members</h2><p className="mt-2 text-sm text-slate-600">Search by public display name or username. Private account details are not exposed.</p><div className="mt-5 flex gap-3"><div className="flex-1"><Field label="Account search"><input className={inputClass} value={query} onChange={(event) => setQuery(event.target.value)} /></Field></div><Button className="mt-6" variant="secondary" onClick={() => void search()} disabled={query.trim().length < 2}><Search size={16} /> Search</Button></div><div className="mt-4 grid gap-3">{results.map((member) => <div key={member.id} className="flex items-center justify-between gap-3 rounded-[8px] border border-black/10 p-4"><div><p className="font-black">{member.displayName}</p>{member.username ? <p className="text-sm text-slate-500">@{member.username}</p> : null}</div><Button disabled={busy || remaining === 0} onClick={() => void action("invite", { userId: member.id })}><UserPlus size={16} /> Invite</Button></div>)}</div></Card> : null}
    <div className="grid gap-5 lg:grid-cols-2"><Card className="p-5"><h2 className="text-lg font-black">Invitations · {pendingInvites.length}</h2>{pendingInvites.length ? <div className="mt-4 grid gap-3">{pendingInvites.map((invite) => { const member = identity(invite.inviteeUserId); return <div key={invite.id} className="rounded-[8px] border border-black/10 p-4"><p className="font-black">{member.displayName}</p><p className="mt-1 text-sm capitalize text-slate-500">{String(invite.status)}</p>{isCaptain && !locked ? <Button className="mt-3" variant="ghost" disabled={busy} onClick={() => window.confirm("Revoke this pending invitation?") && void action("revoke_invite", { userId: invite.inviteeUserId })}>Revoke</Button> : null}</div>; })}</div> : <p className="mt-3 text-sm text-slate-500">No pending invitations.</p>}</Card><Card className="p-5"><h2 className="text-lg font-black">Join Requests · {pendingRequests.length}</h2>{pendingRequests.length ? <div className="mt-4 grid gap-3">{pendingRequests.map((request) => { const member = identity(request.userId); return <div key={request.id} className="rounded-[8px] border border-black/10 p-4"><p className="font-black">{member.displayName}</p><div className="mt-3 flex gap-2"><Button disabled={busy} onClick={() => void action("accept_request", { userId: request.userId })}><ShieldCheck size={16} /> Accept</Button><Button variant="secondary" disabled={busy} onClick={() => void action("reject_request", { userId: request.userId })}>Reject</Button></div></div>; })}</div> : <p className="mt-3 text-sm text-slate-500">No pending join requests.</p>}</Card></div>
  </section>;
}
