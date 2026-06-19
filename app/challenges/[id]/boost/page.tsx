"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Rocket } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { Button, Card, LinkButton, PageTitle } from "@/components/ui";
import { boostChallenge, fetchBoostPackages, fetchChallengeDetails } from "@/lib/api/services";
import { normalizeChallenge, type ChallengeApiRecord } from "@/lib/api/normalizers";
import { useCurrentUser } from "@/lib/hooks/use-current-user";

type BoostPackage = {
  id: string;
  name?: string;
  coins?: number;
  reach?: string;
  duration?: string;
  durationDays?: number;
};

export default function BoostChallengePage() {
  const params = useParams<{ id: string }>();
  const challengeId = params.id;
  const auth = useAuth();
  const currentUser = useCurrentUser();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState("");
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");

  const detailsQuery = useQuery({
    queryKey: ["challenge-details", challengeId, auth.user?.uid ?? "signed-out"],
    queryFn: () => fetchChallengeDetails(challengeId),
    enabled: Boolean(challengeId) && !auth.loading,
    staleTime: 30_000
  });
  const packagesQuery = useQuery({
    queryKey: ["boost-packages"],
    queryFn: fetchBoostPackages,
    staleTime: 60_000
  });

  const details = detailsQuery.data?.ok ? detailsQuery.data.data : null;
  const rawChallenge = details?.challenge as (ChallengeApiRecord & Record<string, unknown>) | undefined;
  const challenge = useMemo(() => rawChallenge ? normalizeChallenge(rawChallenge) : null, [rawChallenge]);
  const boostPackages = useMemo(() => {
    const records = packagesQuery.data?.ok ? packagesQuery.data.data?.packages ?? [] : [];
    return records.map((item) => item as BoostPackage).filter((item) => item.id && Number(item.coins ?? 0) > 0);
  }, [packagesQuery.data]);
  const selectedId = selected || boostPackages[0]?.id || "";
  const boost = boostPackages.find((item) => item.id === selectedId) ?? boostPackages[0];
  const walletBalance = currentUser.user?.doroBalance ?? 0;
  const boostCost = Number(boost?.coins ?? 0);
  const eligibleStatuses = ["published", "registration_open", "active", "voting"];
  const eligible = Boolean(rawChallenge && eligibleStatuses.includes(String(rawChallenge.status ?? "")));

  const mutation = useMutation({
    mutationFn: async () => {
      if (!boost) throw new Error("Select a boost package.");
      const result = await boostChallenge(challengeId, boost.id);
      if (!result.ok) throw new Error(result.message);
      return result.data?.boost as { endsAt?: string; viewsGained?: number } | undefined;
    },
    onSuccess: async () => {
      setActive(true);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["challenge-details", challengeId] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      ]);
    },
    onError: (caught) => setError(caught instanceof Error ? caught.message : "Boost could not be activated.")
  });

  function confirmBoost() {
    setError("");
    if (!auth.user) {
      setError("Sign in before boosting this challenge.");
      return;
    }
    if (!eligible) {
      setError("This challenge is not eligible for boosting.");
      return;
    }
    if (!boost) {
      setError("Select a boost package.");
      return;
    }
    if (boostCost > walletBalance) {
      setError("Insufficient DoroCoin balance.");
      return;
    }
    mutation.mutate();
  }

  if (auth.loading || detailsQuery.isLoading || packagesQuery.isLoading || currentUser.loading) {
    return (
      <AppShell>
        <div className="max-w-5xl">
          <Card className="h-12 max-w-lg animate-pulse bg-[#171717]" />
          <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_340px]">
            <Card className="h-72 animate-pulse bg-[#171717]" />
            <Card className="h-72 animate-pulse bg-[#171717]" />
          </div>
        </div>
      </AppShell>
    );
  }

  if (detailsQuery.data && !detailsQuery.data.ok) {
    return (
      <AppShell>
        <Card className="max-w-3xl p-8">
          <PageTitle title="Boost Challenge" subtitle="Challenge unavailable" icon={<Rocket className="text-[var(--gold)]" />} />
          <p className="mt-6 rounded-[8px] bg-red-950/50 p-3 text-red-200">{detailsQuery.data.message}</p>
          <LinkButton href="/challenges" className="mt-8">Back to Challenges</LinkButton>
        </Card>
      </AppShell>
    );
  }

  if (!challenge) {
    return (
      <AppShell>
        <Card className="max-w-3xl p-8">
          <PageTitle title="Boost Challenge" subtitle="Challenge not found" icon={<Rocket className="text-[var(--gold)]" />} />
          <LinkButton href="/challenges" className="mt-8">Back to Challenges</LinkButton>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-5xl">
        <PageTitle title="Boost Challenge" subtitle={challenge.title} icon={<Rocket className="text-[var(--gold)]" />} />
        {active ? (
          <Card className="mt-8 border-emerald-500/30 bg-emerald-950/20 p-8">
            <CheckCircle2 className="h-14 w-14 text-emerald-300" />
            <h2 className="mt-5 text-3xl font-black">Boosting Active</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <Metric label="Status" value="Boost active" />
              <Metric label="Ends in" value={boost?.duration ?? `${boost?.durationDays ?? 0} days`} />
              <Metric label="Views gained" value="+0" />
            </div>
            <LinkButton href={`/challenges/${challenge.id}`} className="mt-8">Back to Challenge</LinkButton>
          </Card>
        ) : (
          <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_340px]">
            <Card className="p-7">
              <h2 className="text-2xl font-black">Choose Boost Package</h2>
              {packagesQuery.data && !packagesQuery.data.ok ? <p className="mt-5 rounded-[8px] bg-red-950/50 p-3 text-red-200">{packagesQuery.data.message}</p> : null}
              {!boostPackages.length ? <p className="mt-5 rounded-[8px] bg-[#151515] p-4 text-slate-300">No boost packages are currently available.</p> : null}
              <div className="mt-6 grid gap-5 md:grid-cols-3">
                {boostPackages.map((pack) => (
                  <button key={pack.id} onClick={() => setSelected(pack.id)} className={`rounded-[8px] border p-5 text-left ${selectedId === pack.id ? "border-yellow-400 bg-yellow-500/10" : "border-white/10 bg-[#151515]"}`}>
                    <h3 className="text-xl font-black">{pack.name}</h3>
                    <p className="mt-3 text-slate-300">{pack.reach}</p>
                    <p className="mt-2 text-slate-300">{pack.duration ?? `${pack.durationDays ?? 0} days`}</p>
                    <p className="mt-4 text-2xl font-black text-[var(--gold)]">{pack.coins} DoroCoins</p>
                  </button>
                ))}
              </div>
            </Card>
            <Card className="p-7">
              <h2 className="text-2xl font-black">Confirm Boost</h2>
              <p className="mt-4 text-slate-300">Current visibility: {String(rawChallenge?.status ?? challenge.status)}</p>
              <p className="mt-2 text-slate-300">Wallet balance: {walletBalance} DoroCoins</p>
              {!auth.user ? <p className="mt-4 rounded-[8px] bg-red-950/50 p-3 text-red-200">Sign in before boosting this challenge.</p> : null}
              {!eligible ? <p className="mt-4 rounded-[8px] bg-red-950/50 p-3 text-red-200">This challenge is not eligible for boosting.</p> : null}
              <div className="mt-6 rounded-[8px] bg-black/40 p-4">
                <b>{boost?.name ?? "Select a boost package"}</b>
                <p className="mt-2 text-sm text-slate-300">{boost ? `${boost.reach ?? ""} for ${boost.duration ?? `${boost.durationDays ?? 0} days`}` : "Choose an active package to continue."}</p>
              </div>
              {error ? <p className="mt-4 rounded-[8px] bg-red-950/50 p-3 text-red-200">{error}</p> : null}
              <Button className="mt-6 w-full" onClick={confirmBoost} disabled={!auth.user || !eligible || !boost || mutation.isPending}>{mutation.isPending ? "Activating Boost" : "Confirm Boost"}</Button>
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[8px] bg-black/30 p-4"><div className="text-sm font-bold text-slate-400">{label}</div><div className="mt-1 text-2xl font-black">{value}</div></div>;
}
