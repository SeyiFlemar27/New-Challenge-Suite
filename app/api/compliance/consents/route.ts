import { getAdminDb } from "@/lib/firebase/admin";
import { legalDocuments } from "@/lib/legal";
import { requireRequestUser } from "@/lib/server/auth";
import { ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";
import type { AgreementType } from "@/lib/types";

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Consent logging");

  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const agreementType = body.agreementType as AgreementType;
  const doc = legalDocuments[agreementType];
  if (!doc) return validationError({ agreementType: "Select a valid agreement type." });

  const headers = new Headers(request.headers);
  const record = {
    userId: user.uid,
    agreementType,
    agreementVersion: body.agreementVersion ?? doc.version,
    targetId: body.targetId ?? null,
    timestamp: new Date().toISOString(),
    ipAddress: headers.get("x-forwarded-for")?.split(",")[0] ?? "local",
    deviceInformation: headers.get("user-agent") ?? "unknown",
    region: headers.get("x-vercel-ip-country") ?? "self-declared"
  };

  await db.collection("userConsents").add(record);

  return ok({ record }, "Consent recorded.");
}
