import { FieldPath, type Firestore, type Query, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { requireEnterprisePermission } from "@/lib/server/enterprise-access";
import { fail, ok, serverError } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;

type CursorKind = "challenge" | "cash" | "revenue" | "exposure" | "settlement";

function decodeCursor(value: string | null, kind: CursorKind) {
  if (!value) return null;
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const [prefix, id] = decoded.split(":", 2);
    return prefix === kind && id && /^[A-Za-z0-9_-]{1,180}$/.test(id) ? id : "invalid";
  } catch {
    return "invalid";
  }
}

function encodeCursor(kind: CursorKind, id: string) {
  return Buffer.from(`${kind}:${id}`, "utf8").toString("base64url");
}

function timestamp(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return null;
}

function amount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

async function pageOwnedQuery(
  query: Query,
  collection: string,
  ownerField: string,
  organizationId: string,
  kind: CursorKind,
  cursorValue: string | null,
  pageSize: number,
  orderField = "createdAt",
) {
  const cursorId = decodeCursor(cursorValue, kind);
  if (cursorId === "invalid") throw new Error("INVALID_FINANCE_CURSOR");
  let pageQuery = query.orderBy(orderField, "desc").orderBy(FieldPath.documentId(), "desc");
  if (cursorId) {
    const cursor = await query.firestore.collection(collection).doc(cursorId).get();
    if (!cursor.exists || String(cursor.get(ownerField) ?? "") !== organizationId) throw new Error("INVALID_FINANCE_CURSOR");
    pageQuery = pageQuery.startAfter(cursor);
  }
  const result = await pageQuery.limit(pageSize + 1).get();
  const docs = result.docs.slice(0, pageSize);
  return {
    docs,
    hasMore: result.docs.length > pageSize,
    nextCursor: result.docs.length > pageSize && docs.length ? encodeCursor(kind, docs[docs.length - 1].id) : null,
  };
}

function challengeLedgerRow(doc: QueryDocumentSnapshot) {
  const row = doc.data();
  return {
    id: doc.id,
    challengeId: String(row.challengeId ?? ""),
    transactionId: String(row.transactionId ?? row.entryPaymentId ?? row.sponsorContributionId ?? "") || null,
    sourceType: String(row.sourceType ?? row.purpose ?? row.revenueType ?? "financial_record"),
    shareType: String(row.shareType ?? row.bucket ?? "") || null,
    amountCents: amount(row.amountCents ?? row.netAmountCents ?? row.grossAmountCents),
    currency: String(row.currency ?? "USD").toUpperCase(),
    direction: String(row.direction ?? "credit"),
    status: String(row.status ?? "unknown"),
    createdAt: timestamp(row.createdAt),
    confirmedAt: timestamp(row.confirmedAt),
    refundedAt: timestamp(row.refundedAt),
    refundOf: String(row.refundOf ?? row.sourceTransactionId ?? (String(row.direction ?? "") === "debit" ? row.transactionId ?? "" : "")) || null,
    provider: String(row.provider ?? "") || null,
    providerReference: String(row.providerReference ?? "") || null,
    financialOwnerType: String(row.financialOwnerType ?? "organization"),
  };
}

function revenueLedgerRow(doc: QueryDocumentSnapshot) {
  const row = doc.data();
  return {
    id: doc.id,
    challengeId: String(row.challengeId ?? ""),
    settlementId: String(row.settlementId ?? "") || null,
    sourceType: String(row.sourceType ?? "enterprise_revenue"),
    amountCents: amount(row.amountCents),
    currency: String(row.currency ?? "USD").toUpperCase(),
    direction: String(row.direction ?? "credit"),
    status: String(row.status ?? "unknown"),
    createdAt: timestamp(row.createdAt),
    confirmedPaymentSourcesOnly: row.confirmedPaymentSourcesOnly === true,
    externalPayoutExecuted: row.externalPayoutExecuted === true,
  };
}

function cashLedgerRow(doc: QueryDocumentSnapshot) {
  const row = doc.data();
  return {
    id: doc.id,
    challengeId: String(row.challengeId ?? ""),
    sourceId: String(row.sourceId ?? "") || null,
    transactionType: String(row.transactionType ?? row.sourceType ?? "financial_transaction"),
    amountCents: amount(row.amountCents),
    currency: String(row.currency ?? "USD").toUpperCase(),
    direction: String(row.direction ?? "credit"),
    status: String(row.status ?? "unknown"),
    createdAt: timestamp(row.createdAt),
    providerReference: String(row.providerReference ?? "") || null,
  };
}

