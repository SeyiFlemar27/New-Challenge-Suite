"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type ReviewItem = { id: string; title?: string; brandName?: string; status?: string; prizeType?: string; isLiveEvent?: boolean; platformFeePercent?: number };
type Queue = { sponsors: ReviewItem[]; challenges: ReviewItem[]; sponsorships: ReviewItem[] };

export default function AdminReviewPage() {
  const [queue, setQueue] = useState<Queue>({ sponsors: [], challenges: [], sponsorships: [] });
  const [notice, setNotice] = useState("");

  async function load() {
    const result = await apiRequest<Queue>("/api/admin/reviews");
    setNotice(result.ok ? "" : result.message);
    if (result.ok && result.data) setQueue(result.data);
  }

  useEffect(() => { void load(); }, []);

  async function decide(type: "sponsor" | "challenge" | "sponsorship", id: string, action: "approve" | "reject") {
    const result = await apiRequest("/api/admin/reviews", { method: "PATCH", body: JSON.stringify({ type, id, action }) });
    setNotice(result.message);
    if (result.ok) await load();
  }

  return (
    <AppShell>
      <PageTitle title="Platform Review Queue" subtitle="Restricted review controls for sponsors, challenge/prize/event metadata, and mutually agreed sponsorship terms. Payout execution is not available." />
      {notice ? <Card className="mt-6 p-4 text-slate-300">{notice}</Card> : null}
      {(["sponsors", "challenges", "sponsorships"] as const).map((group) => <section key={group} className="mt-8"><h2 className="text-2xl font-black capitalize">{group}</h2><div className="mt-4 grid gap-4 md:grid-cols-2">{queue[group].length ? queue[group].map((item) => <Card key={item.id} className="p-5"><p className="font-black">{item.title || item.brandName || item.id}</p><p className="mt-2 text-sm text-slate-300">Status: {item.status || "pending review"}{item.prizeType ? ` · Prize: ${item.prizeType}` : ""}{item.isLiveEvent ? " · Live event sync requested" : ""}</p>{group === "challenges" ? <p className="mt-2 text-xs text-slate-400">Internal platform allocation: {item.platformFeePercent ?? 15}% (admin-only). No payout or release action exists here.</p> : null}<div className="mt-4 flex gap-3"><Button onClick={() => void decide(group === "sponsors" ? "sponsor" : group === "challenges" ? "challenge" : "sponsorship", item.id, "approve")}>Approve</Button><Button variant="secondary" onClick={() => void decide(group === "sponsors" ? "sponsor" : group === "challenges" ? "challenge" : "sponsorship", item.id, "reject")}>Reject</Button></div></Card>) : <Card className="p-5 text-slate-400">No pending {group}.</Card>}</div></section>)}
    </AppShell>
  );
}
