import { getAdminDb } from "@/lib/firebase/admin";
import { getStripe } from "@/lib/stripe";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";
import { hasEnterprisePermission, normalizeEnterpriseAccess } from "@/lib/enterprise-access";
import { attachCreatorPrizeCheckoutSession, createPendingCreatorPrizeFunding, CREATOR_PRIZE_PAYMENT_PURPOSE, releasePendingCreatorPrizeFunding } from "@/lib/server/prize-funding";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Tournament Base Prize funding");
  const { id } = await context.params;
  const snapshot = await db.collection("tournaments").doc(id).get();
  if (!snapshot.exists) return fail("Tournament not found.", 404, undefined, "TOURNAMENT_NOT_FOUND");
  const tournament = snapshot.data() ?? {};
  const organizationId = String(tournament.organizationOwnerId ?? tournament.enterpriseOrganizationId ?? "");
  const organizationOwned = tournament.officialChallenge === true || tournament.ownershipType === "challenge_suite_official";
  if (organizationOwned) {
    const [account, profile] = await Promise.all([db.collection("users").doc(user.uid).get(), db.collection("profiles").doc(user.uid).get()]);
    const access = normalizeEnterpriseAccess({ ...profile.data(), ...account.data() });
    if (!organizationId || access?.organizationId !== organizationId || !hasEnterprisePermission(access, "finance.prepare")) return fail("Your Enterprise workspace cannot fund this Tournament.", 403, undefined, "ENTERPRISE_FINANCE_DENIED");
  } else if (tournament.hostId !== user.uid) return fail("Only the responsible creator can fund this Base Prize.", 403, undefined, "TOURNAMENT_FUNDING_OWNER_REQUIRED");
  const amountCents = Number(tournament.basePrizeAmountMinor ?? 0);
  if (tournament.status !== "draft") return fail("Base Prize funding must be completed before Admin Review.", 409, undefined, "TOURNAMENT_NOT_EDITABLE");
  if (!Number.isSafeInteger(amountCents) || amountCents < 500 || amountCents > 100000000) return fail("Save a Base Prize of at least $5 before funding.", 422, undefined, "BASE_PRIZE_AMOUNT_INVALID");
  const stripe = getStripe();
  if (!stripe) return fail("Creator prize funding is not configured.", 503, undefined, "PAYMENT_CONFIGURATION_ERROR");
  let payment;
  try {
    payment = await createPendingCreatorPrizeFunding(db, { challengeId: id, subjectType: "tournament", creatorId: user.uid, initiatedByUserId: user.uid, organizationOwnerId: organizationOwned ? organizationId : null, amountCents, currency: "USD" });
  } catch { return fail("The saved Base Prize or funding reservation changed. Refresh the draft before retrying.", 409, undefined, "PRIZE_FUNDING_RESERVATION_CONFLICT"); }
  if (payment.status === "confirmed") return ok({ status: "confirmed", paymentId: payment.id }, "Funding is already confirmed. Refresh the draft.");
  const origin = process.env.NEXT_PUBLIC_APP_URL;
  if (!origin || !/^https?:\/\//.test(origin)) return fail("The application return URL is not configured.", 503, undefined, "PAYMENT_CONFIGURATION_ERROR");
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment", payment_method_types: ["card"],
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: amountCents, product_data: { name: `Tournament Base Prize — ${String(tournament.title).slice(0, 80)}` } } }],
      success_url: `${origin}/tournaments/create?draft=${encodeURIComponent(id)}&funding=processing`,
      cancel_url: `${origin}/tournaments/create?draft=${encodeURIComponent(id)}&funding=cancelled`,
      metadata: { paymentPurpose: CREATOR_PRIZE_PAYMENT_PURPOSE, creatorPrizeFundingId: payment.id, fundingSubjectType: "tournament", challengeId: id, tournamentId: id, userId: user.uid, initiatedByUserId: user.uid, organizationOwnerId: organizationOwned ? organizationId : "" }
    }, { idempotencyKey: `creator_prize_funding_${payment.id}` });
    if (!session.url) throw new Error("Checkout URL unavailable");
    await attachCreatorPrizeCheckoutSession(db, payment.id, session);
    return ok({ url: session.url, status: "pending", webhookConfirmationRequired: true }, "Checkout opened. Funding still requires verified provider confirmation.");
  } catch {
    await releasePendingCreatorPrizeFunding(db, payment.id, "checkout_creation_failed").catch(() => undefined);
    return fail("Prize funding checkout could not be opened. Your Base Prize is not confirmed.", 503, undefined, "CHECKOUT_UNAVAILABLE");
  }
}