function exposureRow(doc: QueryDocumentSnapshot) {
  const row = doc.data();
  return {
    challengeId: String(row.challengeId ?? doc.id),
    configuredPrizeObligationCents: amount(row.configuredPrizeCents),
    exposureCents: amount(row.exposureCents),
    maximumCents: amount(row.maximumCents) || 1_000_000,
    confirmed: {
      creatorFundingCents: amount(row.creatorConfirmedCents),
      sponsorPrizeCents: amount(row.sponsorConfirmedCents),
      paidEntryWinnerAllocationCents: amount(row.entryConfirmedCents),
      promotionalPrizeCents: amount(row.promotionalConfirmedCents),
    },
    reserved: {
      creatorFundingCents: amount(row.creatorReservedCents),
      additiveContributionsCents: amount(row.additionalReservedCents),
    },
    updatedAt: timestamp(row.updatedAt),
  };
}

function settlementRow(doc: QueryDocumentSnapshot) {
  const row = doc.data();
  const winners = Array.isArray(row.winnerDistribution) ? row.winnerDistribution as Array<Record<string, unknown>> : [];
  return {
    id: doc.id,
    challengeId: String(row.challengeId ?? ""),
    settlementId: String(row.settlementId ?? doc.id),
    status: String(row.status ?? "unknown"),
    organizationRevenueCents: amount(row.creatorHostAmount),
    winnerDistributionCents: winners.reduce((sum, winner) => sum + amount(winner.netAmountCents), 0),
    winnerCount: winners.length || (Array.isArray(row.approvedWinnerIds) ? row.approvedWinnerIds.length : 0),
    createdAt: timestamp(row.createdAt),
    payoutProviderCalled: row.payoutProviderCalled === true,
    externalPayoutExecuted: row.externalPayoutExecuted === true,
  };
}

async function challengeOwnershipMap(db: Firestore, challengeIds: string[]) {
  const ids = [...new Set(challengeIds.filter(Boolean))];
  const groups: string[][] = [];
  for (let index = 0; index < ids.length; index += 30) groups.push(ids.slice(index, index + 30));
  const [challengeGroups, tournamentGroups] = await Promise.all([
    Promise.all(groups.map((group) => db.collection("challenges").where(FieldPath.documentId(), "in", group).get())),
    Promise.all(groups.map((group) => db.collection("tournaments").where(FieldPath.documentId(), "in", group).get())),
  ]);
  const ownership = new Map<string, Record<string, unknown> | undefined>();
  for (const snapshot of [...challengeGroups, ...tournamentGroups]) {
    for (const doc of snapshot.docs) {
      if (ownership.has(doc.id)) ownership.set(doc.id, undefined);
      else ownership.set(doc.id, doc.data());
    }
  }
  return ownership;
}

function belongsToOrganization(row: Record<string, unknown>, challenge: Record<string, unknown> | undefined, organizationId: string) {
  if (row.financialOwnerType && row.financialOwnerType !== "organization") return false;
  const rowOwners = [row.organizationOwnerId, row.enterpriseOrganizationId, row.enterpriseFinanceContextId].filter((value) => typeof value === "string" && value.length > 0);
  if (rowOwners.some((owner) => owner !== organizationId)) return false;
  if (!challenge) return false;
  const challengeOwners = [challenge.organizationOwnerId, challenge.enterpriseOrganizationId, challenge.enterpriseFinanceContextId].filter((value) => typeof value === "string" && value.length > 0);
  return challengeOwners.length > 0
    && challengeOwners.every((owner) => owner === organizationId)
    && (challenge.officialChallenge === true || challenge.ownershipType === "challenge_suite_official");
}

