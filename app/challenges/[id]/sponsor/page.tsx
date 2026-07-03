"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { Button, Card, Field, inputClass, LinkButton, PageTitle, textareaClass } from "@/components/ui";
import { fetchChallengeDetails, proposeSponsorship } from "@/lib/api/services";
import { normalizeChallenge, type ChallengeApiRecord } from "@/lib/api/normalizers";
import { isChallengeEligibleForSponsorship } from "@/lib/challenge-status";

type SponsorForm = {
  sponsorName: string;
  brandName: string;
  contactEmail: string;
  amount: number;
  prizePoolContribution: number;
  brandingPreference: string;
  message: string;
  packageId: string;
  ctaButtonText: string;
  ctaDestinationLink: string;
  sponsorReturnPercent: number;
  creatorPercent: number;
};

export default function SponsorChallengePage() {
  const params = useParams<{ id: string }>();
  const challengeId = params.id;
  const auth = useAuth();
  const [review, setReview] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState<SponsorForm | null>(null);
  const detailsQuery = useQuery({
    queryKey: ["challenge-details", challengeId, auth.user?.uid ?? "signed-out"],
    queryFn: () => fetchChallengeDetails(challengeId),
    enabled: Boolean(challengeId) && !auth.loading,
    staleTime: 30_000
  });

  const details = detailsQuery.data?.ok ? detailsQuery.data.data : null;
  const rawChallenge = details?.challenge as (ChallengeApiRecord & Record<string, unknown>) | undefined;
  const challenge = useMemo(() => rawChallenge ? normalizeChallenge(rawChallenge) : null, [rawChallenge]);
  const eligible = Boolean(rawChallenge?.sponsorEnabled && isChallengeEligibleForSponsorship(rawChallenge.status));
  const sponsorPackages = Array.isArray(rawChallenge?.sponsorPackages) ? rawChallenge.sponsorPackages as Array<{ id: string; name?: string; price?: number; slotLimit?: number }> : [];

  const mutation = useMutation({
    mutationFn: async () => {
      if (!proposal) throw new Error("Review a sponsorship proposal before submitting.");
      const result = await proposeSponsorship(challengeId, proposal);
      if (!result.ok) throw new Error(result.message);
      return result.data?.sponsorship;
    },
    onSuccess: () => setSuccess(true),
    onError: (caught) => setError(caught instanceof Error ? caught.message : "Sponsorship proposal could not be submitted.")
  });

  function reviewProposal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const nextProposal = {
      sponsorName: String(formData.get("sponsorName") ?? "").trim(),
      brandName: String(formData.get("brandName") ?? "").trim(),
      contactEmail: String(formData.get("contactEmail") ?? "").trim(),
      amount: Number(formData.get("amount") ?? 0),
      prizePoolContribution: Number(formData.get("prizePoolContribution") ?? 0),
      brandingPreference: String(formData.get("brandingPreference") ?? "Logo on challenge page"),
      message: String(formData.get("message") ?? "").trim()
      ,
      packageId: String(formData.get("packageId") ?? "").trim(),
      ctaButtonText: String(formData.get("ctaButtonText") ?? "Learn More").trim(),
      ctaDestinationLink: String(formData.get("ctaDestinationLink") ?? "").trim(),
      sponsorReturnPercent: Number(formData.get("sponsorReturnPercent") ?? 12),
      creatorPercent: Number(formData.get("creatorPercent") ?? 3)
    };
    if (!auth.user) {
      setError("Sign in with a sponsor account before submitting a sponsorship proposal.");
      return;
    }
    if (!eligible) {
      setError("This challenge is not eligible for sponsorship.");
      return;
    }
    setProposal(nextProposal);
    setReview(true);
  }

  if (auth.loading || detailsQuery.isLoading) {
    return (
      <AppShell>
        <Card className="mx-auto max-w-3xl p-5 sm:p-8">
          <div className="h-12 max-w-lg animate-pulse rounded bg-[#171717]" />
          <div className="mt-8 space-y-5">{[0, 1, 2, 3].map((item) => <div key={item} className="h-11 animate-pulse rounded-[8px] bg-[#171717]" />)}</div>
        </Card>
      </AppShell>
    );
  }

  if (detailsQuery.data && !detailsQuery.data.ok) {
    return (
      <AppShell>
        <Card className="mx-auto max-w-2xl p-6 text-center sm:p-8 lg:p-10">
          <h1 className="text-3xl font-black sm:text-4xl">{detailsQuery.data.message.toLowerCase().includes("not found") ? "Challenge Not Found" : "Challenge Unavailable"}</h1>
          <p className="mt-3 text-slate-300">{detailsQuery.data.message}</p>
          <LinkButton href="/challenges" className="mt-8 w-full sm:w-auto">Back to Challenges</LinkButton>
        </Card>
      </AppShell>
    );
  }

  if (!challenge) {
    return (
      <AppShell>
        <Card className="mx-auto max-w-2xl p-6 text-center sm:p-8 lg:p-10">
          <h1 className="text-3xl font-black sm:text-4xl">Challenge Not Found</h1>
          <p className="mt-3 text-slate-300">This challenge does not exist or is not available.</p>
          <LinkButton href="/challenges" className="mt-8 w-full sm:w-auto">Back to Challenges</LinkButton>
        </Card>
      </AppShell>
    );
  }

  if (success) {
    return (
      <AppShell>
        <Card className="mx-auto max-w-2xl p-6 text-center sm:p-8 lg:p-10">
          <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-400 sm:h-20 sm:w-20" />
          <h1 className="mt-6 text-3xl font-black sm:text-4xl">Proposal Submitted</h1>
          <p className="mt-3 text-slate-300">Your terms were sent to the creator. Both parties must agree before platform review.</p>
          <div className="mt-6 rounded-[8px] bg-yellow-500/10 p-4 font-black text-[var(--gold)]">Status: Pending Creator Approval</div>
          <LinkButton href={`/challenges/${challenge.id}`} className="mt-8 w-full sm:w-auto">Back to Challenge</LinkButton>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Card className="mx-auto max-w-3xl p-5 sm:p-8">
        <PageTitle title="Sponsorship Proposal" subtitle={challenge.title} />
        {!auth.user ? <p className="mt-6 rounded-[8px] bg-red-950/50 p-3 text-red-200">Sign in with a sponsor account before submitting a sponsorship proposal.</p> : null}
        {!eligible ? <p className="mt-6 rounded-[8px] bg-red-950/50 p-3 text-red-200">This challenge is not eligible for sponsorship.</p> : null}
        {!review ? (
          <form className="mt-8 space-y-5" onSubmit={reviewProposal}>
            <Field label="Sponsor Name"><input name="sponsorName" className={inputClass} required /></Field>
            <Field label="Brand / Company Name"><input name="brandName" className={inputClass} required /></Field>
            <Field label="Contact Email"><input name="contactEmail" className={inputClass} type="email" required /></Field>
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Sponsor Proposal Amount ($)"><input name="amount" className={inputClass} type="number" min="1" required /></Field>
              <Field label="Sponsor Contribution Request ($)"><input name="prizePoolContribution" className={inputClass} type="number" min="0" required /></Field>
            </div>
            {sponsorPackages.length ? <Field label="Sponsor Package"><select name="packageId" className={inputClass} required>{sponsorPackages.map((item) => <option key={item.id} value={item.id}>{item.name || item.id} · {item.slotLimit ?? 0} slot(s)</option>)}</select></Field> : null}
            <Field label="Branding Preference"><select name="brandingPreference" className={inputClass}><option>Logo on challenge page</option><option>Featured sponsor badge</option><option>Custom CTA placement</option></select></Field>
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="CTA Button Text"><select name="ctaButtonText" className={inputClass}><option>Shop Now</option><option>Visit Website</option><option>Register Now</option><option>Follow Brand</option><option>Learn More</option></select></Field>
              <Field label="CTA Destination Link"><input name="ctaDestinationLink" className={inputClass} type="url" placeholder="https://..." /></Field>
              <Field label="Sponsor Return Arrangement (%)"><input name="sponsorReturnPercent" className={inputClass} type="number" min="0" max="100" defaultValue="12" /></Field>
              <Field label="Creator Arrangement (%)"><input name="creatorPercent" className={inputClass} type="number" min="0" max="100" defaultValue="3" /></Field>
            </div>
            <Field label="Sponsorship Message"><textarea name="message" className={textareaClass} required /></Field>
            <label className="flex items-start gap-3 font-bold leading-6"><input className="mt-1 shrink-0" type="checkbox" required /> <span>I accept review-only sponsorship split terms. Both parties must approve. Money capture/release is inactive and no investment return is promised.</span></label>
            {error ? <p className="rounded-[8px] bg-red-950/50 p-3 text-red-200">{error}</p> : null}
            <Button className="w-full" disabled={!auth.user || !eligible}>Review Proposal</Button>
          </form>
        ) : (
          <div className="mt-8">
            <h2 className="text-xl font-black sm:text-2xl">Review Sponsorship</h2>
            <p className="mt-3 text-slate-300">Confirm the proposed collaboration terms. The creator must also approve before platform review. Money capture/release is inactive and no investment return is promised.</p>
            {proposal ? <div className="mt-6 rounded-[8px] bg-black/40 p-4 text-sm text-slate-300"><b className="text-white">{proposal.sponsorName}</b><p className="mt-2">${proposal.amount.toLocaleString()} sponsor proposal with ${proposal.prizePoolContribution.toLocaleString()} contribution request. Money capture/release is not active yet.</p></div> : null}
            {error ? <p className="mt-4 rounded-[8px] bg-red-950/50 p-3 text-red-200">{error}</p> : null}
            <div className="mt-6 grid gap-3 sm:flex sm:justify-end">
              <Button className="w-full sm:w-auto" variant="secondary" onClick={() => setReview(false)}>Back</Button>
              <Button className="w-full sm:w-auto" onClick={() => mutation.mutate()} disabled={mutation.isPending}>{mutation.isPending ? "Submitting" : "Submit Proposal"}</Button>
            </div>
          </div>
        )}
      </Card>
    </AppShell>
  );
}
