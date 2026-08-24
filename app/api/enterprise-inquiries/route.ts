import { getAdminDb } from "@/lib/firebase/admin";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { requireRequestUser } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import {
  canEditEnterpriseApplication,
  canResubmitEnterpriseApplication,
  ENTERPRISE_APPLICATION_COLLECTION,
  ENTERPRISE_APPLICATION_REVISION_COLLECTION,
  ENTERPRISE_APPLICATION_TYPE,
  enterpriseApplicationId,
  enterpriseApplicationRevisionId,
  enterpriseApplicationStatus,
  enterpriseApplicationTimeline,
  enterpriseApplicationVersion,
  latestEnterpriseApplication
} from "@/lib/server/enterprise-applications";

export const dynamic = "force-dynamic";

function text(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function submittedFields(body: Record<string, unknown>) {
  return {
    fullName: text(body.fullName, 160),
    company: text(body.company ?? body.organization, 180),
    workEmail: text(body.workEmail, 180),
    website: text(body.website, 220) || null,
    roleTitle: text(body.role ?? body.roleTitle, 160) || null,
    expectedChallengeVolume: text(body.expectedUsage ?? body.expectedUse, 240) || null,
    useCase: text(body.useCase ?? body.reason, 1200),
    relationship: text(body.relationship, 1000) || null,
    teamSize: text(body.teamSize, 80) || null,
    budgetOrPlanInterest: text(body.budgetRange ?? body.budgetOrPlanInterest, 120) || null,
    contactDetails: text(body.contactDetails ?? body.message, 1500) || null
  };
}

function validateApplicationFields(fields: ReturnType<typeof submittedFields>) {
  if (!fields.fullName) return validationError({ fullName: "Full name is required." });
  if (!fields.company) return validationError({ company: "Company or organization is required." });
  if (!/^\S+@\S+\.\S+$/.test(fields.workEmail)) return validationError({ workEmail: "A valid work email is required." });
  if (!fields.useCase) return validationError({ useCase: "Tell us why Enterprise access is needed." });
  return null;
}

function applicationData(fields: ReturnType<typeof submittedFields>) {
  return {
    applicantName: fields.fullName,
    applicantEmail: fields.workEmail,
    fullName: fields.fullName,
    company: fields.company,
    companyName: fields.company,
    workEmail: fields.workEmail,
    website: fields.website,
    role: fields.roleTitle,
    roleTitle: fields.roleTitle,
    expectedUsage: fields.expectedChallengeVolume,
    expectedChallengeVolume: fields.expectedChallengeVolume,
    useCase: fields.useCase,
    reason: fields.useCase,
    relationship: fields.relationship,
    teamSize: fields.teamSize,
    budgetRange: fields.budgetOrPlanInterest,
    budgetOrPlanInterest: fields.budgetOrPlanInterest,
    message: fields.contactDetails,
    contactDetails: fields.contactDetails,
    submittedFields: fields
  };
}

function sameFields(left: unknown, right: unknown) {
  return JSON.stringify(left ?? {}) === JSON.stringify(right ?? {});
}

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Enterprise applications");
  const snapshot = await db.collection(ENTERPRISE_APPLICATION_COLLECTION).where("userId", "==", user.uid).limit(20).get();
  const applications = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown> & { id: string }));
  const application = latestEnterpriseApplication(applications);
  if (!application) return ok({ application: null, revisions: [], timeline: [] }, "Enterprise application status loaded.");
  const revisionSnapshot = await db.collection(ENTERPRISE_APPLICATION_REVISION_COLLECTION).where("applicationId", "==", application.id).limit(50).get();
  const revisions = revisionSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown> & { id: string })).sort((a, b) => Number(b.version ?? 0) - Number(a.version ?? 0));
  return ok({ application, revisions, timeline: enterpriseApplicationTimeline(application) }, "Enterprise application status loaded.");
}

