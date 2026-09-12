import { getChallengeDisplayStatus } from "@/lib/challenge-status";
import { CHALLENGE_SUITE_ENTERPRISE_ID, enterpriseChallengeInScope, isEnterpriseAccessActive, normalizeEnterpriseAccess, type EnterprisePermission } from "@/lib/enterprise-access";
import { createNotification } from "@/lib/server/notifications";
import { requireEnterprisePermission } from "@/lib/server/enterprise-access";
import { writeAuditLog } from "@/lib/server/audit";
import { fail, ok, readJson, validationError } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

const activeStatuses = new Set(["approved", "scheduled", "active", "submission_open", "voting_open", "voting_closed", "under_review", "results_review"]);

function iso(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return value.toDate().toISOString();
  return null;
}

function assignmentFor(challenge: Record<string, unknown>, userId: string) {
  const assignments = Array.isArray(challenge.enterpriseAssignments) ? challenge.enterpriseAssignments as Array<Record<string, unknown>> : [];
  return assignments.find((item) => item.userId === userId && item.status !== "removed") ?? null;
}

export async function GET(request: Request) {
  const section = new URL(request.url).searchParams.get("section") ?? "studio";
  const sectionPermission: Record<string, EnterprisePermission> = { studio: "challenge.view", challenges: "challenge.view", assigned: "challenge.view", submissions: "submissions.view", reviews: "reviews.view", analytics: "analytics.view", finance: "finance.view", sponsorships: "sponsors.view", team: "team.view", activity: "activity.view" };
  const permission = sectionPermission[section];
  if (!permission) return validationError({ section: "Choose a valid Enterprise workspace section." });
  const result = await requireEnterprisePermission(request, permission, { allowObligationAccess: section !== "team" && section !== "analytics" && section !== "sponsorships" });
  if (result.response) return result.response;
  const { db, user, access } = result;
  const [challengeSnap, participantSnap, submissionSnap, activitySnap] = await Promise.all([
    db.collection("challenges").where("officialChallenge", "==", true).limit(200).get(),
    db.collection("participants").limit(500).get(),
    db.collection("submissions").limit(500).get(),
    db.collection("auditLogs").orderBy("createdAt", "desc").limit(30).get().catch(() => null),
  ]);
  const visible = challengeSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown> & { id: string }))
    .filter((challenge) => String(challenge.organizationOwnerId ?? CHALLENGE_SUITE_ENTERPRISE_ID) === access.enterpriseId)
    .filter((challenge) => enterpriseChallengeInScope(access, challenge, user.uid))
    .filter((challenge) => result.accessState !== "obligation_only" || result.obligationChallengeIds.includes(challenge.id))
    .sort((a, b) => String(b.updatedAt ?? b.createdAt ?? "").localeCompare(String(a.updatedAt ?? a.createdAt ?? "")));
  const ids = new Set(visible.map((item) => item.id));
  const participants = participantSnap.docs.filter((doc) => ids.has(String(doc.data().challengeId ?? ""))).length;
  const submissions = submissionSnap.docs.filter((doc) => ids.has(String(doc.data().challengeId ?? ""))).length;
  const challenges = visible.slice(0, 36).map((challenge) => {
    const assignment = assignmentFor(challenge, user.uid);
    return {
      id: challenge.id,
      title: String(challenge.title ?? "Untitled challenge"),
      category: String(challenge.category ?? "Uncategorized"),
      region: String(challenge.region ?? challenge.country ?? "All regions"),
      status: String(challenge.status ?? "draft"),
      displayStatus: getChallengeDisplayStatus(challenge),
      nextDeadline: iso(challenge.submissionDeadline ?? challenge.votingDeadline ?? challenge.endsAt),
      assignment: assignment ? String(assignment.responsibility ?? assignment.role ?? "Assigned") : null,
      createdByMe: challenge.createdBy === user.uid || challenge.creatorId === user.uid,
      needsAttention: ["pending_review", "requires_changes", "results_review"].includes(String(challenge.status ?? "")),
    };
  });
  const activity = activitySnap?.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown> & { id: string }))
    .filter((item) => ids.has(String(item.challengeId ?? item.targetId ?? "")))
    .slice(0, 8) ?? [];
  const base = {
    access, accessState: result.accessState,
    metrics: { activeOfficialChallenges: visible.filter((item) => activeStatuses.has(String(item.status ?? ""))).length, participants, submissions, needsAttention: visible.filter((item) => ["pending_review", "requires_changes", "results_review"].includes(String(item.status ?? ""))).length },
    attention: challenges.filter((item) => item.needsAttention).slice(0, 3),
    assigned: challenges.filter((item) => item.assignment).slice(0, 6),
    official: challenges.slice(0, 6),
    challenges,
    pagination: { page: 1, pageSize: 36, total: visible.length, totalPages: Math.max(1, Math.ceil(visible.length / 36)) },
    activity,
  };
  if (section === "submissions") {
    const records = submissionSnap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown> & { id: string }))
      .filter((item) => ids.has(String(item.challengeId ?? "")))
      .slice(0, 100);
    return ok({ ...base, records }, "Enterprise submissions loaded.");
  }
  if (section === "team") {
    const teamSnap = await db.collection("users").where("enterpriseAccessStatus", "==", "approved").limit(200).get();
    const team = teamSnap.docs.map((doc) => { const data = doc.data(); return { id: doc.id, displayName: String(data.displayName ?? [data.firstName, data.lastName].filter(Boolean).join(" ") ?? "Enterprise staff"), role: String(data.enterpriseRole ?? "operations"), department: String(data.enterpriseDepartment ?? "Operations"), status: String(data.enterpriseStaffStatus ?? "active"), scope: String(data.enterpriseScope ?? "assigned_only") }; });
    return ok({ ...base, team }, "Enterprise Team loaded.");
  }
  if (section === "finance") {
    const financeSnap = await db.collection("settlementUnresolvedAllocations").where("allocationType", "==", "enterprise_official_organizational_share").limit(200).get();
    const finance = financeSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown> & { id: string })).filter((item) => ids.has(String(item.challengeId ?? "")));
    return ok({ ...base, finance }, "Enterprise Finance loaded.");
  }
  if (section === "sponsorships") {
    const sponsorshipSnap = await db.collection("sponsorships").limit(200).get();
    const sponsorships = sponsorshipSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown> & { id: string })).filter((item) => ids.has(String(item.challengeId ?? "")));
    return ok({ ...base, sponsorships }, "Enterprise Sponsorships loaded.");
  }
  if (section === "reviews") return ok({ ...base, records: challenges.filter((item) => item.needsAttention) }, "Enterprise reviews loaded.");
  return ok(base, section === "studio" ? "Enterprise Studio loaded." : `Enterprise ${section} loaded.`);
}

