import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { conflict, fail, ok, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Live event check-in");
  const { id } = await params;
  const eventRef = db.collection("liveEvents").doc(id);
  const registrationRef = db.collection("liveEventRegistrations").doc(`${id}_${user.uid}`);

  try {
    const result = await db.runTransaction(async (transaction) => {
      const [eventSnap, registrationSnap] = await Promise.all([
        transaction.get(eventRef),
        transaction.get(registrationRef)
      ]);
      if (!eventSnap.exists) throw new Error("LIVE_EVENT_NOT_FOUND");
      if (!registrationSnap.exists) throw new Error("REGISTRATION_REQUIRED");
      const event = eventSnap.data() ?? {};
      const registration = registrationSnap.data() ?? {};
      if (!["confirmed", "checked_in"].includes(String(registration.status ?? ""))) {
        throw new Error("REGISTRATION_NOT_CONFIRMED");
      }
      if (registration.checkedInAt || registration.status === "checked_in") {
        return { alreadyCheckedIn: true, checkedInAt: registration.checkedInAt ?? null };
      }
      if (["draft", "cancelled", "deleted", "completed"].includes(String(event.status ?? "").toLowerCase())) {
        throw new Error("CHECK_IN_NOT_AVAILABLE");
      }
      const now = new Date().toISOString();
      const checkInCount = Number(event.checkInCount ?? event.checkedInCount ?? 0) + 1;
      transaction.set(registrationRef, {
        status: "checked_in",
        checkInStatus: "checked_in",
        checkedInAt: now,
        updatedAt: now
      }, { merge: true });
      transaction.set(eventRef, { checkInCount, updatedAt: now }, { merge: true });
      return { alreadyCheckedIn: false, checkedInAt: now, checkInCount };
    });
    return ok(result, result.alreadyCheckedIn ? "You are already checked in." : "Live event check-in confirmed.");
  } catch (error) {
    const code = error instanceof Error ? error.message : "CHECK_IN_FAILED";
    if (code === "LIVE_EVENT_NOT_FOUND") return fail("Live event not found.", 404, undefined, code);
    if (code === "REGISTRATION_REQUIRED") return fail("A confirmed registration is required for check-in.", 403, undefined, code);
    if (code === "REGISTRATION_NOT_CONFIRMED") return conflict("Your registration is not confirmed.");
    if (code === "CHECK_IN_NOT_AVAILABLE") return conflict("Check-in is not available for this event.");
    return fail("Live event check-in could not be completed.", 500, undefined, "CHECK_IN_FAILED");
  }
}
