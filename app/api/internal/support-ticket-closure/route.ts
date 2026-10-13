import { getAdminDb } from "@/lib/firebase/admin";
import { closeExpiredSupportTickets } from "@/lib/server/support-tickets";
import { dispatchSupportEmailOutbox } from "@/lib/server/support-email";
import { fail, ok, serverError, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return fail("Scheduled operation is not authorized.", 401, undefined, "CRON_UNAUTHORIZED");
  const db = getAdminDb(); if (!db) return serverUnavailable("Support ticket closure");
  try {
    const result = await closeExpiredSupportTickets(db);
    for (const outboxId of result.closedOutboxIds) await dispatchSupportEmailOutbox(db, outboxId);
    return ok({ scanned: result.scanned, closed: result.closed }, "Expired support tickets closed.");
  }
  catch (error) { return serverError("Support ticket closure could not run.", error instanceof Error ? error.message : error); }
}
