"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Share2, Users, Vote, X } from "lucide-react";
import { Button, Card, LinkButton } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { logoUrl } from "@/components/brand";

type StoryChallenge = Record<string, any>;

export function TrendingStories({ challenges, source = "explore" }: { challenges: StoryChallenge[]; source?: "dashboard" | "explore" | "homepage" }) {
  const stories = useMemo(() => [...challenges]
    .filter((item) => ["active", "submission_open", "voting_open", "published", "registration_open"].includes(String(item.status ?? item.lifecycleStatus ?? "").toLowerCase()))
    .sort((a, b) => Number(b.participants ?? b.participantCount ?? 0) - Number(a.participants ?? a.participantCount ?? 0))
    .slice(0, 12), [challenges]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const active = activeIndex === null ? null : stories[activeIndex];

  function track(challengeId: string, action: string) {
    void apiRequest("/api/stories/track", { method: "POST", body: JSON.stringify({ challengeId, action, source }) });
  }
  function open(index: number) {
    setActiveIndex(index);
    track(String(stories[index].id), "view");
  }
  function move(direction: -1 | 1) {
    if (activeIndex === null) return;
    const next = (activeIndex + direction + stories.length) % stories.length;
    track(String(stories[activeIndex].id), direction === 1 ? "next" : "previous");
    open(next);
  }
  function close() {
    if (active) track(String(active.id), "close");
    setActiveIndex(null);
  }

  useEffect(() => {
    if (activeIndex === null) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "ArrowRight") move(1);
      if (event.key === "ArrowLeft") move(-1);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", keydown);
    };
  }, [activeIndex, stories.length]);

  if (!stories.length) return null;
  return (
    <section className="mt-8">
      <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Trending now</p><h2 className="mt-1 text-2xl font-black">Challenge Stories</h2></div><p className="text-xs text-slate-400">Tap for preview</p></div>
      <div className="scrollbar-dark mt-4 flex gap-4 overflow-x-auto pb-3">
        {stories.map((story, index) => <button key={story.id} onClick={() => open(index)} className="w-24 shrink-0 text-left"><div className="rounded-full border-[3px] border-[var(--gold)] p-[3px]"><div className="h-[88px] overflow-hidden rounded-full border-4 border-black bg-[#181818]"><img src={story.coverImageUrl || story.imageUrl || story.promoImageUrl || logoUrl} alt={story.title} className="h-full w-full object-cover" /></div></div><p className="mt-2 line-clamp-2 text-center text-xs font-black">{story.title}</p><p className="mt-1 text-center text-[10px] text-slate-400">{Number(story.participants ?? story.participantCount ?? 0)} joined</p></button>)}
      </div>

      {active ? <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-0 sm:p-6" role="dialog" aria-modal="true" aria-label={`${active.title} story preview`}>
        <Card className="relative flex h-[100dvh] w-full max-w-3xl flex-col overflow-hidden rounded-none border-0 bg-[#090909] sm:h-[min(860px,92vh)] sm:rounded-[8px] sm:border">
          <div className="absolute left-3 right-3 top-3 z-20 flex gap-1">{stories.map((story, index) => <div key={story.id} className={`h-1 flex-1 rounded-full ${index <= activeIndex! ? "bg-[var(--gold)]" : "bg-white/20"}`} />)}</div>
          <button onClick={close} className="absolute right-4 top-7 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-black/70" aria-label="Close story"><X /></button>
          <div className="relative min-h-0 flex-1 bg-black">
            {String(active.trailerVideoUrl || active.promoVideoUrl || "").startsWith("http") ? <video src={active.trailerVideoUrl || active.promoVideoUrl} controls autoPlay muted className="h-full w-full object-contain" /> : <img src={active.coverImageUrl || active.imageUrl || active.promoImageUrl || logoUrl} alt={active.title} className="h-full w-full object-contain" />}
            <button onClick={() => move(-1)} className="absolute left-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/60" aria-label="Previous story"><ChevronLeft /></button>
            <button onClick={() => move(1)} className="absolute right-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/60" aria-label="Next story"><ChevronRight /></button>
          </div>
          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase text-[var(--gold)]"><span>Trending</span>{active.sponsorEnabled ? <span>· Sponsored</span> : null}</div>
            <h2 className="mt-2 break-words text-2xl font-black sm:text-3xl">{active.title}</h2>
            <p className="mt-2 line-clamp-2 text-sm text-slate-300">{active.description}</p>
            <p className="mt-3 text-sm font-bold text-slate-300">by @{active.creatorUsername || active.creatorName || "challengehost"}</p>
            <div className="mt-4 grid grid-cols-3 gap-2"><Mini icon={<Users size={15} />} value={Number(active.participants ?? active.participantCount ?? 0)} label="Participants" /><Mini icon={<Vote size={15} />} value={Number(active.voteCount ?? 0)} label="Votes" /><Mini value={active.publicJackpotEstimateCents ? `$${(Number(active.publicJackpotEstimateCents) / 100).toLocaleString()}` : "Review"} label="Prize" /></div>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <LinkButton href={`/challenges/${active.id}`} onClick={() => track(String(active.id), "view_details")}>View Details</LinkButton>
              <LinkButton href={`/challenges/${active.id}/join`} variant="secondary" onClick={() => track(String(active.id), "join")}>Participate</LinkButton>
              <LinkButton href={`/challenges/${active.id}/votes`} variant="secondary" onClick={() => track(String(active.id), "vote")}>Vote Now</LinkButton>
              {active.creatorUsername || active.creatorId ? <Button variant="secondary" onClick={() => void apiRequest(`/api/public/profiles/${active.creatorUsername || active.creatorId}/follow`, { method: "POST" }).then(() => track(String(active.id), "follow"))}>Follow Host</Button> : null}
              <Button variant="secondary" onClick={() => { track(String(active.id), "share"); void navigator.share?.({ title: active.title, url: `${window.location.origin}/challenges/${active.id}` }); }}><Share2 size={16} /> Share</Button>
            </div>
          </div>
        </Card>
      </div> : null}
    </section>
  );
}

function Mini({ icon, value, label }: { icon?: React.ReactNode; value: string | number; label: string }) {
  return <div className="rounded-[8px] bg-white/5 p-3 text-center"><div className="flex items-center justify-center gap-1 font-black text-[var(--gold)]">{icon}{value}</div><div className="mt-1 text-[10px] text-slate-400">{label}</div></div>;
}
