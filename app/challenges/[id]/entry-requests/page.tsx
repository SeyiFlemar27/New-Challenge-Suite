"use client";

import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, UserRound, XCircle } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type EntryRequest = {
  id: string;
  status?: string;
  userId?: string;
  paidEntryRequired?: boolean;
  paymentWindowStatus?: string;
  paymentDeadline?: string | null;
  createdAt?: string;
  rejectionReason?: string | null;
  participantProfile?: {
    displayName?: string;
    username?: string | null;
    avatarUrl?: string | null;
    profileUrl?: string;
    followerCount?: number | null;
    verificationStatus?: string | null;
    location?: string | null;
  };
};

type EntryRequestPayload = { challenge: { id: string; title?: string }; requests: EntryRequest[] };

export default function EntryRequestsPage() {
  const params = useParams<{ id: string }>();
  const challengeId = params.id;
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["entry-requests", challengeId], queryFn: () => apiRequest<EntryRequestPayload>(`/api/challenges/${challengeId}/entry-request`), enabled: Boolean(challengeId), staleTime: 20_000 });
  const payload = data?.ok ? data.data : null;
  const requests = payload?.requests ?? [];

  async function decide(requestId: string, action: "approve" | "reject") {
    const note = action === "reject" ? window.prompt("Reason for rejection") ?? "" : "";
    await apiRequest(`/api/challenges/${challengeId}/entry-request/${requestId}/${action}`, { method: "POST", body: JSON.stringify({ note }) });
    await queryClient.invalidateQueries({ queryKey: ["entry-requests", challengeId] });
  }

  return <AppShell>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <PageTitle title="Entry Requests" subtitle={payload?.challenge.title ? `Review requests for ${payload.challenge.title}.` : "Review participant access requests."} icon={<UserRound />} />
      <LinkButton href="/challenges" variant="secondary">Back to Challenges</LinkButton>
    </div>

    {isLoading ? <div className="mt-8 grid gap-5 md:grid-cols-2">{[0, 1].map((item) => <Card key={item} className="h-48 animate-pulse bg-[#171717]" />)}</div> : null}
    {!isLoading && (!data?.ok || !payload) ? <Card className="mt-8 border-red-500/20 bg-red-950/30 p-5 text-red-200">{data?.message || "Entry requests could not be loaded."}</Card> : null}
    {payload && !requests.length ? <Card className="mt-8"><EmptyState icon={<Clock3 />} title="No entry requests" body="Pending participant requests will appear here." /></Card> : null}
    {requests.length ? <div className="mt-8 grid gap-5 xl:grid-cols-2">
      {requests.map((request) => <Card key={request.id} className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-[var(--gold)]/15 text-lg font-black text-[var(--gold)]">
              {request.participantProfile?.avatarUrl ? <img src={request.participantProfile.avatarUrl} alt="" className="h-full w-full object-cover" /> : (request.participantProfile?.displayName ?? "P").slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-black">{request.participantProfile?.displayName ?? "Participant"}</h2>
              <p className="mt-1 text-sm text-slate-400">{request.participantProfile?.username ? `@${request.participantProfile.username}` : "Profile details limited"}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-300">
                {request.participantProfile?.location ? <span className="rounded-full bg-white/10 px-3 py-1">{request.participantProfile.location}</span> : null}
                {request.participantProfile?.verificationStatus ? <span className="rounded-full bg-white/10 px-3 py-1">{request.participantProfile.verificationStatus}</span> : null}
                {typeof request.participantProfile?.followerCount === "number" ? <span className="rounded-full bg-white/10 px-3 py-1">{request.participantProfile.followerCount.toLocaleString()} followers</span> : null}
              </div>
            </div>
          </div>
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black uppercase text-slate-300">{String(request.status ?? "pending").replaceAll("_", " ")}</span>
        </div>
        <div className="mt-5 grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
          <Info label="Payment" value={request.paidEntryRequired ? String(request.paymentWindowStatus ?? "not started").replaceAll("_", " ") : "Not required"} />
          <Info label="Window" value={request.paymentDeadline ? new Date(request.paymentDeadline).toLocaleDateString() : "Not open"} />
          <Info label="Requested" value={request.createdAt ? new Date(request.createdAt).toLocaleDateString() : "Pending"} />
        </div>
        {request.rejectionReason ? <p className="mt-4 rounded-[8px] bg-red-950/30 p-3 text-sm text-red-100">{request.rejectionReason}</p> : null}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          {request.participantProfile?.profileUrl ? <LinkButton href={request.participantProfile.profileUrl} variant="secondary" className="w-full sm:w-auto">View Profile</LinkButton> : null}
          <Button className="w-full sm:w-auto" onClick={() => void decide(request.id, "approve")} disabled={request.status === "approved"}><CheckCircle2 size={16} /> Approve</Button>
          <Button className="w-full sm:w-auto" variant="secondary" onClick={() => void decide(request.id, "reject")} disabled={request.status === "rejected"}><XCircle size={16} /> Reject</Button>
        </div>
      </Card>)}
    </div> : null}
  </AppShell>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[8px] bg-black/30 p-3"><p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</p><p className="mt-1 font-bold">{value}</p></div>;
}