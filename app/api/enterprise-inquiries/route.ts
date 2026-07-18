import { getAdminDb } from "@/lib/firebase/admin";
import { ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

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
  const inquiry = {
    id: ref.id,
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
