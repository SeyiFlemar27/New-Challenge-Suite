"use client";
import { useEffect, useMemo, useState } from "react";
import { Bookmark, Send, Search, Users, X } from "lucide-react";
import { SponsorShell, type SponsorShellProfile } from "@/components/sponsor/sponsor-shell";
import { Button, Card, EmptyState, Field, inputClass, LinkButton, textareaClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type Creator = Record<string, any>;
type Tab = "discover" | "saved" | "pending" | "active";

export default function SponsorCreatorDiscoveryPage() {
  const [profile, setProfile] = useState<SponsorShellProfile | null>(null);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [savedCreators, setSavedCreators] = useState<Creator[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [compare, setCompare] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>("discover");
  const [inviteCreator, setInviteCreator] = useState<Creator | null>(null);
  const [inviteType, setInviteType] = useState("custom_challenge_request");
  const [inviteMessage, setInviteMessage] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => { void load(); }, []);
  async function load() {
    const [profileResult, creatorResult, savedResult, invitationResult] = await Promise.all([
      apiRequest<{ sponsorProfile: SponsorShellProfile }>("/api/sponsor/profile"),
      apiRequest<{ creators: Creator[] }>("/api/sponsor/discover/creators"),
      apiRequest<{ savedCreators: Creator[] }>("/api/sponsor/saved"),
      apiRequest<{ invitations: any[] }>("/api/sponsor/invitations")
    ]);
    if (profileResult.ok && profileResult.data) setProfile(profileResult.data.sponsorProfile);
    if (creatorResult.ok && creatorResult.data) setCreators(creatorResult.data.creators); else setError(creatorResult.message || "Creators could not be loaded.");
    if (savedResult.ok && savedResult.data) setSavedCreators(savedResult.data.savedCreators ?? []);
    if (invitationResult.ok && invitationResult.data) setInvitations(invitationResult.data.invitations ?? []);
    setLoading(false);
  }
  const savedIds = useMemo(() => new Set(savedCreators.map((item) => String(item.creatorId ?? item.id))), [savedCreators]);
  const pendingIds = useMemo(() => new Set(invitations.filter((item) => String(item.status ?? "").includes("pending")).map((item) => String(item.creatorId))), [invitations]);
  const activeIds = useMemo(() => new Set(invitations.filter((item) => ["accepted", "active", "funded"].includes(String(item.status ?? ""))).map((item) => String(item.creatorId))), [invitations]);
  const visibleCreators = useMemo(() => {
    const base = creators.filter((creator) => !query || [creator.displayName, creator.username, creator.niche, creator.category, creator.location].some((value) => String(value ?? "").toLowerCase().includes(query.toLowerCase())));
    if (tab === "saved") return base.filter((creator) => savedIds.has(String(creator.id)));
    if (tab === "pending") return base.filter((creator) => pendingIds.has(String(creator.id)));
    if (tab === "active") return base.filter((creator) => activeIds.has(String(creator.id)));
    return base.filter((creator) => !savedIds.has(String(creator.id)) && !pendingIds.has(String(creator.id)) && !activeIds.has(String(creator.id)));
  }, [activeIds, creators, pendingIds, query, savedIds, tab]);
  async function saveCreator(creatorId: string) { const result = await apiRequest("/api/sponsor/saved/creators", { method: "POST", body: JSON.stringify({ creatorId }) }); setNotice(result.message); void load(); }
  function toggleCompare(id: string) { setCompare((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length >= 4 ? current : [...current, id]); }
  async function sendInvite() { if (!inviteCreator) return; const result = await apiRequest("/api/sponsor/invitations", { method: "POST", body: JSON.stringify({ creatorId: inviteCreator.id, inviteType, message: inviteMessage }) }); setNotice(result.message); if (result.ok) { setInviteCreator(null); setInviteMessage(""); void load(); } }
  return <SponsorShell profile={profile}><div className="mx-auto max-w-7xl"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-sm font-black uppercase tracking-[0.2em] text-[var(--gold)]">Creator Discovery</p><h1 className="mt-3 text-4xl font-black">Find sponsor-ready creators</h1><p className="mt-3 max-w-3xl leading-7 text-slate-600">Only real backend creators with completed profiles and sponsor-ready status appear here. Missing performance metrics are shown as Not available yet.</p></div><div className="flex flex-wrap gap-3"><LinkButton href={compare.length ? `/sponsor/discover/creators/compare?ids=${compare.join(",")}` : "/sponsor/discover/creators/compare"} variant="secondary">Compare ({compare.length}/4)</LinkButton><Button variant="ghost" onClick={() => setCompare([])}>Clear</Button></div></div><Card className="mt-8 p-4"><div className="flex flex-col gap-3 lg:flex-row"><div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-3.5 text-slate-500" size={18} /><input className={`${inputClass} pl-10`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by niche, category, country, city, or verified status" /></div><div className="grid grid-cols-2 gap-2 sm:flex">{(["discover", "saved", "pending", "active"] as Tab[]).map((item) => <Button key={item} variant={tab === item ? "primary" : "secondary"} onClick={() => setTab(item)}>{item[0].toUpperCase() + item.slice(1)}</Button>)}</div></div></Card>{notice ? <Card className="mt-5 p-4 text-sm text-slate-600">{notice}</Card> : null}{error ? <Card className="mt-6 border-red-500/20 border border-red-200 bg-red-50 p-5 text-red-800">{error}</Card> : null}{loading ? <div className="mt-8 grid gap-4">{[0,1,2].map((item) => <Card key={item} className="h-40 animate-pulse bg-slate-100" />)}</div> : visibleCreators.length === 0 ? <EmptyState icon={<Users />} title={tab === "discover" ? "No sponsor-ready creators yet." : `No ${tab} creators yet.`} body={tab === "discover" ? "Creators will appear after a real creator profile is completed and marked sponsor-ready." : "This section updates from saved creators, pending invitations, and active sponsor relationships."} /> : <div className="sponsor-discovery-list mt-8 grid gap-5">{visibleCreators.map((creator) => <CreatorCard key={creator.id} creator={creator} saved={savedIds.has(String(creator.id))} pending={pendingIds.has(String(creator.id))} active={activeIds.has(String(creator.id))} compared={compare.includes(creator.id)} onSave={() => void saveCreator(creator.id)} onCompare={() => toggleCompare(creator.id)} onInvite={() => { setInviteCreator(creator); setInviteMessage(`I would like to discuss a ${inviteType === "custom_challenge_request" ? "custom challenge" : "sponsor campaign"} opportunity with you.`); }} />)}</div>}{inviteCreator ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><Card className="w-full max-w-xl p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">Invite Creator</p><h2 className="mt-2 text-2xl font-black">{inviteCreator.displayName}</h2></div><Button variant="ghost" onClick={() => setInviteCreator(null)}><X size={16} /></Button></div><div className="mt-5 grid gap-4"><Field label="Invite type"><select className={inputClass} value={inviteType} onChange={(event) => setInviteType(event.target.value)}><option value="custom_challenge_request">Custom Challenge Request</option><option value="join_sponsor_campaign">Join Sponsor Campaign</option></select></Field><Field label="Message"><textarea className={textareaClass} value={inviteMessage} onChange={(event) => setInviteMessage(event.target.value)} /></Field><Button disabled={inviteMessage.trim().length < 2} onClick={() => void sendInvite()}><Send size={16} /> Send Pending Invite</Button><p className="text-xs leading-5 text-slate-500">The invite remains pending until the creator/host responds. No acceptance, email delivery, or sponsorship agreement is created.</p></div></Card></div> : null}</div></SponsorShell>;
}

function CreatorCard({ creator, saved, pending, active, compared, onSave, onCompare, onInvite }: { creator: Creator; saved: boolean; pending: boolean; active: boolean; compared: boolean; onSave: () => void; onCompare: () => void; onInvite: () => void }) {
  return <Card className="p-5 sm:p-6"><div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(520px,1fr)] xl:items-center"><div className="flex min-w-0 items-start gap-4"><div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--gold)]/40 bg-slate-100 text-xl font-black text-[var(--gold)]">{creator.avatarUrl ? <img src={creator.avatarUrl} alt="" className="h-full w-full object-cover" /> : String(creator.displayName ?? "C").slice(0,1)}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="break-words text-xl font-black">{creator.displayName}</h2>{active ? <Chip label="Active" /> : pending ? <Chip label="Pending" /> : saved ? <Chip label="Saved" /> : <Chip label="Discover" />}</div><p className="text-sm text-slate-500">@{creator.username}</p><p className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-[var(--gold)]">{creator.verificationStatus || "Not available yet"}</p></div></div><div><div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-3"><Info label="Niche" value={creator.niche} /><Info label="Audience" value={creator.audienceSizeLabel} /><Info label="Engagement" value={creator.engagementRateLabel} /></div><div className="mt-5 flex flex-wrap gap-3 xl:justify-end"><Button variant={saved ? "primary" : "ghost"} onClick={onSave}><Bookmark size={16} /> {saved ? "Saved" : "Save"}</Button><LinkButton href={`/sponsor/discover/creators/${creator.id}`} variant="secondary">View Profile</LinkButton><Button variant={compared ? "primary" : "ghost"} onClick={onCompare}>Compare</Button><Button onClick={onInvite}><Send size={16} /> Invite</Button></div></div></div></Card>;
}

function Chip({ label }: { label: string }) {
  return <span className="rounded-full bg-[var(--gold)]/10 px-3 py-1 text-xs font-black uppercase text-[var(--gold)]">{label}</span>;
}

function Info({ label, value }: { label: string; value: any }) { return <div className="rounded-[8px] border border-slate-200 bg-slate-50 p-3"><p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-1 font-bold text-slate-950">{value || "Not available yet"}</p></div>; }
