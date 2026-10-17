import { getAdminDb, getAdminStorage } from "@/lib/firebase/admin";
import { getOptionalRequestUser } from "@/lib/server/auth";
import { canEditTournament } from "@/lib/server/tournament-permissions";
import { isPublishedTournament } from "@/lib/server/tournament-public-policy";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string; submissionId: string }> }) {
  const db = getAdminDb(), storage = getAdminStorage();
  if (!db || !storage) return new Response(null, { status: 503 });
  const { id, submissionId } = await context.params;
  const [tournamentSnap, submissionSnap, viewer] = await Promise.all([
    db.collection("tournaments").doc(id).get(), db.collection("tournamentSubmissions").doc(submissionId).get(), getOptionalRequestUser(request)
  ]);
  const tournament = tournamentSnap.data(), submission = submissionSnap.data();
  if (!tournament || !submission || submission.tournamentId !== id) return new Response(null, { status: 404 });
  const publicMedia = isPublishedTournament(tournament) && tournament.privacy === "public" && ["approved", "active", "eliminated", "winner"].includes(String(submission.status));
  let canView = publicMedia || Boolean(viewer && (submission.userId === viewer.uid || canEditTournament({ ...viewer }, { ...tournament, id }).allowed));
  if (!canView && viewer && submission.teamId) {
    const membership = await db.collection("tournamentTeamMemberships").doc(`${id}_${viewer.uid}`).get();
    canView = membership.data()?.status === "active" && membership.data()?.teamId === submission.teamId;
  }
  if (!canView) return new Response(null, { status: 404 });
  const media = submission.mediaVerification as Record<string, unknown> | undefined;
  if (media?.status !== "verified" || typeof media.path !== "string" || !media.path.startsWith(`verified-tournament-submissions/${id}/${submissionId}/`) || media.path.includes("..")) return new Response(null, { status: 404 });
  try {
    const file = storage.bucket().file(media.path, { generation: String(media.generation) });
    const [bytes] = await file.download();
    if (bytes.length !== media.size) return new Response(null, { status: 503 });
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": String(media.contentType), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" } });
  } catch { return new Response(null, { status: 503 }); }
}
