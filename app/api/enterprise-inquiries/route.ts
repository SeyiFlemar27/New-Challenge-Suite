import { getAdminDb } from "@/lib/firebase/admin";
import { ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { requireRequestUser } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Enterprise applications");
  const snapshot = await db.collection("enterpriseInquiries").where("userId", "==", user.uid).limit(20).get();
  const applications = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown> & { id: string })).filter((item) => item.applicationType === "enterprise_access_application").sort((a, b) => String(b.updatedAt ?? b.createdAt ?? "").localeCompare(String(a.updatedAt ?? a.createdAt ?? "")));
  return ok({ application: applications[0] ?? null }, "Enterprise application status loaded.");
}

export async function POST(request: Request) {
  const db = getAdminDb();
  if (!db) return serverUnavailable("Enterprise inquiries");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body ?? {};
  const applicationType = String(body.applicationType ?? "enterprise_inquiry").trim().slice(0, 80);
  const fullName = String(body.fullName ?? "").trim().slice(0, 160);
  const company = String(body.company ?? body.organization ?? "").trim().slice(0, 180);
  const workEmail = String(body.workEmail ?? "").trim().slice(0, 180);
  const useCase = String(body.useCase ?? body.expectedUse ?? body.reason ?? "").trim().slice(0, 1200);
  if (!fullName) return validationError({ fullName: "Full name is required." });
  if (!company) return validationError({ company: "Company or organization is required." });
  if (!/^\S+@\S+\.\S+$/.test(workEmail)) return validationError({ workEmail: "A valid work email is required." });
  if (!useCase) return validationError({ useCase: "Tell us why Enterprise access is needed." });
  const now = new Date().toISOString();
  const ref = db.collection("enterpriseInquiries").doc();
  const isApplication = applicationType === "enterprise_access_application";
  const auth = isApplication ? await requireRequestUser(request) : null;
  if (auth?.response) return auth.response;
  const inquiry = {
    id: ref.id,
    userId: auth?.user.uid ?? null,
    applicationType,
    fullName,
    company,
    workEmail,
    website: String(body.website ?? "").trim().slice(0, 220) || null,
    role: String(body.role ?? "").trim().slice(0, 160) || null,
    expectedUsage: String(body.expectedUsage ?? body.expectedUse ?? "").trim().slice(0, 240) || null,
    useCase,
    reason: String(body.reason ?? useCase).trim().slice(0, 1200),
    relationship: String(body.relationship ?? "").trim().slice(0, 1000) || null,
    teamSize: String(body.teamSize ?? "").trim().slice(0, 80) || null,
    budgetRange: isApplication ? null : String(body.budgetRange ?? "").trim().slice(0, 120) || null,
    message: String(body.message ?? "").trim().slice(0, 1500) || null,
    status: "pending",
    approvalStatus: "pending",
    enterpriseAccessGranted: false,
    paymentRequired: false,
    emailProviderConfigured: Boolean(process.env.RESEND_API_KEY || process.env.EMAIL_PROVIDER),
    emailSent: false,
    createdAt: now,
    updatedAt: now
  };
  try {
    await Promise.all([
      ref.set(inquiry),
      db.collection("notifications").doc(`enterprise_${ref.id}`).set({ id: `enterprise_${ref.id}`, audience: "admin", adminOnly: true, type: isApplication ? "enterprise_access_application" : "enterprise_inquiry", title: isApplication ? "New enterprise access application" : "New enterprise inquiry", body: `${company} submitted ${isApplication ? "an Enterprise access application" : "an Enterprise inquiry"}.`, targetId: ref.id, status: "unread", createdAt: now })
    ]);
    return ok({ inquiryId: ref.id, status: "pending", emailSent: false, enterpriseAccessGranted: false }, isApplication ? "Enterprise application submitted for review." : "Your inquiry has been saved for review.");
  } catch (error) {
    return serverError("Enterprise inquiry could not be saved.", error instanceof Error ? error.message : error);
  }
}

export async function PATCH(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Enterprise applications");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const id = String(parsed.body?.id ?? "");
  const ref = db.collection("enterpriseInquiries").doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.userId !== user.uid) return validationError({ id: "Application not found." });
  if (!['needs_info', 'requested_changes'].includes(String(snap.data()?.status ?? ""))) return validationError({ status: "This application is not open for changes." });
  const now = new Date().toISOString();
  const update = {
    fullName: String(parsed.body?.fullName ?? snap.data()?.fullName ?? "").trim().slice(0, 160),
    company: String(parsed.body?.company ?? parsed.body?.organization ?? snap.data()?.company ?? "").trim().slice(0, 180),
    workEmail: String(parsed.body?.workEmail ?? snap.data()?.workEmail ?? "").trim().slice(0, 180),
    useCase: String(parsed.body?.useCase ?? parsed.body?.reason ?? snap.data()?.useCase ?? "").trim().slice(0, 1200),
    reason: String(parsed.body?.reason ?? parsed.body?.useCase ?? snap.data()?.reason ?? "").trim().slice(0, 1200),
    relationship: String(parsed.body?.relationship ?? snap.data()?.relationship ?? "").trim().slice(0, 1000) || null,
    expectedUsage: String(parsed.body?.expectedUse ?? parsed.body?.expectedUsage ?? snap.data()?.expectedUsage ?? "").trim().slice(0, 240) || null,
    teamSize: String(parsed.body?.teamSize ?? snap.data()?.teamSize ?? "").trim().slice(0, 80) || null,
    status: "pending",
    approvalStatus: "pending",
    resubmittedAt: now,
    updatedAt: now
  };
  await ref.set(update, { merge: true });
  return ok({ application: { id, ...snap.data(), ...update } }, "Enterprise application resubmitted.");
}
