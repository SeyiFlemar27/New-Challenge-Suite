import { LegalPage } from "@/components/legal-page";
export const metadata = { title: "Terms of Use | Challenge Suite" };
export default function Page() { return <LegalPage eyebrow="Platform terms" title="Terms of Use" summary="The baseline terms for using Challenge Suite and participating in platform competitions." sections={[
  { title: "Accounts and acceptable use", paragraphs: ["Users are responsible for accurate account information and activity performed through their accounts."], bullets: ["Do not impersonate others, evade restrictions, abuse systems, or interfere with platform security.", "Do not manipulate voting, submissions, leaderboards, or review processes."] },
  { title: "Challenge participation", paragraphs: ["Each challenge may have additional rules, dates, eligibility requirements, and moderation decisions. Participation does not guarantee ranking, prizes, sponsorship, or payment."] },
  { title: "Creators, Hosts, and sponsors", paragraphs: ["Creators and Hosts are responsible for lawful rules and content. Sponsors remain subject to approval, subscription, campaign review, and separate budget terms."] },
  { title: "Voting and outcomes", paragraphs: ["Votes may be reviewed for integrity. Challenge Suite may hold, correct, or remove activity that violates published rules or platform safety requirements."] },
  { title: "Prizes and platform rights", paragraphs: ["Prize, earnings, and withdrawal features remain subject to verification and review. No automatic payout or prize release is promised. Challenge Suite may moderate, suspend, or remove content and accounts to protect the platform."] }
]} />; }
