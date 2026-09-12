"use client";

import { useEffect, useState } from "react";
import { Building2, Radio, ShieldCheck, Swords, Trophy } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { apiRequest } from "@/lib/api/client";
import { Card, LinkButton, PageTitle } from "@/components/ui";

const types = [
  { slug: "normal", label: "Normal Challenge", icon: Swords },
  { slug: "private", label: "Private Challenge", icon: ShieldCheck },
  { slug: "live", label: "Live Event", icon: Radio },
  { slug: "tournament", label: "Tournament", icon: Trophy },
] as const;
type ChallengeType = typeof types[number]["slug"];
type Workspace = { access: { permissions: string[] } };

export function EnterpriseCreateEntry({ selectedType }: { selectedType: ChallengeType | null }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void apiRequest<Workspace>("/api/enterprise/workspace").then((result) => result.ok && result.data ? setWorkspace(result.data) : setError(result.message || "Enterprise access is required."));
  }, []);
  if (error) return <AppShell><Card className="mx-auto max-w-3xl p-7"><h1 className="text-2xl font-black">Enterprise creation unavailable</h1><p className="mt-3 text-slate-600">{error}</p><LinkButton href="/enterprise" className="mt-6">Enterprise Studio</LinkButton></Card></AppShell>;
  if (!workspace) return <AppShell><Card className="mx-auto h-72 max-w-5xl animate-pulse" /></AppShell>;
  const canOfficial = workspace.access.permissions.includes("challenge.create_official");
  if (!canOfficial) return <AppShell><Card className="mx-auto max-w-3xl p-7"><h1 className="text-2xl font-black">Challenge creation is not included in your Enterprise access</h1><p className="mt-3 text-slate-600">Your staff role can continue using its assigned operational areas.</p><LinkButton href="/enterprise/assigned" className="mt-6">Assigned to Me</LinkButton></Card></AppShell>;

  const visibleTypes = selectedType ? types.filter((item) => item.slug === selectedType) : types;
  const selectedLabel = visibleTypes[0]?.label;
  return <AppShell><div className="mx-auto max-w-6xl"><PageTitle title={selectedLabel ?? "Build a Challenge"} subtitle="Challenges created here belong to Challenge Suite Enterprise. Switch to Personal Workspace to create a personally owned challenge." icon={<Building2 className="text-[var(--gold)]" />} /><Card className="mt-8 p-6"><h2 className="text-2xl font-black text-slate-950">Official Enterprise Challenge</h2><p className="mt-2 text-sm leading-6 text-slate-600">Your account is recorded as the creation author and initial Challenge Lead; ownership and finance remain organizational.</p><div className="mt-6 grid gap-3 sm:grid-cols-2">{visibleTypes.map(({ slug, label, icon: Icon }) => <LinkButton key={slug} href={"/enterprise/challenges/create/official/" + slug} variant="secondary"><Icon size={17} />{label}</LinkButton>)}</div></Card></div></AppShell>;
}
