import { LegalPage } from "@/components/legal-page";
export const metadata = { title: "About | Challenge Suite" };
export default function Page() { return <LegalPage eyebrow="About Challenge Suite" title="Competition, made intentional." summary="Challenge Suite brings competitors, creators, Hosts, and approved brands into one structured competition platform." sections={[
  { title: "For competitors", paragraphs: ["Explore challenges, enter, vote, save, follow rankings, and build a competition profile."] },
  { title: "For creators and Hosts", paragraphs: ["Launch challenges, manage submissions, run events and tournaments, and review competition performance through role-aware tools."] },
  { title: "For brands", paragraphs: ["Approved sponsors can discover partnership opportunities through a separate Brand Command Center, with subscription access kept distinct from campaign budgets."] },
  { title: "Built with review and safety foundations", paragraphs: ["Moderation, audit, wallet, prize, and withdrawal foundations are designed around review. Automatic money movement is not active."] }
]} />; }
