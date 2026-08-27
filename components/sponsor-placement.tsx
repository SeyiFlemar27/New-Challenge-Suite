"use client";
import { useEffect } from "react";
import { ExternalLink } from "lucide-react";

export type PublicSponsorPlacement = {
  id: string;
  brandName: string;
  brandLogoUrl?: string | null;
  sponsorRole?: string | null;
  placementId: string;
  ctaButtonText?: string | null;
  ctaDestinationLink?: string | null;
};

function sessionId() {
  const key = "challenge-suite:sponsor-analytics-session";
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID() + crypto.randomUUID();
  sessionStorage.setItem(key, created);
  return created;
}
function recordEvent(item: PublicSponsorPlacement, challengeId: string, eventType: "placement_impression" | "cta_click") {
  void fetch("/api/sponsor/analytics/events", { method: "POST", headers: { "content-type": "application/json" }, keepalive: true, body: JSON.stringify({ sponsorshipId: item.id, challengeId, placementId: item.placementId, eventType, sessionId: sessionId() }) });
}
export function SponsorPlacement({ item, challengeId }: { item: PublicSponsorPlacement; challengeId: string }) {
  useEffect(() => { recordEvent(item, challengeId, "placement_impression"); }, [challengeId, item]);
  return <div className="rounded-[8px] border border-[var(--gold)]/25 bg-[var(--gold)]/5 p-5">
    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--gold)]">{item.sponsorRole === "primary" ? "Primary Sponsor" : "Supporting Sponsor"}</p>
    <div className="mt-3 flex min-w-0 items-center gap-3">{item.brandLogoUrl ? <img src={item.brandLogoUrl} alt="" className="h-11 w-11 rounded-[8px] bg-white object-contain" /> : <span className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-[var(--gold)] text-xs font-black text-black">{item.brandName.slice(0, 2).toUpperCase()}</span>}<p className="min-w-0 truncate font-black">{item.brandName}</p></div>
    {item.ctaDestinationLink ? <a href={item.ctaDestinationLink} target="_blank" rel="noopener noreferrer sponsored" onClick={() => recordEvent(item, challengeId, "cta_click")} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] border border-[var(--gold)]/35 px-4 text-sm font-black">{item.ctaButtonText || "Learn More"} <ExternalLink size={15} /></a> : null}
  </div>;
}