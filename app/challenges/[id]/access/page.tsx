"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button, Card, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { LockKeyhole } from "lucide-react";

type Invitation = { id: string; accessMethod: string; status: string; enabled: boolean; recipientEmail?: string | null; currentUses: number; maxUses?: number | null; expiresAt?: string | null; acceptedAt?: string | null; revokedAt?: string | null };
type AccessRequest = { id: string; userId: string; displayName: string; username: string | null; reason: string; note: string; status: string; createdAt: string | null; decidedAt: string | null };

export default function PrivateAccessManagementPage() {
  const params = useParams<{ id: string }>();
  const id = String(params.id ?? "");
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [message, setMessage] = useState("Loading invitations...");
  const [busy, setBusy] = useState("");
  const [rotatedCredential, setRotatedCredential] = useState<Record<string, unknown> | null>(null);
  const load = useCallback(async () => {
    const result = await apiRequest<{ invitations: Invitation[]; accessRequests: AccessRequest[] }>(`/api/private-exclusive?challengeId=${encodeURIComponent(id)}`);
    if (result.ok && result.data) { setInvitations(result.data.invitations); setAccessRequests(result.data.accessRequests); setMessage(""); }
    else setMessage(result.message || "Invitations could not be loaded.");
  }, [id]);
  useEffect(() => {
    let active = true;
    apiRequest<{ invitations: Invitation[]; accessRequests: AccessRequest[] }>(`/api/private-exclusive?challengeId=${encodeURIComponent(id)}`).then((result) => {
      if (!active) return;
      if (result.ok && result.data) { setInvitations(result.data.invitations); setAccessRequests(result.data.accessRequests); setMessage(""); }
      else setMessage(result.message || "Invitations could not be loaded.");
    });
    return () => { active = false; };
  }, [id]);
  async function revoke(invitationId: string) {
    setBusy(invitationId);
    const result = await apiRequest("/api/private-exclusive", { method: "POST", body: JSON.stringify({ action: "revoke_invite", challengeId: id, inviteId: invitationId }) });
    setBusy("");
    setMessage(result.message);
    if (result.ok) await load();
  }
  async function rotate() {
    setBusy("rotate");
    const result = await apiRequest<{ privateAccess: Record<string, unknown> }>("/api/private-exclusive", { method: "POST", body: JSON.stringify({ action: "rotate_invites", challengeId: id }) });
    setBusy("");
    setMessage(result.message);
    if (result.ok && result.data) { setRotatedCredential(result.data.privateAccess); await load(); }
  }
  async function decide(request: AccessRequest, decision: "approve" | "reject") {
    if (!window.confirm(`${decision === "approve" ? "Approve" : "Reject"} this access request?`)) return;
    setBusy(request.id);
    const result = await apiRequest("/api/private-exclusive", { method: "POST", body: JSON.stringify({ action: "decide_access_request", challengeId: id, requestId: request.id, decision }) });
    setBusy("");
    setMessage(result.message);
    if (result.ok) await load();
  }
  const rotatedInvitations = Array.isArray(rotatedCredential?.invitations) ? rotatedCredential.invitations as Array<{ email: string; token: string }> : [];
  const rotatedLink = typeof rotatedCredential?.token === "string" ? `/private/invite/${rotatedCredential.token}` : typeof rotatedCredential?.code === "string" ? `/private/${rotatedCredential.code}` : "";
  return <AppShell><main className="mx-auto max-w-4xl px-4 py-8 sm:px-6"><PageTitle title="Private access" subtitle="Review access requests and manage this challenge's invitation credentials." icon={<LockKeyhole className="text-[var(--gold)]" />} /><section className="mt-6"><h2 className="text-xl font-black">Access requests</h2><div className="mt-3 space-y-3">{accessRequests.map((request) => <Card key={request.id} className="p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row"><div><p className="font-black">{request.displayName}{request.username ? ` · @${request.username}` : ""}</p><p className="mt-1 text-xs text-slate-500">{request.createdAt ? new Date(request.createdAt).toLocaleString() : ""} · {request.status.replaceAll("_", " ")}</p><p className="mt-3 text-sm">{request.reason}</p>{request.note ? <p className="mt-2 text-sm text-slate-500">{request.note}</p> : null}</div>{request.status === "pending_review" ? <div className="flex shrink-0 gap-2"><Button disabled={Boolean(busy)} onClick={() => void decide(request, "approve")}>Approve</Button><Button variant="secondary" disabled={Boolean(busy)} onClick={() => void decide(request, "reject")}>Reject</Button></div> : null}</div></Card>)}{!accessRequests.length && !message ? <Card className="p-4 text-slate-500">No access requests yet.</Card> : null}</div></section><div className="mt-8"><h2 className="text-xl font-black">Invitation methods</h2><div className="mt-3"><Button variant="secondary" disabled={Boolean(busy)} onClick={rotate}>{busy === "rotate" ? "Rotating..." : "Revoke all and issue new credentials"}</Button></div>{rotatedCredential ? <Card className="mt-5 border-[var(--gold)]/30 p-5"><p className="font-black">New credentials (shown once)</p>{rotatedLink ? <a className="mt-2 block break-all text-[var(--gold)] underline" href={rotatedLink}>{typeof rotatedCredential.code === "string" ? rotatedCredential.code : rotatedLink}</a> : null}{rotatedInvitations.map((item) => <p key={item.email} className="mt-2 break-all text-sm">{item.email}: <a className="text-[var(--gold)] underline" href={`/private/invite/${item.token}`}>{`/private/invite/${item.token}`}</a></p>)}</Card> : null}<div className="mt-6 space-y-3">{invitations.map((invite) => <Card key={invite.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black">{invite.accessMethod === "invite_link" ? "Invite Link" : invite.accessMethod === "direct_invitations" ? "Direct Invitation" : "Invitation Code"}{invite.recipientEmail ? ` · ${invite.recipientEmail}` : ""}</p><p className="mt-1 text-sm text-slate-400">Status: {invite.status} · Uses: {invite.currentUses}{invite.maxUses ? ` / ${invite.maxUses}` : ""}{invite.expiresAt ? ` · Expires ${new Date(invite.expiresAt).toLocaleString()}` : ""}</p></div>{invite.enabled && !["revoked", "accepted", "expired"].includes(invite.status) ? <Button variant="secondary" disabled={Boolean(busy)} onClick={() => revoke(invite.id)}>{busy === invite.id ? "Revoking..." : "Revoke"}</Button> : <span className="text-sm text-slate-500">No longer usable</span>}</Card>)}{!invitations.length && !message ? <Card className="p-5 text-slate-400">No invitations have been issued for this challenge.</Card> : null}</div></div><div className="mt-6"><LinkButton href={`/challenges/${id}`} variant="secondary">Back to challenge</LinkButton></div></main></AppShell>;
}
