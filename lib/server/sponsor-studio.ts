export type SponsorStudioRecord = Record<string, unknown> & { id?: string };

export type SponsorAttentionItem = {
  id: string;
  priority: number;
  title: string;
  context: string;
  reason: string;
  href: string;
  actionLabel: string;
  deadline: string | null;
};

const ACTIVE_SPONSORSHIP_STATUSES = new Set(["scheduled", "active", "live", "completion_review", "disputed", "cancellation_requested"]);
const OPEN_PROPOSAL_STATUSES = new Set(["draft", "sent", "received", "viewed", "under_review", "negotiating", "countered", "changes_requested", "accepted", "funding_required"]);
const TERMINAL_DELIVERABLE_STATUSES = new Set(["approved", "completed", "waived", "cancelled"]);

function text(value: unknown, fallback = "") { return String(value ?? fallback).trim(); }
function dateValue(value: unknown) { const parsed = Date.parse(text(value)); return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY; }
function status(value: unknown) { return text(value).toLowerCase(); }
function itemId(prefix: string, item: SponsorStudioRecord) { return prefix + "_" + text(item.id, "unknown"); }

export function buildSponsorAttention(input: {
  profile: SponsorStudioRecord;
  proposals: SponsorStudioRecord[];
  sponsorships: SponsorStudioRecord[];
  deliverables: SponsorStudioRecord[];
  wallet: SponsorStudioRecord;
  now?: number;
}) {
  const items: SponsorAttentionItem[] = [];
  const now = input.now ?? Date.now();
  const profileCompletion = Number(input.profile.onboardingCompletionPercent ?? 0);
  const verification = status(input.profile.sponsorVerificationStatus ?? input.profile.businessVerificationStatus);
  if (["needs_changes", "additional_information_required", "rejected"].includes(verification)) {
    items.push({ id: "profile_verification", priority: 1, title: "Brand verification needs attention", context: text(input.profile.brandName, "Sponsor account"), reason: "Review the requested changes before sending proposals or funding sponsorships.", href: "/sponsor/onboarding", actionLabel: "Review details", deadline: null });
  }
  if (["past_due", "unpaid", "payment_warning_2"].includes(status(input.profile.subscriptionStatus ?? input.profile.planStatus))) {
    items.push({ id: "payment_readiness", priority: 1, title: "Payment setup needs attention", context: "Sponsor account", reason: "Resolve the billing issue before the next funding action.", href: "/sponsor/billing", actionLabel: "Review billing", deadline: null });
  }
  if (input.wallet.fundingIssue === true || status(input.wallet.status) === "restricted") {
    items.push({ id: "wallet_readiness", priority: 1, title: "Wallet funding needs attention", context: "Sponsor Wallet", reason: "Review the wallet status before funding an accepted proposal.", href: "/sponsor/wallet", actionLabel: "Open Wallet", deadline: null });
  }
  for (const proposal of input.proposals) {
    const proposalStatus = status(proposal.status);
    const id = text(proposal.id);
    const title = text(proposal.title ?? proposal.proposalTitle ?? proposal.challengeTitle, "Sponsorship proposal");
    const deadline = text(proposal.expiresAt ?? proposal.expiryAt) || null;
    if (proposalStatus === "funding_required" || (proposalStatus === "accepted" && status(proposal.fundingStatus).includes("required"))) {
      items.push({ id: itemId("funding", proposal), priority: 1, title, context: "Funding required", reason: "The accepted proposal is ready for full Wallet funding.", href: "/sponsor/proposals/" + id, actionLabel: "Review funding", deadline });
    } else if (deadline && dateValue(deadline) > now && dateValue(deadline) - now <= 72 * 60 * 60 * 1000) {
      items.push({ id: itemId("expiry", proposal), priority: 2, title, context: "Proposal expiring soon", reason: "Review the proposal before its expiry time.", href: "/sponsor/proposals/" + id, actionLabel: "Open proposal", deadline });
    } else if (["countered", "changes_requested", "received"].includes(proposalStatus) || (proposalStatus === "negotiating" && text(proposal.lastActionBy) !== text(input.profile.userId))) {
      items.push({ id: itemId("proposal", proposal), priority: 3, title, context: "Response required", reason: "The Creator has sent terms or feedback for your review.", href: "/sponsor/proposals/" + id, actionLabel: "Review proposal", deadline });
    }
  }
  for (const deliverable of input.deliverables) {
    const deliverableStatus = status(deliverable.status);
    if (!["submitted", "resubmitted", "awaiting_sponsor_review"].includes(deliverableStatus)) continue;
    const id = text(deliverable.id);
    items.push({ id: itemId("deliverable", deliverable), priority: 4, title: text(deliverable.title, "Creator deliverable"), context: "Deliverable review", reason: "A Creator deliverable is waiting for your decision.", href: "/sponsor/deliverables/" + id, actionLabel: "Review deliverable", deadline: text(deliverable.dueAt) || null });
  }
  for (const sponsorship of input.sponsorships) {
    if (status(sponsorship.status) !== "completion_review") continue;
    const id = text(sponsorship.id);
    items.push({ id: itemId("completion", sponsorship), priority: 5, title: text(sponsorship.challengeTitle ?? sponsorship.title, "Sponsorship"), context: "Completion review", reason: "Review the final sponsorship outcome before the completion window ends.", href: "/sponsor/sponsorships/" + id, actionLabel: "Review completion", deadline: text(sponsorship.completionReviewEndsAt) || null });
  }
  if (profileCompletion < 100 && !["needs_changes", "additional_information_required", "rejected"].includes(verification)) {
    items.push({ id: "profile_setup", priority: 6, title: "Complete your Brand Profile", context: Math.max(0, Math.min(100, profileCompletion)) + "% complete", reason: "Add the remaining brand details to improve opportunity matching.", href: "/sponsor/onboarding", actionLabel: "Continue", deadline: null });
  }
  return items.sort((left, right) => left.priority - right.priority || dateValue(left.deadline) - dateValue(right.deadline) || left.id.localeCompare(right.id)).slice(0, 5);
}

