import { ForTalentExperience } from "@/components/public-site/for-talent-experience";
import { fixedPublicMetadata } from "@/lib/i18n/metadata";
export function generateMetadata() { return fixedPublicMetadata({ title: "For Talent", description: "Discover challenges, submit your work and build a public competition record on Challenge Suite.", canonical: "/for-talent", openGraphTitle: "Turn your skills into opportunities worth competing for.", openGraphDescription: "Join Challenge Suite as talent." }); }
export default function ForTalentPage() { return <ForTalentExperience />; }