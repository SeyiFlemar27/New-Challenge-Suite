"use client";

import { Building2, ClipboardCheck, LockKeyhole, Radio, Settings, Swords, Trophy, UsersRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, LinkButton, PageTitle } from "@/components/ui";
import { useCurrentUser } from "@/lib/hooks/use-current-user";

const tools = [
  { title: "Challenge Operations", body: "Coordinate approved challenge workflows.", icon: Swords },
  { title: "Private Challenges", body: "Manage invite-only competition access.", icon: LockKeyhole },
  { title: "Live Events", body: "Prepare live event operations when enabled.", icon: Radio },
  { title: "Tournaments", body: "Review tournament structures and status.", icon: Trophy },
  { title: "Voting Control", body: "Monitor voting windows and leaderboard visibility.", icon: ClipboardCheck },
  { title: "Team / Operators", body: "Operator access remains approval-controlled.", icon: UsersRound },
  { title: "Settings", body: "Configure approved workspace details.", icon: Settings }
];

export default function EnterprisePanelPage() {
  const { user, loading } = useCurrentUser();
  if (loading) return <AppShell><div className="mx-auto max-w-7xl"><div className="h-12 w-80 animate-pulse rounded bg-white/5" /><div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{[1,2,3].map((item) => <Card key={item} className="h-44 animate-pulse" />)}</div></div></AppShell>;
  const approved = [user?.enterpriseAccessStatus, user?.enterpriseApprovalStatus].some((value) => String(value ?? "").toLowerCase() === "approved");
  if (!approved) return <AppShell><Card className="mx-auto max-w-3xl border-[var(--gold)]/25 bg-[var(--gold)]/5 p-8 text-center"><LockKeyhole className="mx-auto h-14 w-14 text-[var(--gold)]" /><h1 className="mt-5 text-3xl font-black">Enterprise access required</h1><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-300">Enterprise is available to approved teams. Apply or check the status of an existing application.</p><div className="mt-7 flex flex-wrap justify-center gap-3"><LinkButton href="/enterprise/apply">Apply for Enterprise Access</LinkButton><LinkButton href="/enterprise/status" variant="secondary">View Application</LinkButton><LinkButton href="/dashboard" variant="secondary">Back to Dashboard</LinkButton></div></Card></AppShell>;
  return <AppShell><div className="mx-auto max-w-7xl"><PageTitle title="Enterprise Control Center" subtitle="Approved operations workspace for your team." icon={<Building2 className="text-[var(--gold)]" />} /><div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{tools.map(({ title, body, icon: Icon }) => <Card key={title} className="p-5"><Icon className="text-[var(--gold)]" /><h2 className="mt-4 text-xl font-black">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-300">{body}</p></Card>)}</div></div></AppShell>;
}
