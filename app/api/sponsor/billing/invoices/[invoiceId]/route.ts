import { ok, serverError } from "@/lib/server/responses";
import { assertSponsorOwnedDoc, requireSponsorContext } from "@/lib/server/sponsor";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ invoiceId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { invoiceId } = await params;
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const owned = await assertSponsorOwnedDoc(context.db, "sponsorInvoices", invoiceId, context.user.uid);
  if (owned.response) return owned.response;
  return ok({ invoice: { id: owned.snap.id, ...owned.snap.data() }, pdfStatus: "foundation_only" }, "Invoice foundation loaded.");
}