export function activeSponsorPreview(sponsorships: SponsorStudioRecord[], attention: SponsorAttentionItem[]) {
  const urgent = new Set(attention.map((item) => item.id.replace(/^[^_]+_/, "")));
  return sponsorships.filter((item) => ACTIVE_SPONSORSHIP_STATUSES.has(status(item.status))).sort((left, right) => {
    const leftUrgent = urgent.has(text(left.id)) ? 0 : 1; const rightUrgent = urgent.has(text(right.id)) ? 0 : 1;
    if (leftUrgent !== rightUrgent) return leftUrgent - rightUrgent;
    const milestoneDifference = dateValue(left.nextMilestoneAt ?? left.activationAt ?? left.completionReviewEndsAt) - dateValue(right.nextMilestoneAt ?? right.activationAt ?? right.completionReviewEndsAt);
    return milestoneDifference || text(left.id).localeCompare(text(right.id));
  }).slice(0, 3);
}

export function sponsorStudioMetrics(input: { sponsorships: SponsorStudioRecord[]; proposals: SponsorStudioRecord[]; attention: SponsorAttentionItem[]; wallet: SponsorStudioRecord }) {
  return {
    activeSponsorships: input.sponsorships.filter((item) => ACTIVE_SPONSORSHIP_STATUSES.has(status(item.status))).length,
    openProposals: input.proposals.filter((item) => OPEN_PROPOSAL_STATUSES.has(status(item.status))).length,
    needsAttention: input.attention.length,
    walletBalanceCents: Math.max(0, Number(input.wallet.availableBalanceCents ?? 0) || 0)
  };
}

export function unresolvedRequiredDeliverables(deliverables: SponsorStudioRecord[]) {
  return deliverables.some((item) => item.required !== false && !TERMINAL_DELIVERABLE_STATUSES.has(status(item.status)));
}