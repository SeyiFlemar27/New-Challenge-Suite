import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireRecentAdminAuthentication } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import { getRequestIdempotencyKey, deterministicId } from "@/lib/server/idempotency";
import { applyEnterprisePromotionalPrizeFundingInTransaction } from "@/lib/server/enterprise-prize-exposure";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";

const schema = z.object({ amountCents: z.coerce.number().int().positive().max(1_000_000), reason: z.string().trim().min(8).max(1000), idempotencyKey: z.string().trim().min(8).max(120).optional() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRecentAdminAuthentication(request, "promotionalFunding.create");
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Enterprise promotional prize funding");
  const { id: challengeId } = await params;
  const body = await readJson(request);
  if (body.response) return body.response;
  const parsed = schema.safeParse(body.body ?? {});
  if (!parsed.success) return validationError(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0] ?? "funding"), issue.message])));
  const idempotencyKey = getRequestIdempotencyKey(request, parsed.data);
  if (!idempotencyKey) return validationError({ idempotencyKey: "A funding request reference is required." });
  const fundingId = deterministicId("admin_prize_promo", challengeId, idempotencyKey);
  const now = new Date().toISOString();
  try {
    const outcome = await db.runTransaction((transaction) => applyEnterprisePromotionalPrizeFundingInTransaction(db, transaction, {
      challengeId,
      fundingId,
      amountCents: parsed.data.amountCents,
      adminId: user!.uid,
      idempotencyKey,
      reason: parsed.data.reason,
      now,
    }));
    if (!outcome.idempotent) await writeAuditLog({ actorId: user!.uid, actorType: "admin", action: "enterprise.prize_promotional_funding_confirmed", targetType: "challenge", targetId: challengeId, reason: parsed.data.reason, after: outcome.record }, db);
    return ok({ funding: outcome.record, idempotent: outcome.idempotent }, outcome.idempotent ? "Existing promotional prize funding returned." : "Enterprise promotional prize funding recorded.");
  } catch (error) {
    if (error instanceof Error && error.message === "ENTERPRISE_PRIZE_LIMIT_EXCEEDED") return fail("Enterprise challenge prize pools cannot exceed $10,000.", 422, undefined, "ENTERPRISE_PRIZE_LIMIT_EXCEEDED");
    if (error instanceof Error && error.message === "CHALLENGE_NOT_FOUND") return fail("Challenge not found.", 404, undefined, "NOT_FOUND");
    if (error instanceof Error && error.message === "ENTERPRISE_ORGANIZATION_REQUIRED") return fail("Enterprise organization ownership is missing.", 409, undefined, "ENTERPRISE_OWNER_REQUIRED");
    if (error instanceof Error && error.message === "ENTERPRISE_PROMOTIONAL_FUNDING_INVALID") return fail("Promotional prize funding is available only for Enterprise challenges.", 409, undefined, "ENTERPRISE_FUNDING_NOT_APPLICABLE");
    return serverError("Enterprise promotional prize funding could not be recorded.", error instanceof Error ? error.message : error);
  }
}
