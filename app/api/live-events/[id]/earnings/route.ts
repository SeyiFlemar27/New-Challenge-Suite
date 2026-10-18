import { AggregateField } from "firebase-admin/firestore";
import { requireChallengeManagementAccess } from "@/lib/server/challenge-management-access";
import { configuredPayoutProvider } from "@/lib/server/payout-provider";
import { ok, fail } from "@/lib/server/responses";
import {previewLiveEventCreatorEarnings} from "@/lib/server/live-event-creator-earnings";
import {readLiveEvent} from "@/lib/server/live-event-admission";
import {isLiveEventV2} from "@/lib/server/live-event-sponsor-cutoff";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, access = await requireChallengeManagementAccess(request, id, "finance.view");
  if (access.response || !access.db) return access.response;
  try {
    const base = access.db.collection("cashLedger").where("eventId", "==", id).where("direction", "==", "credit");
    const {event}=await access.db.runTransaction(tx=>readLiveEvent(access.db!,tx,id));
    const owner=String(event.organizationOwnerId??event.creatorId??event.hostId??event.userId??"");
    if(!owner||owner.includes("/"))throw new Error("FINANCIAL_OWNER_REQUIRED");
    const [originals,withdrawals]=await Promise.all([base.where("shareType","==","creator_host_share").limit(301).get(),access.db.collection("withdrawalRequests").where("userId","==",owner).limit(101).get()]);
    if(originals.size>300)throw new Error("EARNINGS_PARTITION_REVIEW_REQUIRED");
    const preview=event.status==="completed"&&isLiveEventV2(event)?await previewLiveEventCreatorEarnings(access.db,id):null;
    const earningsStates={awaitingApprovalCents:0,clearingCents:0,availableCents:0,onHoldCents:0};
    for(const source of originals.docs){const row=source.data(),current=preview?.rows.find(item=>item.id===source.id);if(!Number.isSafeInteger(row.netAmountCents)||row.netAmountCents<0)throw new Error("EARNINGS_RECONCILIATION_REQUIRED");const key=current?.blocked?"onHoldCents":current?.status==="available"?"availableCents":current?.approvedAt?"clearingCents":"awaitingApprovalCents";earningsStates[key]+=row.netAmountCents;}
    const ids=new Set(originals.docs.map(row=>row.id));
    const history=withdrawals.docs.filter(row=>Array.isArray(row.data().sourceIds)&&row.data().sourceIds.some((sourceId:unknown)=>typeof sourceId==="string"&&ids.has(sourceId))).sort((a,b)=>String(b.data().createdAt).localeCompare(String(a.data().createdAt)));
    const [sales, creator, platform, prizes, refunds] = await Promise.all([
      access.db.collection("liveEventBookings").where("eventId", "==", id).where("paymentConfirmed", "==", true).aggregate({ admissionCents: AggregateField.sum("admissionCents"), entryCents: AggregateField.sum("competitionEntryCents"), refundedCents: AggregateField.sum("providerRefundedCents"), count: AggregateField.count() }).get(),
      base.where("shareType", "==", "creator_host_share").aggregate({ amountCents: AggregateField.sum("netAmountCents") }).get(),
      base.where("shareType", "==", "platform_share").aggregate({ amountCents: AggregateField.sum("netAmountCents") }).get(),
      base.where("shareType", "==", "winner_share").aggregate({ amountCents: AggregateField.sum("netAmountCents") }).get(),
      access.db.collection("refundCases").where("eventId", "==", id).where("status", "in", ["approved", "executing", "processing", "financial_hold"]).aggregate({ amountCents: AggregateField.sum("amountCents"), count: AggregateField.count() }).get(),
    ]);
    const response = ok({ currency: "USD", sales: sales.data(), creatorEarningsCents: creator.data().amountCents, platformFeeCents: platform.data().amountCents, entryPrizeAllocationCents: prizes.data().amountCents, unresolvedRefunds: refunds.data(),earningsStates,approvalRequired:true,eventComplete:event.status==="completed",withdrawalHistory:history.slice(0,20).map(row=>({id:row.id,status:row.data().status,amountCents:row.data().amountCents,createdAt:row.data().createdAt,completedAt:row.data().completedAt??null})),withdrawalHistoryIncomplete:withdrawals.size>100||history.length>20, earningsAvailability: "admin_approval_then_clearance_and_reconciliation", payoutProviderConnected: Boolean(configuredPayoutProvider()), externalPayoutExecutionAvailable: false });
    response.headers.set("Cache-Control", "private, no-store"); return response;
  } catch { return fail("Event earnings couldn't be verified. No balance has been estimated.", 503); }
}
