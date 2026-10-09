const args = Object.fromEntries(process.argv.slice(2).map((item) => {
  const [key, ...rest] = item.replace(/^--/, "").split("=");
  return [key, rest.join("=")];
}));
const apply = process.argv.includes("--apply");
const limit = Math.max(1, Math.min(100, Number(args.limit ?? 50) || 50));
let getAdminDb;
try {
  ({ getAdminDb } = await import("../lib/firebase/admin.ts"));
} catch {
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", available: false, reason: "approved_environment_access_required" }));
  process.exit(0);
}
const db = getAdminDb();
if (!db) {
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", available: false, reason: "approved_environment_access_required" }));
  process.exit(0);
}

let query = db.collection("challenges").orderBy("__name__").limit(limit);
if (args.after) query = query.startAfter(String(args.after));
const snapshot = await query.get();
const candidates = snapshot.docs.filter((doc) => classifyEnterpriseOwnershipCandidate(doc.data()).status !== "not_candidate");
const results = [];
for (const doc of candidates) {
  const data = doc.data();
  const explicitOwners = [data.organizationOwnerId, data.enterpriseOrganizationId, data.enterpriseFinanceContextId]
    .map((value) => String(value ?? "").trim()).filter(Boolean);
  const distinctOwners = [...new Set(explicitOwners)];
  const organizationId = distinctOwners.length === 1 ? distinctOwners[0] : "";
  if (distinctOwners.length !== 1) {
    const classification = classifyEnterpriseOwnershipCandidate(data);
    results.push({ challengeId: doc.id, status: "unresolved", reason: classification.reason });
    continue;
  }
  const organizationRef = db.collection("enterpriseOrganizations").doc(organizationId);
  const organization = await organizationRef.get();
  if (!organization.exists || organization.data()?.status !== "active") {
    results.push({ challengeId: doc.id, status: "unresolved", organizationId, reason: "organization_missing_or_inactive" });
    continue;
  }
  if (classifyEnterpriseOwnershipCandidate(data, { [organizationId]: "active" }).status === "already_mapped") {
    results.push({ challengeId: doc.id, status: "already_mapped", organizationId });
    continue;
  }
  const auditRef = db.collection("migrationAuditLogs").doc(`enterprise_owner_${doc.id}`);
  if (apply) {
    await db.runTransaction(async (transaction) => {
      const [latest, currentOrganization, audit] = await Promise.all([
        transaction.get(doc.ref), transaction.get(organizationRef), transaction.get(auditRef),
      ]);
      if (audit.exists) return;
      if (!latest.exists || !currentOrganization.exists || currentOrganization.data()?.status !== "active") throw new Error("Record changed or organization is no longer active; rerun the dry run.");
      const current = latest.data() ?? {};
      const latestOwners = [current.organizationOwnerId, current.enterpriseOrganizationId, current.enterpriseFinanceContextId].map((value) => String(value ?? "").trim()).filter(Boolean);
      if ([...new Set(latestOwners)].length !== 1 || latestOwners[0] !== organizationId) throw new Error("Organization mapping changed or became ambiguous; record is preserved for manual review.");
      transaction.set(doc.ref, enterpriseOwnershipPatch(organizationId, new Date().toISOString()), { merge: true });
      transaction.create(auditRef, { id: auditRef.id, migration: "enterprise_challenge_ownership_v1", challengeId: doc.id, organizationId, before: { organizationOwnerId: current.organizationOwnerId ?? null }, after: { organizationOwnerId: organizationId }, status: "applied", createdAt: new Date().toISOString() });
    });
  }
  results.push({ challengeId: doc.id, status: apply ? "mapped" : "eligible", organizationId });
}
console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", scanned: snapshot.size, candidateCount: candidates.length, results, unresolvedCount: results.filter((item) => item.status === "unresolved").length, resumeAfter: snapshot.docs.at(-1)?.id ?? args.after ?? null }, null, 2));
import { classifyEnterpriseOwnershipCandidate, enterpriseOwnershipPatch } from "../lib/server/enterprise-ownership-migration.mjs";
