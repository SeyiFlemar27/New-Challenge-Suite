import { AppShell } from "@/components/app-shell";
import { Card, Field, inputClass, LinkButton, PageTitle, textareaClass } from "@/components/ui";
import { Megaphone } from "lucide-react";

export default function SponsorCampaignCreatePage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <PageTitle title="Create Campaign" subtitle="Build a sponsor campaign foundation without entering the normal challenge builder." icon={<Megaphone />} />
        <Card className="p-6 sm:p-8">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Campaign Name"><input className={inputClass} placeholder="Spring brand activation" /></Field>
            <Field label="Target Audience"><input className={inputClass} placeholder="Creators, students, local fans" /></Field>
            <Field label="Budget Foundation"><input className={inputClass} placeholder="Review-only budget range" /></Field>
            <Field label="Placement Preference"><select className={inputClass}><option>Challenge sponsorship</option><option>Leaderboard placement</option><option>Event placement</option><option>Creator partnership</option></select></Field>
          </div>
          <Field label="Sponsorship Goals"><textarea className={textareaClass} placeholder="Tell the Challenge Suite team what this campaign should accomplish." /></Field>
          <p className="mt-5 rounded-[8px] border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-yellow-100">Sponsor campaign creation is a review foundation. It does not capture funds, release sponsor money, or create a public challenge automatically.</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row"><LinkButton href="/sponsor/dashboard">Back to Sponsor Dashboard</LinkButton><LinkButton href="/contact" variant="secondary">Contact Support</LinkButton></div>
        </Card>
      </div>
    </AppShell>
  );
}
