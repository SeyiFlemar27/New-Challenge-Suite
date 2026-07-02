import nextEnv from "@next/env";
import { createHash } from "node:crypto";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldPath, type Firestore, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getFirestore } from "firebase-admin/firestore";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const paidPlanIds = new Set([
  "creator",
  "pro",
  "host",
  "enterprise",
  "sponsor_starter",
  "brand_partner",
  "enterprise_partner"
]);

const legacyPlanAliases: Record<string, string> = {
  observer: "free",
  premium: "pro",
  creator_pro: "creator",
  verified_host: "host",
  competitor: "pro",
  executive_host: "host",
  chief_producer: "enterprise",
  enterprise_sponsor: "enterprise_partner"
};

type DocumentRecord = { id: string; data: Record<string, unknown> };

type Finding = {
  accountRef: string;
  recordKind: "user" | "demo";
  plans: string[];
  accountType: string | null;
  role: string | null;
  stripeSubscriptionRef: string | null;
  reasons: string[];
};

function argumentValue(name: string) {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument?.slice(prefix.length) || null;
}

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function configuredProjectId() {
  return process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || null;
}

function validateExecutionGuard() {
  if (!process.argv.includes("--dry-run")) {
    throw new Error("This audit is read-only and requires the --dry-run flag.");
  }

  const projectId = configuredProjectId();
  const confirmedProject = argumentValue("project");
  const missing = [
    !projectId ? "FIREBASE_PROJECT_ID or NEXT_PUBLIC_FIREBASE_PROJECT_ID" : null,
    !process.env.FIREBASE_CLIENT_EMAIL ? "FIREBASE_CLIENT_EMAIL" : null,
    !process.env.FIREBASE_PRIVATE_KEY ? "FIREBASE_PRIVATE_KEY" : null
  ].filter(Boolean);

  if (missing.length) {
    throw new Error(`Missing Firebase Admin environment variable(s): ${missing.join(", ")}.`);
  }
  if (!confirmedProject || confirmedProject !== projectId) {
    throw new Error("Pass --project=<configured-project-id> to confirm the exact Firestore project being audited.");
  }
  return projectId;
}

function initializeAdmin(projectId: string) {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY!.trim().replace(/\\n/g, "\n")
      })
    });
  }
  return getFirestore();
}