export async function POST(request: Request) {
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body ?? {};
  const action = String(body.action ?? "");
  const challengeId = String(body.challengeId ?? "");
  if (!challengeId) return validationError({ challengeId: "Challenge is required." });
  const permission = action === "add_note" ? "notes.write" : "challenge.assign";
  const result = await requireEnterprisePermission(request, permission);
  if (result.response) return result.response;
  const ref = result.db.collection("challenges").doc(challengeId);
  const snap = await ref.get();
  const challenge = snap.exists ? { id: snap.id, ...snap.data() } as Record<string, unknown> & { id: string } : null;
  if (!challenge || !enterpriseChallengeInScope(result.access, challenge, result.user.uid, true)) return fail("This official challenge is outside your editable scope.", 403, undefined, "ENTERPRISE_SCOPE_DENIED");
  const now = new Date().toISOString();
  if (action === "add_note") {
    const note = String(body.note ?? "").trim().slice(0, 1500);
    if (!note) return validationError({ note: "Enter an internal note." });
    const noteRef = result.db.collection("enterpriseChallengeNotes").doc();
    await noteRef.set({ id: noteRef.id, challengeId, note, authorId: result.user.uid, visibility: "assigned_enterprise_team", createdAt: now, updatedAt: now });
    await writeAuditLog({ actorId: result.user.uid, actorType: "creator", action: "enterprise_note_added", targetType: "challenge", targetId: challengeId, metadata: { noteId: noteRef.id, enterpriseStaff: true } }, result.db);
    return ok({ noteId: noteRef.id }, "Internal note added.");
  }
  if (action === "assign") {
    if (!result.access.permissions.includes("team.manage")) return fail("Team management permission is required.", 403, undefined, "ENTERPRISE_PERMISSION_REQUIRED");
    const assigneeId = String(body.assigneeId ?? "");
    const responsibility = String(body.responsibility ?? "operations").slice(0, 80);
    if (!assigneeId) return validationError({ assigneeId: "Staff member is required." });
    const assigneeSnap = await result.db.collection("users").doc(assigneeId).get();
    const assigneeAccess = assigneeSnap.exists ? normalizeEnterpriseAccess(assigneeSnap.data() ?? {}) : null;
    if (!assigneeSnap.exists || !isEnterpriseAccessActive(assigneeAccess)) return fail("Active Enterprise staff member not found.", 404, undefined, "ENTERPRISE_STAFF_NOT_FOUND");
    const assignments = Array.isArray(challenge.enterpriseAssignments) ? challenge.enterpriseAssignments as Array<Record<string, unknown>> : [];
    const next = [...assignments.filter((item) => item.userId !== assigneeId), { userId: assigneeId, responsibility, status: "active", assignedBy: result.user.uid, assignedAt: now }];
    await ref.set({ enterpriseAssignments: next, updatedAt: now, version: Number(challenge.version ?? 0) + 1 }, { merge: true });
    await Promise.all([
      writeAuditLog({ actorId: result.user.uid, actorType: "creator", action: "enterprise_staff_assigned", targetType: "challenge", targetId: challengeId, after: { assigneeId, responsibility }, metadata: { enterpriseStaff: true } }, result.db),
      createNotification(result.db, { userId: assigneeId, type: "enterprise_assignment", title: "Assigned to official challenge", body: `You were assigned to ${String(challenge.title ?? "an official challenge")}.`, entityType: "challenge", entityId: challengeId, actionUrl: `/challenges/${challengeId}/manage`, idempotencyKey: `enterprise_assignment_${challengeId}_${assigneeId}_${responsibility}` }),
    ]);
    return ok({ challengeId, assigneeId }, "Staff assignment saved.");
  }
  return validationError({ action: "Select a valid Enterprise action." });
}
