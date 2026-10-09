import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";

const MAXIMUM_EXPOSURE_CENTS = 1_000_000;

function cents(value: unknown) {
  return Math.max(0, Math.round(Number(value) || 0));
}

async function readPendingReservationBuckets(db: Firestore, transaction: Transaction, challengeId: string) {
  const creatorPending = await transaction.get(db.collection("creatorPrizeFundingPayments").where("challengeId", "==", challengeId).where("status", "==", "pending").where("reservationStatus", "==", "pending_payment"));
  const sponsorPending = await transaction.get(db.collection("sponsorContributions").where("challengeId", "==", challengeId).where("status", "==", "pending"));
  const entryPending = await transaction.get(db.collection("challengeEntryPayments").where("challengeId", "==", challengeId).where("status", "==", "pending"));
  const creatorReservedCents = creatorPending.docs.reduce((sum, item) => sum + cents(item.data().amountCents), 0);
  const additionalReservedCents = sponsorPending.docs.reduce((sum, item) => sum + cents(item.data().amountCents), 0)
    + entryPending.docs.reduce((sum, item) => sum + cents(item.data().winnerShareCents), 0);
  return { creatorReservedCents, additionalReservedCents, reservedCents: creatorReservedCents + additionalReservedCents };
}

export function calculateEnterprisePrizeExposure(input: {
  challenge: Record<string, unknown>;
  limitData?: Record<string, unknown> | null;
  legacyReservedCents?: number;
}) {
  const configuredPrizeCents = Math.max(
    cents(Number(input.challenge.prizeValue ?? 0) * 100),
    cents(input.limitData?.configuredPrizeCents),
  );
  const creatorConfirmedCents = Math.max(cents(input.limitData?.creatorConfirmedCents), cents(input.challenge.confirmedCreatorPrizeFundingCents));
  const sponsorConfirmedCents = Math.max(cents(input.limitData?.sponsorConfirmedCents), cents(input.challenge.confirmedSponsorContributionCents));
  const entryConfirmedCents = Math.max(cents(input.limitData?.entryConfirmedCents), cents(input.challenge.confirmedEntryFeeAllocationCents));
  const promotionalConfirmedCents = Math.max(cents(input.limitData?.promotionalConfirmedCents), cents(input.challenge.confirmedPlatformPromotionalCents));
  const categorizedConfirmed = creatorConfirmedCents + sponsorConfirmedCents + entryConfirmedCents + promotionalConfirmedCents;
  const aggregateConfirmedCents = Math.max(cents(input.limitData?.confirmedCents), categorizedConfirmed);
  // Preserve older aggregate-only records conservatively as additional pool funds.
  const unattributedConfirmedCents = Math.max(0, aggregateConfirmedCents - categorizedConfirmed);
  const creatorReservedCents = cents(input.limitData?.creatorReservedCents);
  const additionalReservedCents = cents(input.limitData?.additionalReservedCents);
  const legacyReservedCents = input.limitData && input.limitData.reservedCents !== undefined
    ? cents(input.limitData.reservedCents)
    : cents(input.legacyReservedCents);
  const categorizedReservedCents = creatorReservedCents + additionalReservedCents;
  const unattributedReservedCents = Math.max(0, legacyReservedCents - categorizedReservedCents);
  const confirmedCents = aggregateConfirmedCents;
  const reservedCents = legacyReservedCents;
  // Creator funding fulfills the configured obligation; other sources add to it.
  // A reservation is moved from reserved to confirmed in one transaction, so it
  // appears once in this equation at every lifecycle stage.
  const creatorObligationCents = Math.max(configuredPrizeCents, creatorConfirmedCents + creatorReservedCents);
  const additionalPoolCents = sponsorConfirmedCents + entryConfirmedCents + promotionalConfirmedCents
    + additionalReservedCents + unattributedConfirmedCents + unattributedReservedCents;
  const exposureCents = creatorObligationCents + additionalPoolCents;
  if (exposureCents > MAXIMUM_EXPOSURE_CENTS) throw new Error("ENTERPRISE_PRIZE_LIMIT_EXCEEDED");
  return { configuredPrizeCents, creatorConfirmedCents, sponsorConfirmedCents, entryConfirmedCents, promotionalConfirmedCents, creatorReservedCents, additionalReservedCents, confirmedCents, reservedCents, exposureCents };
}

export function reserveEnterprisePrizeExposure(input: {
  challenge: Record<string, unknown>;
  limitData?: Record<string, unknown> | null;
  legacyReservedCents?: number;
  amountCents: number;
  sourceType?: "creator" | "additional";
}) {
  const current = calculateEnterprisePrizeExposure(input);
  const reservedCents = current.reservedCents + cents(input.amountCents);
  const creatorReservedCents = cents(input.limitData?.creatorReservedCents) + (input.sourceType === "creator" ? cents(input.amountCents) : 0);
  const additionalReservedCents = cents(input.limitData?.additionalReservedCents) + (input.sourceType === "creator" ? 0 : cents(input.amountCents));
  const exposureCents = Math.max(current.configuredPrizeCents, current.creatorConfirmedCents + creatorReservedCents)
    + current.sponsorConfirmedCents + current.entryConfirmedCents + current.promotionalConfirmedCents + additionalReservedCents;
  if (exposureCents > MAXIMUM_EXPOSURE_CENTS) throw new Error("ENTERPRISE_PRIZE_LIMIT_EXCEEDED");
  return { ...current, creatorReservedCents, additionalReservedCents, reservedCents, exposureCents };
}

