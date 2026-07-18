"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, BarChart3, Check, ChevronRight, Menu, Play, ShieldCheck, Sparkles, Trophy, Vote, X } from "lucide-react";
import { BrandLogo, PremiumBadge } from "@/components/brand";
import { LinkButton } from "@/components/ui";
import { useAuth } from "@/components/auth-provider";

const audience = [
  { index: "01", title: "Competitors", body: "Discover challenges, submit your best work, vote fairly, and build a public competition record.", href: "/challenges" },
  { index: "02", title: "Creators", body: "Launch public challenges, grow an audience, and manage every entry from one focused studio.", href: "/challenges/create" },
  { index: "03", title: "Hosts", body: "Run tournaments, live events, participant reviews, voting controls, and competition reports.", href: "/subscriptions" },
  { index: "04", title: "Brands", body: "Find sponsor-ready communities and support structured campaigns with defined goals and budgets.", href: "/sponsor/plans" }
];

const trust = [
  { icon: Vote, title: "Structured voting", body: "Set voting windows, daily limits, DoroCoin rules, and winner criteria." },
  { icon: ShieldCheck, title: "Moderated competition", body: "Review submissions, enforce rules, manage disputes, and confirm outcomes." },
  { icon: Trophy, title: "Prize transparency", body: "Define prize terms clearly and track approved winner payments." }
];

const leaders = [
  ["Competitor profile", "4,850", "competitor"],
  ["Creator profile", "3,940", "creator"],
  ["Rising creator", "3,410", "creator"],
  ["Host", "2,980", "verified_host"]
];

function safeInternalPath(destination: string) {
  if (!destination.startsWith("/") || destination.startsWith("//") || destination.includes("://")) return "/dashboard";
  return destination;
}

function signInRedirect(destination: string) {
  return `/sign-in?next=${encodeURIComponent(safeInternalPath(destination))}`;
}

