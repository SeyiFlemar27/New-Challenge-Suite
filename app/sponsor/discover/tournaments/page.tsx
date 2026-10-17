"use client";
import { useEffect, useState, type FormEvent } from "react";
import { SponsorShell } from "@/components/sponsor/sponsor-shell";
import { Button, Card, inputClass, LinkButton } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
type Opportunity = { id: string; title: string; category?: string; participantCount: number; fundingWindow: { allowed: boolean; reason: string } };
export default function TournamentSponsorDiscovery() {
  const [rows, setRows] = useState<Opportunity[]>([]), [query, setQuery] = useState(""), [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | null>(null), [next, setNext] = useState<string | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    apiRequest<{ challenges: Opportunity[]; pagination: { nextCursor?: string | null } }>(`/api/sponsor/discover/challenges?subjectType=tournament&q=${encodeURIComponent(search)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`).then(result => {
      if (!active) return;
      if (result.ok && result.data) { setRows(result.data.challenges); setNext(result.data.pagination.nextCursor ?? null); setError(""); }
      else { setRows([]); setNext(null); setError(result.message || "Tournament opportunities are unavailable."); }
    }).catch(() => { if (active) setError("Unable to load opportunities. Try again."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [cursor, search]);
  function submit(event: FormEvent) { event.preventDefault(); if (query.trim() === search && cursor === null) return; setLoading(true); setCursor(null); setSearch(query.trim()); }
  return <SponsorShell><div className="mx-auto max-w-5xl space-y-6"><h1 className="text-3xl font-black">Tournament sponsorship opportunities</h1><p>Funding must be provider-confirmed before the first actual match voting start. A reservation never extends that cutoff.</p><form onSubmit={submit} className="flex gap-3"><label className="flex-1"><span className="sr-only">Search Tournament sponsorship opportunities</span><input className={inputClass} value={query} onChange={event => setQuery(event.target.value)} /></label><Button type="submit">Search</Button></form>{error ? <p role="alert">{error}</p> : null}{loading ? <p role="status">Loading opportunities…</p> : rows.length ? rows.map(row => <Card key={row.id} className="space-y-3 p-5"><h2 className="text-xl font-bold">{row.title}</h2><p>{row.category} · {row.participantCount} confirmed entrants</p><p>{row.fundingWindow.allowed ? "Open for sponsorship terms" : row.fundingWindow.reason.replaceAll("_", " ")}</p><LinkButton href={`/sponsor/discover/challenges/${encodeURIComponent(row.id)}?subjectType=tournament`}>Review opportunity and terms</LinkButton></Card>) : !error ? <p>No eligible Tournament opportunities found.</p> : null}<nav aria-label="Tournament opportunity pages" className="flex gap-3"><Button variant="secondary" disabled={!cursor || loading} onClick={() => { setLoading(true); setCursor(null); }}>First page</Button><Button disabled={!next || loading} onClick={() => { setLoading(true); setCursor(next); }}>Next page</Button></nav></div></SponsorShell>;
}
