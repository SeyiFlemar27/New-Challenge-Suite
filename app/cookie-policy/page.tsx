import { LegalPage } from "@/components/legal-page";
export const metadata = { title: "Cookie Policy | Challenge Suite" };
export default function Page() { return <LegalPage eyebrow="Browser data" title="Cookie Policy" summary="How browser storage supports the Challenge Suite experience." sections={[
  { title: "Necessary storage", paragraphs: ["Authentication, account security, session continuity, and route protection may require cookies or similar storage."] },
  { title: "Preferences", paragraphs: ["Local storage may retain appearance, walkthrough completion, and other product preferences."] },
  { title: "Analytics and future tracking", paragraphs: ["Any optional analytics, advertising, or third-party tracking should be documented and consented to before production activation."] }
]} />; }
