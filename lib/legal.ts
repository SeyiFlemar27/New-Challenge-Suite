import type { AgreementType } from "./types";

export const allowedRegions = ["US", "NG"] as const;

export const legalDocuments: Record<AgreementType, { title: string; version: string; body: string }> = {
  master_account: {
    title: "Master Account Agreement",
    version: "2026.06.17",
    body: "By creating an account, you accept the Challenge Suite Terms of Service, Privacy Policy, and Community Guidelines. You agree that consent records may include timestamp, IP address, device information, and your declared country or region."
  },
  challenge_entry: {
    title: "Challenge Entry Agreement",
    version: "2026.06.17",
    body: "You acknowledge the challenge rules, voting policy, prize terms, and any non-refundable entry fee before enrolling. You must upload an accepted media type before submitting an entry."
  },
  paid_voting: {
    title: "Paid Voting Agreement",
    version: "2026.06.17",
    body: "Additional vote purchases are final sale and non-refundable. Paid votes do not guarantee a challenge outcome and may be reviewed for fraud or manipulation."
  },
  dorocoin: {
    title: "DoroCoin Virtual Currency Agreement",
    version: "2026.06.17",
    body: "DoroCoin is a platform virtual currency, has no cash value, is non-transferable outside Challenge Suite, and is non-refundable except where required by law."
  },
  challenge_creator: {
    title: "Challenge Creator Agreement",
    version: "2026.06.17",
    body: "Creators agree to run fair challenges, honor stated rules, maintain prize responsibility, and accept the published revenue share and sponsorship allocation terms."
  },
  sponsor: {
    title: "Sponsor Agreement",
    version: "2026.06.17",
    body: "Sponsors acknowledge funding obligations, non-refundable sponsorship payments, and Challenge Suite branding policies before proposal submission or payment."
  },
  live_event: {
    title: "Live Event Agreement",
    version: "2026.06.17",
    body: "You acknowledge live event risks, event rules, and recording/photo consent before registering for or hosting an in-person event."
  },
  winner_claim: {
    title: "Winner Claim Agreement",
    version: "2026.06.17",
    body: "Winner claims require identity document upload, payout verification, and acknowledgement of tax responsibility. Claims may be reviewed before payout."
  },
  anti_fraud: {
    title: "Anti-Fraud Acknowledgement",
    version: "2026.06.17",
    body: "Suspicious activity may require you to declare that you are not using bots, vote manipulation, multiple accounts, shared-IP abuse, or other prohibited conduct."
  }
};

export function redistributeSponsorship<T extends { percent: number; enabled: boolean }>(totalPercent: number, buckets: T[]): T[] {
  const enabled = buckets.filter((bucket) => bucket.enabled);
  const enabledTotal = enabled.reduce((sum, bucket) => sum + bucket.percent, 0);
  if (enabled.length === 0) return buckets.map((bucket) => ({ ...bucket, percent: 0 }));
  return buckets.map((bucket) => {
    if (!bucket.enabled) return { ...bucket, percent: 0 };
    const nextPercent = enabledTotal === 0 ? totalPercent / enabled.length : (bucket.percent / enabledTotal) * totalPercent;
    return { ...bucket, percent: Number(nextPercent.toFixed(2)) };
  });
}
