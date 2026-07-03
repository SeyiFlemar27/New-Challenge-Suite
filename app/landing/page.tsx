"use client";

import { useState } from "react";
import { Award, BadgeCheck, BarChart3, Camera, Crown, Globe, Trophy, Users, Menu, X } from "lucide-react";
import { LinkButton, Card, Button } from "@/components/ui";
import { BrandLogo, PremiumBadge } from "@/components/brand";

const features = [
  { icon: Camera, title: "Daily Challenges", body: "New creative challenges every day across photography, art, fitness, and more" },
  { icon: Award, title: "Earn Badges", body: "Unlock achievements and showcase your skills with exclusive badges" },
  { icon: BarChart3, title: "Leaderboards", body: "Compete globally and climb the ranks to become a top creator" },
  { icon: Trophy, title: "Prize Foundations", body: "Participate in premium challenges with reviewed prize details and platform rewards" },
  { icon: BadgeCheck, title: "Get Discovered", body: "Showcase your work to thousands of community members" },
  { icon: Users, title: "Community", body: "Connect with like-minded creators and grow together" }
];

const leaders = [
  ["Flemar", "4,850 pts", "competitor"],
  ["Emily Smith", "3,940 pts", "competitor"],
  ["John Doe", "3,410 pts", ""],
  ["Maya Lens", "2,980 pts", "creator"],
  ["Chef Nova", "2,420 pts", ""],
  ["Studio Blue", "2,110 pts", "executive_host"]
];

