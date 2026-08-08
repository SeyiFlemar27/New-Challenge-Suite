import { getAdminDb } from "@/lib/firebase/admin";
import { writeAuditLog } from "@/lib/server/audit";
import { requireAdminPermission } from "@/lib/server/auth";
import { processGrowthWalletExpiryBatch } from "@/lib/server/growth-wallet-expiry";
import { ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";

export async function GET(request: Request) {
  const { response } = await requireAdminPermission(request, "jobs.view");
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Growth Wallet expiry monitoring");
  const [allocations, jobs] = await Promise.all([db.collection("creatorGrowthWalletAllocations").limit(500).get(), db.collection("backgroundJobs").where("type", "==", "growth_wallet_expiry").limit(25).get()]);
  const now = Date.now();
  const records = allocations.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown>));
  const jobRecords = jobs.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown>));
  return ok({ expired: records.filter((item) => item.status === "expired"), upcoming: records.filter((item) => item.status === "active" && Date.parse(String(item.expiresAt ?? "")) > now).sort((a, b) => String(a.expiresAt).localeCompare(String(b.expiresAt))).slice(0, 100), jobs: jobRecords.sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""))) }, "Growth Wallet expiry monitoring loaded.");
}

export async function POST(request: Request) {
  const { user, response } = await requireAdminPermission(request, "jobs.retry");
  if (response) return response;
  const body = await readJson(request);
  if (body.response) return body.response;
  const reason = String(body.body?.reason ?? "").trim();
  if (reason.length < 8) return validationError({ reason: "A meaningful reason is required to run Growth Wallet expiry." });
  const db = getAdminDb();
  if (!db) return serverUnavailable("Growth Wallet expiry processing");
  const result = await processGrowthWalletExpiryBatch(db, { actorId: user.uid, reason, limit: Number(body.body?.limit ?? 100) });
  await writeAuditLog({ actorId: user.uid, actorType: "admin", action: "growth_wallet.expiry_batch_run", targetType: "system", targetId: result.runId, reason, metadata: { status: result.status, scannedCount: result.scannedCount, failureCount: result.failures.length } }, db);
  return ok(result, result.failures.length ? "Growth Wallet expiry run completed with items requiring attention." : "Growth Wallet expiry run completed.");
}
