import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverError, serverUnavailable } from "@/lib/server/responses";
import { customizationOptions } from "@/lib/customization/options";
import { getCustomizationAccess, sanitizeCustomization, validateCustomizationForProfile } from "@/lib/customization/access";

export const dynamic = "force-dynamic";

async function getProfileContext(db: NonNullable<ReturnType<typeof getAdminDb>>, uid: string) {
  const [accountSnap, profileSnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("profiles").doc(uid).get()
  ]);
  const account = accountSnap.exists ? accountSnap.data() ?? {} : {};
  const profile = profileSnap.exists ? profileSnap.data() ?? {} : {};
  return { account, profile, merged: { ...profile, ...account } };
}

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Profile customization");

  try {
    const { account, profile, merged } = await getProfileContext(db, user.uid);
    const customization = sanitizeCustomization((profile.customization ?? account.customization) as any);
    return ok({
      customization,
      access: getCustomizationAccess(merged),
      options: customizationOptions
    }, "Customization loaded.");
  } catch (error) {
    return serverError("Customization could not be loaded.", error instanceof Error ? error.message : error);
  }
}

export async function PATCH(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Profile customization");

  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;

  try {
    const { merged } = await getProfileContext(db, user.uid);
    const customization = sanitizeCustomization(parsed.body?.customization);
    const access = validateCustomizationForProfile(merged, customization);
    if (!access.allowed) return fail(access.message, 403, undefined, access.code ?? "CUSTOMIZATION_NOT_ALLOWED");

    const now = new Date().toISOString();
    const payload = {
      customization,
      customizationUpdatedAt: now,
      customizationUnlockedByPlan: getCustomizationAccess(merged).planId,
      updatedAt: now
    };
    await Promise.all([
      db.collection("profiles").doc(user.uid).set(payload, { merge: true }),
      db.collection("users").doc(user.uid).set(payload, { merge: true })
    ]);

    return ok(payload, "Customization saved.");
  } catch (error) {
    return serverError("Customization could not be saved.", error instanceof Error ? error.message : error);
  }
}