export async function GET(request: Request) {
  const authorization = await requireEnterprisePermission(request, "finance.view");
  if (authorization.response) return authorization.response;

  const { db, access } = authorization;
  const organizationId = access.organizationId;
  if (!organizationId) return fail("Enterprise organization ownership is unavailable.", 403, undefined, "ENTERPRISE_ORGANIZATION_REQUIRED");

  const url = new URL(request.url);
  const suppliedOrganizationId = url.searchParams.get("organizationId") ?? url.searchParams.get("workspaceId");
  if (suppliedOrganizationId && suppliedOrganizationId !== organizationId) {
    return fail("Requested finance scope does not match your authorized organization.", 403, undefined, "ENTERPRISE_SCOPE_DENIED");
  }
  const requestedPageSize = Number(url.searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE);
  const pageSize = Number.isInteger(requestedPageSize) ? Math.min(MAX_PAGE_SIZE, Math.max(1, requestedPageSize)) : DEFAULT_PAGE_SIZE;

  try {
    const [walletSnap, challengeLedger, cashLedger, revenueLedger, exposure, settlements] = await Promise.all([
      db.collection("enterpriseFinanceWallets").doc(organizationId).get(),
      pageOwnedQuery(db.collection("challengeFinancialLedger").where("organizationOwnerId", "==", organizationId), "challengeFinancialLedger", "organizationOwnerId", organizationId, "challenge", url.searchParams.get("challengeCursor"), pageSize),
      pageOwnedQuery(db.collection("cashLedger").where("organizationOwnerId", "==", organizationId), "cashLedger", "organizationOwnerId", organizationId, "cash", url.searchParams.get("cashCursor"), pageSize),
      pageOwnedQuery(db.collection("enterpriseFinanceLedger").where("organizationId", "==", organizationId), "enterpriseFinanceLedger", "organizationId", organizationId, "revenue", url.searchParams.get("revenueCursor"), pageSize),
      pageOwnedQuery(db.collection("enterprisePrizeFundingLimits").where("organizationOwnerId", "==", organizationId), "enterprisePrizeFundingLimits", "organizationOwnerId", organizationId, "exposure", url.searchParams.get("exposureCursor"), pageSize, "updatedAt"),
      pageOwnedQuery(db.collection("challengeSettlements").where("enterpriseOrganizationId", "==", organizationId), "challengeSettlements", "enterpriseOrganizationId", organizationId, "settlement", url.searchParams.get("settlementCursor"), pageSize),
    ]);
    const challengeIds = [
      ...challengeLedger.docs.map((doc) => String(doc.get("challengeId") ?? "")),
      ...cashLedger.docs.map((doc) => String(doc.get("challengeId") ?? "")),
      ...revenueLedger.docs.map((doc) => String(doc.get("challengeId") ?? "")),
      ...exposure.docs.map((doc) => String(doc.get("challengeId") ?? doc.id)),
      ...settlements.docs.map((doc) => String(doc.get("challengeId") ?? "")),
    ];
    const challengeOwners = await challengeOwnershipMap(db, challengeIds);
    const safeChallengeLedger = challengeLedger.docs.filter((doc) => belongsToOrganization(doc.data(), challengeOwners.get(String(doc.get("challengeId") ?? "")), organizationId));
    const safeCashLedger = cashLedger.docs.filter((doc) => belongsToOrganization(doc.data(), challengeOwners.get(String(doc.get("challengeId") ?? "")), organizationId));
    const safeRevenueLedger = revenueLedger.docs.filter((doc) => belongsToOrganization(doc.data(), challengeOwners.get(String(doc.get("challengeId") ?? "")), organizationId));
    const safeExposure = exposure.docs.filter((doc) => belongsToOrganization(doc.data(), challengeOwners.get(String(doc.get("challengeId") ?? doc.id)), organizationId));
    const safeSettlements = settlements.docs.filter((doc) => belongsToOrganization(doc.data(), challengeOwners.get(String(doc.get("challengeId") ?? "")), organizationId));
    const wallet = walletSnap.exists ? walletSnap.data() ?? {} : null;
    if (wallet && String(wallet.organizationId ?? "") !== organizationId) {
      return fail("Organization finance balance ownership is inconsistent.", 409, undefined, "ENTERPRISE_FINANCE_OWNER_MISMATCH");
    }
    return ok({
      organizationId,
      currency: String(wallet?.currency ?? "USD").toUpperCase(),
      wallet: wallet ? {
        recordExists: true,
        pendingBalanceCents: amount(wallet.pendingBalanceCents),
        lifetimeChallengeRevenueCents: amount(wallet.lifetimeChallengeRevenueCents),
        withdrawalsEnabled: wallet.withdrawalsEnabled === true,
        personalWalletFallback: wallet.personalWalletFallback === true,
        updatedAt: timestamp(wallet.updatedAt),
      } : {
        recordExists: false,
        pendingBalanceCents: null,
        lifetimeChallengeRevenueCents: null,
        withdrawalsEnabled: false,
        personalWalletFallback: false,
        updatedAt: null,
      },
      accounting: {
        organizationRevenueSource: "enterpriseFinanceWallets and enterpriseFinanceLedger",
        prizeFundingSource: "enterprisePrizeFundingLimits and organization-tagged challengeFinancialLedger rows",
        sponsorPrizeContributionsAreOrganizationRevenue: false,
        paidEntryWinnerSharePercent: 65,
        paidEntryOrganizationSharePercent: 20,
        paidEntryPlatformSharePercent: 15,
        maximumPrizePoolPerChallengeCents: 1_000_000,
        externalPayoutExecutionEnabled: false,
      },
      challengeTransactions: { items: safeChallengeLedger.map(challengeLedgerRow), hasMore: challengeLedger.hasMore, nextCursor: challengeLedger.nextCursor },
      cashTransactions: { items: safeCashLedger.map(cashLedgerRow), hasMore: cashLedger.hasMore, nextCursor: cashLedger.nextCursor },
      organizationRevenueTransactions: { items: safeRevenueLedger.map(revenueLedgerRow), hasMore: revenueLedger.hasMore, nextCursor: revenueLedger.nextCursor },
      prizeExposure: { items: safeExposure.map(exposureRow), hasMore: exposure.hasMore, nextCursor: exposure.nextCursor },
      settlements: { items: safeSettlements.map(settlementRow), hasMore: settlements.hasMore, nextCursor: settlements.nextCursor },
      pagination: { pageSize },
    }, "Enterprise finance records loaded.");
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_FINANCE_CURSOR") {
      return fail("Finance cursor is invalid or outside your organization scope.", 400, undefined, "INVALID_CURSOR");
    }
    return serverError("Enterprise finance records could not be loaded.", error instanceof Error ? error.message : error);
  }
}