/** Shared Firestore transaction reservation used by creator and Sponsor funding. */
export async function reserveEnterprisePrizeExposureInTransaction(db: Firestore, transaction: Transaction, input: {
  challengeId: string;
  challenge: Record<string, unknown>;
  organizationOwnerId: string;
  amountCents: number;
  sourceType: "creator" | "sponsor" | "entry" | "promotional";
  releaseAmountCents?: number;
  now: string;
}) {
  const ownership = resolveEnterpriseFinancialOwnership(input.challenge);
  if (ownership.workspaceType !== "enterprise" || ownership.organizationOwnerId !== input.organizationOwnerId) {
    throw new Error("ENTERPRISE_FINANCE_OWNER_MISMATCH");
  }
  const limitRef = db.collection("enterprisePrizeFundingLimits").doc(input.challengeId);
  const limitSnap = await transaction.get(limitRef);
  let legacyReservedCents: number | undefined;
  if (!limitSnap.exists) {
    const creatorPending = await transaction.get(db.collection("creatorPrizeFundingPayments").where("challengeId", "==", input.challengeId).where("status", "==", "pending").where("reservationStatus", "==", "pending_payment"));
    const sponsorPending = await transaction.get(db.collection("sponsorContributions").where("challengeId", "==", input.challengeId).where("status", "==", "pending"));
    const entryPending = await transaction.get(db.collection("challengeEntryPayments").where("challengeId", "==", input.challengeId).where("status", "==", "pending"));
    legacyReservedCents = creatorPending.docs.reduce((sum, item) => sum + cents(item.data().amountCents), 0)
      + sponsorPending.docs.reduce((sum, item) => sum + cents(item.data().amountCents), 0)
      + entryPending.docs.reduce((sum, item) => sum + cents(item.data().winnerShareCents), 0)
      - cents(input.releaseAmountCents);
    legacyReservedCents = Math.max(0, legacyReservedCents);
  } else if (String(limitSnap.data()?.organizationOwnerId ?? "") !== ownership.organizationOwnerId) {
    throw new Error("ENTERPRISE_FINANCE_OWNER_MISMATCH");
  }
  let currentLimit = limitSnap.exists ? limitSnap.data() as Record<string, unknown> : null;
  if (currentLimit && (currentLimit.creatorReservedCents === undefined || currentLimit.additionalReservedCents === undefined)) {
    const buckets = await readPendingReservationBuckets(db, transaction, input.challengeId);
    currentLimit = { ...currentLimit, ...buckets };
  }
  const adjustedLimit = currentLimit && input.releaseAmountCents
    ? { ...currentLimit, reservedCents: Math.max(0, cents(currentLimit.reservedCents) - cents(input.releaseAmountCents)), additionalReservedCents: Math.max(0, cents(currentLimit.additionalReservedCents) - cents(input.releaseAmountCents)) }
    : currentLimit;
  const current = calculateEnterprisePrizeExposure({ challenge: input.challenge, limitData: adjustedLimit, legacyReservedCents });
  const creatorReservedCents = current.creatorReservedCents + (input.sourceType === "creator" ? cents(input.amountCents) : 0);
  const additionalReservedCents = current.additionalReservedCents + (input.sourceType === "creator" ? 0 : cents(input.amountCents));
  const nextLimit = {
    ...(adjustedLimit ?? {}),
    creatorConfirmedCents: current.creatorConfirmedCents,
    sponsorConfirmedCents: current.sponsorConfirmedCents,
    entryConfirmedCents: current.entryConfirmedCents,
    promotionalConfirmedCents: current.promotionalConfirmedCents,
    creatorReservedCents,
    additionalReservedCents,
    reservedCents: current.reservedCents + cents(input.amountCents),
  };
  const exposure = calculateEnterprisePrizeExposure({ challenge: input.challenge, limitData: nextLimit });
  transaction.set(limitRef, {
    challengeId: input.challengeId,
    organizationOwnerId: ownership.organizationOwnerId,
    ...exposure,
    maximumCents: MAXIMUM_EXPOSURE_CENTS,
    updatedAt: input.now,
  }, { merge: true });
  return exposure;
}

export async function confirmEnterprisePrizeExposureInTransaction(db: Firestore, transaction: Transaction, input: {
  challengeId: string;
  challenge: Record<string, unknown>;
  organizationOwnerId: string;
  amountCents: number;
  sourceType: "creator" | "sponsor" | "entry" | "promotional";
  now: string;
}) {
  const ownership = resolveEnterpriseFinancialOwnership(input.challenge);
  if (ownership.workspaceType !== "enterprise" || ownership.organizationOwnerId !== input.organizationOwnerId) {
    throw new Error("ENTERPRISE_FINANCE_OWNER_MISMATCH");
  }
  const limitRef = db.collection("enterprisePrizeFundingLimits").doc(input.challengeId);
  const limitSnap = await transaction.get(limitRef);
  let limitData: Record<string, unknown> | null = limitSnap.exists ? limitSnap.data() as Record<string, unknown> : null;
  if (limitSnap.exists && String(limitData?.organizationOwnerId ?? "") !== ownership.organizationOwnerId) {
    throw new Error("ENTERPRISE_FINANCE_OWNER_MISMATCH");
  }
  if (limitData && (limitData.creatorReservedCents === undefined || limitData.additionalReservedCents === undefined)) {
    limitData = { ...limitData, ...await readPendingReservationBuckets(db, transaction, input.challengeId) };
  }
  if (!limitSnap.exists) {
    const creatorPending = await transaction.get(db.collection("creatorPrizeFundingPayments").where("challengeId", "==", input.challengeId).where("status", "==", "pending").where("reservationStatus", "==", "pending_payment"));
    const sponsorPending = await transaction.get(db.collection("sponsorContributions").where("challengeId", "==", input.challengeId).where("status", "==", "pending"));
    const entryPending = await transaction.get(db.collection("challengeEntryPayments").where("challengeId", "==", input.challengeId).where("status", "==", "pending"));
    const reservedCents = creatorPending.docs.reduce((sum, item) => sum + cents(item.data().amountCents), 0)
      + sponsorPending.docs.reduce((sum, item) => sum + cents(item.data().amountCents), 0)
      + entryPending.docs.reduce((sum, item) => sum + cents(item.data().winnerShareCents), 0);
    limitData = {
      organizationOwnerId: ownership.organizationOwnerId,
      configuredPrizeCents: cents(Number(input.challenge.prizeValue ?? 0) * 100),
      confirmedCents: cents(input.challenge.confirmedCreatorPrizeFundingCents)
        + cents(input.challenge.confirmedSponsorContributionCents)
        + cents(input.challenge.confirmedEntryFeeAllocationCents)
        + cents(input.challenge.confirmedPlatformPromotionalCents),
      reservedCents,
      creatorReservedCents: creatorPending.docs.reduce((sum, item) => sum + cents(item.data().amountCents), 0),
      additionalReservedCents: sponsorPending.docs.reduce((sum, item) => sum + cents(item.data().amountCents), 0)
        + entryPending.docs.reduce((sum, item) => sum + cents(item.data().winnerShareCents), 0),
      creatorConfirmedCents: cents(input.challenge.confirmedCreatorPrizeFundingCents),
      sponsorConfirmedCents: cents(input.challenge.confirmedSponsorContributionCents),
      entryConfirmedCents: cents(input.challenge.confirmedEntryFeeAllocationCents),
      promotionalConfirmedCents: cents(input.challenge.confirmedPlatformPromotionalCents),
    };
  }
  const existing = calculateEnterprisePrizeExposure({ challenge: input.challenge, limitData, legacyReservedCents: input.amountCents });
  const sourceField = input.sourceType === "creator" ? "creatorConfirmedCents" : input.sourceType === "sponsor" ? "sponsorConfirmedCents" : input.sourceType === "entry" ? "entryConfirmedCents" : "promotionalConfirmedCents";
  const reservedField = input.sourceType === "creator" ? "creatorReservedCents" : "additionalReservedCents";
  const currentSourceConfirmed = cents(limitData?.[sourceField]) || existing[sourceField as keyof typeof existing] as number;
  const confirmedCents = cents(currentSourceConfirmed) + cents(input.amountCents);
  const reservedCents = Math.max(0, cents(limitData?.[reservedField]) - cents(input.amountCents));
  const nextLimit = { ...limitData, [sourceField]: confirmedCents, [reservedField]: reservedCents,
    confirmedCents: existing.confirmedCents + cents(input.amountCents),
    reservedCents: Math.max(0, existing.reservedCents - cents(input.amountCents)),
  };
  const exposure = calculateEnterprisePrizeExposure({ challenge: input.challenge, limitData: nextLimit });
  transaction.set(limitRef, { challengeId: input.challengeId, organizationOwnerId: ownership.organizationOwnerId, ...exposure, maximumCents: MAXIMUM_EXPOSURE_CENTS, updatedAt: input.now }, { merge: true });
  return exposure;
}

