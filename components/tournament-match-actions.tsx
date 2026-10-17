"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { MediaUploadField } from "@/components/media-upload-field";
import { Button, Card, Field } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { tournamentSubmissionMediaPath } from "@/lib/media-upload-paths";
import { TOURNAMENT_PRODUCT_POLICY } from "@/lib/tournament-builder-policy";

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
  const configuredMedia = Array.isArray(tournament.submissionMediaTypes) ? tournament.submissionMediaTypes : round?.acceptedMedia;
  const [mediaType, setMediaType] = useState<"image" | "video">(Array.isArray(configuredMedia) && configuredMedia.length === 1 && configuredMedia[0] === "video" ? "video" : "image");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaPath, setMediaPath] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [needsCoins, setNeedsCoins] = useState(false);
  const paidAttempts = useRef<Record<string, string>>({});
  const automaticVoting = tournament.productPolicyVersion === TOURNAMENT_PRODUCT_POLICY;
  const id = encodeURIComponent(tournamentId);
  const matchId = String(match.id ?? "");
  const assigned = [match.participantAId, match.participantBId].map(String);
  const isCompetitor = Boolean(competitorId && assigned.includes(competitorId));
  const canSubmit = Boolean(viewerId && competitorId && isCompetitor && canSubmitForRole && match.status === "submissions_open");
  const canVote = Boolean(viewerId && !isCompetitor && !isHost && match.status === "voting_open");
  const paidVotesActive = (tournament.voting as Row | undefined)?.paidVotesActive === true;
  const allowedMedia = Array.isArray(configuredMedia) ? configuredMedia.map(String).filter((type) => type === "image" || type === "video") : ["image", "video"];
  const existingSubmission = submissions.find((submission) => String(submission.participantId ?? "") === competitorId);
  const submissionDeadline = String(match.submissionDeadlineAt ?? "");
  const votingClosesAt = String(match.votingClosesAt ?? "");

  async function submit() {
    if (busy || !mediaUrl || !mediaPath || !round?.id) return;
    setBusy(true);
    setNotice("");
    try {
    const result = await apiRequest(`/api/tournaments/${id}/submissions`, {
      method: "POST",
      body: JSON.stringify({ matchId, roundId: round.id, mediaUrl, mediaPath, mediaType, caption, expectedRevision: Number(existingSubmission?.revision ?? 0) })
    });
    setNotice(result.message || (result.ok ? "Submission saved." : "Submission could not be saved."));
    if (result.ok) router.refresh();
    } catch {
      setNotice("The submission save could not be confirmed. Your selected media remains here. Refresh its current status before retrying to avoid overwriting a newer revision.");
    } finally {
      setBusy(false);
    }
  }

  async function vote(submission: Row, voteType: "free" | "dorocoin") {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      let balance: number | null = null;
      if (automaticVoting) {
        const state = await apiRequest<{ canVote: boolean; freeVote: { used: boolean }; balance: number }>(`/api/tournaments/${id}/votes?matchId=${encodeURIComponent(matchId)}`);
        if (!state.ok || !state.data?.canVote) { setNotice(state.message || "Current voting eligibility is unavailable."); return; }
        voteType = state.data.freeVote.used ? "dorocoin" : "free";
        balance = state.data.balance;
        if (voteType === "dorocoin" && balance < 5) { setNeedsCoins(true); setNotice("You need 5 DoroCoins for an additional vote."); return; }
      }
      if (voteType === "dorocoin" && !window.confirm(`Spend 5 DoroCoins on this Tournament vote?${balance === null ? "" : ` Current balance: ${balance} DoroCoins.`}`)) return;
      const key = String(submission.id);
      const result = await apiRequest(`/api/tournaments/${id}/votes`, {
        method: "POST", body: JSON.stringify({ matchId, submissionId: submission.id, selectedParticipantId: submission.participantId, voteType, confirmedDoroCoinSpend: voteType === "dorocoin", ...(voteType === "dorocoin" ? { idempotencyKey: paidAttempts.current[key] ??= crypto.randomUUID() } : {}) })
      });
      if (result.ok || result.status && result.status >= 400 && result.status < 500) delete paidAttempts.current[key];
      if (result.code === "INSUFFICIENT_DOROCOINS") setNeedsCoins(true);
      setNotice(result.message || (result.ok ? "Vote recorded." : "Vote could not be recorded."));
      if (result.ok) router.refresh();
    } catch { setNotice("The vote outcome could not be confirmed. Retry safely with the same payment request."); }
    finally { setBusy(false); }
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
  const canConfirm = Number(tournament.configVersion ?? 1) < 3 && isManager && match.resultMethod === "votes" && ["voting_open", "voting_closed"].includes(String(match.status));

  return <div className="mt-5 grid gap-5">
    {Number(tournament.configVersion ?? 1) >= 3 && match.status === "voting_closed" ? <p role="status" className="text-sm text-slate-500">Voting has closed. Results are being verified before the bracket advances. Any integrity or financial hold requires review.</p> : null}
    {notice ? <p className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-sm" role="status">{notice}</p> : null}
    {canSubmit ? <Card className="p-5" aria-labelledby="match-submit-heading">
      <h2 id="match-submit-heading" className="text-lg font-black">Your fresh match submission</h2>
      {Array.isArray(tournament.submissionInstructions) && tournament.submissionInstructions.length ? <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">{tournament.submissionInstructions.map((instruction, index) => <li key={index} className="whitespace-pre-wrap">{String(instruction)}</li>)}</ol> : null}
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
      <div className="mt-4 flex flex-wrap gap-2">{submissions.filter((submission) => ["submitted", "approved", "active"].includes(String(submission.status))).map((submission) => <div key={String(submission.id)} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--line)] p-3"><span className="text-sm">Entry {String(submission.participantId ?? "")}</span><Button disabled={busy} onClick={() => void vote(submission, "free")}>{automaticVoting ? "Vote" : "Free vote"}</Button>{paidVotesActive && !automaticVoting ? <Button variant="secondary" disabled={busy} onClick={() => void vote(submission, "dorocoin")}>Vote · 5 DoroCoins</Button> : null}</div>)}</div>
      {needsCoins ? <a className="mt-3 inline-block font-bold underline" href={`/dorocoins?tab=buy&returnTo=${encodeURIComponent(`/tournaments/${tournamentId}/matches/${matchId}`)}`}>Buy DoroCoins and return to this match</a> : null}
      {votingClosesAt ? <p className="mt-3 text-xs text-slate-500">Voting closes {new Date(votingClosesAt).toLocaleString()}.</p> : null}
    </Card> : null}
    {canConfirm ? <Card className="p-5"><h2 className="text-lg font-black">Result review</h2><p className="mt-1 text-sm text-slate-500">The server verifies the voting deadline, full vote event sequence, and bracket dependency before confirming and advancing. Requests before the deadline remain blocked.</p><Button className="mt-4" disabled={busy} onClick={() => void confirmResult()}>{busy ? "Verifying…" : "Request result verification"}</Button></Card> : null}
    {viewerId && isCompetitor && !canSubmit ? <p className="text-sm text-slate-500">Participant actions are unavailable for your role or in this match phase. Match deadlines and eligibility are enforced by the server.</p> : null}
  </div>;
}
