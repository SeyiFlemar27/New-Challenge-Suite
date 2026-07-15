"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Users, Vote, X } from "lucide-react";
import { Button, Card, LinkButton } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { getChallengeLifecycleState } from "@/lib/challenge-status";
import { logoUrl } from "@/components/brand";

type StoryChallenge = Record<string, any>;

type TrendingStoriesProps = {
  challenges: StoryChallenge[];
  source?: "dashboard" | "explore" | "homepage";
  isLoading?: boolean;
  errorMessage?: string;
};

export function TrendingStories({ challenges, source = "explore", isLoading = false, errorMessage = "" }: TrendingStoriesProps) {
  const stories = useMemo(() => [...challenges]
    .filter((item) => {
      const lifecycle = getChallengeLifecycleState(item);
      return lifecycle.canJoin || lifecycle.canSubmit || lifecycle.canVote || ["active", "submission_open", "voting_open", "registration_open"].includes(lifecycle.primaryStatus);
    })
    .sort((a, b) => Number(b.participants ?? b.participantCount ?? 0) - Number(a.participants ?? a.participantCount ?? 0))
    .slice(0, 12), [challenges]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const active = activeIndex === null ? null : stories[activeIndex];
  const activeLifecycle = active ? getChallengeLifecycleState(active) : null;
  const dashboardMode = source === "dashboard";

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
      if (!dashboardMode && event.key === "ArrowRight") move(1);
      if (!dashboardMode && event.key === "ArrowLeft") move(-1);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", keydown);
    };
  }, [activeIndex, dashboardMode, stories.length]);

  if (isLoading) {
    return <StoryShell><Card className="mt-4 border-white/10 bg-white/[0.03] p-5 text-sm font-bold text-slate-300">Loading trending challenges...</Card></StoryShell>;
  }

  if (errorMessage) {
    return <StoryShell><Card className="mt-4 border-red-400/20 bg-red-950/20 p-5 text-sm font-bold text-red-100">Unable to load trending challenges right now.</Card></StoryShell>;
  }

  if (!stories.length) {
    return <StoryShell><Card className="mt-4 border-dashed p-5 text-sm text-slate-300"><p className="font-black text-white">No trending challenges yet</p><p className="mt-1">Public challenges gaining activity will appear here once the community starts participating.</p></Card></StoryShell>;
  }

  return (
    <StoryShell>
      <div className="scrollbar-dark mt-4 flex gap-4 overflow-x-auto pb-3">
        {stories.map((story, index) => (
          <button key={story.id} type="button" onClick={() => open(index)} className="w-24 shrink-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]">
            <div className="rounded-full border-[3px] border-[var(--gold)] p-[3px] shadow-[0_0_22px_rgba(246,198,75,.12)]">
              <div className="h-[88px] overflow-hidden rounded-full border-4 border-black bg-[#181818]">
                <img src={story.coverImageUrl || story.imageUrl || story.promoImageUrl || logoUrl} alt={story.title || "Trending challenge"} className="h-full w-full object-cover" />
              </div>
            </div>
            <p className="mt-2 line-clamp-2 text-center text-xs font-black">{story.title || "Challenge"}</p>
            <p className="mt-1 text-center text-[10px] text-slate-400">{Number(story.participants ?? story.participantCount ?? 0)} joined</p>
          </button>
        ))}
      </div>

      {active && dashboardMode ? <DashboardStoryPreview active={active} lifecycle={activeLifecycle} onClose={close} /> : null}
      {active && !dashboardMode ? <ExploreStoryPreview active={active} stories={stories} activeIndex={activeIndex} lifecycle={activeLifecycle} onClose={close} onMove={move} onTrack={track} /> : null}
    </StoryShell>
  );
}

function StoryShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Trending now</p>
          <h2 className="mt-1 text-2xl font-black">Trending Challenges</h2>
          <p className="mt-1 text-sm text-slate-400">Challenges gaining the most participation right now.</p>
        </div>
        <p className="text-xs text-slate-400">Tap for preview</p>
      </div>
      {children}
    </section>
  );
}

