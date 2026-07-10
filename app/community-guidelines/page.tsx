import { LegalPage } from "@/components/legal-page";
export const metadata = { title: "Community Guidelines | Challenge Suite" };
export default function Page() { return <LegalPage eyebrow="Compete fairly" title="Community Guidelines" summary="A clear standard for safe, fair, and constructive participation." sections={[
  { title: "Fair participation", bullets: ["Submit original, eligible work.", "Follow challenge-specific rules and deadlines.", "Respect participants, creators, Hosts, sponsors, reviewers, and moderators."] },
  { title: "No manipulation or fraud", bullets: ["Do not buy, automate, coordinate, or falsify votes outside permitted platform flows.", "Do not create duplicate identities to evade limits.", "Do not misrepresent prize, sponsor, payment, or event information."] },
  { title: "Safe content", bullets: ["No harassment, threats, exploitation, hate, illegal activity, or harmful content.", "Do not upload content you do not have permission to use.", "Report suspected abuse through the contact route."] }
]} />; }
