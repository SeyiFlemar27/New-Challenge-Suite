import { ok, serverError } from "@/lib/server/responses";
import { requireSponsorContext } from "@/lib/server/sponsor";
import { contractTemplates, legalDisclaimer } from "@/lib/sponsor-finance";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  return ok({ templates: contractTemplates, disclaimer: legalDisclaimer }, "Contract templates loaded. Templates are workflow aids only and are not legal advice.");
}
