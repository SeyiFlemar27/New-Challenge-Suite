import { getAdminDb } from "@/lib/firebase/admin";
import { getEffectiveTier } from "@/lib/plan-access";
import { writeAuditLog } from "@/lib/server/audit";
import { buildChallengeApprovalUpdate, buildChallengeRejectionUpdate } from "@/lib/server/challenge-lifecycle";
import { requireAdminPermission, requireRecentAdminAuthentication } from "@/lib/server/auth";
import { hasAdminPermission, type AdminPermission } from "@/lib/server/admin-permissions";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { createNotification } from "@/lib/server/notifications";
import { ENTERPRISE_APPLICATION_COLLECTION, ENTERPRISE_APPLICATION_REVISION_COLLECTION, ENTERPRISE_APPLICATION_TYPE, enterpriseApplicationRevisionId, enterpriseApplicationVersion } from "@/lib/server/enterprise-applications";
import { isEnterpriseRole, isEnterpriseScope, rolePermissions } from "@/lib/enterprise-access";

export const dynamic = "force-dynamic";

type RecordData = Record<string, unknown> & { id: string };

function records(snapshot: FirebaseFirestore.QuerySnapshot) {
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as RecordData));
}

function safeUser(record: RecordData, doroBalance = 0, cashBalanceCents = 0) {
  const tier = getEffectiveTier(record);
  return {
    id: record.id,
    displayName: record.displayName ?? record.name ?? "",
    email: record.email ?? "",
    accountType: record.accountType ?? record.role ?? "user",
    effectiveTier: tier.displayName,
    planId: record.planId ?? record.subscriptionPlan ?? "free",
    subscriptionStatus: record.subscriptionStatus ?? record.planStatus ?? "none",
    sponsorStatus: record.sponsorVerificationStatus ?? "not_submitted",
    hostStatus: record.hostVerificationStatus ?? "not_submitted",
    doroCoinBalance: doroBalance,
    cashBalanceCents,
    riskStatus: record.riskStatus ?? "clear",
    isAdmin: Boolean(record.isAdmin || record.role === "admin"),
    suspended: Boolean(record.suspended),
    createdAt: record.createdAt ?? null,
    lastActivityAt: record.lastActivityAt ?? record.updatedAt ?? null
  };
}

