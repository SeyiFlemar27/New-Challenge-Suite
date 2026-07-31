import { AppShell } from "@/components/app-shell";
import { Card, LinkButton, PageTitle } from "@/components/ui";

export default function HybridRoute() {
  return <AppShell><div className="mx-auto max-w-3xl">
    <PageTitle title="Competition Format Retired" subtitle="Hybrid Competition is no longer available for new competitions." />
    <Card className="mt-6 p-6">
      <p className="leading-7 text-slate-300">Historical records remain preserved for affected participants, hosts, finance review, and audit history.</p>
      <LinkButton href="/explore" className="mt-5">Explore active challenges</LinkButton>
    </Card>
  </div></AppShell>;
}
