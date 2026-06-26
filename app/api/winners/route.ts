import { getAdminDb } from "@/lib/firebase/admin";
import { ok, serverError, serverUnavailable } from "@/lib/server/responses";
import { deriveSafePreviewWinners, enrichWinnerRecord } from "@/lib/server/winners";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getAdminDb();
  if (!db) return serverUnavailable("Winners");

  try {
    const winnerDocs = await db.collection("winners").orderBy("createdAt", "desc").limit(48).get().catch(() => null);
    if (winnerDocs && !winnerDocs.empty) {
      const winners = await Promise.all(winnerDocs.docs.map((doc) => enrichWinnerRecord(db, { id: doc.id, ...doc.data() }, "stored")));
      return ok({ winners, source: "stored", message: null }, "Winners loaded.");
    }

    const derived = await deriveSafePreviewWinners(db, 24);
    const pendingCount = derived.filter((winner) => winner.status === "pending_review").length;
    return ok({
      winners: derived,
      source: "derived_preview",
      message: pendingCount ? "Some results are being reviewed before winners are announced." : derived.length ? null : "No final winner results are available yet."
    }, "Winners loaded.");
  } catch (error) {
    console.error("[winners] load failed", { message: error instanceof Error ? error.message : String(error) });
    return serverError("Winners could not be loaded.", error instanceof Error ? error.message : error);
  }
}

