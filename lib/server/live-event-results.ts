import type { Firestore } from "firebase-admin/firestore";
import { eventKind, eventOptions, eventTime, LiveEventPolicyError, rankPhysicalResults } from "@/lib/live-event-policy";
import { readLiveEvent } from "@/lib/server/live-event-admission";
import { createHash } from "node:crypto";

type PhysicalResultAction = { action: "scores"; competitorId: string; scores: number[] } | { action: "announce"; confirmed: boolean };
/** Caller must establish current challenge-management authorization; this service rechecks canonical state. */
export async function recordPhysicalEventResults(db: Firestore, input: PhysicalResultAction & { eventId: string; actorId: string; reason: string; requestKey: string; expectedVersion: number; now?: number }) {
  if (input.reason.trim().length < 5 || input.reason.length > 1000 || !/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestKey)) throw new LiveEventPolicyError("CONFIRMATION_REASON_REQUIRED", 422);
  const actionRef = db.collection("liveEventResultActions").doc(createHash("sha256").update(`${input.eventId}:${input.requestKey}`).digest("hex"));
  const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return db.runTransaction(async tx => {
    const [{ event, ref, challengeRef, challengeExists }, previous] = await Promise.all([readLiveEvent(db, tx, input.eventId), tx.get(actionRef)]);
    if (previous.exists) { if (previous.data()?.fingerprint !== fingerprint) throw new LiveEventPolicyError("RESULT_REFERENCE_REUSED"); return { version: previous.data()?.version, repeated: true }; }
    const now = input.now ?? Date.now(), iso = new Date(now).toISOString();
    if (eventKind(event) !== "physical_competition" || event.eventApprovalStatus !== "approved" || ["draft", "pending_review", "cancelled", "rejected", "deleted"].includes(String(event.status)) || !Number.isFinite(eventTime(event.startsAt)) || now < Math.min(eventTime(event.startsAt),event.liveEventStartedAt?eventTime(event.liveEventStartedAt):Infinity)) throw new LiveEventPolicyError("PHYSICAL_RESULTS_UNAVAILABLE");
    if (event.resultsPublishedAt) throw new LiveEventPolicyError("RESULTS_ALREADY_ANNOUNCED");
    const version = Number(event.physicalResultsVersion ?? 0);
    if (version !== input.expectedVersion) throw new LiveEventPolicyError("RESULTS_CHANGED");
    const options = eventOptions(event), judges = Number(event.physicalJudgeCountLocked ?? options.physicalJudgeCount), winners = Number(options.winnerCount);
    if (!Number.isSafeInteger(judges) || judges < 1 || judges > 20 || ![1,2,3].includes(winners)) throw new LiveEventPolicyError("JUDGING_CONFIGURATION_INVALID");
    const registrations = await tx.get(db.collection("liveEventRegistrations").where("eventId", "==", input.eventId).limit(1001));
    if (registrations.size > 1000) throw new LiveEventPolicyError("RESULTS_PARTITION_REVIEW_REQUIRED");
    const eligible = registrations.docs.filter(row => row.data().kind === "competitor" && row.data().eligible === true && row.data().status === "checked_in" && row.data().checkedInAt);
    const scoreRefs = eligible.map(row => db.collection("liveEventPhysicalScores").doc(createHash("sha256").update(`${input.eventId}:${row.data().userId}`).digest("hex")));
    const scores = scoreRefs.length ? await tx.getAll(...scoreRefs) : [];
    let patch: Record<string, unknown>;
    if (input.action === "scores") {
      const index = eligible.findIndex(row => row.data().userId === input.competitorId);
      if (index < 0) throw new LiveEventPolicyError("COMPETITOR_NOT_ELIGIBLE", 422);
      if (input.scores.length !== judges || input.scores.some(value => !Number.isFinite(value) || value < 0 || value > 10 || Math.abs(Math.round(value * 100) - value * 100) > 0.000001)) throw new LiveEventPolicyError("COMPLETE_PHYSICAL_SCORES_REQUIRED", 422);
      tx.set(scoreRefs[index], { eventId: input.eventId, userId: input.competitorId, scores: input.scores, judgeCount: judges, attendanceCheckedInAt: eligible[index].data().checkedInAt, enteredBy: input.actorId, updatedAt: iso });
      tx.create(db.collection("auditLogs").doc(`live_score_${actionRef.id}`), { actorId: input.actorId, action: "live_event.physical_scores_recorded", eventId: input.eventId, targetId: input.competitorId, before: scores[index].data()?.scores ?? null, after: input.scores, reason: input.reason, createdAt: iso });
      patch = { physicalJudgeCountLocked: judges, physicalResultsVersion: version + 1, updatedAt: iso };
    } else {
      if (!input.confirmed) throw new LiveEventPolicyError("RESULT_CONFIRMATION_REQUIRED", 422);
      if (eligible.length < winners) throw new LiveEventPolicyError("WINNER_COUNT_REVIEW_REQUIRED");
      const ranking = rankPhysicalResults(eligible.map((row,index)=>({ userId: String(row.data().userId), eligible:true, checkedIn:true, scores:scores[index]?.data()?.attendanceCheckedInAt === row.data().checkedInAt && Array.isArray(scores[index]?.data()?.scores) ? scores[index].data()!.scores as number[] : [] })), judges, winners);
      const published = ranking.slice(0,winners).map((row,index)=>({userId:row.userId,score:row.score,placement:index+1}));
      // This records verified sporting outcomes only; it never invents a settled money transfer.
      patch = { physicalResultsVersion: version + 1, physicalJudgeCountLocked: judges, publishedPhysicalResults: published, resultsPublishedAt: iso, resultsPublishedBy: input.actorId, eventPrizeSettlementStatus: "awaiting_financial_verification", updatedAt: iso };
      for (const row of published) tx.create(db.collection("notifications").doc(`live_result_${input.eventId}_${row.userId}`), { userId:row.userId,type:"live_event_result",title:"Your event results are ready",message:"The organizer has announced the physical competition results.",actionUrl:`/live-events/${input.eventId}`,read:false,createdAt:iso });
      tx.create(db.collection("auditLogs").doc(`live_results_${actionRef.id}`), { actorId:input.actorId,action:"live_event.results_announced",eventId:input.eventId,before:{version},after:{version:version+1,results:published},reason:input.reason,createdAt:iso });
    }
    tx.update(ref, patch);
    if(challengeExists)tx.update(challengeRef,patch);
    tx.create(actionRef,{eventId:input.eventId,actorId:input.actorId,fingerprint,version:version+1,createdAt:iso});
    return {version:version+1,repeated:false};
  });
}
