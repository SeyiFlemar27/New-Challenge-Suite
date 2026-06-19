import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { subscriptionPlans } from "@/lib/server/subscriptions";
import { fail, ok, serverError, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return null;
}

function eventDateValue(data: FirebaseFirestore.DocumentData) {
  return toIso(data.startsAt ?? data.startDate ?? data.date ?? data.createdAt) ?? "";
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, response } = await requireRequestUser(request);
  if (response) return response;

  const db = getAdminDb();
  if (!db) return serverUnavailable("Live event details");

  try {
    const [eventSnap, userSnap, profileSnap, registrationSnap] = await Promise.all([
      db.collection("liveEvents").doc(id).get(),
      db.collection("users").doc(user.uid).get(),
      db.collection("profiles").doc(user.uid).get(),
      db.collection("eventRegistrations").doc(`${id}_${user.uid}`).get()
    ]);

    if (!eventSnap.exists) {
      return fail("Live event not found.", 404, { fieldErrors: { eventId: "Live event does not exist." } }, "NOT_FOUND");
    }

    const data = eventSnap.data() ?? {};
    const account = userSnap.exists ? userSnap.data() ?? {} : {};
    const profile = profileSnap.exists ? profileSnap.data() ?? {} : {};
    const currentPlanId = String(account.planId ?? profile.planId ?? "observer");
    const plan = subscriptionPlans.find((item) => item.id === currentPlanId) ?? subscriptionPlans[0];
    const requiredPlanId = typeof data.requiredPlanId === "string" ? data.requiredPlanId : null;
    const requiredPlan = requiredPlanId ? subscriptionPlans.find((item) => item.id === requiredPlanId) : null;
    const planRequired = Boolean(requiredPlan && !plan.canHostLiveEvents && requiredPlan.canHostLiveEvents);
    const capacity = Number(data.capacity ?? data.maxAttendees ?? 0);
    const attending = Number(data.attending ?? data.attendeeCount ?? data.registrationCount ?? 0);
    const status = String(data.status ?? "scheduled").toLowerCase();
    const alreadyRegistered = registrationSnap.exists;
    const isFull = Boolean(capacity && attending >= capacity);
    const registrationOpen = !["draft", "deleted", "cancelled", "closed", "completed"].includes(status);

    return ok({
      user: {
        uid: user.uid,
        email: user.email ?? account.email ?? profile.email ?? "",
        displayName: profile.displayName ?? account.displayName ?? user.email ?? "",
        planId: plan.id,
        subscriptionStatus: account.subscriptionStatus ?? profile.subscriptionStatus ?? "free"
      },
      event: {
        id: eventSnap.id,
        title: data.title ?? "",
        host: data.hostName ?? data.host ?? data.creatorName ?? "",
        image: data.imageUrl ?? data.image ?? data.mediaUrl ?? "",
        location: data.location ?? "",
        date: eventDateValue(data),
        time: data.time ?? data.startTime ?? "",
        description: data.description ?? "",
        attending,
        capacity,
        price: Number(data.price ?? data.ticketPrice ?? 0),
        ticketType: data.ticketType ?? "General attendee access",
        requiredPlanId,
        status,
        alreadyRegistered,
        fullCapacity: isFull,
        planRequired,
        registrationOpen,
        canRegister: registrationOpen && !alreadyRegistered && !isFull && !planRequired
      },
      registration: registrationSnap.exists ? { id: registrationSnap.id, ...registrationSnap.data() } : null
    }, "Live event details loaded.");
  } catch (error) {
    return serverError("Live event details could not be loaded.", error instanceof Error ? error.message : error);
  }
}
