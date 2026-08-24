import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");

const sponsorRedirect = read("app/sponsor/messages/page.tsx");
const messagesPage = read("app/messages/[conversationId]/page.tsx");
const messagesRoute = read("app/api/messages/route.ts");
const threadRoute = read("app/api/messages/[conversationId]/route.ts");
const messageService = read("lib/server/messages.ts");
const paths = read("lib/media-upload-paths.ts");

assert(sponsorRedirect.includes('redirect("/messages")'), "Sponsor messages should use the canonical global conversation workspace.");
assert(messagesPage.includes("xl:grid-cols-[330px_minmax(0,1fr)_310px]"), "Messages page should use left, center, and right workspace columns.");
assert(messagesPage.includes("Collaboration details") && messagesPage.includes("Linked proposal available"), "Messages page should include conversation list and context panel.");
assert(messagesPage.includes("Attach image") && messagesPage.includes("Attach document"), "Messages page should support image and document attachments.");
assert(!messagesPage.includes('kind="video"'), "Video attachments must remain disabled.");
assert(messagesPage.includes("sponsorConversationMediaPath"), "Message attachments should use shared global media path support.");
assert(paths.includes("sponsor-conversations/{conversationId}/{userId}/{folder}/{fileName}"), "Shared path helper should document sponsor conversation attachments.");
assert(messageService.includes("safeAttachments") && messagesRoute.includes("attachments: parsed.body?.attachments") && threadRoute.includes("attachments: parsed.body?.attachments"), "Message routes should validate real uploaded attachment metadata.");
assert(messageService.includes('status: "sent"') && messageService.includes("lastReadAt"), "Delivery/read state should be canonical server state.");
assert(!/fake message|fake sent|read_foundation|delivered_foundation|emailSent: true/i.test(messagesPage + messagesRoute + threadRoute + messageService), "Messaging must not fake messages, delivery, read state, or email notification.");

console.log("Sponsor messaging workflow checks passed.");
