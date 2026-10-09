import { fail, serverError } from "@/lib/server/responses";
import { requireSponsorContext } from "@/lib/server/sponsor";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  return fail("Historical proposal revisions are immutable. New sponsorship activity starts from an opportunity.", 410, undefined, "SPONSOR_PROPOSAL_REVISION_RETIRED");
}
