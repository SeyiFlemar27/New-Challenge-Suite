"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, CalendarClock, Clock3, Star, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type EngagementItem = {
  engagementId: string;
  challenge: Record<string, unknown> & { id: string };
  saved: boolean;
  watchLater: boolean;
  interested: boolean;
  reminderOffsetsMinutes: number[];
  reminderStatus?: string | null;
};

const tabs = [
  { id: "saved", label: "Saved Challenges", icon: Bookmark },
  { id: "watchLater", label: "Watch Later", icon: Clock3 },
  { id: "interested", label: "Interested Events", icon: CalendarClock }
] as const;
type TabId = typeof tabs[number]["id"];

export default function FavoritesPage() {
  const [tab, setTab] = useState<TabId>("saved");
  const [notice, setNotice] = useState("");
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["engagements"],
    queryFn: () => apiRequest<{ items: EngagementItem[] }>("/api/engagements"),
    staleTime: 30_000
  });
  const mutation = useMutation({
    mutationFn: ({ challengeId, action }: { challengeId: string; action: "save_challenge" | "watch_later" | "interested" }) =>
      apiRequest(`/api/challenges/${challengeId}/engagement`, { method: "POST", body: JSON.stringify({ action, enabled: false }) }),
    onSuccess: async (result) => {
      setNotice(result.message);
      await queryClient.invalidateQueries({ queryKey: ["engagements"] });
    }
  });
  const allItems = query.data?.ok ? query.data.data?.items ?? [] : [];
  const items = allItems.filter((item) => Boolean(item[tab]));
  const active = tabs.find((item) => item.id === tab)!;
  const ActiveIcon = active.icon;
  const removeAction = tab === "saved" ? "save_challenge" : tab === "watchLater" ? "watch_later" : "interested";

  return (
    <AppShell>
      <PageTitle title="Saved" subtitle="Keep challenges, watch plans, and event reminders organized in one place." icon={<Star />} />
      <div className="scrollbar-dark mt-8 flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Saved challenge sections">
        {tabs.map(({ id, label, icon: Icon }) => <Button key={id} variant={tab === id ? "primary" : "secondary"} onClick={() => setTab(id)} role="tab" aria-selected={tab === id}><Icon size={17} /> {label}</Button>)}
      </div>
      {notice ? <p className="mt-5 rounded-[8px] border border-emerald-500/20 bg-emerald-950/30 p-4 text-sm text-emerald-200">{notice}</p> : null}
      {query.isLoading ? <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((item) => <Card key={item} className="h-72 animate-pulse" />)}</div> : null}
      {!query.isLoading && query.data && !query.data.ok ? <Card className="mt-8"><EmptyState icon={<Star />} title="Saved items unavailable" body={query.data.message} action={<Button onClick={() => void query.refetch()}>Retry</Button>} /></Card> : null}
      {!query.isLoading && query.data?.ok && items.length ? <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => {
        const challenge = item.challenge;
        const challengeId = String(challenge.id);
        const title = String(challenge.title ?? "Challenge");
        const imageUrl = String(challenge.imageUrl ?? challenge.coverImageUrl ?? "");
        return <Card key={item.engagementId} className="overflow-hidden"><div className="h-44 bg-[#191919] bg-cover bg-center" style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined} /><div className="p-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">{active.label}</p><h2 className="mt-3 break-words text-xl font-black">{title}</h2>{tab === "interested" ? <p className="mt-3 text-sm leading-6 text-slate-400">In-app reminders: {item.reminderOffsetsMinutes.length ? "1 hour, 30 minutes, 5 minutes, and start time" : "not configured"}. Push/email delivery is not available yet.</p> : null}<div className="mt-5 grid gap-2 sm:grid-cols-2"><LinkButton href={tab === "interested" || tab === "watchLater" ? `/challenges/${challengeId}/watch` : `/challenges/${challengeId}`} className="w-full">{tab === "saved" ? "View Challenge" : "View Challenge Updates"}</LinkButton><Button variant="ghost" onClick={() => mutation.mutate({ challengeId, action: removeAction })} disabled={mutation.isPending}><Trash2 size={16} /> Remove</Button></div></div></Card>;
      })}</div> : null}
      {!query.isLoading && query.data?.ok && !items.length ? <Card className="mt-8"><EmptyState icon={<ActiveIcon />} title={`No ${active.label.toLowerCase()} yet`} body={tab === "saved" ? "Save a challenge to return to it here." : tab === "watchLater" ? "Add a challenge to Watch Later when you want to revisit its media or activity." : "Mark an upcoming challenge or event as Interested in Watching to save in-app reminder preferences."} action={<LinkButton href="/challenges">Explore Challenges</LinkButton>} /></Card> : null}
      {tab === "interested" ? <Card className="mt-6 border-yellow-500/20 bg-yellow-500/5 p-5 text-sm leading-6 text-slate-300">Reminders are saved in-app. Push and email delivery will be enabled when notification delivery is connected.</Card> : null}
    </AppShell>
  );
}
