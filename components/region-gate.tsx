"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, Card } from "./ui";
import { allowedRegions } from "@/lib/legal";
import type { RegionCode } from "@/lib/types";

export function RegionGate({ children }: { children: React.ReactNode }) {
  const [region, setRegion] = useState<string | null>(null);
  const [ipRegion, setIpRegion] = useState<string>("Unknown");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const cookieRegion = document.cookie
      .split("; ")
      .find((row) => row.startsWith("challenge-suite-region="))
      ?.split("=")[1];
    const queryRegion = searchParams.get("region");
    const stored = queryRegion || cookieRegion || localStorage.getItem("challenge-suite-region");
    if (stored) setRegion(stored);
    fetch("/api/compliance/region")
      .then((response) => response.json())
      .then((data) => setIpRegion(data.country ?? "Unknown"))
      .catch(() => setIpRegion("Unknown"));
  }, [searchParams]);

  function chooseRegion(nextRegion: RegionCode) {
    localStorage.setItem("challenge-suite-region", nextRegion);
    document.cookie = `challenge-suite-region=${nextRegion}; path=/; max-age=31536000; samesite=lax`;
    setRegion(nextRegion);
    const params = new URLSearchParams(searchParams.toString());
    params.set("region", nextRegion);
    router.replace(`${pathname}?${params.toString()}`);
  }

  if (region && allowedRegions.includes(region as RegionCode)) return <>{children}</>;

  if (region && !allowedRegions.includes(region as RegionCode)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6">
        <Card className="max-w-xl p-8 text-center">
          <h1 className="text-3xl font-black text-[var(--gold)]">Challenge Suite is not available in your region</h1>
          <p className="mt-4 text-slate-300">Access is currently limited to the United States and Nigeria. Your declared region is {region}.</p>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6">
      <Card className="w-full max-w-xl p-8 text-center">
        <h1 className="text-3xl font-black text-[var(--gold)]">Choose Your Region</h1>
        <p className="mt-3 text-slate-300">Challenge Suite is currently available only in the United States and Nigeria.</p>
        <p className="mt-2 text-sm text-slate-500">IP-based region signal: {ipRegion}</p>
        <div className="mt-8 grid grid-cols-2 gap-4">
          <Button onClick={() => chooseRegion("US")}>United States</Button>
          <Button onClick={() => chooseRegion("NG")}>Nigeria</Button>
        </div>
      </Card>
    </main>
  );
}
