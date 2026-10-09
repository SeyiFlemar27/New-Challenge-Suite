"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Handshake, ShieldCheck } from "lucide-react";
import { SponsorShell, type SponsorShellProfile } from "@/components/sponsor/sponsor-shell";
import { Card, LinkButton } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type Opportunity = Record<string, any>;

export default function SponsorFundingCheckoutPage() {
  const params = useParams<{ challengeId: string }>();
  const [profile, setProfile] = useState<SponsorShellProfile | null>(null);
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([
      apiRequest<{ sponsorProfile: SponsorShellProfile }>("/api/sponsor/profile"),
      apiRequest<{ opportunity: Opportunity }>(`/api/sponsor/discover/challenges/${params.challengeId}`),
    ]).then(([profileResult, opportunityResult]) => {
      if (profileResult.ok && profileResult.data) setProfile(profileResult.data.sponsorProfile);
      if (opportunityResult.ok && opportunityResult.data) setOpportunity(opportunityResult.data.opportunity);
      else setNotice(opportunityResult.message || "Funding opportunity could not be loaded.");
      setLoading(false);
    });
  }, [params.challengeId]);

  const fundingAllowed = Boolean(opportunity?.fundingWindow?.allowed);

  return <SponsorShell profile={profile}>
    {loading ? <Card className="h-96 animate-pulse bg-[#171717]" /> : <div className="mx-auto max-w-6xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div><p className="text-sm font-black uppercase tracking-[0.2em] text-[var(--gold)]">Sponsorship funding</p><h1 className="mt-3 text-4xl font-black">Accepted terms required</h1><p className="mt-3 max-w-3xl leading-7 text-slate-300">A pending commercial agreement must be accepted by both the Sponsor and the challenge owner before checkout can begin.</p></div>
        <LinkButton href={`/sponsor/discover/challenges/${params.challengeId}`} variant="secondary"><ArrowLeft size={16} /> Back to Opportunity</LinkButton>
      </div>
      {notice ? <Card className="mt-6 border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-yellow-100">{notice}</Card> : null}
      <Card className="mt-8 max-w-3xl p-6"><Handshake className="text-[var(--gold)]" /><h2 className="mt-3 text-2xl font-black">No direct checkout</h2><p className="mt-3 text-sm leading-6 text-slate-300">Submit commercial terms from the opportunity page. The challenge owner reviews them, then both parties accept the same version. Only then can this agreement be funded. Payment remains pending until Stripe confirms it, and placement requires review.</p><div className="mt-5 flex flex-wrap gap-3"><LinkButton href={`/sponsor/discover/challenges/${params.challengeId}`}><Handshake size={16} /> Review sponsorship terms</LinkButton><LinkButton href="/sponsor/wallet" variant="secondary">View Sponsor Wallet</LinkButton></div><div className="mt-5 flex items-center gap-2 text-xs text-slate-400"><ShieldCheck size={15} />{fundingAllowed ? "Funding eligibility is checked again at checkout." : "This opportunity is currently outside its funding window."}</div></Card>
    </div>}
  </SponsorShell>;
}
