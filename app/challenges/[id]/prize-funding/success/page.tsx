"use client";
import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { PaymentStatusJourney } from "@/components/payment-status-journey";
import { PAYMENT_PURPOSES } from "@/lib/payment-purposes";
export default function CreatorPrizeFundingSuccessPage() { return <Suspense><Content /></Suspense>; }
function Content() { const { id } = useParams<{ id: string }>(); const params = useSearchParams(); return <PaymentStatusJourney purpose={PAYMENT_PURPOSES.prizePool} reference={params.get("prizeFundingId")} resourceId={id} copy={{ eyebrow: "Creator prize funding", pendingTitle: "Confirming prize funding", confirmedTitle: "Prize funding confirmed", pendingBody: "We are confirming your payment with Stripe. The prize will update automatically when confirmation is complete.", confirmedBody: "The creator-funded prize is reserved for this challenge. Winner release remains subject to approved results and the dispute hold.", primaryLabel: "Return to Builder", primaryHref: `/challenges/create/${id}`, secondaryLabel: "View Challenge", secondaryHref: `/challenges/${id}` }} />; }