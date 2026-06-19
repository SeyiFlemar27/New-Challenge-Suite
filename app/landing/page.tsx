"use client";

import { useState } from "react";
import { Award, BadgeCheck, BarChart3, Camera, Crown, Globe, Trophy, Users } from "lucide-react";
import { LinkButton, Card, Button } from "@/components/ui";
import { BrandLogo, PremiumBadge } from "@/components/brand";

const features = [
  { icon: Camera, title: "Daily Challenges", body: "New creative challenges every day across photography, art, fitness, and more" },
  { icon: Award, title: "Earn Badges", body: "Unlock achievements and showcase your skills with exclusive badges" },
  { icon: BarChart3, title: "Leaderboards", body: "Compete globally and climb the ranks to become a top creator" },
  { icon: Trophy, title: "Win Prizes", body: "Participate in premium challenges with cash prizes and rewards" },
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
  const visibleLeaders = expanded ? leaders : leaders.slice(0, 3);

  return (
    <main className="min-h-screen bg-[#11111a]">
      <section className="relative flex min-h-[900px] flex-col items-center justify-center overflow-hidden px-6 text-center">
        <BrandLogo className="mb-8" imageClassName="h-28 w-28 border-2 border-[var(--gold)] gold-glow" />
        <FloatingCard className="left-[10%] top-[12%]" icon={<Camera size={48} />} label="Creative Challenges" />
        <FloatingCard className="left-[15%] top-[38%]" icon={<Globe size={48} />} label="Global Community" />
        <FloatingCard className="right-[15%] top-[37%]" icon={<Trophy size={48} />} label="Win Prizes" />
        <h1 className="text-6xl font-black tracking-normal">Welcome to <span className="text-[var(--gold)]">ChallengeSuite</span></h1>
        <p className="mt-10 max-w-3xl text-2xl leading-10 text-[#9cb5d8]">Join creative challenges, showcase your talent, and compete with a global community</p>
        <div className="mt-12 flex flex-wrap justify-center gap-6">
          <LinkButton href="/auth/register" variant="purple" className="h-16 w-72 text-lg">Get Started Free</LinkButton>
          <LinkButton href="/auth/login" variant="ghost" className="h-16 w-40 text-lg">Sign In</LinkButton>
        </div>
      </section>

      <section className="mx-auto max-w-[1340px] px-6 pb-24">
        <h2 className="text-center text-5xl font-black text-[#d5a7ff]">Why Join ChallengeSuite?</h2>
        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return <Card key={feature.title} className="min-h-[330px] p-10 text-center"><Icon className="mx-auto text-white" size={54} /><h3 className="mt-9 text-2xl font-black">{feature.title}</h3><p className="mt-5 text-lg leading-8 text-[#9cb5d8]">{feature.body}</p></Card>;
          })}
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#211a3b] py-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 text-center md:grid-cols-4">
          {[["24", "Active Users"], ["19", "Challenges"], ["$6,900+", "Prizes Won"], ["12", "Submissions"]].map(([value, label]) => <div key={label}><div className="text-6xl font-black text-[#765cf6]">{value}</div><div className="mt-4 text-xl font-bold text-[#9cb5d8]">{label}</div></div>)}
        </div>

        <Card className="mx-auto mt-20 max-w-3xl p-8">
          <div className="flex items-center justify-between gap-4">
            <h2 className="flex items-center gap-2 text-3xl font-black"><Crown className="text-[var(--gold)]" /> Homepage Leaderboard</h2>
            {!expanded ? <Button onClick={() => setExpanded(true)} variant="secondary">View Leaderboards</Button> : <LinkButton href="/leaderboards">Show More</LinkButton>}
          </div>
          <div className="mt-6 space-y-3">
            {visibleLeaders.map(([name, score, plan], index) => (
              <div key={name} className="flex items-center justify-between rounded-[8px] bg-black/30 p-4">
                <span className="flex items-center gap-3 font-black">#{index + 1} {name}<PremiumBadge planId={plan as any} compact /></span>
                <span className="text-[var(--gold)]">{score}</span>
              </div>
            ))}
          </div>
        </Card>

        <div className="mt-20 text-center">
          <h2 className="text-5xl font-black">Ready to Start Your Journey?</h2>
          <p className="mt-7 text-2xl text-[#9cb5d8]">Join thousands of creators showcasing their talent</p>
          <LinkButton href="/auth/register" variant="purple" className="mt-10 h-16 w-80 text-lg">Create Free Account</LinkButton>
        </div>
      </section>
      <footer className="py-10 text-center text-[#58719a]">ChallengeSuite. All rights reserved.</footer>
    </main>
  );
}

function FloatingCard({ icon, label, className }: { icon: React.ReactNode; label: string; className: string }) {
  return <div className={`absolute hidden rounded-[16px] border border-white/10 bg-white/5 px-10 py-12 lg:block ${className}`}><div>{icon}</div><div className="mt-7 text-lg font-bold text-slate-300">{label}</div></div>;
}