export function isEnterpriseFinanceResource(resource: Record<string, unknown>) {
  return resource.officialChallenge === true
    || ["challenge_suite_official", "enterprise_personal"].includes(String(resource.ownershipType ?? ""))
    || Boolean(resource.organizationOwnerId || resource.enterpriseOrganizationId || resource.enterpriseFinanceContextId);
}

export function organizationOwnerForFinance(resource: Record<string, unknown>) {
  const owners = [resource.organizationOwnerId, resource.enterpriseOrganizationId, resource.enterpriseFinanceContextId]
    .map((value) => String(value ?? "").trim())
    .filter((value) => value && value !== "challenge_suite");
  const distinctOwners = [...new Set(owners)];
  if (distinctOwners.length > 1) throw new Error("ENTERPRISE_FINANCE_OWNER_MISMATCH");
  return distinctOwners[0] ?? "";
}

/** Resolve the financial owner from the persisted challenge, keeping the actor separate. */
export function resolveEnterpriseFinancialOwnership(resource: Record<string, unknown>) {
  if (!isEnterpriseFinanceResource(resource)) {
    return { workspaceType: "personal" as const, organizationOwnerId: null, financialOwnerType: "user" as const };
  }
  const organizationOwnerId = organizationOwnerForFinance(resource);
  if (!organizationOwnerId) throw new Error("ENTERPRISE_ORGANIZATION_REQUIRED");
  return { workspaceType: "enterprise" as const, organizationOwnerId, financialOwnerType: "organization" as const };
}

/**
 * Persist a configured prize change against the same document funding reservations
 * use. That shared transaction key prevents prize edits racing concurrent checkouts.
 */
export async function prepareEnterprisePrizeValueUpdate(db: Firestore, transaction: Transaction, input: {
  challengeId: string;
  challenge: Record<string, unknown>;
  nextPrizeValue: unknown;
  now: string;
}) {
  if (!isEnterpriseFinanceResource(input.challenge)) return;
  const organizationId = organizationOwnerForFinance(input.challenge);
  if (!organizationId) throw new Error("ENTERPRISE_ORGANIZATION_REQUIRED");

  const limitRef = db.collection("enterprisePrizeFundingLimits").doc(input.challengeId);
  const limitSnap = await transaction.get(limitRef);
  const data = limitSnap.data() ?? {};
  let legacyReservedCents = 0;
  let legacyCreatorReservedCents = 0;
  let legacyAdditionalReservedCents = 0;
  if (!limitSnap.exists) {
    const [creatorPending, sponsorPending, entryPending] = await Promise.all([
      transaction.get(db.collection("creatorPrizeFundingPayments").where("challengeId", "==", input.challengeId).where("status", "==", "pending").where("reservationStatus", "==", "pending_payment")),
      transaction.get(db.collection("sponsorContributions").where("challengeId", "==", input.challengeId).where("status", "==", "pending")),
      transaction.get(db.collection("challengeEntryPayments").where("challengeId", "==", input.challengeId).where("status", "==", "pending")),
    ]);
    legacyReservedCents = creatorPending.docs.reduce((sum, item) => sum + cents(item.data().amountCents), 0)
      + sponsorPending.docs.reduce((sum, item) => sum + cents(item.data().amountCents), 0)
      + entryPending.docs.reduce((sum, item) => sum + cents(item.data().winnerShareCents), 0);
    legacyCreatorReservedCents = creatorPending.docs.reduce((sum, item) => sum + cents(item.data().amountCents), 0);
    legacyAdditionalReservedCents = sponsorPending.docs.reduce((sum, item) => sum + cents(item.data().amountCents), 0)
      + entryPending.docs.reduce((sum, item) => sum + cents(item.data().winnerShareCents), 0);
  }
  const configuredPrizeCents = cents(Number(input.nextPrizeValue) * 100);
  const nextLimit = { ...(limitSnap.exists ? data : {}), configuredPrizeCents };
  const currentExposure = calculateEnterprisePrizeExposure({ challenge: { ...input.challenge, prizeValue: Number(input.nextPrizeValue) }, limitData: limitSnap.exists ? nextLimit : { ...nextLimit, reservedCents: legacyReservedCents, creatorReservedCents: legacyCreatorReservedCents, additionalReservedCents: legacyAdditionalReservedCents }, legacyReservedCents });
  if (data.organizationOwnerId && data.organizationOwnerId !== organizationId) {
    throw new Error("ENTERPRISE_FINANCE_OWNER_MISMATCH");
  }
  transaction.set(limitRef, {
    challengeId: input.challengeId,
    organizationOwnerId: organizationId,
    ...currentExposure,
    maximumCents: MAXIMUM_EXPOSURE_CENTS,
    updatedAt: input.now,
  }, { merge: true });
}

