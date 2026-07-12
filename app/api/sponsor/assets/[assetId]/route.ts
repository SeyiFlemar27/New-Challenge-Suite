import { ok, readJson, serverError } from "@/lib/server/responses";
import { assertSponsorOwnedDoc, requireSponsorContext } from "@/lib/server/sponsor";
import { cleanText, isoNow, normalizeAssetType, safeArray } from "@/lib/sponsor-operations";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ assetId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { assetId } = await params;
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const owned = await assertSponsorOwnedDoc(context.db, "sponsorBrandAssets", assetId, context.user.uid);
  if (owned.response) return owned.response;
  const versions = await context.db.collection("sponsorAssetVersions").where("sponsorId", "==", context.user.uid).where("assetId", "==", assetId).limit(25).get();
  return ok({ asset: { id: owned.snap.id, ...owned.snap.data() }, versions: versions.docs.map((doc) => ({ id: doc.id, ...doc.data() })), downloadStatus: "foundation_only" }, "Sponsor asset foundation loaded.");
}

export async function PATCH(request: Request, { params }: Params) {
  const { assetId } = await params;
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const owned = await assertSponsorOwnedDoc(context.db, "sponsorBrandAssets", assetId, context.user.uid);
  if (owned.response) return owned.response;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  try {
    const now = isoNow();
    const update = { name: cleanText(body.name ?? owned.snap.data()?.name).slice(0, 180), type: normalizeAssetType(body.type ?? owned.snap.data()?.type), folder: cleanText(body.folder ?? owned.snap.data()?.folder).slice(0, 120), tags: safeArray(body.tags ?? owned.snap.data()?.tags), usagePermissions: cleanText(body.usagePermissions ?? owned.snap.data()?.usagePermissions, "private_sponsor_only").slice(0, 180), archived: Boolean(body.archived ?? owned.snap.data()?.archived ?? false), publicExposure: false, updatedAt: now, updatedBy: context.user.uid, version: Number(owned.snap.data()?.version ?? 1) + 1 };
    await Promise.all([owned.snap.ref.set(update, { merge: true }), context.db.collection("sponsorAssetVersions").add({ sponsorId: context.user.uid, assetId, version: update.version, changeSummary: "Asset metadata foundation updated.", fileStored: false, createdAt: now, createdBy: context.user.uid })]);
    return ok({ asset: { id: assetId, ...(owned.snap.data() ?? {}), ...update } }, "Asset foundation updated. No public exposure or fake download was created.");
  } catch (error) {
    console.error("[sponsor-asset:patch]", { userId: context.user.uid, assetId, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor asset could not be updated.");
  }
}
