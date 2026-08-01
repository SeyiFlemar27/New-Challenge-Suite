import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { deterministicId } from "@/lib/server/idempotency";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { maskAccount } from "@/lib/server/withdrawals";

const SUPPORTED_METHODS = new Set(["bank_transfer", "paypal", "payoneer"]);

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Payout methods");
  const snapshot = await db.collection("payoutMethods").where("userId", "==", user.uid).limit(20).get();
  const methods = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      type: data.type,
      label: data.maskedAccount,
      accountHolderName: data.accountHolderName,
      country: data.country,
      currency: data.currency,
      verificationStatus: data.verificationStatus,
      providerConnected: false,
      transferEnabled: false,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    };
  });
  return ok({ methods, supportedMethods: [...SUPPORTED_METHODS], externalPayoutEnabled: false }, "Payout methods loaded.");
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
  const accountNumber = String((body as any).accountNumber ?? "").trim();
  const email = String((body as any).email ?? "").trim().toLowerCase();
  const country = String((body as any).country ?? "US").trim().toUpperCase();

  if (!SUPPORTED_METHODS.has(type)) return fail("Choose Bank Transfer, PayPal, or Payoneer.", 400, undefined, "UNSUPPORTED_PAYOUT_METHOD");
  if (!accountHolderName) return fail("Account holder name is required.", 400, undefined, "PAYOUT_METHOD_INVALID");
  if (type === "bank_transfer" && (!bankName || accountNumber.replace(/\D/g, "").length < 4)) return fail("Add a valid bank name and account number.", 400, undefined, "PAYOUT_METHOD_INVALID");
  if (type !== "bank_transfer" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Add a valid payout account email.", 400, undefined, "PAYOUT_METHOD_INVALID");

  const id = deterministicId("payout_method", user.uid, type);
  const now = new Date().toISOString();
  const domain = email.includes("@") ? email.slice(email.lastIndexOf("@")) : "";
  const maskedAccount = type === "bank_transfer" ? `${bankName} ${maskAccount(accountNumber)}` : `${type === "paypal" ? "PayPal" : "Payoneer"} - ***${domain}`;
  const method = {
    id,
    userId: user.uid,
    type,
    accountHolderName,
    bankName: type === "bank_transfer" ? bankName : type === "paypal" ? "PayPal" : "Payoneer",
    maskedAccount,
    last4: type === "bank_transfer" ? accountNumber.replace(/\D/g, "").slice(-4) : type,
    country,
    currency: "usd",
    payoutProvider: "manual",
    payoutProviderReference: null,
    verificationStatus: "details_collected",
    providerConnected: false,
    transferEnabled: false,
    externalPayoutEnabled: false,
    createdAt: now,
    updatedAt: now
  };
  await db.collection("payoutMethods").doc(id).set(method, { merge: true });
  return ok({ method: { ...method, userId: undefined }, externalPayoutEnabled: false }, "Payout method saved for withdrawal review.");
}