/** Validate the aggregate immediately before converting a funding reservation. */
export function confirmedEnterpriseExposure(input: {
  challenge: Record<string, unknown>;
  limitData?: Record<string, unknown> | null;
  amountCents: number;
  sourceType: "creator" | "sponsor" | "entry" | "promotional";
}) {
  const current = calculateEnterprisePrizeExposure({ challenge: input.challenge, limitData: input.limitData, legacyReservedCents: input.amountCents });
  const sourceField = input.sourceType === "creator" ? "creatorConfirmedCents" : input.sourceType === "sponsor" ? "sponsorConfirmedCents" : input.sourceType === "entry" ? "entryConfirmedCents" : "promotionalConfirmedCents";
  const reservedField = input.sourceType === "creator" ? "creatorReservedCents" : "additionalReservedCents";
  const nextLimit = { ...(input.limitData ?? {}), [sourceField]: current[sourceField] + cents(input.amountCents), [reservedField]: Math.max(0, current[reservedField] - cents(input.amountCents)), confirmedCents: current.confirmedCents + cents(input.amountCents), reservedCents: Math.max(0, current.reservedCents - cents(input.amountCents)) };
  return calculateEnterprisePrizeExposure({ challenge: input.challenge, limitData: nextLimit });
}

export async function claimEnterpriseRefundLock(db: Firestore, input: {
  refundCaseId: string;
  paymentCollection: "creatorPrizeFundingPayments" | "sponsorContributions" | "challengeEntryPayments" | "paidVotePurchases";
  paymentId: string;
  now: string;
}) {
  const refundRef = db.collection("refundCases").doc(input.refundCaseId);
  const paymentRef = db.collection(input.paymentCollection).doc(input.paymentId);
  return db.runTransaction(async (transaction) => {
    const [refundSnap, paymentSnap] = await Promise.all([transaction.get(refundRef), transaction.get(paymentRef)]);
    if (!refundSnap.exists || !paymentSnap.exists) throw new Error("ENTERPRISE_REFUND_SOURCE_NOT_FOUND");
    const refund = refundSnap.data() ?? {};
    const payment = paymentSnap.data() ?? {};
    if (!["confirmed", "succeeded", "paid"].includes(String(payment.status ?? payment.paymentStatus))) {
      throw new Error("ENTERPRISE_REFUND_PAYMENT_NOT_CONFIRMED");
    }
    const challengeId = String(payment.challengeId ?? "");
    if (!challengeId) throw new Error("ENTERPRISE_REFUND_CHALLENGE_NOT_FOUND");
    const challengeRef = db.collection("challenges").doc(challengeId);
    const lockRef = db.collection("enterpriseChallengeFinanceLocks").doc(challengeId);
    const settlementQuery = db.collection("challengeSettlements").where("challengeId", "==", challengeId).limit(1);
    const [challengeSnap, lockSnap, settlementSnap] = await Promise.all([
      transaction.get(challengeRef), transaction.get(lockRef), transaction.get(settlementQuery),
    ]);
    if (!challengeSnap.exists) throw new Error("ENTERPRISE_REFUND_CHALLENGE_NOT_FOUND");
    const ownership = resolveEnterpriseFinancialOwnership(challengeSnap.data() ?? {});
    if (ownership.workspaceType !== "enterprise" || String(payment.organizationOwnerId ?? "") !== ownership.organizationOwnerId) {
      throw new Error("ENTERPRISE_FINANCE_OWNER_MISMATCH");
    }
    if (!["approved", "processing"].includes(String(refund.status))) throw new Error("ENTERPRISE_REFUND_STATE_CHANGED");
    if (cents(refund.amountCents) !== cents(payment.amountCents)) throw new Error("ENTERPRISE_REFUND_AMOUNT_MISMATCH");
    const lock = lockSnap.data() ?? {};
    if (!settlementSnap.empty || ["settlement_prepared", "settled"].includes(String(lock.status))) {
      throw new Error("ENTERPRISE_REFUND_SETTLEMENT_LOCKED");
    }
    if (lock.status === "refund_pending" && lock.refundCaseId !== input.refundCaseId) {
      throw new Error("ENTERPRISE_REFUND_ALREADY_PENDING");
    }
    transaction.set(lockRef, {
      challengeId,
      organizationOwnerId: ownership.organizationOwnerId,
      status: "refund_pending",
      refundCaseId: input.refundCaseId,
      updatedAt: input.now,
    }, { merge: true });
    transaction.set(refundRef, { status: "processing", providerExecutionStartedAt: input.now, updatedAt: input.now }, { merge: true });
    return { challengeId, organizationOwnerId: ownership.organizationOwnerId, idempotent: lock.status === "refund_pending" };
  });
}

