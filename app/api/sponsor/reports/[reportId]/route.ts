import { ok, serverError } from "@/lib/server/responses";
import { assertSponsorOwnedDoc, requireSponsorContext } from "@/lib/server/sponsor";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ reportId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { reportId } = await params;
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const owned = await assertSponsorOwnedDoc(context.db, "sponsorReports", reportId, context.user.uid);
  if (owned.response) return owned.response;
  return ok({ report: { id: owned.snap.id, ...owned.snap.data() }, exportStatus: "foundation_only" }, "Sponsor report foundation loaded.");
}