export default function LandingPage() {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const visibleLeaders = expanded ? leaders : leaders.slice(0, 3);

  return (
    <main className="min-h-screen overflow-x-hidden bg-black">
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-black/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between"><a href="/landing" className="flex items-center gap-3"><BrandLogo imageClassName="h-11 w-11 border border-[var(--gold)]" /><span className="font-black">Challenge Suite</span></a><nav className="hidden items-center gap-3 md:flex"><LinkButton href="/challenges" variant="ghost">Explore</LinkButton><LinkButton href="/leaderboards" variant="ghost">Leaderboards</LinkButton><LinkButton href="/challenges/create">Create Challenge</LinkButton><LinkButton href="/auth/login" variant="secondary">Sign In</LinkButton></nav><button onClick={() => setMenuOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-[var(--gold)]/30 text-[var(--gold)] md:hidden" aria-label="Open public navigation"><Menu /></button></div>
      </header>
      {menuOpen ? <div className="fixed inset-0 z-[90] md:hidden" role="dialog" aria-modal="true" aria-label="Public navigation"><button className="absolute inset-0 bg-black/80" onClick={() => setMenuOpen(false)} aria-label="Close navigation" /><aside className="absolute bottom-0 right-0 top-0 w-[min(88vw,340px)] border-l border-[var(--gold)]/20 bg-[#0b0b0b] p-5"><div className="flex items-center justify-between"><span className="font-black">Menu</span><button onClick={() => setMenuOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-white/10"><X /></button></div><nav className="mt-8 grid gap-3"><LinkButton href="/challenges">Explore Challenges</LinkButton><LinkButton href="/challenges/create" variant="secondary">Create Challenge</LinkButton><LinkButton href="/leaderboards" variant="secondary">Leaderboards</LinkButton><LinkButton href="/winners" variant="secondary">Winners</LinkButton><LinkButton href="/auth/login" variant="ghost">Sign In</LinkButton></nav></aside></div> : null}
      <section className="relative flex min-h-[680px] flex-col items-center justify-center overflow-hidden px-4 py-20 text-center sm:px-6 lg:min-h-[900px] lg:py-28">
        <BrandLogo className="mb-7 lg:mb-8" imageClassName="h-20 w-20 border-2 border-[var(--gold)] gold-glow sm:h-24 sm:w-24 lg:h-28 lg:w-28" />
        <FloatingCard className="left-[10%] top-[12%]" icon={<Camera size={48} />} label="Creative Challenges" />
        <FloatingCard className="left-[15%] top-[38%]" icon={<Globe size={48} />} label="Global Community" />
        <FloatingCard className="right-[15%] top-[37%]" icon={<Trophy size={48} />} label="Prize Foundations" />
        <h1 className="max-w-5xl text-4xl font-black leading-tight tracking-normal sm:text-5xl lg:text-6xl">Welcome to <span className="text-[var(--gold)]">ChallengeSuite</span></h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-[#9cb5d8] sm:mt-8 sm:text-xl lg:mt-10 lg:text-2xl lg:leading-10">Join creative challenges, showcase your talent, and compete with a global community</p>
        <div className="mt-9 flex w-full max-w-sm flex-col justify-center gap-3 sm:mt-12 sm:max-w-none sm:flex-row sm:flex-wrap sm:gap-6">
          <LinkButton href="/challenges" className="min-h-14 w-full text-base sm:h-16 sm:w-56 sm:text-lg">Explore Challenges</LinkButton>
          <LinkButton href="/challenges/create" variant="secondary" className="min-h-14 w-full text-base sm:h-16 sm:w-56 sm:text-lg">Create Challenge</LinkButton>
          <LinkButton href="/auth/login" variant="ghost" className="min-h-14 w-full text-base sm:h-16 sm:w-40 sm:text-lg">Sign In</LinkButton>
        </div>
      </section>

      <section className="mx-auto max-w-[1340px] px-4 pb-16 sm:px-6 sm:pb-20 lg:pb-24">
        <h2 className="text-center text-3xl font-black leading-tight text-[var(--gold-2)] sm:text-4xl lg:text-5xl">Why Join ChallengeSuite?</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:mt-16 lg:grid-cols-3 lg:gap-8">
          {features.map((feature) => {
            const Icon = feature.icon;
            return <Card key={feature.title} className="p-6 text-center sm:min-h-[280px] lg:min-h-[330px] lg:p-10"><Icon className="mx-auto text-white" size={46} /><h3 className="mt-6 text-xl font-black lg:mt-9 lg:text-2xl">{feature.title}</h3><p className="mt-4 text-base leading-7 text-[#9cb5d8] lg:mt-5 lg:text-lg lg:leading-8">{feature.body}</p></Card>;
          })}
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#111111] py-14 sm:py-16 lg:py-20">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 text-center sm:px-6 md:grid-cols-4 lg:gap-10">
          {[["24", "Active Users"], ["19", "Challenges"], ["Tracked", "Prize Foundations"], ["12", "Submissions"]].map(([value, label]) => <div key={label} className="min-w-0"><div className="break-words text-4xl font-black text-[var(--gold)] sm:text-5xl lg:text-6xl">{value}</div><div className="mt-3 text-sm font-bold leading-6 text-slate-300 sm:text-base lg:mt-4 lg:text-xl">{label}</div></div>)}
        </div>

        <Card className="mx-4 mt-12 max-w-3xl p-5 sm:mx-auto sm:mt-16 sm:p-8 lg:mt-20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="flex min-w-0 items-center gap-2 text-2xl font-black sm:text-3xl"><Crown className="shrink-0 text-[var(--gold)]" /> <span className="min-w-0">Homepage Leaderboard</span></h2>
            {!expanded ? <Button onClick={() => setExpanded(true)} variant="secondary" className="w-full sm:w-auto">View Leaderboards</Button> : <LinkButton href="/leaderboards" className="w-full sm:w-auto">Show More</LinkButton>}
          </div>
          <div className="mt-6 space-y-3">
            {visibleLeaders.map(([name, score, plan], index) => (
              <div key={name} className="flex items-center justify-between gap-3 rounded-[8px] bg-black/30 p-4">
                <span className="flex min-w-0 flex-wrap items-center gap-2 font-black">#{index + 1} <span className="truncate">{name}</span><PremiumBadge planId={plan as any} compact /></span>
                <span className="shrink-0 text-sm font-black text-[var(--gold)] sm:text-base">{score}</span>
              </div>
            ))}
          </div>
        </Card>

        <div className="mx-auto mt-14 max-w-3xl px-4 text-center sm:mt-16 lg:mt-20">
          <h2 className="text-3xl font-black leading-tight sm:text-4xl lg:text-5xl">Ready to Start Your Journey?</h2>
          <p className="mt-5 text-lg leading-8 text-[#9cb5d8] sm:mt-7 sm:text-2xl">Join thousands of creators showcasing their talent</p>
          <div className="mt-8 grid gap-3 sm:mt-10 sm:flex sm:justify-center"><LinkButton href="/challenges" className="min-h-14 w-full text-base sm:w-64 sm:text-lg">Find Challenges</LinkButton><LinkButton href="/challenges/create" variant="secondary" className="min-h-14 w-full text-base sm:w-64 sm:text-lg">Create Challenge</LinkButton></div>
        </div>
      </section>
      <footer className="py-10 text-center text-[#58719a]">ChallengeSuite. All rights reserved.</footer>
    </main>
  );
}

function FloatingCard({ icon, label, className }: { icon: React.ReactNode; label: string; className: string }) {
  return <div className={`absolute hidden rounded-[16px] border border-white/10 bg-white/5 px-10 py-12 lg:block ${className}`}><div>{icon}</div><div className="mt-7 text-lg font-bold text-slate-300">{label}</div></div>;
}
