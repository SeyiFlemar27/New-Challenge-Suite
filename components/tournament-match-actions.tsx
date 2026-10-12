"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MediaUploadField } from "@/components/media-upload-field";
import { Button, Card, Field } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { tournamentSubmissionMediaPath } from "@/lib/media-upload-paths";

type Row = Record<string, unknown>;

export function TournamentMatchActions({
  tournamentId,
  tournament,
  match,
  round,
  submissions,
  viewerId,
  competitorId,
  canSubmitForRole,
  isHost,
  isManager
}: {
  tournamentId: string;
  tournament: Row;
  match: Row;
  round: Row | null;
  submissions: Row[];
  viewerId: string | null;
  competitorId: string | null;
  canSubmitForRole: boolean;
  isHost: boolean;
  isManager: boolean;
}) {
  const router = useRouter();
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaPath, setMediaPath] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const id = encodeURIComponent(tournamentId);
  const matchId = String(match.id ?? "");
  const assigned = [match.participantAId, match.participantBId].map(String);
  const isCompetitor = Boolean(competitorId && assigned.includes(competitorId));
  const canSubmit = Boolean(viewerId && competitorId && isCompetitor && canSubmitForRole && match.status === "submissions_open");
  const canVote = Boolean(viewerId && !isCompetitor && !isHost && match.status === "voting_open");
  const paidVotesActive = (tournament.voting as Row | undefined)?.paidVotesActive === true;
  const allowedMedia = Array.isArray(round?.acceptedMedia) ? round.acceptedMedia.map(String).filter((type) => type === "image" || type === "video") : ["image", "video"];
  const existingSubmission = submissions.find((submission) => String(submission.participantId ?? "") === competitorId);
  const submissionDeadline = String(match.submissionDeadlineAt ?? "");
  const votingClosesAt = String(match.votingClosesAt ?? "");

  async function submit() {
    if (!mediaUrl || !mediaPath || !round?.id) return;
    setBusy(true);
    setNotice("");
    const result = await apiRequest(`/api/tournaments/${id}/submissions`, {
      method: "POST",
      body: JSON.stringify({ matchId, roundId: round.id, mediaUrl, mediaPath, mediaType, caption })
    });
    setNotice(result.message || (result.ok ? "Submission saved." : "Submission could not be saved."));
    setBusy(false);
    if (result.ok) router.refresh();
  }

  async function vote(submission: Row, voteType: "free" | "dorocoin") {
    if (voteType === "dorocoin" && !window.confirm("Spend 5 DoroCoins on this Tournament vote?")) return;
    setBusy(true);
    setNotice("");
    const result = await apiRequest(`/api/tournaments/${id}/votes`, {
      method: "POST",
      body: JSON.stringify({
        matchId,
        submissionId: submission.id,
        selectedParticipantId: submission.participantId,
        voteType,
        ...(voteType === "dorocoin" ? { idempotencyKey: crypto.randomUUID() } : {})
      })
    });
    setNotice(result.message || (result.ok ? "Vote recorded." : "Vote could not be recorded."));
    setBusy(false);
    if (result.ok) router.refresh();
  }

  async function confirmResult() {
    if (!window.confirm("Confirm this result from the server-verified Tournament vote records and advance the bracket?")) return;
    setBusy(true);
    setNotice("");
    const result = await apiRequest(`/api/tournaments/${id}/results`, {
      method: "POST",
      body: JSON.stringify({ matchId })
    });
    setNotice(result.message || (result.ok ? "Verified result confirmed." : "Result needs review."));
    setBusy(false);
    if (result.ok) router.refresh();
  }

  // The button may be rendered while voting is still open so a manager can
  // request verification; the server remains the sole deadline authority.
  const canConfirm = isManager && match.resultMethod === "votes" && ["voting_open", "voting_closed"].includes(String(match.status));

  return <div className="mt-5 grid gap-5">
    {notice ? <p className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-sm" role="status">{notice}</p> : null}
    {canSubmit ? <Card className="p-5" aria-labelledby="match-submit-heading">
      <h2 id="match-submit-heading" className="text-lg font-black">Your fresh match submission</h2>
      <p className="mt-1 text-sm text-slate-500">{submissionDeadline ? `Server deadline: ${new Date(submissionDeadline).toLocaleString()}.` : "The server validates the match submission window."} Every round requires fresh content.</p>
      {existingSubmission ? <p className="mt-3 text-sm" role="status">Current submission: {String(existingSubmission.status ?? "submitted").replaceAll("_", " ")}. Replacements are accepted only when Tournament rules and the server allow them.</p> : null}
      {allowedMedia.length > 1 ? <Field label="Media type"><select className="mt-2 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3" value={mediaType} onChange={(event) => setMediaType(event.target.value as "image" | "video")}><option value="image">Image</option><option value="video">Video</option></select></Field> : null}
      {allowedMedia.includes(mediaType) ? <MediaUploadField label={mediaType === "image" ? "Match image" : "Match video"} value={mediaUrl} storagePath={tournamentSubmissionMediaPath(tournamentId, String(round?.id ?? ""), matchId, competitorId ?? "", mediaType === "image" ? "images" : "videos")} kind={mediaType} onChange={(url, metadata) => { setMediaUrl(url); setMediaPath(metadata?.path ?? ""); }} helperText="Uploads are tied to this Tournament, round, match, and competitor. The server verifies ownership and media before accepting the submission." /> : <p className="text-sm text-amber-700">This round does not accept {mediaType} submissions.</p>}
      <label className="grid gap-2 text-sm font-semibold">Caption (optional)<textarea className="min-h-20 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3" value={caption} maxLength={400} onChange={(event) => setCaption(event.target.value)} /></label>
      <Button disabled={busy || !mediaUrl || !mediaPath || !allowedMedia.includes(mediaType)} onClick={() => void submit()}>{busy ? "Saving…" : existingSubmission ? "Submit replacement" : "Submit match entry"}</Button>
    </Card> : null}
    {canVote ? <Card className="p-5" aria-labelledby="match-vote-heading">
      <h2 id="match-vote-heading" className="text-lg font-black">Vote in this match</h2>
      <p className="mt-1 text-sm text-slate-500">One free vote per match per local day. Competitors and the Tournament host cannot vote in this match. Live totals stay hidden.</p>
      <div className="mt-4 flex flex-wrap gap-2">{submissions.filter((submission) => ["submitted", "approved", "active"].includes(String(submission.status))).map((submission) => <div key={String(submission.id)} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--line)] p-3"><span className="text-sm">Entry {String(submission.participantId ?? "")}</span><Button disabled={busy} onClick={() => void vote(submission, "free")}>Free vote</Button>{paidVotesActive ? <Button variant="secondary" disabled={busy} onClick={() => void vote(submission, "dorocoin")}>Vote · 5 DoroCoins</Button> : null}</div>)}</div>
      {votingClosesAt ? <p className="mt-3 text-xs text-slate-500">Voting closes {new Date(votingClosesAt).toLocaleString()}.</p> : null}
    </Card> : null}
    {canConfirm ? <Card className="p-5"><h2 className="text-lg font-black">Result review</h2><p className="mt-1 text-sm text-slate-500">The server verifies the voting deadline, full vote event sequence, and bracket dependency before confirming and advancing. Requests before the deadline remain blocked.</p><Button className="mt-4" disabled={busy} onClick={() => void confirmResult()}>{busy ? "Verifying…" : "Request result verification"}</Button></Card> : null}
    {viewerId && isCompetitor && !canSubmit ? <p className="text-sm text-slate-500">Participant actions are unavailable for your role or in this match phase. Match deadlines and eligibility are enforced by the server.</p> : null}
  </div>;
}
