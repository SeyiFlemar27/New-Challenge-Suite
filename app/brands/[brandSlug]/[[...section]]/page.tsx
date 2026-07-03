"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { BadgeCheck, Building2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, EmptyState, LinkButton } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type BrandData = { brand: Record<string, any>; sponsored: Array<Record<string, any>>; campaigns: Array<Record<string, any>>; prizePools: Array<Record<string, any>> };

export default function BrandProfilePage() {
  const params = useParams<{ brandSlug: string; section?: string[] }>();
  const section = params.section?.[0] ?? "sponsored";
  const [data, setData] = useState<BrandData | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    void apiRequest<BrandData>(`/api/brands/${params.brandSlug}`).then((result) => {
      if (result.ok && result.data) setData(result.data);
      else setNotice(result.message);
    });
  }, [params.brandSlug]);
  if (!data) return <AppShell><EmptyState icon={<Building2 />} title="Brand profile unavailable" body={notice || "Loading verified brand profile..."} /></AppShell>;
  const items = section === "campaigns" ? data.campaigns : section === "prize-pools" ? data.prizePools : data.sponsored;
  return (
    <AppShell>
      <div className="mx-auto max-w-6xl">
        <Card className="overflow-hidden">
          <div className="h-40 bg-[var(--gold)]/10 bg-cover bg-center" style={data.brand.bannerUrl ? { backgroundImage: `url(${data.brand.bannerUrl})` } : undefined} />
          <div className="p-6 sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-end gap-4">
                <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-[8px] border-4 border-black bg-[var(--gold)] text-black">
                  {data.brand.logoUrl ? <img src={data.brand.logoUrl} alt={data.brand.brandName} className="h-full w-full object-cover" /> : <Building2 />}
                </div>
                <div>
                  <h1 className="flex items-center gap-2 text-3xl font-black">{data.brand.brandName}<BadgeCheck className="text-[var(--gold)]" /></h1>
                  <p className="mt-1 text-slate-400">{data.brand.industry}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => void apiRequest(`/api/public/profiles/${data.brand.userId}/follow`, { method: "POST" }).then((result) => setNotice(result.message))}>Follow Brand</Button>
                {data.brand.ctaDestinationLink ? <a className="inline-flex min-h-11 items-center rounded-[8px] border border-[var(--gold)] px-5 font-bold text-[var(--gold)]" href={data.brand.ctaDestinationLink} target="_blank" rel="noreferrer">{data.brand.ctaButtonText}</a> : null}
              </div>
            </div>
            <p className="mt-6 max-w-3xl text-slate-300">{data.brand.brandDescription}</p>
          </div>
        </Card>
        <nav className="mt-6 flex flex-wrap gap-3">
          {["sponsored", "campaigns", "prize-pools"].map((tab) => <LinkButton key={tab} href={`/brands/${params.brandSlug}/${tab}`} variant={section === tab ? "primary" : "secondary"} className="capitalize">{tab.replace("-", " ")}</LinkButton>)}
        </nav>
        {notice ? <p className="mt-4 text-sm text-slate-300">{notice}</p> : null}
        <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {items.length ? items.map((item) => (
            <Card key={item.id || item.challengeId} className="p-5">
              <h2 className="text-xl font-black">{item.title || item.name || `Prize pool ${item.challengeId}`}</h2>
              <p className="mt-2 text-sm capitalize text-slate-400">Status: {String(item.status || "recorded").replaceAll("_", " ")}</p>
              {item.visibleJackpotCents !== undefined ? <p className="mt-3 font-black text-[var(--gold)]">{`$${(Number(item.visibleJackpotCents) / 100).toLocaleString()}`}</p> : null}
              {item.id && item.title ? <LinkButton href={`/challenges/${item.id}`} variant="ghost" className="mt-4 w-full">View Challenge</LinkButton> : null}
            </Card>
          )) : <Card className="p-8 text-slate-400">No public {section.replace("-", " ")} yet.</Card>}
        </div>
      </div>
    </AppShell>
  );
}