export async function GET(request: Request) {
  const { user, response } = await requireAdminPermission(request, "admin.dashboard.view");
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin operations");
  try {
    const snapshots = await Promise.all([
      db.collection("sponsorProfiles").limit(150).get(),
      db.collection("users").limit(250).get(),
      db.collection("challenges").limit(200).get(),
      db.collection("submissions").limit(250).get(),
      db.collection("challengeParticipants").limit(250).get(),
      db.collection("winners").limit(150).get(),
      db.collection("withdrawalRequests").limit(150).get(),
      db.collection("auditLogs").limit(200).get(),
      db.collection("disputes").limit(100).get(),
      db.collection("prizePools").limit(150).get(),
      db.collection("adminNotes").limit(250).get(),
      db.collection("doroCoinWallets").limit(250).get(),
      db.collection("doroCoinTransactions").limit(300).get(),
      db.collection("cashWallets").limit(250).get(),
      db.collection("cashLedger").limit(300).get(),
      db.collection("liveEvents").limit(200).get(),
      db.collection("tournaments").limit(200).get(),
      db.collection("notifications").limit(200).get(),
      db.collection("supportTickets").limit(200).get(),
      db.collection("announcements").limit(100).get(),
      db.collection("predictionRecords").limit(200).get(),
      db.collection("rewardSpinHistory").limit(200).get(),
      db.collection("rewardWheelPrizes").limit(200).get(),
      db.collection("kycMetadata").limit(200).get(),
      db.collection("predictionSettlementReviews").limit(200).get(),
      db.collection("adVoteRewardLogs").limit(200).get(),
      db.collection(ENTERPRISE_APPLICATION_COLLECTION).limit(200).get(),
      db.collection("mediaUploads").limit(200).get()
    ]);
    const [sponsorSnap, userSnap, challengeSnap, submissionSnap, participantSnap, winnerSnap, withdrawalSnap, auditSnap, disputeSnap, prizePoolSnap, adminNoteSnap, doroWalletSnap, doroTransactionSnap, cashWalletSnap, cashLedgerSnap, liveEventSnap, tournamentSnap, notificationSnap, supportSnap, announcementSnap, predictionSnap, rewardSpinSnap, prizeWheelSnap, kycSnap, predictionSettlementSnap, adRewardSnap, enterpriseLeadSnap, mediaUploadSnap] = snapshots;
    const notes = new Map(records(adminNoteSnap).map((item) => [`${item.targetType}_${item.targetId}`, item]));
    const users = records(userSnap);
    const userMap = new Map(users.map((item) => [item.id, item]));
    const doroWallets = records(doroWalletSnap);
    const cashWallets = records(cashWalletSnap);
    const doroMap = new Map(doroWallets.map((item) => [String(item.userId ?? item.id), Number(item.balance ?? 0)]));
    const cashMap = new Map(cashWallets.map((item) => [String(item.userId ?? item.id), item]));
    const hosts = users.filter((item) => item.accountType === "host" || item.role === "host" || item.planId === "host");
    const sponsors = records(sponsorSnap).map((item) => ({
      id: item.id,
      brandName: item.brandName ?? item.displayName ?? "Sponsor",
      industry: item.industry ?? "",
      website: item.website ?? "",
      contactEmail: item.contactEmail ?? "",
      contactPerson: item.contactPerson ?? item.contactName ?? "",
      status: item.sponsorVerificationStatus ?? "not_submitted",
      subscriptionStatus: item.subscriptionStatus ?? "none",
      createdAt: item.createdAt ?? null,
      riskFlags: item.riskFlags ?? [],
      adminNotesCount: notes.has(`sponsor_${item.id}`) ? 1 : 0,
      adminNote: notes.get(`sponsor_${item.id}`)?.note ?? null,
      updatedAt: item.updatedAt ?? null
    }));
    const challenges = records(challengeSnap).map((item) => ({
      id: item.id,
      title: item.title ?? "Challenge",
      creatorId: item.creatorId ?? null,
      creatorName: item.creatorName ?? "",
      category: item.category ?? "",
      visibility: item.visibility ?? item.visibilityMode ?? "public",
      status: item.status ?? "draft",
      prizeType: item.prizeType ?? "none",
      sponsorReady: Boolean(item.sponsorEnabled || item.sponsorReady),
      votingStartsAt: item.votingStartsAt ?? null,
      votingEndsAt: item.votingEndsAt ?? null,
      entryDeadline: item.entryDeadline ?? null,
      riskFlags: item.riskFlags ?? [],
      submissionCount: Number(item.submissionCount ?? 0),
      voteCount: Number(item.voteCount ?? item.totalVotes ?? 0),
      adminNote: notes.get(`challenge_${item.id}`)?.note ?? null
    }));
    const submissions = records(submissionSnap).map((item) => ({
      id: item.id,
      challengeId: item.challengeId ?? null,
      userId: item.userId ?? null,
      title: item.title ?? "Submission",
      participantName: item.participantName ?? item.creatorName ?? "",
      challengeTitle: item.challengeTitle ?? "",
      creatorName: item.hostName ?? item.challengeCreatorName ?? "",
      format: item.submissionType ?? item.mediaType ?? "unknown",
      riskFlags: item.riskFlags ?? [],
      mediaUrl: item.mediaUrl ?? item.imageUrl ?? null,
      status: item.status ?? "pending_review",
      internalNote: notes.get(`submission_${item.id}`)?.note ?? null,
      createdAt: item.createdAt ?? null
    }));
    const participants = records(participantSnap).map((item) => ({
      id: item.id,
      challengeId: item.challengeId ?? null,
      userId: item.userId ?? null,
      displayName: item.displayName ?? item.username ?? "Participant",
      email: item.email ?? "",
      status: item.status ?? "pending",
      submissionStatus: item.submissionStatus ?? "not_submitted",
      joinedAt: item.joinedAt ?? item.createdAt ?? null,
      votes: Number(item.votes ?? item.voteCount ?? 0),
      riskFlags: item.riskFlags ?? [],
      adminNote: notes.get(`participant_${item.id}`)?.note ?? null
    }));
    const winners = records(winnerSnap).map((item) => ({
      id: item.id,
      challengeId: item.challengeId ?? null,
      challengeTitle: item.challengeTitle ?? "Challenge",
      userId: item.userId ?? item.winnerId ?? null,
      displayName: item.displayName ?? item.winnerName ?? "Winner",
      voteCount: Number(item.voteCount ?? item.votes ?? 0),
      hostConfirmationStatus: item.hostConfirmationStatus ?? "pending",
      status: item.adminReviewStatus ?? item.status ?? "pending_admin_review",
      flagWarnings: item.flagWarnings ?? [],
      disqualificationNotes: item.disqualificationNotes ?? null
    }));
    const withdrawals = records(withdrawalSnap).map((item) => {
      const account = userMap.get(String(item.userId ?? ""));
      const wallet = cashMap.get(String(item.userId ?? ""));
      return {
      id: item.id,
      userId: item.userId ?? null,
      userName: account?.displayName ?? account?.name ?? "User",
      accountType: account?.accountType ?? account?.role ?? "user",
      amountCents: Number(item.amountCents ?? 0),
      currency: item.currency ?? "USD",
      sourceType: item.sourceType ?? "eligible_earnings",
      payoutMethodLabel: item.payoutMethodLabel ?? "Masked payout method",
      status: item.status ?? "pending_review",
      kycStatus: item.kycStatus ?? "not_started",
      riskStatus: item.riskStatus ?? "pending_review",
      availableBalanceCents: Number(wallet?.availableBalanceCents ?? 0),
      underReviewBalanceCents: Number(wallet?.underReviewBalanceCents ?? wallet?.lockedBalanceCents ?? 0),
      createdAt: item.createdAt ?? null,
      transferEnabled: false,
      payoutExecuted: false
    }; });
    const auditLogs = records(auditSnap)
      .map((item) => {
        const actor = userMap.get(String(item.actorId ?? ""));
        return { id: item.id, actorId: item.actorId ?? "", actorName: actor?.displayName ?? actor?.name ?? "Administrator", actorEmail: actor?.email ?? "", action: item.action ?? "", targetType: item.targetType ?? "", targetId: item.targetId ?? "", reason: item.reason ?? null, note: (item.metadata as Record<string, unknown> | undefined)?.note ?? null, previousStatus: (item.before as Record<string, unknown> | undefined)?.status ?? null, newStatus: (item.after as Record<string, unknown> | undefined)?.status ?? null, createdAt: item.createdAt ?? null };
      })
      .sort((a, b) => Date.parse(String(b.createdAt ?? "")) - Date.parse(String(a.createdAt ?? "")));
    const disputes = records(disputeSnap).map((item) => ({ id: item.id, type: item.type ?? item.targetType ?? "other", userId: item.userId ?? null, targetId: item.targetId ?? null, status: item.status ?? "open", reason: item.reason ?? "", createdAt: item.createdAt ?? null }));
    const doroCoin = {
      wallets: doroWallets.map((item) => ({ id: item.id, userId: item.userId ?? item.id, balance: Number(item.balance ?? 0), lockedBalance: Number(item.lockedBalance ?? 0), updatedAt: item.updatedAt ?? null })),
      transactions: records(doroTransactionSnap).map((item) => ({ id: item.id, userId: item.userId ?? null, type: item.type ?? "unknown", amount: Number(item.amount ?? 0), status: item.status ?? "recorded", createdAt: item.createdAt ?? null })),
      conversionEnabled: false,
      adjustmentsEnabled: false
    };
    const cashLedger = records(cashLedgerSnap).map((item) => ({ id: item.id, userId: item.userId ?? null, type: item.type ?? "unknown", sourceType: item.sourceType ?? "", sourceId: item.sourceId ?? "", amountCents: Number(item.amountCents ?? 0), currency: item.currency ?? "USD", direction: item.direction ?? "", status: item.status ?? "recorded", createdAt: item.createdAt ?? null, transferEnabled: false }));
    const events = records(liveEventSnap).map((item) => ({ id: item.id, title: item.title ?? "Live event", hostId: item.hostId ?? item.creatorId ?? null, startsAt: item.startsAt ?? null, status: item.status ?? "draft", registrationCount: Number(item.registrationCount ?? 0), riskFlags: item.riskFlags ?? [] }));
    const tournaments = records(tournamentSnap).map((item) => ({ id: item.id, title: item.title ?? "Tournament", hostId: item.hostId ?? null, format: item.format ?? "not_configured", participantCount: Number(item.participantCount ?? 0), status: item.status ?? "draft", bracketExecutionEnabled: false }));
    const adminNotifications = records(notificationSnap).filter((item) => item.audience === "admin" || item.adminOnly === true || ["sponsor_application", "host_verification", "flagged_submission", "withdrawal_request", "winner_review", "support_ticket"].includes(String(item.type)));
    const support = records(supportSnap).map((item) => ({ id: item.id, category: item.category ?? "other", subject: item.subject ?? "Support request", userId: item.userId ?? null, status: item.status ?? "open", createdAt: item.createdAt ?? null }));
    const announcements = records(announcementSnap).map((item) => ({ id: item.id, type: item.type ?? "platform_announcement", title: item.title ?? "Announcement", status: item.status ?? "draft", createdAt: item.createdAt ?? null, deliveryActive: false }));
    const predictions = records(predictionSnap).map((item) => ({ id: item.id, userId: item.userId ?? null, challengeId: item.challengeId ?? null, predictedParticipantId: item.predictedParticipantId ?? null, stakeAmountUsd: Number(item.stakeAmountUsd ?? 0), platformFeeUsd: Number(item.platformFeeUsd ?? 0), netStakeUsd: Number(item.netStakeUsd ?? 0), predictionStatus: item.predictionStatus ?? item.status ?? "pending_payment", paymentStatus: item.paymentStatus ?? "provider_approval_required", settlementStatus: item.settlementStatus ?? "admin_review_required", eligibilityStatus: item.eligibilityStatus ?? "not_available", status: item.settlementStatus ?? item.predictionStatus ?? item.status ?? "pending_payment", settlementRequiresAdminReview: true, automaticPayoutsEnabled: false, automaticSettlementEnabled: false }));
    const rewards = records(rewardSpinSnap).map((item) => ({ id: item.id, userId: item.userId ?? null, prizeName: item.prizeName ?? "Reward", prizeType: item.prizeType ?? "manual_review", status: item.status ?? "pending_admin_fulfillment", manualFulfillmentRequired: item.manualFulfillmentRequired !== false, cashOutEnabled: false, createdAt: item.createdAt ?? null }));
    const prizeWheel = records(prizeWheelSnap).map((item) => ({ id: item.id, prizeName: item.prizeName ?? item.name ?? "Prize", prizeType: item.prizeType ?? "manual_prize", tier: item.tier ?? "standard", enabled: item.enabled !== false, quantity: Number(item.quantity ?? 0), probabilityWeight: Number(item.probabilityWeight ?? item.weight ?? 0), manualFulfillmentRequired: item.manualFulfillmentRequired !== false, cashOutEnabled: false, status: item.status ?? "not_configured" }));
    const kyc = records(kycSnap).map((item) => ({ id: item.id, userId: item.userId ?? item.id, planId: item.planId ?? item.subscriptionPlanId ?? null, kycRequired: item.kycRequired === true, kycStatus: item.kycStatus ?? "not_started", kycProvider: item.kycProvider ?? "not_configured", sumsubApplicantId: item.sumsubApplicantId ?? null, sumsubProviderStatus: item.sumsubProviderStatus ?? null, sumsubReviewAnswer: item.sumsubReviewAnswer ?? null, sumsubReviewRejectType: item.sumsubReviewRejectType ?? null, submittedAt: item.kycSubmittedAt ?? null, verifiedAt: item.kycVerifiedAt ?? null, rejectedAt: item.kycRejectedAt ?? null, failureReason: item.kycFailureReason ?? null, kycSessionId: item.kycSessionId ?? null, rawIdentityStored: false, status: item.kycStatus ?? "not_started", updatedAt: item.updatedAt ?? item.kycLastCheckedAt ?? null }));
    const predictionSettlements = records(predictionSettlementSnap).map((item) => ({ id: item.id, predictionId: item.predictionId ?? item.id, challengeId: item.challengeId ?? null, userId: item.userId ?? null, status: item.settlementStatus ?? item.refundStatus ?? item.status ?? "admin_review_required", refundStatus: item.refundStatus ?? "not_applicable", automaticPayoutsEnabled: false, automaticRefundsEnabled: false, createdAt: item.createdAt ?? null }));
    const adRewards = records(adRewardSnap).map((item) => ({ id: item.id, userId: item.userId ?? null, challengeId: item.challengeId ?? null, adProvider: item.adProvider ?? "disabled", status: item.adRewardStatus ?? "not_available", voteGranted: item.voteGranted === true, providerVerificationRequired: true, clientGrantBlocked: item.clientGrantBlocked !== false, createdAt: item.createdAt ?? null }));
    const enterpriseRecords = records(enterpriseLeadSnap);
    const enterpriseApplications = enterpriseRecords.filter((item) => item.applicationType === ENTERPRISE_APPLICATION_TYPE).map((item) => {
      const account = userMap.get(String(item.userId ?? "")) ?? ({} as RecordData);
      const internalNote = notes.get(`enterprise_${item.id}`);
      return {
        id: item.id,
        userId: item.userId ?? null,
        userRef: item.userRef ?? item.userId ?? null,
        applicationType: ENTERPRISE_APPLICATION_TYPE,
        applicantName: item.applicantName ?? item.fullName ?? account.displayName ?? account.name ?? "Applicant",
        applicantEmail: item.applicantEmail ?? item.workEmail ?? account.email ?? "",
        companyName: item.companyName ?? item.company ?? "Organization",
        roleTitle: item.roleTitle ?? item.role ?? "",
        currentAccountType: account.accountType ?? account.role ?? "user",
        currentPlan: account.planId ?? account.subscriptionPlan ?? "free",
        enterpriseAccessStatus: account.enterpriseAccessStatus ?? account.enterpriseApprovalStatus ?? "not_submitted",
        useCase: item.useCase ?? item.reason ?? "",
        expectedChallengeVolume: item.expectedChallengeVolume ?? item.expectedUsage ?? "",
        teamSize: item.teamSize ?? "",
        budgetOrPlanInterest: item.budgetOrPlanInterest ?? item.budgetRange ?? "",
        contactDetails: item.contactDetails ?? item.message ?? "",
        website: item.website ?? "",
        relationship: item.relationship ?? "",
        status: item.status ?? item.approvalStatus ?? "pending",
        submittedAt: item.submittedAt ?? item.createdAt ?? null,
        lastSubmittedAt: item.lastSubmittedAt ?? item.resubmittedAt ?? item.updatedAt ?? null,
        createdAt: item.createdAt ?? null,
        updatedAt: item.updatedAt ?? null,
        reviewedAt: item.reviewedAt ?? null,
        reviewedBy: item.reviewedBy ?? null,
        decisionReason: item.decisionReason ?? null,
        requestedInfoMessage: item.requestedInfoMessage ?? null,
        version: enterpriseApplicationVersion(item),
        currentRevision: enterpriseApplicationVersion(item),
        reviewAttempt: Number(item.reviewAttempt ?? 1),
        timeline: Array.isArray(item.timeline) ? item.timeline : [],
        internalNote: internalNote?.note ?? null,
        actionHistoryCount: auditLogs.filter((event) => String(event.targetId ?? "") === item.id).length
      };
    });
    const enterpriseLeads = enterpriseRecords.filter((item) => item.applicationType !== ENTERPRISE_APPLICATION_TYPE).map((item) => ({ id: item.id, userId: item.userId ?? null, applicationType: item.applicationType ?? "enterprise_inquiry", company: item.company ?? "Enterprise lead", fullName: item.fullName ?? "", workEmail: item.workEmail ?? "", role: item.role ?? "", useCase: item.useCase ?? item.reason ?? "", teamSize: item.teamSize ?? "", relationship: item.relationship ?? "", status: item.status ?? "pending", createdAt: item.createdAt ?? null, updatedAt: item.updatedAt ?? null }));
    const contactRequests = support;
    const mediaModeration = records(mediaUploadSnap).map((item) => ({ id: item.id, userId: item.userId ?? null, path: item.path ?? item.storagePath ?? "", contentType: item.contentType ?? "unknown", status: item.status ?? item.moderationStatus ?? "recorded", publicReadApproved: item.publicReadApproved === true, privateMedia: item.privateMedia === true, createdAt: item.createdAt ?? null }));
    const riskSafety = [...submissions.filter((item) => Array.isArray(item.riskFlags) && item.riskFlags.length), ...participants.filter((item) => Array.isArray(item.riskFlags) && item.riskFlags.length), ...predictions.filter((item) => ["disputed", "suspended"].includes(String(item.status)))].map((item) => ({ ...item, status: item.status ?? "review_required" }));
    const pending = (list: Array<{ status?: unknown }>, statuses: string[]) => list.filter((item) => statuses.includes(String(item.status))).length;
    return ok({
      overview: {
        pendingSponsorReviews: pending(sponsors, ["pending_review", "submitted"]),
        pendingHostVerifications: hosts.filter((item) => ["pending_review", "submitted"].includes(String(item.hostVerificationStatus))).length,
        pendingChallengeReviews: pending(challenges, ["pending_review", "flagged"]),
        pendingEnterpriseApplications: pending(enterpriseApplications, ["pending", "in_review"]),
        pendingSubmissions: pending(submissions, ["pending_review"]),
        flaggedSubmissions: pending(submissions, ["flagged"]),
        participantApprovals: pending(participants, ["pending"]),
        winnerConfirmations: pending(winners, ["pending_admin_review", "pending_host_confirmation"]),
        openDisputes: disputeSnap.docs.filter((doc) => !["resolved", "closed"].includes(String(doc.data().status))).length,
        revenueReviewItems: prizePoolSnap.docs.filter((doc) => ["pending_review", "under_review", "payout_review"].includes(String(doc.data().payoutReviewStatus ?? doc.data().status))).length,
        pendingWithdrawalReviews: withdrawals.filter((item) => ["pending_review", "needs_kyc"].includes(String(item.status))).length,
        pendingKycReviews: kyc.filter((item) => ["pending_review", "needs_resubmission"].includes(String(item.status))).length,
        predictionReviews: predictions.filter((item) => ["pending_payment", "admin_review_required", "settlement_pending", "locked", "disputed"].includes(String(item.status))).length,
        rewardFulfillments: rewards.filter((item) => ["pending_admin_fulfillment", "pending_review"].includes(String(item.status))).length,
        recentAuditEvents: auditLogs.slice(0, 8),
        safety: { automaticPayouts: "Disabled", withdrawals: "Review only", sponsorRelease: "Disabled", prizePoolRelease: "Disabled", kycProcessing: "Not active", doroCoinConversion: "Disabled", adRewards: "Verification required" }
      },
      sponsors: hasAdminPermission(user.adminPermissions, "sponsors.view") ? sponsors : [],
      hosts: hasAdminPermission(user.adminPermissions, "users.view") ? hosts.map((item) => ({ ...safeUser(item, doroMap.get(item.id) ?? 0, Number(cashMap.get(item.id)?.availableBalanceCents ?? 0)), organizationName: item.organizationName ?? item.hostOrganizationName ?? item.displayName ?? "", ownerName: item.displayName ?? item.name ?? "", location: item.location ?? item.country ?? "", eventType: item.hostType ?? "", competitionSize: item.competitionSize ?? "", riskFlags: item.riskFlags ?? [] })) : [],
      challenges,
      submissions: hasAdminPermission(user.adminPermissions, "submissions.view") ? submissions : [],
      participants: hasAdminPermission(user.adminPermissions, "participants.review") ? participants : [],
      winners: hasAdminPermission(user.adminPermissions, "winners.review") ? winners : [],
      withdrawals: hasAdminPermission(user.adminPermissions, "finance.view") ? withdrawals : [],
      disputes: hasAdminPermission(user.adminPermissions, "disputes.review") ? disputes : [],
      reports: {
        challengeCount: challenges.length,
        submissionCount: submissions.length,
        participantCount: participants.length,
        sponsorInterestCount: sponsors.length,
        winnerCount: winners.length,
        withdrawalCount: withdrawals.length,
        disputeCount: disputes.length,
        eventCount: events.length,
        tournamentCount: tournaments.length,
        exportsEnabled: false
      },
      users: hasAdminPermission(user.adminPermissions, "users.view") ? users.map((item) => safeUser(item, doroMap.get(item.id) ?? 0, Number(cashMap.get(item.id)?.availableBalanceCents ?? 0))) : [],
      creators: hasAdminPermission(user.adminPermissions, "users.view") ? users.filter((item) => item.accountType === "creator" || item.role === "creator" || item.planId === "creator").map((item) => ({ ...safeUser(item, doroMap.get(item.id) ?? 0, Number(cashMap.get(item.id)?.availableBalanceCents ?? 0)), createdChallengeCount: Number(item.createdChallengeCount ?? 0), submissionVolume: Number(item.submissionCount ?? 0), boostsUsed: Number(item.boostsUsed ?? 0), sponsorReadyCount: Number(item.sponsorReadyCount ?? 0), riskFlags: item.riskFlags ?? [] })) : [],
      hostWorkspaces: hasAdminPermission(user.adminPermissions, "users.view") ? hosts.map((item) => ({ id: item.id, workspaceName: item.organizationName ?? item.hostOrganizationName ?? item.displayName ?? "Host workspace", ownerName: item.displayName ?? item.name ?? "", verificationStatus: item.hostVerificationStatus ?? "not_submitted", planStatus: item.subscriptionStatus ?? item.planStatus ?? "none", events: Number(item.eventCount ?? 0), tournaments: Number(item.tournamentCount ?? 0), participants: Number(item.participantCount ?? 0), teamSeats: Number(item.teamSeats ?? 1), reports: Number(item.reportCount ?? 0), riskFlags: item.riskFlags ?? [] })) : [],
      sponsorBrands: hasAdminPermission(user.adminPermissions, "sponsors.view") ? sponsors : [],
      events,
      tournaments,
      doroCoin: hasAdminPermission(user.adminPermissions, "finance.view") ? doroCoin : { wallets: [], transactions: [], conversionEnabled: false, adjustmentsEnabled: false },
      cashLedger: hasAdminPermission(user.adminPermissions, "finance.view") ? cashLedger : [],
      adminNotifications,
      support,
      announcements,
      predictions,
      predictionSettlements,
      rewards,
      prizeWheel,
      kyc: hasAdminPermission(user.adminPermissions, "users.requireVerification") ? kyc : [],
      adRewards,
      enterpriseApplications,
      enterpriseLeads,
      contactRequests,
      mediaModeration,
      riskSafety,
      auditLogs: hasAdminPermission(user.adminPermissions, "auditLogs.viewRaw") ? auditLogs : [],
      settings: {
        adminRoles: "Server-verified granular administrator roles and permissions",
        reviewRulesConfigured: true,
        payoutProvider: "manual_review",
        automaticMoneyMovement: false,
        categories: ["challenge", "submission", "event", "sponsor", "risk"],
        votingRules: { freeVotesPerDay: 1, doroCoinCostConfigurable: true, suspiciousVoteReview: "manual_review" },
        revenueRules: { generatedRevenueSplit: { winners: 65, creatorHost: 20, platform: 15 }, sponsorFundingIncluded: false, initialPrizePoolRule: "100_percent_to_winners", challengerVoteRevenueBonusPercent: 10, minimumWithdrawalCents: 2500, moneyMovementEnabled: false },
        featureFlags: {
          adRewards: "disabled",
          withdrawals: "review_only",
          automaticPayouts: "disabled",
          sponsorReleases: "disabled",
          prizePoolRelease: "disabled",
          kycVerification: "not_connected",
          liveStreaming: "disabled",
          realExports: "disabled",
          teamInvitations: "not_configured",
          emailNotifications: "not_configured",
          pushNotifications: "not_configured",
          realMoneyPredictionArenaEnabled: false,
          predictionPaymentsProvider: "disabled_or_pending_approval",
          adVotesEnabled: false,
          rewardsWheelEnabled: true,
          uploadsEnabled: "rules_pending_publication",
          privateChallengesEnabled: true,
          revenueShareVisible: true,
          predictionArena: "compliance_review_required",
          voterRewardsWheel: "server_selected"
        },
        roles: ["Platform Owner", "Super Admin", "Operations Admin", "Finance Admin", "Moderation Admin", "Safety Admin", "Support Admin", "Sponsor Manager", "Event and Tournament Admin", "Content Admin", "Marketing and Communications Admin", "Analyst", "Read-only Auditor", "Technical Admin", "Developer Support"]
      }
    }, "Admin operations data loaded.");
  } catch (error) {
    return serverError("Admin operations could not be loaded.", error instanceof Error ? error.message : error);
  }
}

