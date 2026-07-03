import { getAdminDb } from "@/lib/firebase/admin";
import { normalizeAccountType } from "@/lib/plan-access";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Sponsor messages");
  const snap = await db.collection("sponsorMessages").where("sponsorId", "==", user.uid).limit(100).get();
  const messages = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown>)).sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
  return ok({ messages }, "Sponsor messages loaded.");
}

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Sponsor messages");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const recipientId = typeof parsed.body?.recipientId === "string" ? parsed.body.recipientId.trim() : "";
  const challengeId = typeof parsed.body?.challengeId === "string" ? parsed.body.challengeId.trim() : "";
  const body = typeof parsed.body?.body === "string" ? parsed.body.body.trim() : "";
  if (!recipientId) return validationError({ recipientId: "Creator or host user ID is required." });
  if (body.length < 2 || body.length > 2000) return validationError({ body: "Message must be between 2 and 2,000 characters." });
  const [accountSnap, profileSnap, sponsorSnap] = await Promise.all([
    db.collection("users").doc(user.uid).get(),
    db.collection("profiles").doc(user.uid).get(),
    db.collection("sponsorProfiles").doc(user.uid).get()
  ]);
  if (normalizeAccountType({ ...(profileSnap.data() ?? {}), ...(accountSnap.data() ?? {}) }) !== "sponsor") {
    return fail("A sponsor account is required.", 403, undefined, "PERMISSION_DENIED");
  }
  if (!sponsorSnap.exists || sponsorSnap.data()?.sponsorOnboardingStatus !== "complete") {
    return fail("Complete sponsor onboarding before messaging creators or hosts.", 403, { redirectTo: "/sponsor/onboarding" }, "SPONSOR_ONBOARDING_REQUIRED");
  }
  const now = new Date().toISOString();
  const ref = db.collection("sponsorMessages").doc();
  const message = {
    id: ref.id,
    sponsorId: user.uid,
    recipientId,
    challengeId: challengeId || null,
    body,
    status: "sent",
    moderationStatus: "unreviewed",
    sponsorshipId: null,
    createdAt: now,
    updatedAt: now
  };
  await ref.set(message);
  return ok({ message }, "Message sent. No sponsorship or payment was created.");
}
