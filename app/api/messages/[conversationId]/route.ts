import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import { listMessages, markConversationRead, sendMessage } from "@/lib/server/messages";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Messages");
  try {
    const { conversationId } = await params;
    return ok(await listMessages(db, conversationId, user.uid), "Conversation loaded.");
  } catch (error) {
    const caught = error as Error & { code?: string };
    return fail(caught.message || "Conversation could not be loaded.", caught.code === "CONVERSATION_FORBIDDEN" ? 403 : 404, undefined, caught.code ?? "MESSAGE_REJECTED");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const rateLimit = consumeRateLimit(`message:send:${user.uid}`, { limit: 20, windowMs: 60_000 });
  if (!rateLimit.allowed) return fail("Too many messages. Please wait before sending another.", 429, { retryAfterSeconds: rateLimit.retryAfterSeconds }, "RATE_LIMITED");
  const db = getAdminDb();
  if (!db) return serverUnavailable("Messages");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  try {
    const { conversationId } = await params;
    const message = await sendMessage(db, {
      conversationId,
      senderId: user.uid,
      body: String(parsed.body?.body ?? ""),
      attachments: parsed.body?.attachments,
      idempotencyKey: request.headers.get("idempotency-key")
    });
    return ok({ message }, message.duplicate ? "Message already recorded." : "Message sent.");
  } catch (error) {
    const caught = error as Error & { code?: string };
    return fail(caught.message || "Message could not be sent.", caught.code === "CONVERSATION_FORBIDDEN" ? 403 : 409, undefined, caught.code ?? "MESSAGE_REJECTED");
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Messages");
  try {
    const { conversationId } = await params;
    return ok(await markConversationRead(db, conversationId, user.uid), "Conversation marked read.");
  } catch (error) {
    const caught = error as Error & { code?: string };
    return fail(caught.message || "Read state could not be updated.", caught.code === "CONVERSATION_FORBIDDEN" ? 403 : 404, undefined, caught.code ?? "MESSAGE_REJECTED");
  }
}
