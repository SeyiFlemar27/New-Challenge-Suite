"use client";

import { useEffect, useState } from "react";
import { Bookmark, Search, Store, Users } from "lucide-react";
import { SponsorShell, type SponsorShellProfile } from "@/components/sponsor/sponsor-shell";
import { Card, LinkButton } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

const tabs = [
  { label: "Creators", href: "/sponsor/discover/creators", icon: Users, body: "Find real sponsor-ready creator profiles and start a proposal from an eligible opportunity." },
  { label: "Challenges", href: "/sponsor/discover/challenges", icon: Store, body: "Browse published sponsor-ready challenges with real funding-window and host information." },
  { label: "Saved", href: "/sponsor/saved", icon: Bookmark, body: "Return to creators and challenges saved by this sponsor account." }
];

export default function SponsorDiscoverPage() {
  const [profile, setProfile] = useState<SponsorShellProfile | null>(null);
  useEffect(() => { void apiRequest<{ sponsorProfile: SponsorShellProfile }>("/api/sponsor/profile").then((result) => { if (result.ok && result.data) setProfile(result.data.sponsorProfile); }); }, []);
  return <SponsorShell profile={profile}><div className="mx-auto max-w-6xl"><p className="text-xs font-black uppercase tracking-[0.18em] text-amber-800">Discover</p><h1 className="mt-2 text-3xl font-black text-slate-950 sm:text-4xl">Find the right sponsorship opportunity</h1><p className="mt-3 max-w-3xl leading-7 text-slate-600">Explore real creator and challenge records, then save or propose only when your sponsor status allows it.</p><div className="mt-7 grid gap-5 md:grid-cols-3">{tabs.map((tab) => { const Icon = tab.icon; return <Card key={tab.label} className="flex flex-col p-6"><div className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-amber-50 text-amber-800"><Icon /></div><h2 className="mt-4 text-xl font-black text-slate-950">{tab.label}</h2><p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{tab.body}</p><LinkButton href={tab.href} variant="secondary" className="mt-5">Open {tab.label}</LinkButton></Card>; })}</div><Card className="mt-7 border-blue-200 bg-blue-50 p-5"><Search className="text-blue-700" /><p className="mt-3 text-sm leading-6 text-blue-900">Discovery never creates a proposal, conversation, or funding record by itself. Each action is confirmed in its own workflow.</p></Card></div></SponsorShell>;
}