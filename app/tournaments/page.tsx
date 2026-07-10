"use client";

import { AppShell } from "@/components/app-shell";
import { Button, Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { Trophy } from "lucide-react";
import { useState } from "react";
import { PlanFeatureGate } from "@/components/plan-feature-gate";

export default function TournamentsPage() {
  return (
    <PlanFeatureGate feature="tournament_builder" requiredPlan="Host" title="Tournament tools require Host Plan">
      <TournamentPreview />
    </PlanFeatureGate>
  );
}

function TournamentPreview() {
  const [type, setType] = useState("knockout");
  const stages = ["Registration", "Round 1", type === "league_table" ? "Table Review" : "Advancement", "Final", "Host Confirmation", "Admin Review"];
  return (
    <AppShell>
      <PageTitle title="Tournament Manager" subtitle="A tournament is a multi-stage competition with rounds, advancement rules, participant review, voting or judging, finals, and admin-reviewed winner confirmation." />
      <div className="mt-6 flex flex-wrap gap-3">{["knockout", "bracket", "league_table", "audition_to_final", "group_stage_to_final", "custom_rounds"].map((item) => <Button key={item} variant={type === item ? "primary" : "ghost"} onClick={() => setType(item)}>{item.replaceAll("_", " ")}</Button>)}</div>
      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="p-6 sm:p-8">
          <h2 className="text-2xl font-black capitalize">{type.replaceAll("_", " ")} Flow</h2>
          <div className="mt-7 grid gap-4 md:grid-cols-3">{stages.map((stage, index) => <Card key={stage} className="p-4"><p className="text-xs font-black uppercase text-[var(--gold)]">Stage {index + 1}</p><h3 className="mt-2 font-black">{stage}</h3><p className="mt-2 text-sm text-slate-400">{stage === "Admin Review" ? "Winner announcement and revenue/prize foundations require review. No payout is executed." : "Configure rules, participants, submissions, votes, and advancement before moving forward."}</p></Card>)}</div>
        </Card>
        <Card className="p-6">
          <EmptyState icon={<Trophy />} title="No tournament plans yet" body="Create a Host competition and choose Tournament to start planning rounds, participant approvals, advancement rules, and finals." action={<LinkButton href="/challenges/create?mode=tournament">Create Tournament</LinkButton>} />
          <p className="mt-5 rounded-[8px] border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-yellow-100">Bracket execution, automatic advancement, prize release, and payout actions remain inactive foundations.</p>
        </Card>
      </div>
    </AppShell>
  );
}