const allowedActions: Record<string, Set<string>> = {
  sponsor: new Set(["approve", "reject", "request_changes", "suspend", "add_note"]),
  host: new Set(["verify", "reject", "request_changes", "suspend", "add_note"]),
  challenge: new Set(["approve", "reject", "request_changes", "flag", "archive", "suspend", "add_note"]),
  submission: new Set(["approve", "reject", "request_changes", "flag", "add_note"]),
  participant: new Set(["approve", "reject", "disqualify", "reinstate", "flag", "add_note"]),
  winner: new Set(["approve", "hold", "request_review", "flag", "add_note"]),
  withdrawal: new Set(["approve", "second_approve", "reject", "request_info", "mark_paid", "add_note"]),
  enterprise: new Set(["approve", "reject", "request_info", "add_note"])
};

const reasonRequired = new Set(["reject", "request_changes", "suspend", "flag", "disqualify", "hold", "request_review", "request_info"]);

function permissionForAction(type: string, action: string): AdminPermission {
  if (action === "add_note") return type === "withdrawal" ? "withdrawals.review" : type === "sponsor" ? "sponsors.review" : "challenges.review";
  if (type === "sponsor") return action === "suspend" ? "sponsors.suspend" : "sponsors.approve";
  if (type === "host") return "users.requireVerification";
  if (type === "challenge") return action === "archive" ? "challenges.archive" : "challenges.review";
  if (type === "enterprise") return "challenges.review";
  if (type === "submission") return "submissions.review";
  if (type === "participant") return action === "disqualify" ? "participants.disqualify" : "participants.review";
  if (type === "winner") return action === "approve" ? "winners.confirm" : "winners.review";
  if (type === "withdrawal") {
    if (action === "mark_paid") return "withdrawals.markPaid";
    if (action === "second_approve") return "withdrawals.secondApprove";
    if (action === "approve") return "withdrawals.approve";
    return "withdrawals.review";
  }
  return "admin.dashboard.view";
}

