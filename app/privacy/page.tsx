import { LegalPage } from "@/components/legal-page";
export const metadata = { title: "Privacy Policy | Challenge Suite" };
export default function Page() { return <LegalPage eyebrow="Trust and privacy" title="Privacy Policy" summary="How Challenge Suite collects, uses, and protects information across competition, creator, Host, sponsor, and administrative experiences." sections={[
  { title: "Information we collect", bullets: ["Account and profile details you provide.", "Challenge entries, votes, preferences, and platform activity.", "Technical, security, and device information needed to operate the service."] },
  { title: "Payments and credits", paragraphs: ["Payments are processed by third-party payment providers. Challenge Suite does not treat DoroCoins as cash, legal tender, or a withdrawable balance."] },
  { title: "Cookies and local storage", paragraphs: ["We use necessary browser storage for authentication, security, preferences, and onboarding state. Analytics or advertising technologies must be disclosed before activation."] },
  { title: "Your choices and rights", paragraphs: ["You may request access, correction, deactivation, or information about your data through the contact route. Rights vary by location and applicable law."] },
  { title: "Contact", paragraphs: ["Privacy questions can be submitted through the Challenge Suite contact page."] }
]} />; }