export async function releaseEnterpriseRefundLock(db: Firestore, input: {
  refundCaseId: string;
  challengeId: string;
  refundStatus: "approved" | "failed";
  providerStatus?: string;
  now: string;
}) {
  const lockRef = db.collection("enterpriseChallengeFinanceLocks").doc(input.challengeId);
  const refundRef = db.collection("refundCases").doc(input.refundCaseId);
  return db.runTransaction(async (transaction) => {
    const [lockSnap, refundSnap] = await Promise.all([transaction.get(lockRef), transaction.get(refundRef)]);
    if (!refundSnap.exists) throw new Error("ENTERPRISE_REFUND_SOURCE_NOT_FOUND");
    if (refundSnap.data()?.status === "succeeded") return { released: false, stale: true };
    const lock = lockSnap.data() ?? {};
    if (lock.status === "refund_pending" && lock.refundCaseId === input.refundCaseId) {
      transaction.set(lockRef, { status: "open", refundCaseId: null, updatedAt: input.now, lastRefundStatus: input.refundStatus }, { merge: true });
    }
    transaction.set(refundRef, { status: input.refundStatus, providerStatus: input.providerStatus ?? null, updatedAt: input.now }, { merge: true });
    return { released: lock.status === "refund_pending" && lock.refundCaseId === input.refundCaseId };
  });
}

export async function reserveEnterpriseSettlementLockInTransaction(db: Firestore, transaction: Transaction, input: {
  challengeId: string;
  organizationOwnerId: string;
  settlementId: string;
  now: string;
}) {
  const lockRef = db.collection("enterpriseChallengeFinanceLocks").doc(input.challengeId);
  const lockSnap = await transaction.get(lockRef);
  const lock = lockSnap.data() ?? {};
  if (lock.status === "refund_pending") throw new Error("ENTERPRISE_REFUND_PENDING");
  if (["settlement_prepared", "settled"].includes(String(lock.status)) && lock.settlementId !== input.settlementId) {
    throw new Error("ENTERPRISE_SETTLEMENT_LOCKED");
  }
  transaction.set(lockRef, {
    challengeId: input.challengeId,
    organizationOwnerId: input.organizationOwnerId,
    status: "settlement_prepared",
    settlementId: input.settlementId,
    updatedAt: input.now,
  }, { merge: true });
}

export async function applyEnterprisePromotionalPrizeFundingInTransaction(db: Firestore, transaction: Transaction, input: {
  challengeId: string;
  fundingId: string;
  amountCents: number;
  adminId: string;
  idempotencyKey: string;
  reason: string;
  now: string;
}) {
  const fundingRef = db.collection("enterprisePromotionalPrizeFunding").doc(input.fundingId);
  const challengeRef = db.collection("challenges").doc(input.challengeId);
  const poolRef = db.collection("prizePools").doc(input.challengeId);
  const fundingSnap = await transaction.get(fundingRef);
  if (fundingSnap.exists) {
    const prior = fundingSnap.data() ?? {};
    if (prior.challengeId !== input.challengeId || cents(prior.amountCents) !== cents(input.amountCents) || prior.idempotencyKey !== input.idempotencyKey) {
      throw new Error("ENTERPRISE_PROMOTIONAL_FUNDING_IDEMPOTENCY_CONFLICT");
    }
    return { idempotent: true, record: prior };
  }
  const [challengeSnap, poolSnap] = await Promise.all([transaction.get(challengeRef), transaction.get(poolRef)]);
  if (!challengeSnap.exists) throw new Error("CHALLENGE_NOT_FOUND");
  const challenge = challengeSnap.data() ?? {};
  const ownership = resolveEnterpriseFinancialOwnership(challenge);
  const amountCents = cents(input.amountCents);
  if (ownership.workspaceType !== "enterprise" || amountCents <= 0) throw new Error("ENTERPRISE_PROMOTIONAL_FUNDING_INVALID");
  const reserved = await reserveEnterprisePrizeExposureInTransaction(db, transaction, {
    challengeId: input.challengeId,
    challenge,
    organizationOwnerId: ownership.organizationOwnerId,
    amountCents,
    sourceType: "promotional",
    now: input.now,
  });
  const confirmedCents = reserved.confirmedCents + amountCents;
  const reservedCents = Math.max(0, reserved.reservedCents - amountCents);
  const additionalReservedCents = Math.max(0, reserved.additionalReservedCents - amountCents);
  const promotionalConfirmedCents = reserved.promotionalConfirmedCents + amountCents;
  const exposureCents = Math.max(reserved.configuredPrizeCents, reserved.creatorConfirmedCents + reserved.creatorReservedCents)
    + reserved.sponsorConfirmedCents + reserved.entryConfirmedCents + promotionalConfirmedCents + additionalReservedCents;
  const pool = poolSnap.data() ?? {};
  const record = {
    id: input.fundingId,
    challengeId: input.challengeId,
    organizationOwnerId: ownership.organizationOwnerId,
    amountCents,
    currency: "USD",
    sourceType: "admin_promotional_prize_funding",
    status: "confirmed",
    adminId: input.adminId,
    idempotencyKey: input.idempotencyKey,
    reason: input.reason,
    createdAt: input.now,
    updatedAt: input.now,
  };
  transaction.create(fundingRef, record);
  transaction.set(db.collection("enterprisePrizeFundingLimits").doc(input.challengeId), {
    challengeId: input.challengeId,
    organizationOwnerId: ownership.organizationOwnerId,
    configuredPrizeCents: reserved.configuredPrizeCents,
    confirmedCents,
    reservedCents,
    exposureCents,
    maximumCents: MAXIMUM_EXPOSURE_CENTS,
    updatedAt: input.now,
  }, { merge: true });
  transaction.set(challengeRef, {
    confirmedPlatformPromotionalCents: cents(challenge.confirmedPlatformPromotionalCents) + amountCents,
    updatedAt: input.now,
  }, { merge: true });
  transaction.set(poolRef, {
    confirmedPlatformPromotionalCents: FieldValue.increment(amountCents),
    totalConfirmedCents: FieldValue.increment(amountCents),
    totalCommittedCents: FieldValue.increment(amountCents),
    visibleJackpotCents: FieldValue.increment(amountCents),
    status: "platform_promotional_funded",
    fundingStatus: "platform_promotional_funded",
    updatedAt: input.now,
  }, { merge: true });
  transaction.create(db.collection("platformLedger").doc(input.fundingId), {
    id: input.fundingId,
    challengeId: input.challengeId,
    organizationOwnerId: ownership.organizationOwnerId,
    actorAdminId: input.adminId,
    sourceType: "admin_promotional_prize_funding",
    sourceId: input.fundingId,
    amountCents,
    currency: "USD",
    direction: "debit",
    status: "recorded",
    idempotencyKey: input.idempotencyKey,
    externalPayoutExecuted: false,
    reason: input.reason,
    createdAt: input.now,
    updatedAt: input.now,
  });
  transaction.set(db.collection("enterprisePrizeFundingLimits").doc(input.challengeId), {
    confirmedCents,
    reservedCents,
    additionalReservedCents,
    promotionalConfirmedCents,
    exposureCents,
    updatedAt: input.now,
  }, { merge: true });
  return { idempotent: false, record };
}

