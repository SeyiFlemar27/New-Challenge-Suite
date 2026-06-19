import { AppShell } from "@/components/app-shell";
import { Button, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { Target } from "lucide-react";

export default function MyChallengesPage() {
  return (
    <AppShell>
      <PageTitle title="My Challenges" subtitle="Track your active and completed challenges" />
      <div className="mt-10 flex w-[390px] rounded-[8px] bg-[#11151d] p-2">
        {["All Challenges", "Active", "Completed"].map((tab, i) => <Button key={tab} variant={i === 0 ? "primary" : "ghost"} className="flex-1">{tab}</Button>)}
      </div>
      <EmptyState icon={<Target className="text-pink-500" />} title="No challenges found" body="Start participating in challenges to see them here" action={<LinkButton href="/challenges">Browse Challenges</LinkButton>} />
    </AppShell>
  );
}
