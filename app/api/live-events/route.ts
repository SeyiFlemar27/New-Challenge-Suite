import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { subscriptionPlans } from "@/lib/server/subscriptions";
import { ok, serverError, serverUnavailable } from "@/lib/server/responses";

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

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;

  const db = getAdminDb();
  if (!db) return serverUnavailable("Live events");

  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") ?? 30);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 30;

  try {
    const [userSnap, profileSnap, eventsSnap, registrationsSnap] = await Promise.all([
      db.collection("users").doc(user.uid).get(),
      db.collection("profiles").doc(user.uid).get(),
      db.collection("liveEvents").orderBy("startsAt", "asc").limit(limit).get(),
      db.collection("eventRegistrations").where("userId", "==", user.uid).limit(200).get()
    ]);

    const account = userSnap.exists ? userSnap.data() ?? {} : {};
    const profile = profileSnap.exists ? profileSnap.data() ?? {} : {};
    const currentPlanId = String(account.planId ?? profile.planId ?? "observer");
    const plan = subscriptionPlans.find((item) => item.id === currentPlanId) ?? subscriptionPlans[0];
    const registeredEventIds = new Set(registrationsSnap.docs.map((doc) => String(doc.data().eventId ?? "")));

    const events = eventsSnap.docs
      .map((doc) => {
        const data = doc.data();
        const requiredPlanId = typeof data.requiredPlanId === "string" ? data.requiredPlanId : null;
        const requiredPlan = requiredPlanId ? subscriptionPlans.find((item) => item.id === requiredPlanId) : null;
        const planRequired = Boolean(requiredPlan && !plan.canHostLiveEvents && requiredPlan.canHostLiveEvents);
        const capacity = Number(data.capacity ?? data.maxAttendees ?? 0);
        const attending = Number(data.attending ?? data.attendeeCount ?? data.registrationCount ?? 0);
        return {
          id: doc.id,
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
          eventType: data.eventType ?? data.type ?? null,
          requiredPlanId,
          registrationStatus: registeredEventIds.has(doc.id) ? "registered" : "available",
          planRequired,
          canRegister: !registeredEventIds.has(doc.id) && !planRequired && (!capacity || attending < capacity),
          status: data.status ?? "scheduled"
        };
      })
      .filter((event) => !["draft", "deleted", "cancelled"].includes(String(event.status).toLowerCase()));

    return ok({
      user: {
        uid: user.uid,
        email: user.email ?? account.email ?? profile.email ?? "",
        planId: plan.id,
        subscriptionStatus: account.subscriptionStatus ?? profile.subscriptionStatus ?? "free",
        canHostLiveEvents: plan.canHostLiveEvents
      },
      events
    }, "Live events loaded.");
  } catch (error) {
    return serverError("Live events could not be loaded.", error instanceof Error ? error.message : error);
  }
}