export async function getConfirmedEnterprisePromotionalPrizeFunding(db: Firestore, challengeId: string) {
  const snap = await db.collection("enterprisePromotionalPrizeFunding").where("challengeId", "==", challengeId).get();
  const records = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown> & { id: string }))
    .filter((record) => record.status === "confirmed");
  return {
    grossAmountCents: records.reduce((sum, record) => sum + cents(record.amountCents), 0),
    recordCount: records.length,
    records,
    confirmedOnly: true,
  };
}

/** Apply a provider-confirmed full refund to the same organization exposure ledger. */
export async function finalizeEnterprisePrizeFundingRefund(db: Firestore, input: {
  refundCaseId: string;
  paymentCollection: "creatorPrizeFundingPayments" | "sponsorContributions" | "challengeEntryPayments";
  paymentId: string;
  providerRefundId: string;
  now: string;
}) {
  const refundRef = db.collection("refundCases").doc(input.refundCaseId);
  const paymentRef = db.collection(input.paymentCollection).doc(input.paymentId);
  return db.runTransaction(async (transaction) => {
    const [refundSnap, paymentSnap] = await Promise.all([transaction.get(refundRef), transaction.get(paymentRef)]);
    if (!refundSnap.exists || !paymentSnap.exists) throw new Error("ENTERPRISE_REFUND_SOURCE_NOT_FOUND");
    const refund = refundSnap.data() ?? {};
    const payment = paymentSnap.data() ?? {};
    if (refund.status === "succeeded" && payment.status === "refunded") return { idempotent: true };
    if (!["approved", "processing"].includes(String(refund.status)) || !["confirmed", "succeeded", "paid"].includes(String(payment.status))) {
      throw new Error("ENTERPRISE_REFUND_STATE_CHANGED");
    }
    const challengeId = String(payment.challengeId ?? "");
    const challengeRef = db.collection("challenges").doc(challengeId);
    const lockRef = db.collection("enterpriseChallengeFinanceLocks").doc(challengeId);
    const [challengeSnap, lockSnap] = await Promise.all([transaction.get(challengeRef), transaction.get(lockRef)]);
    if (!challengeSnap.exists) throw new Error("ENTERPRISE_REFUND_CHALLENGE_NOT_FOUND");
    const challenge = challengeSnap.data() ?? {};
    const ownership = resolveEnterpriseFinancialOwnership(challenge);
    if (ownership.workspaceType !== "enterprise" || String(payment.organizationOwnerId ?? "") !== ownership.organizationOwnerId) {
      throw new Error("ENTERPRISE_FINANCE_OWNER_MISMATCH");
    }
    const lock = lockSnap.data() ?? {};
    if (lock.status !== "refund_pending" || lock.refundCaseId !== input.refundCaseId) throw new Error("ENTERPRISE_REFUND_LOCK_LOST");
    const refundedGrossCents = cents(payment.amountCents ?? refund.amountCents);
    if (refundedGrossCents <= 0 || refundedGrossCents !== cents(refund.amountCents)) throw new Error("ENTERPRISE_REFUND_AMOUNT_MISMATCH");
    const amountCents = input.paymentCollection === "challengeEntryPayments" ? cents(payment.winnerShareCents) : refundedGrossCents;
    if (amountCents <= 0) throw new Error("ENTERPRISE_REFUND_HAS_NO_PRIZE_POOL_ALLOCATION");
    const limitRef = db.collection("enterprisePrizeFundingLimits").doc(challengeId);
    const poolRef = db.collection("prizePools").doc(challengeId);
    const ledgerId = `enterprise_refund_${input.refundCaseId}`;
    const ledgerRef = db.collection("challengeFinancialLedger").doc(ledgerId);
    const cashLedgerRef = db.collection("cashLedger").doc(`refund_${input.refundCaseId}`);
    const sourceLedgerQuery = input.paymentCollection === "challengeEntryPayments"
      ? db.collection("challengeFinancialLedger").where("entryPaymentId", "==", input.paymentId)
      : input.paymentCollection === "sponsorContributions"
        ? db.collection("challengeFinancialLedger").where("sponsorContributionId", "==", input.paymentId)
        : db.collection("challengeFinancialLedger").where("transactionId", "==", input.paymentId);
    const [limitSnap, poolSnap, sourceLedgers] = await Promise.all([transaction.get(limitRef), transaction.get(poolRef), transaction.get(sourceLedgerQuery)]);
    const limit = limitSnap.data() ?? {};
    if (String(limit.organizationOwnerId ?? ownership.organizationOwnerId) !== ownership.organizationOwnerId) {
      throw new Error("ENTERPRISE_FINANCE_OWNER_MISMATCH");
    }
    const nextConfirmed = Math.max(0, cents(limit.confirmedCents) - amountCents);
    const nextReserved = cents(limit.reservedCents);
    const configured = Math.max(cents(limit.configuredPrizeCents), cents(Number(challenge.prizeValue ?? 0) * 100));
    const sourceConfirmedField = input.paymentCollection === "creatorPrizeFundingPayments" ? "creatorConfirmedCents"
      : input.paymentCollection === "sponsorContributions" ? "sponsorConfirmedCents" : "entryConfirmedCents";
    const sourceConfirmedCents = Math.max(0, cents(limit[sourceConfirmedField]) - amountCents);
    const nextCreatorConfirmed = input.paymentCollection === "creatorPrizeFundingPayments" ? sourceConfirmedCents : cents(limit.creatorConfirmedCents);
    const nextSponsorConfirmed = input.paymentCollection === "sponsorContributions" ? sourceConfirmedCents : cents(limit.sponsorConfirmedCents);
    const nextEntryConfirmed = input.paymentCollection === "challengeEntryPayments" ? sourceConfirmedCents : cents(limit.entryConfirmedCents);
    const exposureCents = Math.max(configured, nextCreatorConfirmed + cents(limit.creatorReservedCents))
      + nextSponsorConfirmed + nextEntryConfirmed + cents(limit.promotionalConfirmedCents) + cents(limit.additionalReservedCents);
    const challengeField = input.paymentCollection === "creatorPrizeFundingPayments"
      ? "confirmedCreatorPrizeFundingCents"
      : input.paymentCollection === "sponsorContributions" ? "confirmedSponsorContributionCents" : "confirmedEntryFeeAllocationCents";
    const poolField = input.paymentCollection === "creatorPrizeFundingPayments"
      ? "confirmedCreatorFundingCents"
      : input.paymentCollection === "sponsorContributions" ? "confirmedSponsorContributionCents" : "confirmedEntryFeeAllocationCents";
    transaction.set(refundRef, { status: "succeeded", providerRefundId: input.providerRefundId, providerStatus: "succeeded", updatedAt: input.now }, { merge: true });
    transaction.set(lockRef, { status: "open", refundCaseId: null, lastRefundCaseId: input.refundCaseId, lastRefundStatus: "succeeded", updatedAt: input.now }, { merge: true });
    transaction.set(paymentRef, { status: "refunded", refundCaseId: input.refundCaseId, providerRefundId: input.providerRefundId, refundedAt: input.now, updatedAt: input.now }, { merge: true });
    transaction.set(limitRef, { organizationOwnerId: ownership.organizationOwnerId, [sourceConfirmedField]: sourceConfirmedCents, confirmedCents: nextConfirmed, reservedCents: nextReserved, configuredPrizeCents: configured, exposureCents, maximumCents: MAXIMUM_EXPOSURE_CENTS, updatedAt: input.now }, { merge: true });
    const challengeRefundPatch: Record<string, unknown> = {
      [challengeField]: Math.max(0, cents(challenge[challengeField]) - amountCents),
      updatedAt: input.now,
    };
    if (input.paymentCollection === "creatorPrizeFundingPayments") {
      const monetization = typeof challenge.monetization === "object" && challenge.monetization ? challenge.monetization as Record<string, unknown> : {};
      challengeRefundPatch["monetization.confirmedCreatorPrizeFundingCents"] = Math.max(0, cents(monetization.confirmedCreatorPrizeFundingCents) - amountCents);
      challengeRefundPatch["monetization.creatorPrizeFundingStatus"] = "refunded";
    } else if (input.paymentCollection === "sponsorContributions") {
      challengeRefundPatch.confirmedSponsorContributionWinnerShareCents = Math.max(0, cents(challenge.confirmedSponsorContributionWinnerShareCents) - amountCents);
    } else {
      challengeRefundPatch.pendingEntryFeeRevenueGrossCents = Math.max(0, cents(challenge.pendingEntryFeeRevenueGrossCents) - refundedGrossCents);
      challengeRefundPatch.pendingEntryFeePlatformFeeCents = Math.max(0, cents(challenge.pendingEntryFeePlatformFeeCents) - cents(payment.platformFeeCents));
      challengeRefundPatch.pendingEntryFeeWinnerShareCents = Math.max(0, cents(challenge.pendingEntryFeeWinnerShareCents) - amountCents);
      challengeRefundPatch.pendingEntryFeeCreatorShareCents = Math.max(0, cents(challenge.pendingEntryFeeCreatorShareCents) - cents(payment.creatorHostOperatorShareCents));
      challengeRefundPatch.pendingEntryFeeNetCents = Math.max(0, cents(challenge.pendingEntryFeeNetCents) - cents(payment.amountNetCents));
      challengeRefundPatch.paidEntryConfirmedCount = Math.max(0, cents(challenge.paidEntryConfirmedCount) - 1);
    }
    transaction.set(challengeRef, challengeRefundPatch, { merge: true });
    for (const sourceLedger of sourceLedgers.docs) transaction.set(sourceLedger.ref, {
      status: "refunded",
      refundCaseId: input.refundCaseId,
      providerRefundId: input.providerRefundId,
      reversedAt: input.now,
      updatedAt: input.now,
    }, { merge: true });
    const pool = poolSnap.data() ?? {};
    transaction.set(poolRef, {
      [poolField]: Math.max(0, cents(pool[poolField]) - amountCents),
      totalConfirmedCents: Math.max(0, cents(pool.totalConfirmedCents) - amountCents),
      totalCommittedCents: Math.max(0, cents(pool.totalCommittedCents) - amountCents),
      visibleJackpotCents: Math.max(0, cents(pool.visibleJackpotCents) - amountCents),
      fundingStatus: "refunded",
      status: "refunded",
      updatedAt: input.now,
    }, { merge: true });
    transaction.set(ledgerRef, {
      id: ledgerId,
      challengeId,
      organizationOwnerId: ownership.organizationOwnerId,
      transactionId: input.paymentId,
      sourceType: "enterprise_prize_funding_refund",
      sourceResource: `${input.paymentCollection}/${input.paymentId}`,
      amountCents,
      direction: "debit",
      status: "confirmed",
      providerRefundId: input.providerRefundId,
      idempotencyKey: ledgerId,
      payoutExecutionEnabled: false,
      refundExecutionEnabled: false,
      createdAt: input.now,
      updatedAt: input.now,
    }, { merge: true });
    transaction.set(cashLedgerRef, {
      id: `refund_${input.refundCaseId}`,
      transactionType: "refund",
      sourceType: "refund",
      sourceId: input.refundCaseId,
      challengeId,
      organizationOwnerId: ownership.organizationOwnerId,
      amountCents: refundedGrossCents,
      currency: String(payment.currency ?? refund.currency ?? "USD"),
      direction: "debit",
      status: "posted",
      immutable: true,
      providerReference: input.providerRefundId,
      idempotencyKey: `refund_${input.refundCaseId}`,
      createdAt: input.now,
      updatedAt: input.now,
    }, { merge: true });
    return { idempotent: false, challengeId, organizationOwnerId: ownership.organizationOwnerId, amountCents };
  });
}