export async function POST(request: Request) {
  const db = getAdminDb();
  if (!db) return serverUnavailable("Enterprise inquiries");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = (parsed.body ?? {}) as Record<string, unknown>;
  const applicationType = text(body.applicationType ?? "enterprise_inquiry", 80);
  const isApplication = applicationType === ENTERPRISE_APPLICATION_TYPE;
  const auth = isApplication ? await requireRequestUser(request) : null;
  if (auth?.response) return auth.response;
  const fields = submittedFields(body);
  const invalid = validateApplicationFields(fields);
  if (invalid) return invalid;
  const now = new Date().toISOString();

  try {
    let existing: (Record<string, unknown> & { id: string }) | null = null;
    if (isApplication && auth?.user) {
      const snapshot = await db.collection(ENTERPRISE_APPLICATION_COLLECTION).where("userId", "==", auth.user.uid).limit(20).get();
      existing = latestEnterpriseApplication(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      if (existing && enterpriseApplicationStatus(existing) === "approved") {
        return fail("Enterprise access has already been approved.", 409, { status: "approved" }, "ENTERPRISE_APPLICATION_LOCKED");
      }
    }

    const ref = existing
      ? db.collection(ENTERPRISE_APPLICATION_COLLECTION).doc(existing.id)
      : isApplication && auth?.user
        ? db.collection(ENTERPRISE_APPLICATION_COLLECTION).doc(enterpriseApplicationId(auth.user.uid))
        : db.collection(ENTERPRISE_APPLICATION_COLLECTION).doc();
    if (isApplication && auth?.user) {
      const result = await db.runTransaction(async (transaction) => {
        const currentSnap = await transaction.get(ref);
        const current = currentSnap.exists ? ({ id: ref.id, ...currentSnap.data() } as Record<string, unknown> & { id: string }) : existing;
        if (current && enterpriseApplicationStatus(current) === "approved") throw new Error("APPLICATION_LOCKED");
        const currentVersion = current ? enterpriseApplicationVersion(current) : 0;
        const expectedVersion = Number(body.expectedVersion ?? currentVersion);
        if (current && (!Number.isInteger(expectedVersion) || expectedVersion !== currentVersion)) throw new Error("STALE_VERSION");
        const canonicalFields = submittedFields(body);
        if (current && sameFields(current.submittedFields, canonicalFields) && ["pending", "in_review"].includes(enterpriseApplicationStatus(current))) {
          return { application: current, unchanged: true };
        }
        const nextVersion = currentVersion + 1;
        const priorStatus = current ? enterpriseApplicationStatus(current) : "not_submitted";
        const resubmission = current ? canResubmitEnterpriseApplication(current) : false;
        const reviewAttempt = Math.max(1, Number(current?.reviewAttempt ?? 1) + (resubmission ? 1 : 0));
        const event = { type: resubmission ? "application_resubmitted" : current ? "application_updated" : "application_submitted", status: "pending", at: now, message: resubmission ? "Application resubmitted for review." : current ? "Application updated while under review." : "Application submitted for review." };
        const inquiry = {
          id: ref.id, userId: auth.user.uid, userRef: auth.user.uid, applicationType: ENTERPRISE_APPLICATION_TYPE,
          ...applicationData(canonicalFields), status: "pending", approvalStatus: "pending", enterpriseAccessGranted: false,
          paymentRequired: false, emailProviderConfigured: Boolean(process.env.RESEND_API_KEY || process.env.EMAIL_PROVIDER), emailSent: false,
          version: nextVersion, currentRevision: nextVersion, reviewAttempt,
          timeline: [...(Array.isArray(current?.timeline) ? current.timeline : []), event],
          submittedAt: current?.submittedAt ?? current?.createdAt ?? now, lastSubmittedAt: now,
          createdAt: current?.createdAt ?? now, updatedAt: now, resubmittedAt: resubmission ? now : current?.resubmittedAt ?? null,
          reviewedAt: null, reviewedBy: null, decisionReason: null, requestedInfoMessage: null
        };
        transaction.set(ref, inquiry, { merge: Boolean(current) });
        transaction.create(db.collection(ENTERPRISE_APPLICATION_REVISION_COLLECTION).doc(enterpriseApplicationRevisionId(ref.id, nextVersion)), {
          id: enterpriseApplicationRevisionId(ref.id, nextVersion), applicationId: ref.id, userId: auth.user.uid,
          version: nextVersion, reviewAttempt, status: "pending", fields: canonicalFields, source: resubmission ? "resubmission" : current ? "applicant_edit" : "initial_submission", createdAt: now
        });
        transaction.set(db.collection("notifications").doc(`enterprise_${ref.id}`), { id: `enterprise_${ref.id}`, audience: "admin", adminOnly: true, type: ENTERPRISE_APPLICATION_TYPE, title: resubmission ? "Enterprise application resubmitted" : current ? "Enterprise application updated" : "Enterprise application ready for review", body: `${canonicalFields.company} submitted an Enterprise access application.`, targetId: ref.id, status: "unread", createdAt: current?.createdAt ?? now, updatedAt: now }, { merge: true });
        transaction.create(db.collection("auditLogs").doc(`${ref.id}_v${nextVersion}_submitted`), { id: `${ref.id}_v${nextVersion}_submitted`, actorId: auth.user.uid, actorType: "user", action: event.type, targetType: "enterprise_application", targetId: ref.id, before: { status: priorStatus, version: currentVersion }, after: { status: "pending", version: nextVersion, reviewAttempt }, reason: event.message, metadata: {}, createdAt: now });
        return { application: inquiry, unchanged: false };
      });
      return ok({ application: result.application, inquiryId: ref.id, status: "pending", emailSent: false, enterpriseAccessGranted: false, unchanged: result.unchanged }, result.unchanged ? "Enterprise application is already pending review." : "Enterprise application submitted for review.");
    }
    const inquiry = {
      id: ref.id,
      userId: auth?.user.uid ?? null,
      userRef: auth?.user.uid ?? null,
      applicationType,
      ...applicationData(fields),
      status: "pending",
      approvalStatus: "pending",
      enterpriseAccessGranted: false,
      paymentRequired: false,
      emailProviderConfigured: Boolean(process.env.RESEND_API_KEY || process.env.EMAIL_PROVIDER),
      emailSent: false,
      submittedAt: existing?.submittedAt ?? existing?.createdAt ?? now,
      lastSubmittedAt: now,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      resubmittedAt: existing ? now : null
    };
    await ref.set(inquiry, { merge: Boolean(existing) });
    await db.collection("notifications").doc(`enterprise_${ref.id}`).set({
      id: `enterprise_${ref.id}`,
      audience: "admin",
      adminOnly: true,
      type: isApplication ? ENTERPRISE_APPLICATION_TYPE : "enterprise_inquiry",
      title: isApplication ? "Enterprise application ready for review" : "New enterprise sales inquiry",
      body: `${fields.company} submitted ${isApplication ? "an Enterprise access application" : "an Enterprise sales inquiry"}.`,
      targetId: ref.id,
      status: "unread",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    }, { merge: true });
    return ok({ application: inquiry, inquiryId: ref.id, status: "pending", emailSent: false, enterpriseAccessGranted: false }, isApplication ? "Enterprise application submitted for review." : "Your inquiry has been saved for review.");
  } catch (error) {
    if (error instanceof Error && error.message === "STALE_VERSION") return fail("This application changed in another session. Refresh before saving again.", 409, undefined, "STALE_APPLICATION_VERSION");
    if (error instanceof Error && error.message === "APPLICATION_LOCKED") return fail("This Enterprise application has already been approved.", 409, undefined, "ENTERPRISE_APPLICATION_LOCKED");
    return serverError(isApplication ? "Enterprise application could not be submitted." : "Enterprise inquiry could not be saved.", error instanceof Error ? error.message : error);
  }
}

export async function PATCH(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Enterprise applications");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = (parsed.body ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  const id = text(body.id, 160);
  const action = text(body.action ?? "update", 40);
  const ref = db.collection(ENTERPRISE_APPLICATION_COLLECTION).doc(id);
  const snap = await ref.get();
  const previous = { id, ...(snap.data() ?? {}) } as Record<string, unknown> & { id: string };
  if (!snap.exists || previous.userId !== user.uid) return fail("Enterprise application not found.", 404, undefined, "NOT_FOUND");
  if (action === "withdraw") {
    if (!["pending", "in_review", "needs_info", "requested_changes"].includes(enterpriseApplicationStatus(previous))) return fail("This application can no longer be withdrawn.", 409, undefined, "ENTERPRISE_APPLICATION_LOCKED");
    const expectedVersion = Number(body.expectedVersion ?? enterpriseApplicationVersion(previous));
    try {
      const application = await db.runTransaction(async (transaction) => {
        const currentSnap = await transaction.get(ref);
        const current = { id, ...(currentSnap.data() ?? {}) } as Record<string, unknown> & { id: string };
        const version = enterpriseApplicationVersion(current);
        if (!currentSnap.exists || current.userId !== user.uid) throw new Error("NOT_FOUND");
        if (version !== expectedVersion) throw new Error("STALE_VERSION");
        const nextVersion = version + 1;
        const event = { type: "application_withdrawn", status: "withdrawn", at: now, message: "Application withdrawn by applicant." };
        const update = { status: "withdrawn", approvalStatus: "withdrawn", version: nextVersion, currentRevision: nextVersion, withdrawnAt: now, updatedAt: now, timeline: [...(Array.isArray(current.timeline) ? current.timeline : []), event] };
        transaction.set(ref, update, { merge: true });
        transaction.create(db.collection(ENTERPRISE_APPLICATION_REVISION_COLLECTION).doc(enterpriseApplicationRevisionId(id, nextVersion)), { id: enterpriseApplicationRevisionId(id, nextVersion), applicationId: id, userId: user.uid, version: nextVersion, reviewAttempt: Number(current.reviewAttempt ?? 1), status: "withdrawn", fields: current.submittedFields ?? {}, source: "withdrawal", createdAt: now });
        transaction.create(db.collection("auditLogs").doc(`${id}_v${nextVersion}_withdrawn`), { id: `${id}_v${nextVersion}_withdrawn`, actorId: user.uid, actorType: "user", action: "enterprise_application_withdrawn", targetType: "enterprise_application", targetId: id, before: { status: enterpriseApplicationStatus(current), version }, after: { status: "withdrawn", version: nextVersion }, reason: "Application withdrawn by applicant.", metadata: {}, createdAt: now });
        return { ...current, ...update };
      });
      return ok({ application }, "Enterprise application withdrawn.");
    } catch (error) {
      if (error instanceof Error && error.message === "STALE_VERSION") return fail("This application changed in another session. Refresh before trying again.", 409, undefined, "STALE_APPLICATION_VERSION");
      return serverError("Enterprise application could not be withdrawn.", error instanceof Error ? error.message : error);
    }
  }
  if (!canEditEnterpriseApplication(previous) && !canResubmitEnterpriseApplication(previous)) return fail("This application is not open for changes.", 409, undefined, "ENTERPRISE_APPLICATION_LOCKED");
  const fields = submittedFields({ ...(previous.submittedFields as Record<string, unknown> ?? previous), ...body });
  const invalid = validateApplicationFields(fields);
  if (invalid) return invalid;
  const expectedVersion = Number(body.expectedVersion ?? enterpriseApplicationVersion(previous));
  try {
    const application = await db.runTransaction(async (transaction) => {
      const currentSnap = await transaction.get(ref);
      const current = { id, ...(currentSnap.data() ?? {}) } as Record<string, unknown> & { id: string };
      if (!currentSnap.exists || current.userId !== user.uid) throw new Error("NOT_FOUND");
      const currentVersion = enterpriseApplicationVersion(current);
      if (expectedVersion !== currentVersion) throw new Error("STALE_VERSION");
      const priorStatus = enterpriseApplicationStatus(current);
      if (!canEditEnterpriseApplication(current) && !canResubmitEnterpriseApplication(current)) throw new Error("APPLICATION_LOCKED");
      if (sameFields(current.submittedFields, fields) && ["pending", "in_review"].includes(priorStatus)) return current;
      const resubmission = canResubmitEnterpriseApplication(current);
      const nextVersion = currentVersion + 1;
      const nextStatus = resubmission ? "pending" : priorStatus;
      const reviewAttempt = Math.max(1, Number(current.reviewAttempt ?? 1) + (resubmission ? 1 : 0));
      const event = { type: resubmission ? "application_resubmitted" : "application_updated", status: nextStatus, at: now, message: resubmission ? "Application resubmitted for review." : "Application updated while under review." };
      const update = { ...applicationData(fields), status: nextStatus, approvalStatus: nextStatus, requestedInfoMessage: resubmission ? null : current.requestedInfoMessage ?? null, version: nextVersion, currentRevision: nextVersion, reviewAttempt, resubmittedAt: resubmission ? now : current.resubmittedAt ?? null, lastSubmittedAt: now, updatedAt: now, timeline: [...(Array.isArray(current.timeline) ? current.timeline : []), event] };
      transaction.set(ref, update, { merge: true });
      transaction.create(db.collection(ENTERPRISE_APPLICATION_REVISION_COLLECTION).doc(enterpriseApplicationRevisionId(id, nextVersion)), { id: enterpriseApplicationRevisionId(id, nextVersion), applicationId: id, userId: user.uid, version: nextVersion, reviewAttempt, status: nextStatus, fields, source: resubmission ? "resubmission" : "applicant_edit", createdAt: now });
      transaction.set(db.collection("notifications").doc(`enterprise_${id}`), { id: `enterprise_${id}`, audience: "admin", adminOnly: true, type: ENTERPRISE_APPLICATION_TYPE, title: resubmission ? "Enterprise application resubmitted" : "Enterprise application updated", body: `${fields.company} updated its Enterprise application.`, targetId: id, status: "unread", updatedAt: now }, { merge: true });
      transaction.create(db.collection("auditLogs").doc(`${id}_v${nextVersion}_updated`), { id: `${id}_v${nextVersion}_updated`, actorId: user.uid, actorType: "user", action: event.type, targetType: "enterprise_application", targetId: id, before: { status: priorStatus, version: currentVersion }, after: { status: nextStatus, version: nextVersion, reviewAttempt }, reason: event.message, metadata: {}, createdAt: now });
      return { ...current, ...update };
    });
    return ok({ application }, "Enterprise application saved.");
  } catch (error) {
    if (error instanceof Error && error.message === "STALE_VERSION") return fail("This application changed in another session. Refresh before saving again.", 409, undefined, "STALE_APPLICATION_VERSION");
    if (error instanceof Error && error.message === "APPLICATION_LOCKED") return fail("This application is no longer open for changes.", 409, undefined, "ENTERPRISE_APPLICATION_LOCKED");
    return serverError("Enterprise application could not be saved.", error instanceof Error ? error.message : error);
  }
}