function nextStatus(type: string, action: string) {
  const statuses: Record<string, Record<string, string>> = {
    sponsor: { approve: "approved", reject: "rejected", request_changes: "needs_changes", suspend: "suspended" },
    host: { verify: "verified", reject: "rejected", request_changes: "needs_changes", suspend: "suspended" },
    challenge: { approve: "published", reject: "rejected", request_changes: "changes_requested", flag: "flagged", archive: "archived", suspend: "suspended" },
    submission: { approve: "approved", reject: "rejected", request_changes: "resubmission_requested", flag: "flagged" },
    participant: { approve: "approved", reject: "rejected", disqualify: "disqualified", reinstate: "approved", flag: "flagged" },
    winner: { approve: "approved", hold: "held", request_review: "pending_admin_review", flag: "flagged" },
    withdrawal: { approve: "pending_second_approval", second_approve: "approved_for_manual_payout", reject: "rejected", request_info: "needs_kyc", mark_paid: "paid" },
    enterprise: { approve: "approved", reject: "rejected", request_info: "needs_info" }
  };
  return statuses[type]?.[action];
}

export async function PATCH(request: Request) {
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin operations");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const type = String(parsed.body?.type ?? "");
  const id = String(parsed.body?.id ?? "");
  const action = String(parsed.body?.action ?? "");
  const reason = String(parsed.body?.reason ?? "").trim().slice(0, 500);
  const note = String(parsed.body?.note ?? "").trim().slice(0, 1000);
  if (!allowedActions[type]?.has(action)) return validationError({ action: "Select a valid admin action." });
  const permission = permissionForAction(type, action);
  const authorization = action === "mark_paid" || action === "second_approve"
    ? await requireRecentAdminAuthentication(request, permission)
    : await requireAdminPermission(request, permission);
  if (authorization.response) return authorization.response;
  const user = authorization.user;
  if (!id) return validationError({ id: "Target ID is required." });
  if (reasonRequired.has(action) && !reason) return validationError({ reason: "A reason is required for this action." });
  if (action === "add_note" && !note) return validationError({ note: "Enter an internal admin note." });
  let status = nextStatus(type, action);
  const now = new Date().toISOString();

  try {
    if (action === "add_note") {
      if (type === "enterprise") {
        const applicationSnap = await db.collection(ENTERPRISE_APPLICATION_COLLECTION).doc(id).get();
        if (!applicationSnap.exists || applicationSnap.data()?.applicationType !== ENTERPRISE_APPLICATION_TYPE) return fail("Enterprise application not found.", 404, undefined, "NOT_FOUND");
      }
      await db.collection("adminNotes").doc(`${type}_${id}`).set({
        id: `${type}_${id}`,
        targetType: type,
        targetId: id,
        note,
        updatedBy: user.uid,
        updatedAt: now,
        createdAt: now
      }, { merge: true });
      await writeAuditLog({
        actorId: user.uid,
        actorType: "admin",
        action: type === "enterprise" ? "enterprise_internal_note_added" : `${type}.note_added`,
        targetType: type === "enterprise" ? "enterprise_application" : type,
        targetId: id,
        reason: "Internal admin note added.",
        metadata: { note }
      }, db);
      return ok({ type, id, action }, "Internal admin note saved.");
    }
    let previousStatus = "unknown";
    if (type === "host") {
      const userRef = db.collection("users").doc(id);
      const profileRef = db.collection("profiles").doc(id);
      const snap = await userRef.get();
      if (!snap.exists) return fail("Host account not found.", 404, undefined, "NOT_FOUND");
      previousStatus = String(snap.data()?.hostVerificationStatus ?? "not_submitted");
      const update = { hostVerificationStatus: status, hostVerifiedAt: action === "verify" ? now : null, updatedAt: now };
      await Promise.all([userRef.set(update, { merge: true }), profileRef.set(update, { merge: true })]);
    } else if (type === "enterprise") {
      const ref = db.collection(ENTERPRISE_APPLICATION_COLLECTION).doc(id);
      const requestedRole = parsed.body?.enterpriseRole;
      const requestedScope = parsed.body?.enterpriseScope;
      const enterpriseRole = isEnterpriseRole(requestedRole) ? requestedRole : "operations";
      const enterpriseScope = isEnterpriseScope(requestedScope) ? requestedScope : "assigned_only";
      const permissionAdditions = Array.isArray(parsed.body?.permissionAdditions) ? parsed.body.permissionAdditions : [];
      const permissionRemovals = Array.isArray(parsed.body?.permissionRemovals) ? parsed.body.permissionRemovals : [];
      const enterprisePermissions = rolePermissions(enterpriseRole, permissionAdditions, permissionRemovals);
      const expectedVersion = Number(parsed.body?.expectedVersion ?? parsed.body?.currentRevision ?? 0);
      let applicantId = "";
      let previousAccountType = "user";
      await db.runTransaction(async (transaction) => {
        const applicationSnap = await transaction.get(ref);
        if (!applicationSnap.exists || applicationSnap.data()?.applicationType !== ENTERPRISE_APPLICATION_TYPE) throw new Error("NOT_FOUND");
        const application = applicationSnap.data() ?? {};
        previousStatus = String(application.status ?? "pending");
        if (!["pending", "in_review", "needs_info", "requested_changes"].includes(previousStatus)) throw new Error("INVALID_STATE");
        const currentVersion = enterpriseApplicationVersion(application);
        if (!Number.isInteger(expectedVersion) || expectedVersion !== currentVersion) throw new Error("STALE_APPLICATION_VERSION");
        applicantId = String(application.userId ?? "");
        if (!applicantId) throw new Error("APPLICATION_ACCOUNT_REQUIRED");
        const userRef = db.collection("users").doc(applicantId);
        const profileRef = db.collection("profiles").doc(applicantId);
        const [accountSnap, profileSnap] = await Promise.all([transaction.get(userRef), transaction.get(profileRef)]);
        const account = accountSnap.data() ?? {};
        const profile = profileSnap.data() ?? {};
        previousAccountType = String(account.accountType ?? application.currentAccountType ?? "user");
        const existingWorkspaces = new Set<string>([
          ...(Array.isArray(account.workspaceTypes) ? account.workspaceTypes.filter((value): value is string => typeof value === "string") : []),
          ...(Array.isArray(profile.workspaceTypes) ? profile.workspaceTypes.filter((value): value is string => typeof value === "string") : []),
          "personal"
        ]);
        if (action === "approve") existingWorkspaces.add("enterprise");
        const staffAccess = action === "approve" ? {
          status: "active", role: enterpriseRole, scope: enterpriseScope,
          department: String(parsed.body?.enterpriseDepartment ?? "Operations").trim().slice(0, 100) || "Operations",
          permissions: enterprisePermissions,
          categoryScope: Array.isArray(parsed.body?.enterpriseCategoryScope) ? parsed.body.enterpriseCategoryScope.filter((value: unknown): value is string => typeof value === "string").slice(0, 30) : [],
          regionScope: Array.isArray(parsed.body?.enterpriseRegionScope) ? parsed.body.enterpriseRegionScope.filter((value: unknown): value is string => typeof value === "string").slice(0, 30) : [],
          onboardingComplete: false, provisionedAt: now, provisionedBy: user.uid
        } : null;
        const event = { type: `admin_${action}`, status, at: now, message: action === "approve" ? "Enterprise access approved." : action === "request_info" ? "More information requested." : "Application not approved." };
        const accessUpdate = {
          enterpriseAccessStatus: status, enterpriseApprovalStatus: status, enterpriseApplicationId: id,
          enterpriseApprovedAt: action === "approve" ? now : null, enterpriseApprovedBy: action === "approve" ? user.uid : null,
          ...(action === "approve" ? { workspaceTypes: [...existingWorkspaces], enterpriseRole, enterpriseScope, enterpriseDepartment: staffAccess!.department, enterprisePermissions, enterpriseCategoryScope: staffAccess!.categoryScope, enterpriseRegionScope: staffAccess!.regionScope, enterpriseStaffStatus: "active", enterpriseOnboardingComplete: false, staffAccess } : {}),
          updatedAt: now
        };
        transaction.set(ref, { status, approvalStatus: status, enterpriseAccessGranted: action === "approve", enterpriseRole: action === "approve" ? enterpriseRole : null, enterpriseScope: action === "approve" ? enterpriseScope : null, reviewedRevision: currentVersion, reviewedAt: now, reviewedBy: user.uid, decisionReason: reason || null, requestedInfoMessage: action === "request_info" ? reason : null, timeline: [...(Array.isArray(application.timeline) ? application.timeline : []), event], updatedAt: now }, { merge: true });
        transaction.set(userRef, accessUpdate, { merge: true });
        transaction.set(profileRef, accessUpdate, { merge: true });
        transaction.set(db.collection(ENTERPRISE_APPLICATION_REVISION_COLLECTION).doc(enterpriseApplicationRevisionId(id, currentVersion)), { decisionStatus: status, decidedAt: now, decidedBy: user.uid, decisionReason: reason || null }, { merge: true });
        transaction.create(db.collection("auditLogs").doc(`${id}_v${currentVersion}_${action}`), { id: `${id}_v${currentVersion}_${action}`, actorId: user.uid, actorType: "admin", action: `enterprise_application_${action}`, targetType: "enterprise_application", targetId: id, before: { status: previousStatus, version: currentVersion }, after: { status, reviewedRevision: currentVersion }, reason: reason || event.message, metadata: {}, createdAt: now });
      });
      const notificationCopy = action === "approve" ? { type: "enterprise_application_approved", title: "Enterprise access approved", body: "Your Enterprise workspace is ready." } : action === "request_info" ? { type: "enterprise_application_needs_info", title: "More information needed", body: "Please update your Enterprise application." } : { type: "enterprise_application_rejected", title: "Enterprise application not approved", body: "Contact support if you have questions." };
      await createNotification(db, { userId: applicantId, ...notificationCopy, targetId: id });
      if (action === "approve") {
        await writeAuditLog({ actorId: user.uid, actorType: "admin", action: "enterprise_access_granted", targetType: "user", targetId: applicantId, before: { enterpriseAccessStatus: previousStatus, accountType: previousAccountType }, after: { enterpriseAccessStatus: "approved", personalAccountTypePreserved: previousAccountType, enterpriseWorkspaceAdded: true, role: enterpriseRole, scope: enterpriseScope, applicationId: id }, reason: reason || "Enterprise application approved." }, db);
      }
    } else if (type === "withdrawal") {
      const ref = db.collection("withdrawalRequests").doc(id);
      await db.runTransaction(async (transaction) => {
        const snap = await transaction.get(ref);
        if (!snap.exists) throw new Error("NOT_FOUND");
        const record = snap.data() ?? {};
        previousStatus = String(record.status ?? "pending_review");
        const validTransition = action === "mark_paid"
          ? previousStatus === "approved_for_manual_payout"
          : action === "second_approve"
            ? previousStatus === "pending_second_approval"
            : ["pending_review", "needs_kyc"].includes(previousStatus);
        if (!validTransition) throw new Error("INVALID_STATE");
        if (["approve", "second_approve"].includes(action) && record.kycStatus !== "verified") throw new Error("KYC_REQUIRED");
        if (action === "second_approve" && record.firstApprovedBy === user.uid) throw new Error("SECOND_APPROVER_REQUIRED");
        transaction.set(ref, {
          status,
          adminReviewStatus: status,
          reason: reason || null,
          firstApprovedAt: action === "approve" ? now : record.firstApprovedAt ?? null,
          firstApprovedBy: action === "approve" ? user.uid : record.firstApprovedBy ?? null,
          approvedAt: action === "second_approve" ? now : record.approvedAt ?? null,
          approvedBy: action === "second_approve" ? user.uid : record.approvedBy ?? null,
          paidManuallyAt: action === "mark_paid" ? now : record.paidManuallyAt ?? null,
          paidManuallyBy: action === "mark_paid" ? user.uid : record.paidManuallyBy ?? null,
          transferEnabled: false,
          payoutExecuted: false,
          updatedAt: now
        }, { merge: true });
        if (action === "reject" || action === "mark_paid") {
          const walletRef = db.collection("cashWallets").doc(String(record.userId));
          const walletSnap = await transaction.get(walletRef);
          const wallet = walletSnap.data() ?? {};
          const amount = Number(record.amountCents ?? 0);
          const available = Number(wallet.availableBalanceCents ?? 0);
          const underReview = Math.max(0, Number(wallet.underReviewBalanceCents ?? wallet.lockedBalanceCents ?? 0) - amount);
          transaction.set(walletRef, action === "reject"
            ? { availableBalanceCents: available + amount, underReviewBalanceCents: underReview, lockedBalanceCents: underReview, updatedAt: now }
            : { underReviewBalanceCents: underReview, lockedBalanceCents: underReview, withdrawnBalanceCents: Number(wallet.withdrawnBalanceCents ?? 0) + amount, updatedAt: now }, { merge: true });
          const ledgerSuffix = action === "reject" ? "rejected" : "paid_manual";
          for (const sourceId of Array.isArray(record.sourceIds) ? record.sourceIds : []) {
            transaction.set(db.collection("cashLedger").doc(String(sourceId)), {
              status: action === "reject" ? "available" : "paid_out",
              withdrawalRequestId: id,
              updatedAt: now
            }, { merge: true });
          }
          transaction.create(db.collection("cashLedger").doc(`${id}_${ledgerSuffix}`), {
            ledgerId: `${id}_${ledgerSuffix}`, userId: record.userId, type: action === "reject" ? "withdrawal_reversed" : "withdrawal_paid_manually", sourceType: "withdrawal", sourceId: id,
            amountCents: amount, currency: record.currency ?? "USD", direction: action === "reject" ? "credit_release" : "debit_payout", balanceBeforeCents: available,
            balanceAfterCents: action === "reject" ? available + amount : available, status: action === "reject" ? "reversed" : "paid_out", providerConnected: false, transferEnabled: false,
            isQaSeed: record.isQaSeed === true,
            qaSeedBatchId: record.isQaSeed === true ? record.qaSeedBatchId : null,
            createdFor: record.isQaSeed === true ? "admin_qa" : null,
            createdByAdminId: record.isQaSeed === true ? record.createdByAdminId : null,
            metadata: { reason, reviewOnly: true, manualStatusUpdateOnly: true, externalPayoutExecuted: false }, createdAt: now
          });
        }
      });
    } else if (type === "challenge") {
      const ref = db.collection("challenges").doc(id);
      const snap = await ref.get();
      if (!snap.exists) return fail("Challenge record not found.", 404, undefined, "NOT_FOUND");
      const challenge = snap.data() ?? {};
      previousStatus = String(challenge.status ?? "unknown");
      const update = action === "approve" ? buildChallengeApprovalUpdate(challenge, user.uid, now) : action === "reject" ? buildChallengeRejectionUpdate(user.uid, now) : action === "request_changes" ? {
        status: "changes_requested",
        lifecycleStatus: "changes_requested",
        reviewStatus: "changes_requested",
        adminReviewRequired: true,
        reviewedBy: user.uid,
        reviewedAt: now,
        reviewReason: reason,
        updatedAt: now
      } : {
        status,
        reviewedBy: user.uid,
        reviewedAt: now,
        moneyMovementEnabled: false,
        transferEnabled: false,
        updatedAt: now
      };
      status = String(update.status ?? status);
      await ref.set({
        ...update,
        moneyMovementEnabled: false,
        transferEnabled: false
      }, { merge: true });
      const creatorId = String(challenge.creatorId ?? challenge.ownerId ?? "");
      if (creatorId && ["approve", "reject", "request_changes"].includes(action)) {
        const notificationCopy = action === "approve" ? { type: "challenge_approved", title: "Challenge approved", body: "Your challenge is now available." } : action === "request_changes" ? { type: "challenge_changes_requested", title: "Challenge changes requested", body: "Review the requested changes and resubmit your challenge." } : { type: "challenge_rejected", title: "Challenge not approved", body: "Review the decision before editing your challenge." };
        await createNotification(db, { userId: creatorId, ...notificationCopy, targetId: id });
      }
      if (action === "approve" && challenge.isLiveEvent) {
        await db.collection("liveEvents").doc(id).set({
          id,
          challengeId: id,
          title: challenge.title ?? "",
          description: challenge.description ?? "",
          hostName: challenge.creatorName ?? "Challenge Host",
          creatorId: challenge.creatorId ?? null,
          imageUrl: challenge.coverImageUrl ?? challenge.promoImageUrl ?? null,
          location: [challenge.venueName, challenge.eventCity, challenge.eventCountry].filter(Boolean).join(", "),
          startsAt: challenge.startsAt,
          time: challenge.startsAt,
          capacity: challenge.eventCapacity ?? challenge.maxParticipants ?? 0,
          status: "scheduled",
          visibility: "public",
          source: "challenge_sync",
          moneyMovementEnabled: false,
          updatedAt: now,
          createdAt: challenge.createdAt ?? now
        }, { merge: true });
      }
    } else {
      const config: Record<string, { collection: string; statusField: string }> = {
        sponsor: { collection: "sponsorProfiles", statusField: "sponsorVerificationStatus" },
        submission: { collection: "submissions", statusField: "status" },
        participant: { collection: "challengeParticipants", statusField: "status" },
        winner: { collection: "winners", statusField: "adminReviewStatus" }
      };
      const target = config[type];
      const ref = db.collection(target.collection).doc(id);
      const snap = await ref.get();
      if (!snap.exists) return fail(`${type} record not found.`, 404, undefined, "NOT_FOUND");
      previousStatus = String(snap.data()?.[target.statusField] ?? "unknown");
      await ref.set({
        [target.statusField]: status,
        reviewedBy: user.uid,
        reviewedAt: now,
        moneyMovementEnabled: false,
        transferEnabled: false,
        updatedAt: now
      }, { merge: true });
      if (type === "sponsor") {
        await Promise.all([
          db.collection("users").doc(id).set({ sponsorVerificationStatus: status, updatedAt: now }, { merge: true }),
          db.collection("profiles").doc(id).set({ sponsorVerificationStatus: status, updatedAt: now }, { merge: true })
        ]);
      }
    }
    if (note || reason) {
      await db.collection("adminNotes").doc(`${type}_${id}`).set({
        id: `${type}_${id}`,
        targetType: type,
        targetId: id,
        note: note || null,
        reason: reason || null,
        updatedBy: user.uid,
        updatedAt: now,
        createdAt: now
      }, { merge: true });
    }
    if (type !== "enterprise") {
      await writeAuditLog({
        actorId: user.uid,
        actorType: "admin",
        action: `${type}.${action}`,
        targetType: type,
        targetId: id,
        before: { status: previousStatus },
        after: { status, moneyMovementEnabled: false },
        reason: reason || null,
        metadata: { note: note || null, transferEnabled: false }
      }, db);
    }
    return ok({ type, id, action, previousStatus, newStatus: status }, "Admin decision saved. No money movement was performed.");
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return fail("Record not found.", 404, undefined, "NOT_FOUND");
    if (error instanceof Error && error.message === "INVALID_STATE") return fail("This record is no longer eligible for that action.", 409, undefined, "INVALID_STATE");
    if (error instanceof Error && error.message === "STALE_APPLICATION_VERSION") return fail("This application changed after it was opened. Refresh it before making a decision.", 409, undefined, "STALE_APPLICATION_VERSION");
    if (error instanceof Error && error.message === "APPLICATION_ACCOUNT_REQUIRED") return fail("This application is not linked to an account.", 422, undefined, "APPLICATION_ACCOUNT_REQUIRED");
    if (error instanceof Error && error.message === "KYC_REQUIRED") return fail("Identity verification must be verified before approval. KYC processing is not active yet.", 409, undefined, "KYC_REQUIRED");
    if (error instanceof Error && error.message === "SECOND_APPROVER_REQUIRED") return fail("A different authorized administrator must complete the second approval.", 409, undefined, "SECOND_APPROVER_REQUIRED");
    return serverError("Admin decision could not be saved.", error instanceof Error ? error.message : error);
  }
}

