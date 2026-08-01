import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { deterministicId } from "@/lib/server/idempotency";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { maskAccount } from "@/lib/server/withdrawals";

const SUPPORTED_METHODS = new Set(["bank_transfer", "paypal", "payoneer"]);
const SUPPORTED_CURRENCIES = new Set(["USD"]);

function publicMethod(id: string, data: Record<string, unknown>) {
  return {
    id,
    type: data.type,
    label: data.maskedAccount,
    accountHolderName: data.accountHolderName,
    country: data.country,
    currency: String(data.currency ?? "USD").toUpperCase(),
    accountType: data.accountType ?? null,
    verificationStatus: data.verificationStatus,
    providerConnected: data.providerConnected === true,
    transferEnabled: false,
    primary: data.primary === true,
    estimatedProcessingTime: data.estimatedProcessingTime,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  };
}

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Payout methods");
  const snapshot = await db.collection("payoutMethods").where("userId", "==", user.uid).limit(20).get();
  return ok({
    methods: snapshot.docs.map((doc) => publicMethod(doc.id, doc.data())),
    supportedMethods: [...SUPPORTED_METHODS],
    externalPayoutEnabled: false
  }, "Payout methods loaded.");
}

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Payout methods");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body ?? {};
  const type = String((body as any).type ?? "").toLowerCase();
  const accountHolderName = String((body as any).accountHolderName ?? "").trim();
  const bankName = String((body as any).bankName ?? "").trim();
  const accountNumber = String((body as any).accountNumber ?? "").replace(/\D/g, "");
  const bankCode = String((body as any).bankCode ?? "").trim();
  const routingInformation = String((body as any).routingInformation ?? "").trim();
  const country = String((body as any).country ?? "US").trim().toUpperCase();
  const currency = String((body as any).currency ?? "USD").trim().toUpperCase();
  const accountType = String((body as any).accountType ?? "checking").trim().toLowerCase();

  if (!SUPPORTED_METHODS.has(type)) return fail("Choose Payoneer account, Bank transfer, or PayPal account.", 400, undefined, "UNSUPPORTED_PAYOUT_METHOD");
  if (!SUPPORTED_CURRENCIES.has(currency)) return fail("Choose a supported payout currency.", 400, undefined, "PAYOUT_CURRENCY_INVALID");
  if (type === "bank_transfer") {
    if (!accountHolderName || !bankName || accountNumber.length < 4 || !bankCode || !routingInformation || !country || !["checking", "savings"].includes(accountType)) {
      return fail("Complete all required bank transfer details.", 400, undefined, "PAYOUT_METHOD_INVALID");
    }
  }

  const now = new Date().toISOString();
  const providerConnectionRequired = type !== "bank_transfer";
  const last4 = type === "bank_transfer" ? accountNumber.slice(-4) : type;
  const id = deterministicId("payout_method", user.uid, type, last4);
  const maskedAccount = type === "bank_transfer"
    ? bankName + " " + maskAccount(accountNumber)
    : (type === "paypal" ? "PayPal account" : "Payoneer account") + " - connection required";
  const existingPrimary = await db.collection("payoutMethods").where("userId", "==", user.uid).where("primary", "==", true).limit(1).get().catch(() => null);
  const method = {
    id,
    userId: user.uid,
    type,
    accountHolderName: type === "bank_transfer" ? accountHolderName : null,
    bankName: type === "bank_transfer" ? bankName : type === "paypal" ? "PayPal" : "Payoneer",
    maskedAccount,
    last4,
    bankCodeLast4: type === "bank_transfer" ? bankCode.replace(/\s/g, "").slice(-4) : null,
    routingLast4: type === "bank_transfer" ? routingInformation.replace(/\s/g, "").slice(-4) : null,
    country,
    currency,
    accountType: type === "bank_transfer" ? accountType : null,
    payoutProvider: type === "bank_transfer" ? "manual_review" : type,
    payoutProviderReference: null,
    verificationStatus: providerConnectionRequired ? "provider_connection_required" : "pending_verification",
    providerConnected: false,
    transferEnabled: false,
    externalPayoutEnabled: false,
    primary: existingPrimary ? existingPrimary.empty : false,
    estimatedProcessingTime: type === "bank_transfer" ? "Up to 3 business days" : "Up to 1 business day",
    createdAt: now,
    updatedAt: now
  };
  await db.collection("payoutMethods").doc(id).set(method, { merge: true });
  return ok({ method: publicMethod(id, method), externalPayoutEnabled: false }, providerConnectionRequired ? "Provider connection is required before this payout method can be verified." : "Bank transfer details saved for verification review.");
}

export async function PATCH(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Payout methods");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const id = String((parsed.body as any)?.id ?? "").trim();
  if (!id) return fail("Choose a payout method.", 400, undefined, "PAYOUT_METHOD_REQUIRED");
  const target = await db.collection("payoutMethods").doc(id).get();
  if (!target.exists || target.data()?.userId !== user.uid) return fail("Payout method not found.", 404, undefined, "PAYOUT_METHOD_NOT_FOUND");
  const all = await db.collection("payoutMethods").where("userId", "==", user.uid).limit(20).get();
  const batch = db.batch();
  const now = new Date().toISOString();
  all.docs.forEach((doc) => batch.set(doc.ref, { primary: doc.id === id, updatedAt: now }, { merge: true }));
  await batch.commit();
  return ok({ method: publicMethod(id, { ...(target.data() ?? {}), primary: true, updatedAt: now }) }, "Primary payout method updated.");
}