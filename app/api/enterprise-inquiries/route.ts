import { getAdminDb } from "@/lib/firebase/admin";
import { ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const db = getAdminDb();
  if (!db) return serverUnavailable("Enterprise inquiries");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body ?? {};
  const fullName = String(body.fullName ?? "").trim().slice(0, 160);
  const company = String(body.company ?? "").trim().slice(0, 180);
  const workEmail = String(body.workEmail ?? "").trim().slice(0, 180);
  const useCase = String(body.useCase ?? "").trim().slice(0, 1200);
  if (!fullName) return validationError({ fullName: "Full name is required." });
  if (!company) return validationError({ company: "Company or organization is required." });
  if (!/^\S+@\S+\.\S+$/.test(workEmail)) return validationError({ workEmail: "A valid work email is required." });
  if (!useCase) return validationError({ useCase: "Tell us about the enterprise use case." });
  const now = new Date().toISOString();
  const ref = db.collection("enterpriseInquiries").doc();
  const inquiry = {
    id: ref.id,
    fullName,
    company,
    workEmail,
    phone: String(body.phone ?? "").trim().slice(0, 80) || null,
    website: String(body.website ?? "").trim().slice(0, 220) || null,
    expectedMonthlyChallengeVolume: String(body.expectedMonthlyChallengeVolume ?? "").trim().slice(0, 120) || null,
    useCase,
    liveEventNeeds: String(body.liveEventNeeds ?? "").trim().slice(0, 1000) || null,
    sponsorBrandNeeds: String(body.sponsorBrandNeeds ?? "").trim().slice(0, 1000) || null,
    teamSize: String(body.teamSize ?? "").trim().slice(0, 80) || null,
    budgetRange: String(body.budgetRange ?? "").trim().slice(0, 120) || null,
    message: String(body.message ?? "").trim().slice(0, 1500) || null,
    status: "new",
    notificationRecipients: ["dgreen@saveourschools4ourkids.com", "seyiakinsaya7@gmail.com"],
    emailProviderConfigured: Boolean(process.env.RESEND_API_KEY || process.env.EMAIL_PROVIDER),
    emailSent: false,
    createdAt: now,
    updatedAt: now
  };
  try {
    await Promise.all([
      ref.set(inquiry),
      db.collection("notifications").doc(`enterprise_${ref.id}`).set({ id: `enterprise_${ref.id}`, audience: "admin", adminOnly: true, type: "enterprise_inquiry", title: "New enterprise inquiry", body: `${company} submitted a Contact Sales inquiry.`, targetId: ref.id, status: "unread", createdAt: now })
    ]);
    return ok({ inquiryId: ref.id, emailSent: false }, "Your inquiry has been saved. The sales team will follow up.");
  } catch (error) {
    return serverError("Enterprise inquiry could not be saved.", error instanceof Error ? error.message : error);
  }
}
