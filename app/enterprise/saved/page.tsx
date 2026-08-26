"use client";

import { useEffect, useState } from "react";
import { Bookmark } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { apiRequest } from "@/lib/api/client";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";

type EngagementItem = {
  engagementId: string;
  saved: boolean;
  challenge: Record<string, unknown> & { id: string };
};

export default function EnterpriseSavedPage() {
  const [items, setItems] = useState<EngagementItem[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void apiRequest<{ items: EngagementItem[] }>("/api/engagements").then((result) => {
      if (!result.ok) return setError(result.message || "Enterprise saved items could not be loaded.");
      setItems((result.data?.items ?? []).filter((item) => item.saved && (item.challenge.officialChallenge === true || item.challenge.ownershipType === "challenge_suite_official")));
    });
  }, []);
  return <AppShell><div className="mx-auto max-w-7xl"><PageTitle title="Enterprise Saved" subtitle="Official challenges you saved for Enterprise operational follow-up. Personal favorites stay in Personal Workspace." icon={<Bookmark className="text-[var(--gold)]" />} />
    {error ? <Card className="mt-7 p-6 text-red-700">{error}</Card> : items === null ? <Card className="mt-7 h-64 animate-pulse" /> : items.length ? <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => <Card key={item.engagementId} className="p-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-amber-700">Official Challenge</p><h2 className="mt-3 text-xl font-black text-slate-950">{String(item.challenge.title ?? "Challenge")}</h2><p className="mt-2 text-sm text-slate-600">{String(item.challenge.category ?? "Uncategorized")}</p><LinkButton href={"/challenges/" + item.challenge.id} className="mt-5">View Challenge</LinkButton></Card>)}</div> : <Card className="mt-7"><EmptyState icon={<Bookmark />} title="No saved official challenges" body="Official challenges saved from Enterprise will appear here without mixing in Personal favorites." action={<LinkButton href="/explore">Explore Challenges</LinkButton>} /></Card>}
  </div></AppShell>;
}
