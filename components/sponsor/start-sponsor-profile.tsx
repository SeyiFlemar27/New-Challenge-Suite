"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { apiRequest } from "@/lib/api/client";

export function StartSponsorProfile() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function start() {
    setPending(true); setError("");
    try {
      const result = await apiRequest("/api/sponsor/start", { method: "POST" });
      if (!result.ok) { setError(result.message || "Sponsor setup could not be started. Please try again."); return; }
      await refreshProfile();
      router.push("/sponsor/onboarding");
    } catch { setError("Sponsor setup could not be started. Please try again."); }
    finally { setPending(false); }
  }
  return <div><button type="button" onClick={() => void start()} disabled={pending} className="inline-flex min-h-12 items-center gap-2 rounded-[8px] bg-[var(--gold)] px-5 font-black text-black disabled:opacity-60">{pending ? "Starting Sponsor profile…" : "Start Sponsor Profile"}<ArrowRight size={18} /></button>{error ? <p role="alert" className="mt-3 max-w-md text-sm text-red-700">{error}</p> : null}</div>;
}
