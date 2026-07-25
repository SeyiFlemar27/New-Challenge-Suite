import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");

const messagesPage = read("app/sponsor/messages/page.tsx");
const messagesRoute = read("app/api/sponsor/messages/route.ts");
const threadRoute = read("app/api/sponsor/messages/[conversationId]/route.ts");
const paths = read("lib/media-upload-paths.ts");

assert(messagesPage.includes("xl:grid-cols-[340px_minmax(0,1fr)_330px]"), "Messages page should use left, center, and right workspace columns.");
assert(messagesPage.includes("Search conversations") && messagesPage.includes("Creator / opportunity summary"), "Messages page should include conversation list and context panel.");
assert(messagesPage.includes("Attach image") && messagesPage.includes("Attach document"), "Messages page should support image and document attachments.");
assert(messagesPage.includes("video attachments are not enabled"), "Video attachments must remain disabled.");
assert(messagesPage.includes("sponsorConversationMediaPath"), "Message attachments should use shared global media path support.");
assert(paths.includes("sponsor-conversations/{conversationId}/{userId}/{folder}/{fileName}"), "Shared path helper should document sponsor conversation attachments.");
assert(messagesRoute.includes("safeAttachments") && threadRoute.includes("safeAttachments"), "Message routes should validate real uploaded attachment metadata.");
assert(messagesRoute.includes("delivery_foundation") && messagesRoute.includes("not_tracked"), "Delivery/read state should remain foundation-only.");
assert(!/fake message|fake sent|read_foundation|delivered_foundation|emailSent: true/i.test(messagesPage + messagesRoute + threadRoute), "Messaging must not fake messages, delivery, read state, or email notification.");

console.log("Sponsor messaging workflow checks passed.");
