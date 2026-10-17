"use client";
import Link from "next/link";
import { useState } from "react";
import { Card, Button } from "@/components/ui";
import { ChallengeDescription } from "@/components/challenge-description";
type Row = Record<string, unknown> & { id: string };
const tabs = ["Overview", "Bracket", "Matches", "Participants", "Prizes", "Rules"] as const;
const friendly = (value: unknown) => String(value ?? "Pending").replaceAll("_", " ");
export function TournamentDetailContent({ tournament, matches, participants }: { tournament: Row; matches: Row[]; participants: Row[] }) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
  const [bracketView, setBracketView] = useState<"round" | "full">("round");
  const [round, setRound] = useState("");
  const [zoom, setZoom] = useState(1);
  const sorted = matches.slice().sort((a, b) => Number(a.roundNumber) - Number(b.roundNumber) || Number(a.matchNumber) - Number(b.matchNumber));
  const rounds = [...new Set(sorted.map(match => `${match.bracket ?? "winners"}:${match.roundNumber}`))];
  const selectedRound = rounds.includes(round) ? round : rounds.find(key => sorted.some(match => `${match.bracket ?? "winners"}:${match.roundNumber}` === key && ["submissions_open", "submission_review", "voting_open", "voting_closed"].includes(String(match.status)))) ?? rounds[0];
  const names = new Map(participants.map((participant, index) => [participant.id, String(participant.displayName ?? `Entrant ${index + 1}`)]));
  function matchCard(match: Row) {
    return <Link key={match.id} href={`/tournaments/${encodeURIComponent(tournament.id)}/matches/${encodeURIComponent(match.id)}`} className="block rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 hover:border-amber-500">
      <span className="text-xs text-slate-500">{friendly(match.bracket)} · Match {Number(match.matchNumber)}</span>
      <p className="mt-2 font-bold">{names.get(String(match.participantAId)) ?? "Awaiting entrant"}</p><p className="my-1 text-xs text-slate-500">versus</p><p className="font-bold">{names.get(String(match.participantBId)) ?? "Awaiting entrant"}</p>
      <p className="mt-3 capitalize">{friendly(match.status)}</p>
      {match.winnerParticipantId ? <p className="mt-2 text-emerald-700 dark:text-emerald-300">Verified winner: {names.get(String(match.winnerParticipantId)) ?? "Verified entrant"}</p> : null}
      <span className="mt-3 inline-block font-semibold text-amber-700 dark:text-amber-300">View match →</span>
    </Link>;
  }
  const instructions = Array.isArray(tournament.submissionInstructions) ? tournament.submissionInstructions.map(String) : [];
  const rules = Array.isArray(tournament.tournamentRules) ? tournament.tournamentRules.map(String) : [];
  const pool = Number((tournament.prizePool as Record<string, unknown> | undefined)?.confirmedPrizePoolMinor ?? 0);
  const fundingUnderReview = (tournament.prizePool as Record<string, unknown> | undefined)?.status === "under_review";
  return <section className="mt-8">
    <div role="tablist" aria-label="Tournament information" className="flex overflow-x-auto border-b border-[var(--line)]" onKeyDown={event => {
      const index = tabs.indexOf(tab);
      const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
      if (next === null) return;
      event.preventDefault(); setTab(tabs[next]); (event.currentTarget.querySelectorAll('[role="tab"]')[next] as HTMLButtonElement)?.focus();
    }}>{tabs.map(name => <button key={name} type="button" role="tab" id={`tournament-tab-${name}`} aria-controls={`tournament-panel-${name}`} aria-selected={tab === name} tabIndex={tab === name ? 0 : -1} onClick={() => setTab(name)} className={`min-h-12 shrink-0 border-b-2 px-4 text-sm font-bold focus-visible:outline-2 focus-visible:outline-amber-600 ${tab === name ? "border-amber-600 text-amber-700 dark:text-amber-300" : "border-transparent text-slate-500"}`}>{name}</button>)}</div>
    <div role="tabpanel" id={`tournament-panel-${tab}`} aria-labelledby={`tournament-tab-${tab}`} tabIndex={0} className="pt-6">
      {tab === "Overview" ? <Card className="space-y-5 p-5"><h2 className="text-xl font-black">About this Tournament</h2><ChallengeDescription description={String(tournament.description ?? "")} /><dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Format</dt><dd>{friendly(tournament.format)}</dd></div><div><dt className="text-slate-500">Entrants</dt><dd>{Number(tournament.participantCount ?? 0)} / {Number(tournament.participantCapacity)} {tournament.participationMode === "team" ? "teams" : "individuals"}</dd></div><div><dt className="text-slate-500">Submission window per match</dt><dd>{Number(tournament.submissionDurationHours ?? 48)} hours</dd></div><div><dt className="text-slate-500">Voting window per match</dt><dd>{Number(tournament.votingDurationHours ?? 72)} hours</dd></div></dl><p className="text-sm text-slate-500">Registration closes when all eligible slots are confirmed. Match deadlines are shown on each match page.</p></Card> : null}
      {tab === "Bracket" ? <div className="space-y-4"><div className="flex flex-wrap items-center gap-3"><Button variant={bracketView === "round" ? "primary" : "secondary"} onClick={() => setBracketView("round")} aria-pressed={bracketView === "round"}>Round View</Button><Button variant={bracketView === "full" ? "primary" : "secondary"} onClick={() => setBracketView("full")} aria-pressed={bracketView === "full"}>Full Bracket</Button>{bracketView === "full" ? <><Button variant="secondary" onClick={() => setZoom(value => Math.max(.5, value - .25))} disabled={zoom <= .5} aria-label="Zoom bracket out">−</Button><output aria-live="polite">{Math.round(zoom * 100)}%</output><Button variant="secondary" onClick={() => setZoom(value => Math.min(1.5, value + .25))} disabled={zoom >= 1.5} aria-label="Zoom bracket in">+</Button></> : <label className="text-sm">Round <select value={selectedRound ?? ""} onChange={event => setRound(event.target.value)} className="ml-2 min-h-11 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-2">{rounds.map(key => <option key={key} value={key}>{friendly(key.split(":")[0])} · Round {key.split(":")[1]}</option>)}</select></label>}</div>{!matches.length ? <p>Bracket pairings appear after confirmed capacity and automatic activation.</p> : bracketView === "round" ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{sorted.filter(match => `${match.bracket ?? "winners"}:${match.roundNumber}` === selectedRound).map(matchCard)}</div> : <div tabIndex={0} role="region" aria-label="Full Tournament bracket. Scroll horizontally and vertically to explore." className="max-h-[75vh] overflow-auto rounded-xl border border-[var(--line)] p-4"><div className="flex w-max items-start gap-5" style={{ zoom }}>{rounds.map(key => <section key={key} className="w-64 shrink-0 space-y-3"><h3 className="font-bold capitalize">{friendly(key.split(":")[0])} · Round {key.split(":")[1]}</h3>{sorted.filter(match => `${match.bracket ?? "winners"}:${match.roundNumber}` === key).map(matchCard)}</section>)}</div></div>}</div> : null}
      {tab === "Matches" ? sorted.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{sorted.map(matchCard)}</div> : <p>No matches have been generated yet.</p> : null}
      {tab === "Participants" ? participants.length ? <ul className="grid gap-3 sm:grid-cols-2">{participants.map(participant => <li key={participant.id} className="rounded-xl border border-[var(--line)] p-4"><p className="font-bold">{names.get(participant.id)}</p><p className="text-sm capitalize text-slate-500">{friendly(participant.status)}</p>{tournament.participationMode === "team" ? <Link className="mt-3 inline-block font-semibold underline focus-visible:outline-2 focus-visible:outline-amber-600" href={`/tournaments/${encodeURIComponent(tournament.id)}/teams/${encodeURIComponent(participant.id)}`}>View team and public profiles</Link> : null}</li>)}</ul> : <p>No confirmed entrants yet.</p> : null}
      {tab === "Prizes" ? <Card className="space-y-4 p-5">
        <h2 className="text-xl font-black">Confirmed prize contributions</h2>
        {fundingUnderReview ? <p role="status">Funding is under reconciliation. A distributable total is withheld until financial restrictions are resolved.</p> : <p className="text-3xl font-black">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(pool / 100)}</p>}
        <p className="text-sm text-slate-500">Pending payments, sponsor interest and expected entry revenue are not confirmed prize contributions.</p>
        <ol className="space-y-2">{(Array.isArray(tournament.prizeDistribution) ? tournament.prizeDistribution : []).map((item, index) => {
          const allocation = item as Record<string, unknown>;
          return <li key={index}>Place {Number(allocation.placement)}: {Number(allocation.percent)}% {Number(tournament.configVersion ?? 1) >= 3 ? "of the eligible winner pool" : "under the published allocation terms"}</li>;
        })}</ol>
        {Number(tournament.configVersion ?? 1) >= 3 ? <p className="text-sm">Team prizes are divided equally among the eligible locked roster. Restricted shares remain held. Unawarded third-place funds are held for review, never redistributed automatically.</p> : <p className="text-sm">The original published prize terms and server-approved settlement remain authoritative.</p>}
        <Link className="inline-block font-semibold underline" href={`/tournaments/${encodeURIComponent(tournament.id)}/results`}>View official results and allocation status</Link>
      </Card> : null}
      {tab === "Rules" ? <Card className="space-y-5 p-5"><h2 className="text-xl font-black">Tournament rules</h2>{rules.length ? <ol className="list-decimal space-y-2 pl-5">{rules.map((rule, index) => <li key={index} className="whitespace-pre-wrap">{rule}</li>)}</ol> : <p>No additional creator rules were supplied.</p>}<h3 className="font-bold">Submission instructions</h3>{instructions.length ? <ol className="list-decimal space-y-2 pl-5">{instructions.map((instruction, index) => <li key={index} className="whitespace-pre-wrap">{instruction}</li>)}</ol> : <p>No additional submission instructions were supplied.</p>}<p className="text-sm">Each match requires fresh content. Only the authorized captain submits for a team. Eligibility, moderation and match deadlines are enforced by the server.</p></Card> : null}
    </div>
  </section>;
}
