import { getAdminDb } from "@/lib/firebase/admin";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { requireRequestUser } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import {
  canEditEnterpriseApplication,
  decidedEnterpriseApplicationStatuses,
  ENTERPRISE_APPLICATION_COLLECTION,
  ENTERPRISE_APPLICATION_TYPE,
  enterpriseApplicationStatus,
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

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Enterprise applications");
  const snapshot = await db.collection(ENTERPRISE_APPLICATION_COLLECTION).where("userId", "==", user.uid).limit(20).get();
  const applications = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown> & { id: string }));
  return ok({ application: latestEnterpriseApplication(applications) }, "Enterprise application status loaded.");
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
      if (existing && decidedEnterpriseApplicationStatuses.has(enterpriseApplicationStatus(existing))) {
        return fail("This Enterprise application has already been reviewed.", 409, { status: enterpriseApplicationStatus(existing) }, "ENTERPRISE_APPLICATION_LOCKED");
      }
    }

    const ref = existing
      ? db.collection(ENTERPRISE_APPLICATION_COLLECTION).doc(existing.id)
      : db.collection(ENTERPRISE_APPLICATION_COLLECTION).doc();
    const inquiry = {
      id: ref.id,
      userId: auth?.user.uid ?? null,
      userRef: auth?.user.uid ?? null,
      applicationType,
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
      submittedFields: fields,
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
    if (isApplication && auth?.user) {
      await writeAuditLog({
        actorId: auth.user.uid,
        actorType: "user",
        action: existing ? "enterprise_application_updated" : "enterprise_application_submitted",
        targetType: "enterprise_application",
        targetId: ref.id,
        before: { status: existing ? enterpriseApplicationStatus(existing) : "not_submitted" },
        after: { status: "pending", userId: auth.user.uid },
        reason: existing ? "Enterprise application resubmitted." : "Enterprise application submitted."
      }, db);
    }
    return ok({ application: inquiry, inquiryId: ref.id, status: "pending", emailSent: false, enterpriseAccessGranted: false }, isApplication ? "Enterprise application submitted for review." : "Your inquiry has been saved for review.");
  } catch (error) {
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
  const id = text(body.id, 160);
  const ref = db.collection(ENTERPRISE_APPLICATION_COLLECTION).doc(id);
  const snap = await ref.get();
  const previous = { id, ...(snap.data() ?? {}) } as Record<string, unknown> & { id: string };
  if (!snap.exists || previous.userId !== user.uid || !canEditEnterpriseApplication(previous)) return fail("This application is not open for changes.", 409, undefined, "ENTERPRISE_APPLICATION_LOCKED");
  const fields = submittedFields({ ...previous, ...body });
  const invalid = validateApplicationFields(fields);
  if (invalid) return invalid;
  const now = new Date().toISOString();
  const update = {
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
    submittedFields: fields,
    status: "pending",
    approvalStatus: "pending",
    requestedInfoMessage: null,
    resubmittedAt: now,
    lastSubmittedAt: now,
    updatedAt: now
  };
  await ref.set(update, { merge: true });
  await Promise.all([
    db.collection("notifications").doc(`enterprise_${id}`).set({ id: `enterprise_${id}`, audience: "admin", adminOnly: true, type: ENTERPRISE_APPLICATION_TYPE, title: "Enterprise application updated", body: `${fields.company} updated its Enterprise application.`, targetId: id, status: "unread", updatedAt: now }, { merge: true }),
    writeAuditLog({ actorId: user.uid, actorType: "user", action: "enterprise_application_updated", targetType: "enterprise_application", targetId: id, before: { status: enterpriseApplicationStatus(previous) }, after: { status: "pending", userId: user.uid }, reason: "Enterprise application resubmitted." }, db)
  ]);
  return ok({ application: { ...previous, ...update } }, "Enterprise application resubmitted.");
}