export default function LandingPage() {
  const auth = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const internalHref = (destination: string) => auth.user ? safeInternalPath(destination) : signInRedirect(destination);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <main className="min-h-screen overflow-x-hidden bg-black text-white">
      <header className={`fixed inset-x-0 top-0 z-50 px-5 py-3 transition duration-300 ${scrolled ? "border-b border-white/10 bg-black/80 backdrop-blur-xl" : "border-b border-transparent bg-transparent"}`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-5">
          <a href="/landing" className="flex items-center gap-3"><BrandLogo imageClassName="h-10 w-10 border border-[var(--gold)]" /><span className="text-sm font-black uppercase tracking-[0.16em]">Challenge Suite</span></a>
          <nav className="hidden items-center gap-1 lg:flex">
            <LinkButton href={internalHref("/challenges")} variant="ghost">Explore</LinkButton>
            <LinkButton href={internalHref("/leaderboards")} variant="ghost">Leaderboards</LinkButton>
            <LinkButton href="/auth/login" variant="ghost">Sign In</LinkButton>
            <LinkButton href="/auth/register" className="ml-2">Create Account</LinkButton>
          </nav>
          <button type="button" onClick={() => setMenuOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-[var(--gold)]/30 bg-black/30 text-[var(--gold)] lg:hidden" aria-label="Open public navigation"><Menu /></button>
        </div>
      </header>

      {menuOpen ? <div className="fixed inset-0 z-[100] lg:hidden" role="dialog" aria-modal="true" aria-label="Public navigation">
        <button type="button" className="absolute inset-0 bg-black/80" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />
        <aside className="absolute bottom-0 right-0 top-0 w-[min(88vw,360px)] overflow-y-auto border-l border-[var(--gold)]/20 bg-[#0b0b0b] p-6">
          <div className="flex items-center justify-between"><span className="font-black">Challenge Suite</span><button type="button" onClick={() => setMenuOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-white/10" aria-label="Close menu"><X /></button></div>
          <nav className="mt-10 grid gap-3"><LinkButton href={internalHref("/challenges")}>Explore Challenges</LinkButton><LinkButton href="/auth/register" variant="secondary">Create Account</LinkButton><LinkButton href={internalHref("/challenges/create")} variant="secondary">Create Challenge</LinkButton><LinkButton href={internalHref("/leaderboards")} variant="ghost">Leaderboards</LinkButton><LinkButton href="/auth/login" variant="ghost">Sign In</LinkButton></nav>
        </aside>
      </div> : null}

      <section className="relative min-h-[760px] overflow-hidden border-b border-white/10 pt-24 lg:min-h-[880px]">
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,.96)_0%,rgba(0,0,0,.72)_52%,rgba(0,0,0,.24)_100%),url('https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=2200&q=85')] bg-cover bg-center" />
        <div className="relative mx-auto flex min-h-[680px] max-w-7xl items-end px-5 pb-16 sm:px-8 lg:min-h-[790px] lg:items-center lg:px-10 lg:pb-10">
          <div className="max-w-4xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[var(--gold)]">Structured competition for ambitious communities</p>
            <h1 className="mt-6 max-w-4xl text-5xl font-black leading-[1.02] sm:text-6xl lg:text-7xl xl:text-8xl">Turn participation into <span className="text-[var(--gold)]">momentum.</span></h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-200 sm:text-xl">Create, join, vote, rank, and run serious challenges through one trusted platform built for competitors, creators, hosts, and brands.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <LinkButton href="/auth/register" className="min-h-14 px-7 text-base">Create Account <ArrowRight size={18} /></LinkButton>
              <LinkButton href={internalHref("/challenges")} variant="secondary" className="min-h-14 px-7 text-base">Explore Challenges</LinkButton>
              <LinkButton href={internalHref("/challenges/create")} variant="ghost" className="min-h-14 px-7 text-base">Start Creating</LinkButton>
            </div>
            <div className="mt-12 flex flex-wrap gap-x-8 gap-y-4 border-t border-white/15 pt-6 text-sm font-bold text-slate-300">
              <span className="flex items-center gap-2"><Check size={16} className="text-[var(--gold)]" /> Public challenges</span>
              <span className="flex items-center gap-2"><Check size={16} className="text-[var(--gold)]" /> Structured voting</span>
              <span className="flex items-center gap-2"><Check size={16} className="text-[var(--gold)]" /> Verified host tools</span>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 py-20 sm:py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
          <SectionHeading eyebrow="The Challenge Suite experience" title="Competition, in motion." body="Discover challenges, submit entries, follow voting, and track rankings from one clear experience." />
          <div className="mt-12 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
            <article className="group relative min-h-[480px] overflow-hidden rounded-[8px] border border-white/10 bg-[url('https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1600&q=85')] bg-cover bg-center">
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8"><span className="inline-flex items-center gap-2 rounded-full bg-[var(--gold)] px-3 py-1.5 text-xs font-black uppercase text-black"><Play size={13} /> Challenge view</span><h3 className="mt-5 text-3xl font-black sm:text-4xl">A Challenge Suite stage</h3><p className="mt-3 max-w-xl text-slate-200">Follow approved entries, community votes, and a leaderboard that moves with participation.</p><div className="mt-6"><LinkButton href={internalHref("/challenges")}>Explore Published Challenges</LinkButton></div></div>
            </article>
            <div className="grid gap-5">
              <PreviewCard icon={<Sparkles />} label="Trending" title="Creator spotlight" body="Discover original entries before they climb the rankings." />
              <PreviewCard icon={<BarChart3 />} label="Leaderboard" title="Every vote has context" body="Follow position, activity, and verified competition outcomes." />
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-[#0d0d0d] py-20 sm:py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
          <SectionHeading eyebrow="One platform. Four ways in." title="Built around the role you play." body="Join as a competitor, grow as a creator, run full competitions as a host, or partner with communities as a brand." />
          <div className="mt-12 divide-y divide-white/10 border-y border-white/10">
            {audience.map((item) => <a key={item.title} href={internalHref(item.href)} className="group grid gap-4 py-8 transition hover:bg-white/[0.025] sm:grid-cols-[80px_1fr_auto] sm:items-center sm:px-4 lg:py-10"><span className="text-sm font-black text-[var(--gold)]">{item.index}</span><div><h3 className="text-2xl font-black sm:text-3xl">{item.title}</h3><p className="mt-2 max-w-2xl leading-7 text-slate-400">{item.body}</p></div><ChevronRight className="hidden text-[var(--gold)] transition group-hover:translate-x-2 sm:block" /></a>)}
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 py-20 sm:py-24 lg:py-32">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_1.2fr] lg:items-center lg:px-10">
          <div><SectionHeading eyebrow="Competition you can trust" title="Better structure. Fairer outcomes." body="Clear voting rules, reviewed submissions, transparent rankings, and controlled prize processes keep every challenge credible." /><LinkButton href={internalHref("/challenges")} variant="secondary" className="mt-8">See Competition Flow</LinkButton></div>
          <div className="grid gap-4">{trust.map(({ icon: Icon, title, body }, index) => <article key={title} className="grid grid-cols-[52px_1fr] gap-5 rounded-[8px] border border-white/10 bg-[#111] p-5 transition hover:border-[var(--gold)]/40 sm:p-6"><div className="flex h-12 w-12 items-center justify-center rounded-[8px] bg-[var(--gold)]/10 text-[var(--gold)]"><Icon size={22} /></div><div><p className="text-xs font-black text-slate-500">0{index + 1}</p><h3 className="mt-1 text-xl font-black">{title}</h3><p className="mt-2 leading-7 text-slate-400">{body}</p></div></article>)}</div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-[#0d0d0d] py-20 sm:py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-end"><SectionHeading eyebrow="Leaderboard pulse" title="Progress should feel visible." body="Rankings turn participation into a story people can follow." /><LinkButton href={internalHref("/leaderboards")} className="w-fit lg:justify-self-end">View Full Leaderboard</LinkButton></div>
          <div className="mt-10 overflow-hidden rounded-[8px] border border-white/10">{leaders.map(([name, points, plan], index) => <div key={name} className="grid grid-cols-[48px_1fr_auto] items-center gap-4 border-b border-white/10 bg-[#111] p-5 last:border-0 sm:grid-cols-[70px_1fr_auto] sm:p-6"><span className="text-2xl font-black text-[var(--gold)]">{String(index + 1).padStart(2, "0")}</span><span className="flex min-w-0 flex-wrap items-center gap-3 font-black"><span className="truncate">{name}</span><PremiumBadge planId={plan as any} compact /></span><span className="font-black">{points} <span className="hidden text-sm text-slate-500 sm:inline">pts</span></span></div>)}</div>
        </div>
      </section>

      <section className="relative overflow-hidden border-b border-white/10 py-20 sm:py-24 lg:py-32">
        <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[linear-gradient(90deg,#0000,#000),url('https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1400&q=80')] bg-cover bg-center opacity-35 lg:block" />
        <div className="relative mx-auto max-w-7xl px-5 sm:px-8 lg:px-10"><div className="max-w-2xl"><p className="text-xs font-black uppercase tracking-[0.22em] text-[var(--gold)]">For Hosts and Brands</p><h2 className="mt-5 text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">Run the room. Back the right community.</h2><p className="mt-6 text-lg leading-8 text-slate-300">Hosts get operational competition tools. Approved brands get a separate command center for reviewed campaign collaboration. Subscription access and campaign budgets stay clearly separated.</p><div className="mt-8 flex flex-wrap gap-3"><LinkButton href={internalHref("/subscriptions")}>Compare Plans</LinkButton><LinkButton href={internalHref("/sponsor/plans")} variant="secondary">Explore Brand Access</LinkButton></div></div></div>
      </section>

      <section className="px-5 py-20 sm:px-8 sm:py-24 lg:py-32">
        <div className="mx-auto max-w-7xl rounded-[8px] border border-[var(--gold)]/30 bg-[var(--gold)] p-7 text-black sm:p-10 lg:p-14">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end"><div><p className="text-xs font-black uppercase tracking-[0.22em]">Your next challenge starts here</p><h2 className="mt-4 max-w-4xl text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">Compete. Create. Host. Partner.</h2><p className="mt-5 max-w-2xl text-lg font-bold text-black/70">Join a platform built to make serious competition clear, social, and worth following.</p></div><div className="flex flex-col gap-3 sm:flex-row lg:flex-col"><LinkButton href="/auth/register" className="min-h-14 border-black bg-black text-white hover:bg-[#171717]">Create Account</LinkButton><LinkButton href={internalHref("/challenges")} variant="secondary" className="min-h-14 border-black/30 bg-transparent text-black hover:bg-black hover:text-white">Explore Challenges</LinkButton></div></div>
        </div>
      </section>
      <footer className="border-t border-white/10 px-5 py-10"><div className="mx-auto flex max-w-7xl flex-col gap-5 text-sm text-slate-500"><span>Challenge Suite. Competition, made intentional.</span><div className="flex flex-wrap gap-x-5 gap-y-3"><a href="/about">About</a><a href="/contact">Contact</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/community-guidelines">Community Guidelines</a><a href="/refund-policy">Refund Policy</a><a href="/cookie-policy">Cookie Policy</a><a href="/auth/login">Sign In</a><a href="/auth/register">Create Account</a></div></div></footer>
    </main>
  );
}

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return <div className="max-w-3xl"><p className="text-xs font-black uppercase tracking-[0.22em] text-[var(--gold)]">{eyebrow}</p><h2 className="mt-5 text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">{title}</h2><p className="mt-5 max-w-2xl text-lg leading-8 text-slate-400">{body}</p></div>;
}
function PreviewCard({ icon, label, title, body }: { icon: ReactNode; label: string; title: string; body: string }) {
  return <article className="group flex min-h-56 flex-col justify-between rounded-[8px] border border-white/10 bg-[#111] p-6 transition hover:-translate-y-1 hover:border-[var(--gold)]/40 sm:p-8"><div className="flex items-center justify-between"><div className="text-[var(--gold)]">{icon}</div><span className="text-xs font-black uppercase text-slate-500">{label}</span></div><div><h3 className="text-2xl font-black">{title}</h3><p className="mt-3 leading-7 text-slate-400">{body}</p></div></article>;
}
