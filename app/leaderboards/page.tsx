import { AppShell } from "@/components/app-shell";
import { Card, PageTitle } from "@/components/ui";
import { Trophy } from "lucide-react";

export default function LeaderboardsPage() {
  return (
    <AppShell>
      <PageTitle title="Leaderboards" subtitle="Top creators and competitors across Challenge Suite" icon={<Trophy className="text-[var(--gold)]" />} />
      <Card className="mt-10 max-w-3xl p-8">
        {["John Doe old", "Emily Smith", "Mike Johnson", "Flemar"].map((name, i) => <div key={name} className="mb-4 flex items-center justify-between rounded-[8px] bg-[#191919] p-5"><span className="text-xl font-black">#{i + 1} {name}</span><span className="font-bold text-[var(--gold)]">{[1200, 850, 400, 0][i]} pts</span></div>)}
      </Card>
    </AppShell>
  );
}
