import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminPermission } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";

export const dynamic = "force-dynamic";
const actionSchema = z.object({ caseType: z.enum(["dispute", "cancellation"]), caseId: z.string().trim().min(1).max(180), action: z.enum(["request_information", "resolve", "approve_cancellation_review"]), reason: z.string().trim().min(10).max(1200) });

export async function GET(request: Request) {
  const { user, response } = await requireAdminPermission(request, "sponsors.review");
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin Sponsorship operations");
  try {
    const [disputes, cancellations, verifications] = await Promise.all([
      db.collection("sponsorDisputes").limit(200).get(),
      db.collection("sponsorCancellationRequests").limit(200).get(),
      db.collection("sponsorVerification").limit(200).get()
    ]);
    const cases = [
      ...disputes.docs.map((doc) => ({ id: doc.id, caseType: "dispute", ...doc.data() })),
      ...cancellations.docs.map((doc) => ({ id: doc.id, caseType: "cancellation", ...doc.data() })),
      ...verifications.docs.map((doc) => ({ id: doc.id, caseType: "verification", ...doc.data() }))
    ].sort((left, right) => String((right as Record<string, unknown>).createdAt ?? (right as Record<string, unknown>).updatedAt ?? "").localeCompare(String((left as Record<string, unknown>).createdAt ?? (left as Record<string, unknown>).updatedAt ?? "")));
    return ok({ cases, filters: ["all", "dispute", "cancellation", "verification"], externalPayoutExecutionAvailable: false, automaticRefundExecutionAvailable: false }, "Sponsorship operations loaded.");
  } catch (error) {
    console.error("[admin-sponsor-operations:get]", { adminId: user?.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsorship operations could not be loaded.");
  }
}

export async function PATCH(request: Request) {
  const { user, response } = await requireAdminPermission(request, "disputes.decide");
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin Sponsorship operations");
  const body = await readJson(request);
  if (body.response) return body.response;
  const parsed = actionSchema.safeParse(body.body);
  if (!parsed.success) return validationError({ action: parsed.error.issues[0]?.message ?? "Complete the required case decision." });
  const input = parsed.data;
  const collection = input.caseType === "dispute" ? "sponsorDisputes" : "sponsorCancellationRequests";
  try {
    const ref = db.collection(collection).doc(input.caseId);
    const snapshot = await ref.get();
    if (!snapshot.exists) return fail("Sponsorship operation was not found.", 404, undefined, "SPONSOR_OPERATION_NOT_FOUND");
    const current = snapshot.data() ?? {};
    const now = new Date().toISOString();
    const nextStatus = input.action === "request_information" ? "information_requested" : input.action === "resolve" ? "resolved" : "approved_pending_finance_review";
    const batch = db.batch();
    batch.set(ref, { status: nextStatus, adminReason: input.reason, updatedAt: now, updatedBy: user!.uid, externalPayoutExecuted: false, externalRefundExecuted: false }, { merge: true });
    const sponsorshipId = String(current.sponsorshipId ?? "");
    if (sponsorshipId && input.action === "approve_cancellation_review") batch.set(db.collection("sponsorships").doc(sponsorshipId), { status: "cancellation_approved_pending_refund_review", externalPayoutExecuted: false, externalRefundExecuted: false, updatedAt: now, updatedBy: user!.uid }, { merge: true });
    await batch.commit();
    await writeAuditLog({ actorId: user!.uid, actorType: "admin", action: "sponsorship_operation." + input.action, targetType: input.caseType, targetId: input.caseId, reason: input.reason, metadata: { sponsorshipId: sponsorshipId || null, externalPayoutExecuted: false, externalRefundExecuted: false } }, db);
    return ok({ caseId: input.caseId, caseType: input.caseType, status: nextStatus }, "Sponsorship operation updated.");
  } catch (error) {
    console.error("[admin-sponsor-operations:patch]", { adminId: user?.uid, caseId: input.caseId, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsorship operation could not be updated.");
  }
}