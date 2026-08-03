import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import { listConversations, MESSAGE_START_SOURCES, startConversation, type MessageStartSource } from "@/lib/server/messages";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Messages");
  return ok(await listConversations(db, user.uid), "Conversations loaded.");
}

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const rateLimit = consumeRateLimit(`message:start:${user.uid}`, { limit: 8, windowMs: 60_000 });
  if (!rateLimit.allowed) return fail("Too many messaging attempts. Please wait before trying again.", 429, { retryAfterSeconds: rateLimit.retryAfterSeconds }, "RATE_LIMITED");
  const db = getAdminDb();
  if (!db) return serverUnavailable("Messages");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const recipientId = String(parsed.body?.recipientId ?? "").trim().slice(0, 160);
  const body = String(parsed.body?.body ?? "").trim().slice(0, 2000);
  const source = String(parsed.body?.source ?? "") as MessageStartSource;
  if (!recipientId || !MESSAGE_START_SOURCES.includes(source) || source === "existing_conversation") {
    return fail("Open messaging from a member profile, challenge, invite, or discovery page.", 400, undefined, "INVALID_MESSAGE_SOURCE");
  }
  try {
    const result = await startConversation(db, {
      senderId: user.uid,
      recipientId,
      source,
      body,
      relatedChallengeId: String(parsed.body?.challengeId ?? "").slice(0, 160) || null,
      relatedProposalId: String(parsed.body?.proposalId ?? "").slice(0, 160) || null,
      relatedCampaignId: String(parsed.body?.campaignId ?? "").slice(0, 160) || null,
      attachments: parsed.body?.attachments
    });
    return ok(result, body ? "Message sent." : "Conversation ready.");
  } catch (error) {
    const caught = error as Error & { code?: string };
    return fail(caught.message || "Conversation could not be started.", caught.code === "CONVERSATION_FORBIDDEN" ? 403 : 409, undefined, caught.code ?? "MESSAGE_REJECTED");
  }
}
