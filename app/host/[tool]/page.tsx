"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { BarChart3, Bell, ClipboardCheck, Trophy, UsersRound, Vote } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PlanFeatureGate } from "@/components/plan-feature-gate";
import { Button, Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type Item = Record<string, unknown> & { id: string };
type Operations = { challenges: Item[]; participants: Item[]; submissions: Item[]; winners: Item[]; notifications: Item[]; controls: Record<string, boolean> };
const configs = {
  participants: { title: "Participant Management", subtitle: "Review registration and check-in status across hosted competitions.", icon: UsersRound, empty: "No participants yet", body: "Share your competition link. Registrations will appear here.", tabs: ["All", "Pending", "Approved", "Rejected", "Checked In", "Disqualified"] },
  submissions: { title: "Submission Review", subtitle: "Review competition entries without exposing unapproved media.", icon: ClipboardCheck, empty: "No submissions yet", body: "Submissions will appear here after participants enter.", tabs: ["Pending Review", "Approved", "Rejected", "Flagged", "Resubmission Requested"] },
  voting: { title: "Voting Control", subtitle: "Monitor voting windows, totals, and leaderboard visibility.", icon: Vote, empty: "No voting sessions yet", body: "Create a competition with voting enabled to prepare a voting session.", tabs: ["All", "Upcoming", "Open", "Paused", "Closed"] },
  tournaments: { title: "Tournament Planning", subtitle: "Plan knockout, group, leaderboard, and judge-reviewed rounds.", icon: Trophy, empty: "No tournaments yet", body: "Plan your first tournament. Round execution is not available yet.", tabs: ["Drafts", "Upcoming", "Active", "Completed"] },
  reports: { title: "Reports & Results", subtitle: "Prepare participant, submission, vote, winner, attendance, and sponsor-interest reports.", icon: BarChart3, empty: "No reports yet", body: "Reports will be generated after competition activity is recorded.", tabs: ["Participant", "Submission", "Vote", "Winner", "Attendance", "Sponsor Interest"] },
  winners: { title: "Winner Confirmation", subtitle: "Review leaderboard status before publishing results.", icon: Trophy, empty: "No winner reviews yet", body: "Winner review becomes available after voting closes.", tabs: ["Pending Confirmation", "Published", "Disqualified"] },
  notifications: { title: "Host Notifications", subtitle: "Track registration, submission, voting, event, report, and team workflow notices.", icon: Bell, empty: "No host notifications", body: "Host workflow notifications will appear here.", tabs: ["All", "Participants", "Submissions", "Voting", "Events", "Reports"] }
} as const;

export default function HostOperationsPage() {
  const params = useParams<{ tool: string }>();
  const tool = String(params.tool || "participants") as keyof typeof configs;
  const config = configs[tool] ?? configs.participants;
  const [data, setData] = useState<Operations | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<string>(config.tabs[0]);
  useEffect(() => { setTab(config.tabs[0]); void apiRequest<Operations>("/api/host/operations").then((result) => result.ok && result.data ? setData(result.data) : setError(result.message)); }, [tool]);
  const items = useMemo(() => {
    if (!data) return [];
    if (tool === "participants") return data.participants;
    if (tool === "submissions") return data.submissions;
    if (tool === "winners") return data.winners;
    if (tool === "notifications") return data.notifications;
    return data.challenges.filter((item) => tool !== "tournaments" || String(item.tournamentType ?? "none") !== "none");
  }, [data, tool]);

  return <PlanFeatureGate feature="host_control_center" requiredPlan="Host" title="Host tools are available on the Host Plan."><AppShell><div className="mx-auto max-w-7xl">
    <PageTitle title={config.title} subtitle={config.subtitle} />
    <div className="mt-6 flex gap-2 overflow-x-auto pb-2">{config.tabs.map((label) => <Button key={label} variant={tab === label ? "primary" : "secondary"} onClick={() => setTab(label)}>{label}</Button>)}</div>
    {tool === "voting" ? <VotingSummary challenges={data?.challenges ?? []} /> : null}
    {error ? <Card className="mt-6 border-red-500/30 p-5 text-red-200">{error}</Card> : null}
    {!data && !error ? <Card className="mt-6 h-56 animate-pulse" /> : items.length ? <div className="mt-6 grid gap-4">{items.map((item) => <OperationRow key={item.id} item={item} tool={tool} />)}</div> : data ? <Card className="mt-6"><EmptyState icon={<config.icon />} title={config.empty} body={config.body} action={["participants", "submissions"].includes(tool) ? <LinkButton href="/my-challenges">View Hosted Competitions</LinkButton> : <LinkButton href="/challenges/create">Build Competition</LinkButton>} /></Card> : null}
    <Card className="mt-6 border-yellow-500/20 p-5 text-sm leading-6 text-slate-300">Operational changes are disabled here unless an existing workflow supports them. No moderation decision, voting-state change, winner publication, export, payout, refund, sponsor release, or prize release is executed from this screen.</Card>
  </div></AppShell></PlanFeatureGate>;
}

function OperationRow({ item, tool }: { item: Item; tool: string }) {
  const title = String(item.title ?? item.displayName ?? item.name ?? item.type ?? "Host activity");
  const status = String(item.status ?? item.lifecycleStatus ?? "pending").replaceAll("_", " ");
  return <Card className="p-5"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div className="min-w-0"><h2 className="break-words text-lg font-black">{title}</h2><p className="mt-1 text-sm capitalize text-slate-400">{status} - {String(item.challengeId ?? item.id)}</p></div><div className="flex flex-wrap gap-2"><Button variant="secondary" disabled>{tool === "reports" ? "Export coming soon" : tool === "winners" ? "Confirm winner" : "Review"}</Button><LinkButton href={item.challengeId ? `/challenges/${item.challengeId}` : `/challenges/${item.id}`} variant="ghost">View Competition</LinkButton></div></div></Card>;
}
function VotingSummary({ challenges }: { challenges: Item[] }) {
  const votes = challenges.reduce((total, item) => total + Number(item.voteCount ?? 0), 0);
  return <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[["Voting Status", challenges.length ? "Configured" : "Waiting"], ["Total Votes", votes], ["DoroCoin Votes", "Read-only"], ["Leaderboard Visibility", challenges.length ? "Challenge settings" : "Setup required"]].map(([label, value]) => <Card key={label} className="p-5"><p className="text-xs font-bold uppercase text-slate-400">{label}</p><p className="mt-2 text-xl font-black">{value}</p></Card>)}</div>;
}

