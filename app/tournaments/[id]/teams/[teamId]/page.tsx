import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Card, LinkButton } from "@/components/ui";
import { ContentImage } from "@/components/content-image";
import { getAdminDb } from "@/lib/firebase/admin";
import { getPublicTournamentTeam } from "@/lib/server/tournament-public-team";

export const dynamic = "force-dynamic";
export default async function TournamentPublicTeamPage({ params }: { params: Promise<{ id: string; teamId: string }> }) {
  const { id, teamId } = await params;
  const db = getAdminDb();
  const team = db ? await getPublicTournamentTeam(db, id, teamId) : null;
  return <AppShell><div className="mx-auto max-w-3xl"><LinkButton href={`/tournaments/${encodeURIComponent(id)}`} variant="secondary">Back to Tournament</LinkButton>{team ? <Card className="mt-6 space-y-5 p-6"><h1 className="text-2xl font-black">{team.name}</h1><p className="capitalize text-[var(--muted)]">{team.status.replaceAll("_", " ")} · {team.memberCount} members</p><h2 className="text-lg font-bold">Public team profiles</h2>{!team.publicMembers.some(member => member.captain) ? <p className="text-sm text-[var(--muted)]">The captain&apos;s public profile is private or unavailable.</p> : null}<ul className="space-y-3">{team.publicMembers.map((member, index) => <li key={index} className="flex items-center gap-4 rounded-lg border border-[var(--line)] p-4">{member.avatarUrl ? <ContentImage src={member.avatarUrl} alt="" className="size-12 rounded-full object-cover" /> : null}<div>{member.profilePath ? <Link className="font-bold underline focus-visible:outline-2 focus-visible:outline-amber-600" href={member.profilePath}>{member.displayName}</Link> : <p className="font-bold">{member.displayName}</p>}{member.captain ? <p className="text-sm text-[var(--muted)]">Captain</p> : null}</div></li>)}</ul>{team.publicMembers.length < team.memberCount ? <p className="text-sm text-[var(--muted)]">Only available public profiles are shown. Private account details and payment information remain protected.</p> : null}</Card> : <Card className="mt-6 p-6"><h1 className="text-xl font-black">Team unavailable</h1><p className="mt-3">This team is not available for public viewing.</p></Card>}</div></AppShell>;
}
