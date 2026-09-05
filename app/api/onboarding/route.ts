import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import { getEffectiveTier } from "@/lib/plan-access";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";

const creatorSchema = z.object({
  type: z.literal("creator"),
  niche: z.string().trim().min(2).max(80),
  profileGoal: z.string().trim().min(2).max(160)
});

const hostSchema = z.object({
  type: z.literal("host"),
  organizationName: z.string().trim().min(2).max(120),
  eventBrandName: z.string().trim().max(120).default(""),
  location: z.string().trim().min(2).max(160),
  contactEmail: z.string().trim().email(),
  publicProfileUrl: z.string().trim().url().optional().or(z.literal("")),
  logoUrl: z.string().trim().url().optional().or(z.literal("")),
  hostType: z.string().trim().min(2).max(80),
  competitionSize: z.enum(["under_50", "50_200", "200_1000", "1000_plus"]),
  votingPreference: z.enum(["public", "credits", "dorocoin", "judge", "hybrid", "manual"]).transform((value) => value === "dorocoin" ? "credits" : value),
  eventMode: z.enum(["online", "physical", "hybrid", "unsure"]),
  revenueAcknowledged: z.literal(true)
});

const onboardingSchema = z.discriminatedUnion("type", [creatorSchema, hostSchema]);

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Plan onboarding");
  const parsedBody = await readJson(request);
  if (parsedBody.response) return parsedBody.response;
  const parsed = onboardingSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return validationError(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0] ?? "onboarding"), issue.message])));
  }

  const [accountSnap, profileSnap] = await Promise.all([
    db.collection("users").doc(user.uid).get(),
    db.collection("profiles").doc(user.uid).get()
  ]);
  const merged = { ...(profileSnap.data() ?? {}), ...(accountSnap.data() ?? {}) };
  const effectiveTier = getEffectiveTier(merged);
  if (parsed.data.type === "creator" && effectiveTier.id !== "creator") {
    return fail("Creator onboarding requires an active or trialing Creator Plan.", 403, undefined, "CREATOR_PLAN_REQUIRED");
  }
  if (parsed.data.type === "host" && effectiveTier.id !== "host") {
    return fail("Host onboarding requires an active or trialing Host Plan.", 403, undefined, "HOST_PLAN_REQUIRED");
  }

  const now = new Date().toISOString();
  const completionField = parsed.data.type === "host" ? "hostOnboardingComplete" : "creatorOnboardingComplete";
  const onboardingData = { ...parsed.data, userId: user.uid, completedAt: now, updatedAt: now };
  await Promise.all([
    db.collection("planOnboarding").doc(`${user.uid}_${parsed.data.type}`).set(onboardingData, { merge: true }),
    db.collection("users").doc(user.uid).set({ [completionField]: true, updatedAt: now }, { merge: true }),
    db.collection("profiles").doc(user.uid).set({ [completionField]: true, updatedAt: now }, { merge: true })
  ]);

  return ok({
    type: parsed.data.type,
    completed: true,
    destination: parsed.data.type === "host" ? "/dashboard/host" : "/dashboard"
  }, `${parsed.data.type === "host" ? "Host" : "Creator"} onboarding completed.`);
}
