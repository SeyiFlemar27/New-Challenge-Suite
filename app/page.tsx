import { PublicHome } from "@/components/public-site/public-home";
import { brandConfig } from "@/lib/brand-config";
import { fixedPublicMetadata } from "@/lib/i18n/metadata";

export function generateMetadata() {
  return fixedPublicMetadata({
    title: "Challenge Suite | Discover and create competitions",
    description: "Discover challenges, showcase your skills, create competitions and support communities through Challenge Suite.",
    canonical: "/",
    openGraphTitle: "Turn your talent into something worth winning.",
    openGraphDescription: "Discover and create structured competitions on Challenge Suite.",
    image: brandConfig.logo.socialCard
  });
}

export default function Page() {
  const jsonLd = { "@context": "https://schema.org", "@type": "WebSite", name: "Challenge Suite", url: "https://www.challengesuite.com", potentialAction: { "@type": "SearchAction", target: "https://www.challengesuite.com/explore?q={search_term_string}", "query-input": "required name=search_term_string" } };
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} /><PublicHome /></>;
}