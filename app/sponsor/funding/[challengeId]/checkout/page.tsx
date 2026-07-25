"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CreditCard, ShieldCheck, WalletCards } from "lucide-react";
import { SponsorShell, type SponsorShellProfile } from "@/components/sponsor/sponsor-shell";
import { Button, Card, Field, inputClass, LinkButton, textareaClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type Opportunity = Record<string, any>;
type Wallet = Record<string, any>;

export default function SponsorFundingCheckoutPage() {
  const params = useParams<{ challengeId: string }>();
  const [profile, setProfile] = useState<SponsorShellProfile | null>(null);
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [amount, setAmount] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [placementNotes, setPlacementNotes] = useState("");
  const [method, setMethod] = useState<"stripe" | "wallet">("stripe");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void Promise.all([
      apiRequest<{ sponsorProfile: SponsorShellProfile }>("/api/sponsor/profile"),
      apiRequest<{ opportunity: Opportunity }>(`/api/sponsor/discover/challenges/${params.challengeId}`),
      apiRequest<{ wallet: Wallet }>("/api/sponsor/wallet")
    ]).then(([profileResult, opportunityResult, walletResult]) => {
      if (profileResult.ok && profileResult.data) setProfile(profileResult.data.sponsorProfile);
      if (opportunityResult.ok && opportunityResult.data) setOpportunity(opportunityResult.data.opportunity);
      else setNotice(opportunityResult.message || "Funding opportunity could not be loaded.");
      if (walletResult.ok && walletResult.data) setWallet(walletResult.data.wallet);
      setLoading(false);
    });
  }, [params.challengeId]);

  async function startCheckout() {
    setNotice("");
    const dollars = Number(amount);
    if (!Number.isFinite(dollars) || dollars < 5) return setNotice("Sponsor funding amount must be at least $5.");
    if (method === "wallet") return setNotice("Sponsor wallet spending is foundation-only. Use direct Stripe checkout until wallet debit rules are connected.");
    setSubmitting(true);
    const result = await apiRequest<{ url?: string }>(`/api/sponsor/challenges/${params.challengeId}/funding-checkout`, {
      method: "POST",
      body: JSON.stringify({ amountCents: Math.round(dollars * 100), ctaText, ctaUrl, placementNotes, placements: ["challenge_detail", "voting_page", "leaderboard", "winner_announcement", "share_card"] })
    });
    setSubmitting(false);
    if (!result.ok || !result.data?.url) return setNotice(result.message || "Sponsor funding checkout could not start.");
    window.location.href = result.data.url;
  }

  const amountCents = Math.max(0, Math.round(Number(amount || 0) * 100));
  const walletBalance = Number(wallet?.availableBalanceCents ?? 0);
  const fundingAllowed = Boolean(opportunity?.fundingWindow?.allowed);

  return <SponsorShell profile={profile}>
    {loading ? <Card className="h-96 animate-pulse bg-[#171717]" /> : <div className="mx-auto max-w-6xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div><p className="text-sm font-black uppercase tracking-[0.2em] text-[var(--gold)]">Sponsor Funding Checkout</p><h1 className="mt-3 text-4xl font-black">Fund Challenge</h1><p className="mt-3 max-w-3xl leading-7 text-slate-300">Create a pending direct Stripe sponsor contribution. Sponsor money is confirmed only by webhook and goes 100% to winner-source prize funding after confirmation.</p></div>
        <LinkButton href={`/sponsor/discover/challenges/${params.challengeId}`} variant="secondary">Back to Opportunity</LinkButton>
      </div>
      {notice ? <Card className="mt-6 border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-yellow-100">{notice}</Card> : null}
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="p-6">
          <h2 className="text-2xl font-black">Funding details</h2>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <Field label="Funding amount (USD)"><input className={inputClass} type="number" min="5" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="500" /></Field>
            <Field label="Payment method"><select className={inputClass} value={method} onChange={(event) => setMethod(event.target.value as "stripe" | "wallet")}><option value="stripe">Direct Stripe checkout</option><option value="wallet">Sponsor wallet balance foundation</option></select></Field>
            <Field label="CTA text"><input className={inputClass} value={ctaText} onChange={(event) => setCtaText(event.target.value)} placeholder="Visit sponsor" /></Field>
            <Field label="CTA link"><input className={inputClass} value={ctaUrl} onChange={(event) => setCtaUrl(event.target.value)} placeholder="https://example.com" /></Field>
          </div>
          <Field label="Placement request"><textarea className={textareaClass} value={placementNotes} onChange={(event) => setPlacementNotes(event.target.value)} placeholder="Explain requested challenge page, voting page, leaderboard, winner announcement, or share card placement. Public branding remains pending approval." /></Field>
          <Card className="mt-5 border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-slate-300"><ShieldCheck className="mb-2 text-[var(--gold)]" size={18} />Checkout success does not confirm funding. Stripe webhook confirmation is required before any contribution becomes a confirmed prize source. No prize release, payout, wallet withdrawal, or brand placement approval occurs here.</Card>
        </Card>
        <Card className="h-fit p-6">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">Order Summary</p>
          <h2 className="mt-2 text-2xl font-black">{opportunity?.title || "Challenge opportunity"}</h2>
          <div className="mt-5 grid gap-3 text-sm">
            <Info label="Creator / host" value={opportunity?.creatorName} />
            <Info label="Funding window" value={fundingAllowed ? "Open" : String(opportunity?.fundingWindow?.reason || "Funding unavailable").replaceAll("_", " ")} />
            <Info label="Sponsor balance" value={formatCents(walletBalance)} />
            <Info label="Funding amount" value={formatCents(amountCents)} />
            <Info label="Wallet status" value={wallet?.fundingEnabled ? "Available" : "Wallet debit setup required"} />
          </div>
          <Button className="mt-6 w-full" onClick={() => void startCheckout()} disabled={submitting || !fundingAllowed}>{submitting ? "Starting Checkout..." : method === "wallet" ? "Use Wallet Balance" : <><CreditCard size={16} /> Secure Payment</>}</Button>
          {!fundingAllowed ? <p className="mt-3 text-xs text-slate-400">Funding is unavailable for this opportunity. Check challenge status and funding window.</p> : null}
          {method === "wallet" ? <p className="mt-3 text-xs text-slate-400">Wallet spending is a foundation state until safe debit and reservation rules are connected.</p> : null}
          <LinkButton href="/sponsor/wallet" variant="ghost" className="mt-3 w-full"><WalletCards size={16} /> View Sponsor Wallet</LinkButton>
        </Card>
      </div>
    </div>}
  </SponsorShell>;
}

function Info({ label, value }: { label: string; value: any }) {
  return <div className="rounded-[8px] bg-black/30 p-3"><p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-1 break-words font-bold text-white">{value === 0 ? "0" : value || "Not available yet"}</p></div>;
}

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.max(0, cents) / 100);
}
