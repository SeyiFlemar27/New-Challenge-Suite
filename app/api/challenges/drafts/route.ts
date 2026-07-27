import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser, requireRole } from "@/lib/server/auth";
import { ok, serverUnavailable, fail } from "@/lib/server/responses";
import { writeAuditLog } from "@/lib/server/audit";
import { createNotification } from "@/lib/server/notifications";
import { getUserPlanAccess } from "@/lib/plan-access";
import { calculateChallengeDraftProgress, resolveChallengeManagementState } from "@/lib/server/challenge-drafts";
import { isQaOrDemoRecord, publicChallengeFields } from "@/lib/server/public-challenge";

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Challenge drafts");
  const snap = await db.collection("challenges").where("creatorId", "==", user.uid).limit(100).get();
  const challenges = snap.docs
    .filter((doc) => !isQaOrDemoRecord(doc.id, doc.data()))
    .map((doc) => {
      const data = doc.data();
      const progress = calculateChallengeDraftProgress(data);
      return { id: doc.id, ...publicChallengeFields(data), status: data.status ?? "draft", managementState: resolveChallengeManagementState(data), completionPercentage: Number(data.completionPercentage ?? progress.completionPercentage), nextIncompleteSection: data.nextIncompleteSection ?? progress.nextIncompleteSection, lastAutosavedAt: data.lastAutosavedAt ?? data.updatedAt ?? null };
    });
  return ok({ challenges }, "Challenge drafts loaded.");
}

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const permission = requireRole(user, ["user", "creator", "host"]);
  if (permission) return permission;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Challenge draft creation");
  const [accountSnap, profileSnap] = await Promise.all([db.collection("users").doc(user.uid).get(), db.collection("profiles").doc(user.uid).get()]);
  const profile = { ...(profileSnap.exists ? profileSnap.data() ?? {} : {}), ...(accountSnap.exists ? accountSnap.data() ?? {} : {}) };
  const planAccess = getUserPlanAccess(profile);
  if (planAccess.isSponsor) return fail("Sponsor accounts manage campaigns from the sponsor dashboard.", 403, { redirectTo: "/sponsor/dashboard" }, "SPONSOR_NOT_ALLOWED");
  const now = new Date().toISOString();
  const ref = db.collection("challenges").doc();
  const draft = {
    id: ref.id,
    creatorId: user.uid,
    ownerId: user.uid,
    status: "draft",
    lifecycleStatus: "draft",
    visibility: "public",
    type: "Public Challenge",
    title: "",
    description: "",
    category: "",
    acceptedSubmissionTypes: ["image"],
    participantApprovalMode: "automatic",
    requiresParticipantApproval: false,
    requiresSubmissionApproval: false,
    participantCount: 0,
    reservedSlotCount: 0,
    submissionCount: 0,
    voteCount: 0,
    completionPercentage: 0,
    nextIncompleteSection: "Basics",
    creationStep: 0,
    draftAutosaveEnabled: true,
    entitlementConsumed: false,
    createdAt: now,
    updatedAt: now,
    lastAutosavedAt: now
  };
  await ref.set(draft);
  await writeAuditLog({ actorId: user.uid, actorType: "user", action: "challenge.draft_created", targetType: "challenge", targetId: ref.id, after: { status: "draft" }, metadata: { source: "api/challenges/drafts" } }, db).catch(() => undefined);
  await createNotification(db, { userId: user.uid, type: "challenge_draft_created", title: "Challenge draft created", body: "Your challenge draft is ready to edit.", targetId: ref.id });
  return ok({ challenge: draft }, "Challenge draft created.");
}
