import {FieldValue,type Firestore,type Transaction} from "firebase-admin/firestore";
import {LiveEventPolicyError} from "@/lib/live-event-policy";

/** Booking ownership, never bearer-ticket possession, authorizes personal conversion. */
export async function readLiveEventUpgrade(db:Firestore,tx:Transaction,input:{eventId:string;userId:string;ticketId:string;personalAdmissionConfirmed:boolean;upgradeBookingId?:string}){
  if(!input.personalAdmissionConfirmed||!/^[a-f0-9]{64}$/.test(input.ticketId))throw new LiveEventPolicyError("PERSONAL_ADMISSION_CONFIRMATION_REQUIRED",422);
  const ticket=await tx.get(db.collection("liveEventTickets").doc(input.ticketId)),value=ticket.data();
  if(!value||value.eventId!==input.eventId||value.userId!==input.userId||value.kind!=="audience"||value.checkedInAt||value.capacityReleased||value.convertedToTicketId||value.stripeDisputeRestricted||value.financialRestriction||value.assignedUserId&&value.assignedUserId!==input.userId||value.recipientUserId&&value.recipientUserId!==input.userId)throw new LiveEventPolicyError("ADMISSION_UPGRADE_UNAVAILABLE");
  const validStatus=input.upgradeBookingId?value.status==="upgrade_pending"&&value.upgradeBookingId===input.upgradeBookingId:value.status==="confirmed"&&!value.upgradeBookingId;
  if(!validStatus||Number(value.admissionRefundReservedCents??0)>0||Number(value.admissionRefundedCents??0)>0||typeof value.bookingId!=="string"||value.bookingId.includes("/"))throw new LiveEventPolicyError("ADMISSION_UPGRADE_UNAVAILABLE");
  const booking=await tx.get(db.collection("liveEventBookings").doc(value.bookingId)),source=booking.data();
  if(!source||source.eventId!==input.eventId||source.userId!==input.userId||source.kind!=="audience"||source.status!=="confirmed"||!Array.isArray(source.ticketIds)||!source.ticketIds.includes(ticket.id)||Number(source.activeTicketCount??source.ticketIds.length)<1||!Number.isSafeInteger(source.amountCents)||source.amountCents<0||!Number.isSafeInteger(source.activeTicketCount??source.ticketIds.length)||source.financialRestriction||source.stripeDisputeRestricted||source.fraudReviewRequired||Number(source.refundReservedCents??0)>0||Number(source.amountCents)>0&&(source.paymentConfirmed!==true||!source.providerPaymentIntentId))throw new LiveEventPolicyError("ADMISSION_UPGRADE_UNAVAILABLE");
  return {ticket,booking,value,source};
}
export type LiveEventUpgrade=Awaited<ReturnType<typeof readLiveEventUpgrade>>;

export function convertLiveEventAdmission(tx:Transaction,upgrade:LiveEventUpgrade,participantPassId:string,competitionBookingId:string,now:string){
  tx.update(upgrade.ticket.ref,{status:"converted",credential:null,credentialHash:null,capacityReleased:true,convertedToTicketId:participantPassId,competitionBookingId,convertedAt:now,upgradeBookingId:FieldValue.delete(),updatedAt:now});
  tx.update(upgrade.booking.ref,{activeTicketCount:Number(upgrade.source.activeTicketCount??upgrade.source.ticketIds.length)-1,convertedTicketCount:Number(upgrade.source.convertedTicketCount??0)+1,updatedAt:now});
}

/** Called only after provider-verified unpaid expiry/cancellation, never from a browser return URL. */
export async function readRestorableUpgrade(db:Firestore,tx:Transaction,booking:Record<string,unknown>,bookingId:string){
  if(!booking.admissionSourceTicketId)return null;
  if(typeof booking.admissionSourceTicketId!=="string"||!/^[a-f0-9]{64}$/.test(booking.admissionSourceTicketId))throw new LiveEventPolicyError("ADMISSION_UPGRADE_RECONCILIATION_REQUIRED");
  const ticket=await tx.get(db.collection("liveEventTickets").doc(booking.admissionSourceTicketId)),value=ticket.data();
  if(!value||value.eventId!==booking.eventId||value.userId!==booking.userId||value.upgradeBookingId!==bookingId||value.status!=="upgrade_pending"||value.checkedInAt||typeof value.bookingId!=="string"||value.bookingId!==booking.admissionSourceBookingId)throw new LiveEventPolicyError("ADMISSION_UPGRADE_RECONCILIATION_REQUIRED");
  const original=await tx.get(db.collection("liveEventBookings").doc(value.bookingId)),source=original.data();
  const valid=Boolean(source&&source.userId===booking.userId&&source.eventId===booking.eventId&&source.status==="confirmed"&&!source.stripeDisputeRestricted&&!source.fraudReviewRequired&&Number(source.refundReservedCents??0)===0&&!value.admissionRefundedCents&&!value.admissionRefundReservedCents);
  return {ticket,valid};
}
export function restoreLiveEventAdmission(tx:Transaction,upgrade:NonNullable<Awaited<ReturnType<typeof readRestorableUpgrade>>>,now:string){
  tx.update(upgrade.ticket.ref,{status:upgrade.valid?"confirmed":"review_required",upgradeBookingId:FieldValue.delete(),upgradeReleasedAt:now,updatedAt:now});
}
