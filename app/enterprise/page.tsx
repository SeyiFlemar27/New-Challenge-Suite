import { Building2, ClipboardCheck, LockKeyhole, Radio, Settings, Swords, Trophy, UsersRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, LinkButton, PageTitle } from "@/components/ui";

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
  const approved = false;
  if (!approved) return <AppShell><Card className="mx-auto max-w-3xl border-[var(--gold)]/25 bg-[var(--gold)]/5 p-8 text-center"><LockKeyhole className="mx-auto h-14 w-14 text-[var(--gold)]" /><h1 className="mt-5 text-3xl font-black">Enterprise access required</h1><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-300">Enterprise is available only to approved in-house operators and teams. Submit an application or wait for admin approval.</p><div className="mt-7 flex flex-wrap justify-center gap-3"><LinkButton href="/enterprise/apply">Apply for Enterprise Access</LinkButton><LinkButton href="/dashboard" variant="secondary">Back to Dashboard</LinkButton></div></Card></AppShell>;
  return <AppShell><div className="mx-auto max-w-7xl"><PageTitle title="Enterprise Control Center" subtitle="Approved in-house operations workspace for platform teams." icon={<Building2 className="text-[var(--gold)]" />} /><div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{tools.map(({ title, body, icon: Icon }) => <Card key={title} className="p-5"><Icon className="text-[var(--gold)]" /><h2 className="mt-4 text-xl font-black">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-300">{body}</p></Card>)}</div></div></AppShell>;
}