function DashboardStoryPreview({ active, lifecycle, onClose }: { active: StoryChallenge; lifecycle: ReturnType<typeof getChallengeLifecycleState> | null; onClose: () => void }) {
  const image = active.coverImageUrl || active.imageUrl || active.promoImageUrl || logoUrl;
  const status = lifecycle?.primaryLabel ?? active.status ?? "Challenge";
  const stage = lifecycle?.submissionStatus === "submissions_open" ? "Submissions Open" : lifecycle?.votingStatus === "voting_open" ? "Voting Open" : status;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/85 p-4" role="dialog" aria-modal="true" aria-label={`${active.title ?? "Challenge"} preview`}>
      <Card className="w-full max-w-2xl overflow-hidden border-[var(--gold)]/30 bg-[#101010]">
        <div className="relative aspect-[16/9] bg-black">
          <img src={image} alt={active.title ?? "Trending challenge"} className="h-full w-full object-cover" />
          <button onClick={onClose} className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/75 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]" aria-label="Close preview"><X size={18} /></button>
          <div className="absolute bottom-4 left-4 flex flex-wrap gap-2 text-xs font-black uppercase tracking-[0.12em]"><span className="rounded-full bg-[var(--gold)] px-3 py-1 text-black">{active.category ?? "Challenge"}</span><span className="rounded-full bg-black/75 px-3 py-1 text-white">{status}</span></div>
        </div>
        <div className="p-5 sm:p-6">
          <h3 className="break-words text-2xl font-black sm:text-3xl">{active.title ?? "Trending challenge"}</h3>
          <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-300">{active.description || "Challenge details will appear on the full challenge page."}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Mini icon={<Users size={15} />} value={Number(active.participants ?? active.participantCount ?? 0)} label="Participants" />
            <Mini value={stage} label="Stage" />
            <Mini icon={<Vote size={15} />} value={Number(active.voteCount ?? 0)} label="Votes" />
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <LinkButton href={`/challenges/${active.id}`}>View Challenge</LinkButton>
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function ExploreStoryPreview({ active, stories, activeIndex, lifecycle, onClose, onMove, onTrack }: { active: StoryChallenge; stories: StoryChallenge[]; activeIndex: number | null; lifecycle: ReturnType<typeof getChallengeLifecycleState> | null; onClose: () => void; onMove: (direction: -1 | 1) => void; onTrack: (challengeId: string, action: string) => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-0 sm:p-6" role="dialog" aria-modal="true" aria-label={`${active.title} story preview`}>
      <Card className="relative flex h-[100dvh] w-full max-w-3xl flex-col overflow-hidden rounded-none border-0 bg-[#090909] sm:h-[min(860px,92vh)] sm:rounded-[8px] sm:border">
        <div className="absolute left-3 right-3 top-3 z-20 flex gap-1">{stories.map((story, index) => <div key={story.id} className={`h-1 flex-1 rounded-full ${index <= (activeIndex ?? 0) ? "bg-[var(--gold)]" : "bg-white/20"}`} />)}</div>
        <button onClick={onClose} className="absolute right-4 top-7 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-black/70" aria-label="Close story"><X /></button>
        <div className="relative min-h-[34dvh] flex-1 bg-black sm:min-h-0">
          {String(active.trailerVideoUrl || active.promoVideoUrl || "").startsWith("http") ? <video src={active.trailerVideoUrl || active.promoVideoUrl} controls autoPlay muted className="h-full w-full object-contain" /> : <img src={active.coverImageUrl || active.imageUrl || active.promoImageUrl || logoUrl} alt={active.title} className="h-full w-full object-contain" />}
          <button onClick={() => onMove(-1)} className="absolute left-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/60" aria-label="Previous story"><ChevronLeft /></button>
          <button onClick={() => onMove(1)} className="absolute right-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/60" aria-label="Next story"><ChevronRight /></button>
        </div>
        <div className="max-h-[56dvh] overflow-y-auto overscroll-contain p-5 sm:max-h-none sm:p-6">
          <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase text-[var(--gold)]"><span>Trending</span>{active.sponsorEnabled ? <span>/ Sponsored</span> : null}</div>
          <h2 className="mt-2 break-words text-2xl font-black sm:text-3xl">{active.title}</h2>
          <p className="mt-2 line-clamp-2 text-sm text-slate-300">{active.description}</p>
          <p className="mt-3 text-sm font-bold text-slate-300">by @{active.creatorUsername || active.creatorName || "challengehost"}</p>
          <div className="mt-4 grid grid-cols-3 gap-2"><Mini icon={<Users size={15} />} value={Number(active.participants ?? active.participantCount ?? 0)} label="Participants" /><Mini icon={<Vote size={15} />} value={Number(active.voteCount ?? 0)} label="Votes" /><Mini value={active.publicJackpotEstimateCents ? `$${(Number(active.publicJackpotEstimateCents) / 100).toLocaleString()}` : "Review"} label="Prize" /></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <LinkButton href={`/challenges/${active.id}`} onClick={() => onTrack(String(active.id), "view_details")}>View Challenge</LinkButton>
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Mini({ icon, value, label }: { icon?: React.ReactNode; value: string | number; label: string }) {
  return <div className="rounded-[8px] bg-white/5 p-3 text-center"><div className="flex items-center justify-center gap-1 font-black text-[var(--gold)]">{icon}{value}</div><div className="mt-1 text-[10px] text-slate-400">{label}</div></div>;
}

