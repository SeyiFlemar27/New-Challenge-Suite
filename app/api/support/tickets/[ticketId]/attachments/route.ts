import { getAdminStorage, getAdminDb } from "@/lib/firebase/admin";
import { requireAdminPermission, requireRequestUser } from "@/lib/server/auth";
import { fail, serverUnavailable } from "@/lib/server/responses";
import { SUPPORT_ATTACHMENT_MAX_BYTES, SUPPORT_ATTACHMENT_TYPES, supportAttachmentBytesMatchType, supportAttachmentPathAllowed } from "@/lib/server/support-tickets";

export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { user, response } = await requireRequestUser(request); if (response) return response;
  const { ticketId } = await params; const path = new URL(request.url).searchParams.get("path") ?? "";
  const db = getAdminDb(); const storage = getAdminStorage(); if (!db || !storage) return serverUnavailable("Support attachment");
  const ticketRef = db.collection("supportTickets").doc(ticketId); const ticket = await ticketRef.get();
  if (!ticket.exists) return fail("Ticket not found.", 404);
  const data = ticket.data() ?? {}; const isOwner = data.userId === user!.uid;
  if (!isOwner) { const admin = await requireAdminPermission(request, "tickets.view"); if (admin.response) return admin.response; }
  const ownerId = String(data.userId ?? "");
  if (!supportAttachmentPathAllowed(ownerId, path)) return fail("Attachment path is invalid.", 400);
  const initial = await ticketRef.collection("messages").doc("initial").get();
  const allowedPaths = Array.isArray(data.attachmentPaths) ? data.attachmentPaths : [];
  const initialPaths = Array.isArray(initial.data()?.attachmentPaths) ? initial.data()?.attachmentPaths as string[] : [];
  if (![...allowedPaths, ...initialPaths].includes(path)) return fail("Attachment is not associated with this ticket.", 404);
  try {
    const file = storage.bucket().file(path); const [exists] = await file.exists(); if (!exists) return fail("Attachment not found.", 404);
    const [[bytes], [metadata]] = await Promise.all([file.download(), file.getMetadata()]);
    const contentType = String(metadata.contentType ?? "application/octet-stream");
    if (!SUPPORT_ATTACHMENT_TYPES.has(contentType) || bytes.length > SUPPORT_ATTACHMENT_MAX_BYTES || !supportAttachmentBytesMatchType(bytes, contentType)) return fail("Attachment metadata is invalid.", 404);
    return new Response(new Uint8Array(bytes), { status: 200, headers: { "content-type": contentType, "content-length": String(bytes.length), "content-disposition": `inline; filename="${path.split("/").pop()?.replace(/["\\\r\n]/g, "_") ?? "attachment"}"`, "cache-control": "private, no-store" } });
  } catch { return fail("Attachment is unavailable.", 404); }
}
