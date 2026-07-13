"use client";

import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { Target } from "lucide-react";
import { useCurrentUser } from "@/lib/hooks/use-current-user";

export default function MyChallengesPage() {
  const { loading } = useCurrentUser();
  if (loading) {
    return <AppShell><div className="mx-auto max-w-6xl"><div className="h-12 w-80 max-w-full animate-pulse rounded bg-white/10" /><div className="mt-8 space-y-4">{[0, 1, 2].map((item) => <Card key={item} className="h-36 animate-pulse bg-[#151515]" />)}</div></div></AppShell>;
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <PageTitle title="My Challenges" subtitle="Track the challenges you created, continue drafts, and manage active competitions." />
          <div className="flex flex-col gap-3 sm:flex-row">
            <LinkButton href="/challenges/create" className="w-full sm:w-auto">Create Challenge</LinkButton>
            <LinkButton href="/my-entries" variant="secondary" className="w-full sm:w-auto">View My Entries</LinkButton>
          </div>
        </div>

        <Card className="mt-8 overflow-hidden p-0">
          <EmptyState icon={<Target className="text-[var(--gold)]" />} title="No challenges created yet" body="Create your first challenge to start receiving entries." action={<LinkButton href="/challenges/create">Create Challenge</LinkButton>} />
        </Card>
      </div>
    </AppShell>
  );
}
