import { ContactExperience } from "@/components/public-site/contact-experience";
import { fixedPublicMetadata } from "@/lib/i18n/metadata";
export function generateMetadata() { return fixedPublicMetadata({ title: "Contact | Challenge Suite", description: "Contact Challenge Suite support for account, challenge, payment, sponsor, safety, or technical help.", canonical: "/contact" }); }
export default function Page() { return <ContactExperience />; }