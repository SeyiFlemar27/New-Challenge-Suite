"use client";

import { AppShell } from "@/components/app-shell";
import { Button, Card, PageTitle } from "@/components/ui";
import { useState } from "react";

export default function TournamentsPage() {
  const [format, setFormat] = useState<2 | 4 | 6>(2);
  return (
    <AppShell>
      <div className="text-center"><PageTitle title="Tournament Brackets" subtitle="Manage and view live interactive tournament brackets" /></div>
      <div className="mt-6 flex justify-center gap-5"><span className="pt-3 font-bold">Format:</span>{[2, 4, 6].map((item) => <Button key={item} variant={format === item ? "primary" : "ghost"} onClick={() => setFormat(item as 2 | 4 | 6)}>{item} Divisions</Button>)}</div>
      <Card className="bracket-scroll mx-auto mt-12 max-h-[650px] max-w-[1160px] overflow-auto bg-[#0b1019] p-9">
        <h2 className="text-center text-2xl font-black text-[var(--gold-2)]">{format} Divisions {format === 2 ? "(East/West)" : format === 4 ? "(North/South/East/West)" : "(Regional Pools)"}</h2>
        <div className={`mt-10 grid gap-10 ${format === 2 ? "grid-cols-3" : format === 4 ? "grid-cols-4" : "grid-cols-6"}`}>
          {Array.from({ length: format }).map((_, division) => <BracketColumn key={division} title={format === 2 ? ["Quarterfinals", "Semifinals"][division] ?? "Final" : `Division ${division + 1}`} matches={format + division} />)}
          <BracketColumn title="Final" matches={1} />
        </div>
      </Card>
      <p className="mt-12 text-center text-lg text-slate-500">Interactive Bracket Management (Admin/Verified Hosts only)<br />Max 50 participants allowed per tournament.</p>
    </AppShell>
  );
}

function BracketColumn({ title, matches }: { title: string; matches: number }) {
  return <div><h3 className="mb-6 text-center text-xl font-black">{title}</h3>{Array.from({ length: matches }).map((_, i) => <div key={i} className="mb-9 overflow-hidden rounded-[7px] border border-white/10"><div className="flex justify-between bg-yellow-500/10 p-4 font-bold"><span>User {String.fromCharCode(65 + i * 2)}</span><span>{i === 0 ? 3 : 0}</span></div><div className="flex justify-between bg-[#111827] p-4"><span>User {String.fromCharCode(66 + i * 2)}</span><span>{i === 0 ? 1 : 0}</span></div></div>)}</div>;
}
