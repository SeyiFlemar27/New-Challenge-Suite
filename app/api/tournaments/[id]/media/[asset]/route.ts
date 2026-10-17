import { getAdminDb, getAdminStorage } from "@/lib/firebase/admin";
import { getOptionalRequestUser } from "@/lib/server/auth";
import { canEditTournament } from "@/lib/server/tournament-permissions";
import { isPublishedTournament } from "@/lib/server/tournament-public-policy";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string; asset: string }> }) {
  const { id, asset } = await context.params;
  if (!/^[a-f0-9]{64}$/.test(asset)) return new Response(null, { status: 404 });
  const db = getAdminDb(), storage = getAdminStorage();
  if (!db || !storage) return new Response(null, { status: 503 });
  const [snapshot, viewer] = await Promise.all([db.collection("tournaments").doc(id).get(), getOptionalRequestUser(request)]);
  const tournament = snapshot.data();
  if (!tournament) return new Response(null, { status: 404 });
  if (!(tournament.privacy === "public" && isPublishedTournament(tournament)) && !(viewer && canEditTournament({ ...viewer }, { ...tournament, id }).allowed)) return new Response(null, { status: 404 });
  const verification = tournament.creatorMediaVerification as { cover?: Record<string, unknown>; gallery?: Array<Record<string, unknown>>; trailer?: Record<string, unknown> } | undefined;
  const media = [verification?.cover, ...(Array.isArray(verification?.gallery) ? verification.gallery : []), verification?.trailer].find(item => item?.sha256 === asset);
  if (!media || media.status !== "verified" || media.path !== `verified-tournament-media/${id}/${asset}`) return new Response(null, { status: 404 });
  try {
    const [bytes] = await storage.bucket().file(String(media.path), { generation: String(media.generation) }).download();
    if (bytes.length !== media.size) return new Response(null, { status: 503 });
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": String(media.contentType), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" } });
  } catch { return new Response(null, { status: 503 }); }
}
