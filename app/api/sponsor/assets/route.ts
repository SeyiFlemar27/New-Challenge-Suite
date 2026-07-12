import { ok, readJson, serverError, validationError } from "@/lib/server/responses";
import { requireSponsorContext } from "@/lib/server/sponsor";
import { cleanText, isoNow, normalizeAssetType, safeArray } from "@/lib/sponsor-operations";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const [assetsSnap, foldersSnap] = await Promise.all([
      context.db.collection("sponsorBrandAssets").where("sponsorId", "==", context.user.uid).limit(100).get(),
      context.db.collection("sponsorAssetFolders").where("sponsorId", "==", context.user.uid).limit(50).get()
    ]);
    const assets = assetsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const folders = foldersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return ok({ assets, folders, uploadStatus: "setup_required", publicExposure: false }, "Sponsor asset library loaded.");
  } catch (error) {
    console.error("[sponsor-assets:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor assets could not be loaded.");
  }
}

export async function POST(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  if (cleanText(body.name).length < 2) return validationError({ name: "Asset name is required." });
  try {
    const now = isoNow();
    const ref = context.db.collection("sponsorBrandAssets").doc();
    const asset = { id: ref.id, sponsorId: context.user.uid, ownerUid: context.user.uid, name: cleanText(body.name).slice(0, 180), type: normalizeAssetType(body.type), folder: cleanText(body.folder).slice(0, 120), tags: safeArray(body.tags), usagePermissions: cleanText(body.usagePermissions, "private_sponsor_only").slice(0, 180), fileMetadata: body.fileMetadata && typeof body.fileMetadata === "object" ? body.fileMetadata : {}, uploadStatus: "metadata_only", publicExposure: false, sharedWithCampaigns: [], archived: false, createdAt: now, updatedAt: now, createdBy: context.user.uid, updatedBy: context.user.uid, version: 1 };
    await Promise.all([ref.set(asset), context.db.collection("sponsorAssetVersions").add({ sponsorId: context.user.uid, assetId: ref.id, version: 1, changeSummary: "Asset metadata foundation created.", fileStored: false, createdAt: now, createdBy: context.user.uid })]);
    return ok({ asset }, "Asset metadata saved. No fake upload or public exposure was created.");
  } catch (error) {
    console.error("[sponsor-assets:post]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor asset could not be saved.");
  }
}
