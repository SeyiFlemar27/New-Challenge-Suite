import { LegalPage } from "@/components/legal-page";
export const metadata = { title: "Refund Policy | Challenge Suite" };
export default function Page() { return <LegalPage eyebrow="Billing clarity" title="Refund Policy" summary="Starter terms for subscriptions, DoroCoins, disputes, and reviewed financial foundations." sections={[
  { title: "Subscription cancellation", paragraphs: ["Cancelling immediately returns the account to Free access after the verified Stripe cancellation webhook is received. Cancellation does not itself create a refund."] },
  { title: "DoroCoins and platform credits", paragraphs: ["DoroCoins are internal platform credits. They cannot be withdrawn, transferred to a bank, or converted to cash."] },
  { title: "Prizes and withdrawals", paragraphs: ["Eligible cash winnings or approved earnings appear only after review. Withdrawal requests are review-only; automatic payouts and prize-pool releases are not active."] },
  { title: "Disputes and support", paragraphs: ["Billing or challenge disputes should be submitted through the contact route with the relevant account, transaction, or challenge reference. Refund eligibility is reviewed under applicable law and the facts of the transaction."] }
]} />; }