function safeReference(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizePlanId(value: unknown) {
  const planId = stringValue(value)?.toLowerCase();
  if (!planId) return null;
  if (planId === "free" || paidPlanIds.has(planId)) return planId;
  return legacyPlanAliases[planId] ?? planId;
}

function recordPlans(...records: Record<string, unknown>[]) {
  const fields = ["planId", "subscriptionPlan", "subscriptionPlanId", "subscriptionTier"];
  const values = records.flatMap((record) => fields.map((field) => normalizePlanId(record[field])));
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function isTrustedActiveSubscription(record: Record<string, unknown>) {
  const internalStatus = stringValue(record.internalStatus);
  const stripeStatus = stringValue(record.stripeStatus);
  return Boolean(
    stringValue(record.userId)
    && stringValue(record.stripeSubscriptionId)
    && paidPlanIds.has(normalizePlanId(record.planId) ?? "")
    && record.entitlementActive === true
    && internalStatus === "active"
    && (stripeStatus === "active" || stripeStatus === "trialing")
    && stringValue(record.lastStripeEventId)
  );
}

async function readCollection(db: Firestore, collectionName: string, limit: number) {
  const records: DocumentRecord[] = [];
  const pageSize = Math.min(500, limit);
  let lastDocument: QueryDocumentSnapshot | null = null;

  while (records.length < limit) {
    let query = db.collection(collectionName)
      .orderBy(FieldPath.documentId())
      .limit(Math.min(pageSize, limit - records.length));
    if (lastDocument) query = query.startAfter(lastDocument);
    const snapshot = await query.get();
    if (snapshot.empty) break;
    records.push(...snapshot.docs.map((document) => ({ id: document.id, data: document.data() })));
    lastDocument = snapshot.docs.at(-1) ?? null;
    if (snapshot.size < pageSize) break;
  }

  return records;
}

function evaluateAccount(
  user: DocumentRecord,
  profile: DocumentRecord | undefined,
  subscriptions: DocumentRecord[]
): Finding | null {
  const plans = recordPlans(user.data, profile?.data ?? {});
  const paidPlans = plans.filter((planId) => paidPlanIds.has(planId));
  if (!paidPlans.length) return null;

  const trustedSubscriptions = subscriptions.filter((subscription) => isTrustedActiveSubscription(subscription.data));
  const trustedPlans = new Set(trustedSubscriptions.map((subscription) => normalizePlanId(subscription.data.planId)));
  const userSubscriptionId = stringValue(user.data.stripeSubscriptionId)
    ?? stringValue(profile?.data.stripeSubscriptionId);
  const matchingSubscription = userSubscriptionId
    ? trustedSubscriptions.find((subscription) => (
        subscription.id === userSubscriptionId
        || subscription.data.stripeSubscriptionId === userSubscriptionId
      ))
    : null;
  const reasons: string[] = [];

  if (!userSubscriptionId) reasons.push("paid_plan_without_stripe_subscription_id");
  if (!trustedSubscriptions.length) reasons.push("no_trusted_active_stripe_subscription_record");
  if (userSubscriptionId && !matchingSubscription) reasons.push("stripe_subscription_id_not_backed_by_trusted_record");
  if (!paidPlans.some((planId) => trustedPlans.has(planId))) reasons.push("paid_plan_does_not_match_trusted_subscription_plan");

  const userPlan = normalizePlanId(user.data.planId);
  const profilePlan = normalizePlanId(profile?.data.planId);
  if (userPlan && profilePlan && userPlan !== profilePlan) reasons.push("user_profile_plan_mismatch");

  if (!reasons.length) return null;
  return {
    accountRef: safeReference(user.id),
    recordKind: user.id.startsWith("demo-") ? "demo" : "user",
    plans: paidPlans,
    accountType: stringValue(user.data.accountType) ?? stringValue(profile?.data.accountType),
    role: stringValue(user.data.role) ?? stringValue(profile?.data.role),
    stripeSubscriptionRef: userSubscriptionId ? safeReference(userSubscriptionId) : null,
    reasons
  };
}

async function main() {
  const projectId = validateExecutionGuard();
  const limit = positiveInteger(argumentValue("limit"), 5000);
  const db = initializeAdmin(projectId);

  const [users, profiles, subscriptions] = await Promise.all([
    readCollection(db, "users", limit),
    readCollection(db, "profiles", limit),
    readCollection(db, "stripeSubscriptions", limit)
  ]);
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const subscriptionsByUser = new Map<string, DocumentRecord[]>();
  for (const subscription of subscriptions) {
    const userId = stringValue(subscription.data.userId);
    if (!userId) continue;
    subscriptionsByUser.set(userId, [...(subscriptionsByUser.get(userId) ?? []), subscription]);
  }

  const findings = users
    .map((user) => evaluateAccount(
      user,
      profilesById.get(user.id),
      subscriptionsByUser.get(user.id) ?? []
    ))
    .filter((finding): finding is Finding => Boolean(finding));

  const realFindings = findings.filter((finding) => finding.recordKind === "user");
  const demoFindings = findings.filter((finding) => finding.recordKind === "demo");
  console.log(JSON.stringify({
    auditMode: "read_only",
    projectConfirmed: true,
    projectRef: safeReference(projectId),
    limitPerCollection: limit,
    scanned: {
      users: users.length,
      profiles: profiles.length,
      stripeSubscriptions: subscriptions.length
    },
    findings: {
      suspiciousUserAccounts: realFindings.length,
      demoRecordsRequiringNoAutomaticMigration: demoFindings.length,
      records: findings
    },
    migrationPerformed: false
  }, null, 2));
}

main().catch((error) => {
  console.error(`[entitlement-audit] ${error instanceof Error ? error.message : "Audit failed."}`);
  process.exitCode = 1;
});