/** Reverse an Enterprise paid-vote revenue payment without touching prize-pool exposure. */
export async function finalizeEnterprisePaidVoteRefund(db: Firestore, input: {
  refundCaseId: string;
  paymentId: string;
  providerRefundId: string;
  now: string;
}) {
  const refundRef = db.collection("refundCases").doc(input.refundCaseId);
  const paymentRef = db.collection("paidVotePurchases").doc(input.paymentId);
  return db.runTransaction(async (transaction) => {
    const [refundSnap, paymentSnap] = await Promise.all([transaction.get(refundRef), transaction.get(paymentRef)]);
    if (!refundSnap.exists || !paymentSnap.exists) throw new Error("ENTERPRISE_REFUND_SOURCE_NOT_FOUND");
    const refund = refundSnap.data() ?? {};
    const payment = paymentSnap.data() ?? {};
    if (refund.status === "succeeded" && payment.status === "refunded") return { idempotent: true };
    if (!(["approved", "processing"].includes(String(refund.status))) || payment.status !== "confirmed") throw new Error("ENTERPRISE_REFUND_STATE_CHANGED");
    const challengeId = String(payment.challengeId ?? "");
    const challengeRef = db.collection("challenges").doc(challengeId);
    const lockRef = db.collection("enterpriseChallengeFinanceLocks").doc(challengeId);
    const ledgerQuery = db.collection("challengeFinancialLedger").where("paidVotePurchaseId", "==", input.paymentId);
    const creditsQuery = db.collection("paidVoteCredits").where("purchaseId", "==", input.paymentId);
    const [challengeSnap, lockSnap, ledgerSnap, creditsSnap] = await Promise.all([transaction.get(challengeRef), transaction.get(lockRef), transaction.get(ledgerQuery), transaction.get(creditsQuery)]);
    if (!challengeSnap.exists) throw new Error("ENTERPRISE_REFUND_CHALLENGE_NOT_FOUND");
    const challenge = challengeSnap.data() ?? {};
    const ownership = resolveEnterpriseFinancialOwnership(challenge);
    if (ownership.workspaceType !== "enterprise" || String(payment.organizationOwnerId ?? "") !== ownership.organizationOwnerId) throw new Error("ENTERPRISE_FINANCE_OWNER_MISMATCH");
    const lock = lockSnap.data() ?? {};
    if (lock.status !== "refund_pending" || lock.refundCaseId !== input.refundCaseId) throw new Error("ENTERPRISE_REFUND_LOCK_LOST");
    const amountCents = cents(payment.amountCents);
    if (amountCents <= 0 || amountCents !== cents(refund.amountCents)) throw new Error("ENTERPRISE_REFUND_AMOUNT_MISMATCH");
    transaction.set(refundRef, { status: "succeeded", providerRefundId: input.providerRefundId, providerStatus: "succeeded", updatedAt: input.now }, { merge: true });
    transaction.set(paymentRef, { status: "refunded", refundCaseId: input.refundCaseId, providerRefundId: input.providerRefundId, refundedAt: input.now, updatedAt: input.now }, { merge: true });
    transaction.set(lockRef, { status: "open", refundCaseId: null, lastRefundCaseId: input.refundCaseId, lastRefundStatus: "succeeded", updatedAt: input.now }, { merge: true });
    const winnerShareCents = cents(payment.winnerShareCents);
    const creatorShareCents = cents(payment.creatorHostOperatorShareCents);
    const platformShareCents = cents(payment.platformFeeCents);
    if (winnerShareCents + creatorShareCents + platformShareCents !== amountCents) throw new Error("ENTERPRISE_PAID_VOTE_REVENUE_SPLIT_MISMATCH");
    transaction.set(challengeRef, {
      confirmedPaidVoteGrossCents: Math.max(0, cents(challenge.confirmedPaidVoteGrossCents) - amountCents),
      confirmedPaidVoteWinnerShareCents: Math.max(0, cents(challenge.confirmedPaidVoteWinnerShareCents) - winnerShareCents),
      confirmedPaidVoteCreatorHostOperatorShareCents: Math.max(0, cents(challenge.confirmedPaidVoteCreatorHostOperatorShareCents) - creatorShareCents),
      confirmedPaidVotePlatformAdminShareCents: Math.max(0, cents(challenge.confirmedPaidVotePlatformAdminShareCents) - platformShareCents),
      updatedAt: input.now,
    }, { merge: true });
    for (const ledger of ledgerSnap.docs) transaction.set(ledger.ref, { status: "refunded", refundCaseId: input.refundCaseId, providerRefundId: input.providerRefundId, reversedAt: input.now, updatedAt: input.now }, { merge: true });
    for (const credit of creditsSnap.docs) transaction.set(credit.ref, { status: "refunded", votesRemaining: 0, votesGranted: 0, refundCaseId: input.refundCaseId, refundedAt: input.now, updatedAt: input.now }, { merge: true });
    transaction.set(db.collection("cashLedger").doc(`refund_${input.refundCaseId}`), {
      id: `refund_${input.refundCaseId}`,
      transactionType: "refund",
      sourceType: "refund",
      sourceId: input.refundCaseId,
      challengeId,
      organizationOwnerId: ownership.organizationOwnerId,
      amountCents,
      currency: payment.currency ?? "USD",
      direction: "debit",
      status: "posted",
      immutable: true,
      providerReference: input.providerRefundId,
      idempotencyKey: `refund_${input.refundCaseId}`,
      createdAt: input.now,
      updatedAt: input.now,
    }, { merge: true });
    return { idempotent: false, challengeId, organizationOwnerId: ownership.organizationOwnerId, amountCents };
  });
}
