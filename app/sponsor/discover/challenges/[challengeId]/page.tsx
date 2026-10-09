"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { Bookmark, MessageSquare, ShieldAlert, Store, WalletCards } from "lucide-react";
import { SponsorShell, type SponsorShellProfile } from "@/components/sponsor/sponsor-shell";
import { Button, Card, Field, inputClass, LinkButton, textareaClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type Opportunity = Record<string, any>;

export default function ChallengeOpportunityPage() {
  const params = useParams<{ challengeId: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<SponsorShellProfile | null>(null);
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fundingAmount, setFundingAmount] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [placementNotes, setPlacementNotes] = useState("");
  const [fundingMessage, setFundingMessage] = useState("");
  const [fundingLoading, setFundingLoading] = useState(false);
  const [agreement, setAgreement] = useState<Opportunity | null>(null);
  const [discussionLoading, setDiscussionLoading] = useState(false);

  useEffect(() => {
    void Promise.all([
      apiRequest<{ sponsorProfile: SponsorShellProfile }>("/api/sponsor/profile"),
      apiRequest<{ opportunity: Opportunity }>(`/api/sponsor/discover/challenges/${params.challengeId}`)
    ]).then(([profileResult, opportunityResult]) => {
      if (profileResult.ok && profileResult.data) setProfile(profileResult.data.sponsorProfile);
      if (opportunityResult.ok && opportunityResult.data) { setOpportunity(opportunityResult.data.opportunity); setAgreement(opportunityResult.data.opportunity.agreement ?? null); }
      else setError(opportunityResult.message || "Opportunity could not be loaded.");
      setLoading(false);
    });
  }, [params.challengeId]);

  async function save() {
    await apiRequest("/api/sponsor/saved/challenges", { method: "POST", body: JSON.stringify({ challengeId: params.challengeId }) });
  }

  async function expressInterest() {
    setFundingMessage("");
    const dollars = Number(fundingAmount);
    if (!Number.isFinite(dollars) || dollars < 5) {
      setFundingMessage("Proposed sponsorship amount must be at least $5.");
      return;
    }
    setFundingLoading(true);
    const result = await apiRequest<{ agreement: Opportunity }>(`/api/sponsor/challenges/${params.challengeId}/interest`, {
      method: "POST",
      body: JSON.stringify({
        amountCents: Math.round(dollars * 100),
        ctaText,
        ctaUrl,
        placements: ["challenge_detail", "voting_page", "leaderboard", "winner_announcement", "share_card"],
        deliverables: placementNotes.trim() ? [placementNotes.trim()] : []
      })
    });
    setFundingLoading(false);
    if (!result.ok || !result.data?.agreement) {
      setFundingMessage(result.message);
      return;
    }
    setAgreement(result.data.agreement);
    setFundingMessage(result.message);
  }

  async function acceptTerms() {
    if (!agreement?.id) return;
    setFundingLoading(true);
    const result = await apiRequest<{ agreement: Opportunity }>(`/api/sponsor/agreements/${agreement.id}/accept`, { method: "POST", body: JSON.stringify({}) });
    setFundingLoading(false);
    if (result.ok && result.data?.agreement) setAgreement(result.data.agreement);
    setFundingMessage(result.message);
  }

  async function startFundingCheckout() {
    if (!agreement?.id || agreement.status !== "accepted") return setFundingMessage("Both parties must accept the current agreement before funding.");
    setFundingLoading(true);
    const result = await apiRequest<{ url?: string }>(`/api/sponsor/challenges/${params.challengeId}/funding-checkout`, {
      method: "POST",
      body: JSON.stringify({ agreementId: agreement.id, idempotencyKey: crypto.randomUUID() })
    });
    setFundingLoading(false);
    if (!result.ok || !result.data?.url) return setFundingMessage(result.message || "Sponsor funding checkout could not start.");
    window.location.href = result.data.url;
  }

  async function discussSponsorship() {
    if (!opportunity?.creatorId) {
      setFundingMessage("Creator or host details are not available yet.");
      return;
    }
    setDiscussionLoading(true);
    const result = await apiRequest<{ conversation: { id?: string } }>("/api/sponsor/messages", {
      method: "POST",
      body: JSON.stringify({
        recipientId: opportunity.creatorId,
        challengeId: params.challengeId,
        title: `Sponsorship discussion: ${opportunity.title}`,
        body: `I am interested in sponsoring ${opportunity.title}. I would like to discuss brand placement, funding fit, and any custom challenge options before checkout.`
      })
    });
    setDiscussionLoading(false);
    if (!result.ok || !result.data?.conversation?.id) {
      setFundingMessage(result.message || "Sponsorship discussion could not be opened.");
      return;
    }
    router.push(`/sponsor/messages/${result.data.conversation.id}`);
  }

  return <SponsorShell profile={profile}>
    {loading ? <Card className="h-96 animate-pulse bg-slate-100" /> : error || !opportunity ? <Card className="border-red-500/20 border border-red-200 bg-red-50 p-6 text-red-800">{error || "Opportunity could not be loaded."}</Card> : <div className="mx-auto max-w-6xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.2em] text-[var(--gold)]">Sponsor-Ready Challenge</p>
          <h1 className="mt-3 text-4xl font-black">{opportunity.title}</h1>
          <p className="mt-3 max-w-3xl leading-7 text-slate-600">{opportunity.description}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => void save()}><Bookmark size={17} /> Save Challenge</Button>
          <Button variant="secondary" onClick={() => void discussSponsorship()} disabled={discussionLoading || !opportunity.creatorId}><MessageSquare size={16} /> {discussionLoading ? "Opening..." : "Discuss Sponsorship"}</Button>
          <LinkButton href="#funding-checkout"><WalletCards size={16} /> Sponsorship terms</LinkButton>
        </div>
      </div>

      <Card className="mt-8 border-yellow-500/20 bg-yellow-500/5 p-5">
        <ShieldAlert className="text-[var(--gold)]" />
        <h2 className="mt-3 text-xl font-black">Agree terms before funding</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Send proposed commercial terms to the challenge owner. Funding opens only after both parties accept the same version. Confirmed contributions remain prize-directed; placements still require review.</p>
      </Card>

      <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <Tile label="Creator / operator" value={opportunity.creatorName} />
        <Tile label="Participants" value={opportunity.participantCount} />
        <Tile label="Category" value={opportunity.category} />
        <Tile label="Current stage" value={opportunity.status} />
        <Tile label="Funding window" value={opportunity.fundingWindow?.allowed ? "Open" : statusLabel(opportunity.fundingWindow?.reason)} />
        <Tile label="Prize pool" value={formatCents(opportunity.currentPrizePoolCents)} />
      </div>

      <Card className="mt-8 p-6">
        <Store className="text-[var(--gold)]" />
        <h2 className="mt-3 text-2xl font-black">Available brand placements</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {(opportunity.placements ?? []).map((item: any) => <p key={typeof item === "string" ? item : item.surface} className="rounded-[8px] border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">{placementLabel(item)}</p>)}
        </div>
      </Card>

      <Card id="funding-checkout" className="mt-8 p-6">
        <WalletCards className="text-[var(--gold)]" />
        <h2 className="mt-3 text-2xl font-black">Sponsorship interest and terms</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">The proposed amount is not charged until you and the Creator/Host accept the same agreement terms.</p>
        {agreement ? <div className="mt-4 rounded-[8px] border border-slate-200 bg-slate-50 p-4 text-sm"><p className="font-black capitalize">Agreement: {String(agreement.status).replaceAll("_", " ")}</p><p className="mt-2">Funding: {String(agreement.fundingStatus ?? "not_started").replaceAll("_", " ")}</p><p className="mt-2">Agreed amount: {formatCents(agreement.terms?.amountCents)}</p><p className="mt-2">Placements: {(agreement.terms?.placements ?? []).map((item: string) => placementLabel(item)).join(", ")}</p></div> : null}
        {!agreement ? <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Funding amount (USD)">
            <input className={inputClass} type="number" min="5" step="1" value={fundingAmount} onChange={(event) => setFundingAmount(event.target.value)} placeholder="500" />
          </Field>
          <Field label="CTA text">
            <input className={inputClass} value={ctaText} onChange={(event) => setCtaText(event.target.value)} placeholder="Visit sponsor" />
          </Field>
          <Field label="CTA URL">
            <input className={inputClass} value={ctaUrl} onChange={(event) => setCtaUrl(event.target.value)} placeholder="https://example.com" />
          </Field>
          <Field label="Placement notes">
            <textarea className={textareaClass} value={placementNotes} onChange={(event) => setPlacementNotes(event.target.value)} placeholder="Preferred placement context. No public placement appears until payment and approval are confirmed." />
          </Field>
        </div> : null}
        {!agreement ? <Button className="mt-5 w-full sm:w-auto" onClick={() => void expressInterest()} disabled={fundingLoading || !opportunity.fundingWindow?.allowed}>{fundingLoading ? "Sending..." : "Send Interest and Proposed Terms"}</Button> : null}
        {agreement?.status === "awaiting_sponsor_acceptance" ? <Button className="mt-5 w-full sm:w-auto" onClick={() => void acceptTerms()} disabled={fundingLoading}>{fundingLoading ? "Accepting..." : "Accept Creator’s Terms"}</Button> : null}
        {agreement?.status === "accepted" && agreement.fundingStatus !== "confirmed" ? <Button className="mt-5 w-full sm:w-auto" onClick={() => void startFundingCheckout()} disabled={fundingLoading || !opportunity.fundingWindow?.allowed}>{fundingLoading ? "Starting Checkout..." : "Fund Accepted Sponsorship"}</Button> : null}
        {agreement?.fundingStatus === "pending" ? <p className="mt-5 text-sm font-bold text-amber-900">Payment pending provider confirmation. This is not an active or funded sponsorship yet.</p> : null}
        {agreement?.fundingStatus === "confirmed" ? <p className="mt-5 text-sm font-bold text-emerald-800">Funding confirmed. Placement remains pending review.</p> : null}
        {fundingMessage ? <p className="mt-4 rounded-[8px] bg-red-950/40 p-3 text-sm text-red-800">{fundingMessage}</p> : null}
        <p className="mt-4 text-xs leading-5 text-slate-500">Webhook confirmation is required. No sponsor money, prize pool growth, public brand placement, ledger entry, payout, or winner payment is created from this form.</p>
      </Card>

      <Card className="mt-8 p-6">
        <h2 className="text-2xl font-black">Admin and payout controls</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {["Confirmed sponsor payment required", "Winner approval required", "Payout review and 24-hour hold required"].map((item) => <p key={item} className="rounded-[8px] border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">{item}</p>)}
        </div>
      </Card>
    </div>}
  </SponsorShell>;
}

function Tile({ label, value }: { label: string; value: any }) {
  return <Card className="p-5"><p className="text-xs font-black uppercase tracking-[0.15em] text-[var(--gold)]">{label}</p><p className="mt-3 text-sm leading-6 text-slate-600">{value === 0 ? "0" : String(value || "-")}</p></Card>;
}

function formatCents(value: unknown) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount / 100);
}

function placementLabel(item: any) {
  const surface = typeof item === "string" ? item : item?.surface;
  return String(surface || "Placement").replaceAll("_", " ");
}

function statusLabel(reason: unknown) {
  return String(reason || "Setup required").replaceAll("_", " ");
}
