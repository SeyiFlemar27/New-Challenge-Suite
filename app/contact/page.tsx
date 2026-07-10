import { LegalPage } from "@/components/legal-page";
export const metadata = { title: "Contact | Challenge Suite" };
export default function Page() { return <LegalPage eyebrow="Contact and support" title="How can we help?" summary="Use the category that best matches your issue and include relevant account or challenge references." sections={[
  { title: "Support categories", bullets: ["Account access or verification", "Challenge, submission, or voting issue", "Subscription or payment question", "Withdrawal review question", "Creator, Host, or sponsor onboarding", "Abuse, safety, or legal concern"] },
  { title: "Contact channel", paragraphs: ["Email support@challengesuite.com. Do not send passwords, full bank account details, private keys, or payment card information. Confirm this mailbox and response process before launch."] },
  { title: "Response expectations", paragraphs: ["Support and escalation tooling is a review foundation. Urgent safety reports should include enough context for the team to identify the affected account or content."] }
]} />; }
