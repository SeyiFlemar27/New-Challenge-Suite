import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import { normalizedEmailHash, normalizeAccountDeletionStatus, PENDING_ACCOUNT_DELETION_STATUSES } from "@/lib/server/account-deletion";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";

const schema = z.object({ email: z.string().trim().email() });

export async function POST(request: Request) {
  const db = getAdminDb();
  if (!db) return serverUnavailable("Account availability");
  const body = await readJson(request);
  if (body.response) return body.response;
  const parsed = schema.safeParse(body.body);
  if (!parsed.success) return validationError({ email: "Enter a valid email address." });
  const snap = await db.collection("deletedAccountReferences").doc(normalizedEmailHash(parsed.data.email)).get();
  if (!snap.exists) return ok({ available: true, freshAccountRequired: true }, "Account creation can continue.");
  const record = snap.data() ?? {};
  const status = normalizeAccountDeletionStatus(record.status);
  if (PENDING_ACCOUNT_DELETION_STATUSES.has(status)) return fail("This email is linked to an account deletion in progress.", 409, { available: false, supportHref: "/contact" }, "ACCOUNT_DELETION_PENDING");
  if (record.enforcementReviewRequired === true || record.emailReuseAllowed !== true) return fail("Account creation with this email requires support review.", 403, { available: false, supportHref: "/contact" }, "ACCOUNT_REUSE_REVIEW_REQUIRED");
  return ok({ available: true, freshAccountRequired: true, previousAccountRestored: false }, "A new account can be created with a new identity.");
}
