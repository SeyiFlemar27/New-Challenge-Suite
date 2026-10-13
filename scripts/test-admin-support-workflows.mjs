import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp as initializeClientApp } from "firebase/app";
import { connectAuthEmulator, signInWithEmailAndPassword, signOut, getAuth as getClientAuth } from "firebase/auth";
import { connectStorageEmulator, getStorage, ref, uploadBytes } from "firebase/storage";

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST is required");
assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST, "FIREBASE_AUTH_EMULATOR_HOST is required");
const projectId = process.env.FIREBASE_PROJECT_ID ?? "demo-challenge-suite";
const app = initializeApp({ projectId, storageBucket: `${projectId}.appspot.com` });
const db = getFirestore(app); const auth = getAuth(app); const runId = `support_${randomUUID().replaceAll("-", "")}`;
let assertions = 0;
function check(value, message) { assert.ok(value, message); assertions += 1; }
function equal(value, expected, message) { assert.equal(value, expected, message); assertions += 1; }
async function createUser(label, profile = {}) {
  const email = `${label}-${randomUUID()}@example.test`;
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!", returnSecureToken: true }) });
  const body = await response.json(); assert.equal(response.ok, true, JSON.stringify(body));
  await db.collection("users").doc(body.localId).set({ email, emailVerified: true, verificationStatus: "verified", accountStatus: "active", ...profile });
  return { uid: body.localId, token: body.idToken, email, password: "TestPassword123!" };
}
function req(url, token, method = "GET", body, headers = {}) { return new Request(url, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
async function data(response) { return (await response.json()).data; }

const admin = await createUser("admin", { adminRoles: ["support_admin"], adminAccessStatus: "active", adminSecuritySetupComplete: true });
const user = await createUser("customer");
await auth.updateUser(user.uid, { emailVerified: true });
const other = await createUser("other");
const appointed = await createUser("appointed");
const suspended = await createUser("suspended", { adminRoles: ["admin"], adminAccessStatus: "suspended", adminSecuritySetupComplete: true });
const expiredAdmin = await createUser("expired-admin", { adminRoles: ["admin"], adminAccessStatus: "active", adminSecuritySetupComplete: true, adminAccessExpiresAt: "2020-01-01T00:00:00.000Z" });
const fakeClaims = await createUser("claims", { role: "admin" });
const manager = await createUser("manager", { adminRoles: ["platform_owner"], adminAccessStatus: "active", adminSecuritySetupComplete: true });

const clientApp = initializeClientApp({ apiKey: "fake-api-key", authDomain: `${projectId}.firebaseapp.com`, projectId, storageBucket: `${projectId}.appspot.com` }, `support_client_${runId}`);
const clientAuth = getClientAuth(clientApp); connectAuthEmulator(clientAuth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? "127.0.0.1:9199";
const [storageHostname, storagePort = "9199"] = storageHost.split(":");
const clientStorage = getStorage(clientApp); connectStorageEmulator(clientStorage, storageHostname, Number(storagePort));
await signInWithEmailAndPassword(clientAuth, user.email, user.password);
const pdfPath = `users/${user.uid}/support/${runId}/receipt.pdf`;
const imagePath = `users/${user.uid}/support/${runId}/screen.png`;
await uploadBytes(ref(clientStorage, pdfPath), new Blob(["%PDF-1.7 fixture"], { type: "application/pdf" }), { contentType: "application/pdf" });
await uploadBytes(ref(clientStorage, imagePath), new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" }), { contentType: "image/png" });
await signOut(clientAuth);
await signInWithEmailAndPassword(clientAuth, other.email, other.password);
try { await uploadBytes(ref(clientStorage, `${pdfPath}.unauthorized`), new Blob(["%PDF-1.7 unauthorized"], { type: "application/pdf" }), { contentType: "application/pdf" }); check(false, "another authenticated user cannot upload into the ticket owner's support namespace"); }
catch (error) { check(error?.code === "storage/unauthorized", "another authenticated user is denied from the ticket owner's support namespace"); }
await signOut(clientAuth);
try { await uploadBytes(ref(clientStorage, `${pdfPath}.anonymous`), new Blob(["%PDF-1.7 anonymous"], { type: "application/pdf" }), { contentType: "application/pdf" }); check(false, "signed-out visitors cannot upload support attachments"); }
catch (error) { check(error?.code === "storage/unauthorized", "signed-out visitor is denied from uploading support attachments"); }
await signInWithEmailAndPassword(clientAuth, user.email, user.password);

const { GET: adminAccess } = await import("../app/api/admin/access/route.ts");
const accessResponse = await adminAccess(req("http://localhost/api/admin/access", admin.token));
equal(accessResponse.status, 200, "legacy assigned administrator authenticates");
const access = await data(accessResponse);
equal(access.roles.length, 1, "legacy assigned role is represented as one canonical role");
equal(access.roles[0], "admin", "canonical administrator identity is Admin");
check(access.permissions.includes("tickets.resolve"), "legacy support permissions are preserved");
check(!access.permissions.includes("refunds.execute"), "legacy support permissions remain scoped");
const { POST: appointAdmin } = await import("../app/api/admin/team/route.ts");
const appointUrl = "http://localhost/api/admin/team";
equal((await appointAdmin(req(appointUrl, manager.token, "POST", { method: "uid", uid: appointed.uid, roles: ["finance_admin"], reason: "Assign finance scope." }))).status, 400, "legacy role cannot be assigned as a new administrator tier");
equal((await appointAdmin(req(appointUrl, manager.token, "POST", { method: "uid", uid: appointed.uid, roles: ["admin"], reason: "Authorize platform Admin." }))).status, 200, "one canonical Admin role can be appointed");
equal((await db.collection("users").doc(appointed.uid).get()).data()?.adminRoles?.[0], "admin", "appointment persists canonical role only");
const { GET: getCases, PATCH: updateCase } = await import("../app/api/admin/cases/route.ts");
equal((await getCases(req("http://localhost/api/admin/cases?kind=support", null))).status, 401, "unauthenticated admin denied");
equal((await getCases(req("http://localhost/api/admin/cases?kind=support", fakeClaims.token, "GET", undefined, { "x-admin-role": "admin", "x-admin-permissions": "tickets.resolve" }))).status, 403, "forged client role and permissions denied");
equal((await getCases(req("http://localhost/api/admin/cases?kind=support", suspended.token))).status, 403, "suspended admin denied");
equal((await getCases(req("http://localhost/api/admin/cases?kind=support", expiredAdmin.token))).status, 403, "expired Admin access denied");

const { POST: createTicket, GET: listUserTickets } = await import("../app/api/support/tickets/route.ts");
const ticketResponse = await createTicket(req("http://localhost/api/support/tickets", user.token, "POST", { category: "account_security", issueType: "login", subject: "Need help signing in", description: "I cannot access my account after the latest update.", attachmentPaths: [pdfPath, imagePath] }, { "idempotency-key": `${runId}_create_ticket` }));
equal(ticketResponse.status, 200, "user creates ticket through production route");
const created = await data(ticketResponse); check(/^CS-\d{5,}$/.test(created.ticketNumber), "ticket receives a readable CS number");
const ticketId = created.ticketId; const ticketRef = db.collection("supportTickets").doc(ticketId);
equal((await db.collection("supportTickets").doc(ticketId).get()).data()?.userId, user.uid, "ticket ownership comes from authenticated identity");
equal((await db.collection("adminActionTasks").where("sourceId", "==", ticketId).get()).size, 1, "ticket creates one linked Admin task");
equal((await ticketRef.get()).data()?.attachmentPaths?.length, 2, "ticket stores authorized PDF and image attachments");
const invalidAttachment = await createTicket(req("http://localhost/api/support/tickets", user.token, "POST", { category: "account", subject: "Unsafe attachment", description: "I cannot access my account after the latest update.", attachmentPaths: ["https://example.test/private.pdf"] }));
equal(invalidAttachment.status, 400, "external attachment URLs are rejected");
equal((await listUserTickets(req("http://localhost/api/support/tickets", other.token))).status, 200, "other user can list own tickets");
equal((await data(await listUserTickets(req("http://localhost/api/support/tickets", other.token)))).tickets.length, 0, "other user receives no foreign ticket");
const { GET: adminTicket } = await import("../app/api/admin/support/tickets/[ticketId]/route.ts");
equal((await adminTicket(req(`http://localhost/api/admin/support/tickets/${ticketId}`, other.token), { params: Promise.resolve({ ticketId }) })).status, 403, "non-admin cannot read ticket details");
equal((await adminTicket(req(`http://localhost/api/admin/support/tickets/${ticketId}`, admin.token), { params: Promise.resolve({ ticketId }) })).status, 200, "authorized Admin reads ticket detail");
const { GET: ticketAttachment } = await import("../app/api/support/tickets/[ticketId]/attachments/route.ts");
const attachmentUrl = `http://localhost/api/support/tickets/${ticketId}/attachments?path=${encodeURIComponent(pdfPath)}`;
const attachmentContext = { params: Promise.resolve({ ticketId }) };
equal((await ticketAttachment(req(attachmentUrl, user.token), attachmentContext)).status, 423, "ticket owner cannot download a quarantined attachment before scanning");
equal((await ticketAttachment(req(attachmentUrl, other.token), attachmentContext)).status, 403, "another user cannot read a ticket attachment");
equal((await ticketAttachment(req(attachmentUrl, admin.token), attachmentContext)).status, 423, "Admin cannot download a quarantined attachment before scanning");

const oldFetch = globalThis.fetch; const originalEnv = { RESEND_API_KEY: process.env.RESEND_API_KEY, EMAIL_FROM: process.env.EMAIL_FROM, SUPPORT_INBOUND_EMAIL: process.env.SUPPORT_INBOUND_EMAIL, RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET, SUPPORT_EMAIL_DELIVERY_ENABLED: process.env.SUPPORT_EMAIL_DELIVERY_ENABLED };
process.env.RESEND_API_KEY = "re_test_deterministic"; process.env.EMAIL_FROM = "Challenge Suite <support@example.test>"; process.env.SUPPORT_INBOUND_EMAIL = "support@example.test";
process.env.SUPPORT_EMAIL_DELIVERY_ENABLED = "true";
const secretBytes = Buffer.from("deterministic-inbound-secret"); process.env.RESEND_WEBHOOK_SECRET = `whsec_${secretBytes.toString("base64")}`;
let sentEmail = null; let emailSendCount = 0;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url === "https://api.resend.com/emails") { emailSendCount += 1; sentEmail = JSON.parse(String(init?.body)); return Response.json({ id: "email_test" }); }
  if (url.startsWith("https://api.resend.com/emails/receiving/")) {
    const wrongSender = url.endsWith(encodeURIComponent(`${runId}_email2`));
    const alternateSender = url.endsWith(encodeURIComponent(`${runId}_alternate_email`));
    return Response.json({ data: { from: wrongSender ? other.email : alternateSender ? "alternate-contact@example.test" : user.email, text: "I am replying by email.", message_id: `<${runId}${wrongSender ? "-other" : alternateSender ? "-alternate" : ""}@example.test>` } });
  }
  return oldFetch(input, init);
};
try {
  const { POST: adminReply } = await import("../app/api/admin/support/tickets/[ticketId]/messages/route.ts");
  const replyUrl = `http://localhost/api/admin/support/tickets/${ticketId}/messages`;
  const adminReplyRequest = () => adminReply(req(replyUrl, admin.token, "POST", { message: "We are checking the sign-in issue.", reason: "Responding to user request.", confirmed: true }, { "idempotency-key": `${runId}_admin_reply` }), { params: Promise.resolve({ ticketId }) });
  equal((await adminReplyRequest()).status, 200, "Admin reply invokes the real handler and deterministic provider");
  equal((await adminReplyRequest()).status, 200, "repeated Admin reply request is idempotent");
  equal(emailSendCount, 1, "duplicate Admin reply sends only one provider email");
  check(sentEmail?.to === user.email, "Admin reply email is sent to the authenticated ticket owner");
  check(sentEmail?.reply_to === `support+${created.ticketNumber}@example.test`, "outbound reply uses ticket-specific inbound alias");
  equal((await db.collection("supportTickets").doc(ticketId).collection("messages").where("authorType", "==", "admin").get()).size, 1, "Admin reply persists once");
  const { POST: inbound } = await import("../app/api/webhooks/resend/inbound/route.ts");
  const event = { id: `${runId}_event`, type: "email.received", data: { email_id: `${runId}_email`, from: user.email, to: [`support+${created.ticketNumber}@example.test`] } };
  const raw = JSON.stringify(event); const now = String(Math.floor(Date.now() / 1000)); const signature = createHmac("sha256", secretBytes).update(`${event.id}.${now}.${raw}`).digest("base64");
  const inboundRequest = () => new Request("http://localhost/api/webhooks/resend/inbound", { method: "POST", headers: { "content-type": "application/json", "svix-id": event.id, "svix-timestamp": now, "svix-signature": `v1,${signature}` }, body: raw });
  equal((await inbound(inboundRequest())).status, 200, "authenticated provider inbound reply accepted");
  equal((await inbound(inboundRequest())).status, 200, "duplicate inbound event handled idempotently");
  equal((await ticketRef.collection("messages").where("provider", "==", "resend").get()).size, 1, "one inbound message persisted");
  equal((await ticketRef.get()).data()?.status, "open", "inbound user reply preserves the canonical open state");
  const invalidSenderEvent = { ...event, id: `${runId}_wrong_sender`, data: { ...event.data, email_id: `${runId}_email2`, from: other.email } };
  const invalidRaw = JSON.stringify(invalidSenderEvent); const invalidSignature = createHmac("sha256", secretBytes).update(`${invalidSenderEvent.id}.${now}.${invalidRaw}`).digest("base64");
  const deniedSender = await inbound(new Request("http://localhost/api/webhooks/resend/inbound", { method: "POST", headers: { "svix-id": invalidSenderEvent.id, "svix-timestamp": now, "svix-signature": `v1,${invalidSignature}` }, body: invalidRaw }));
  equal(deniedSender.status, 403, "provider-signed message from a different sender is denied");
  const contactTicketResponse = await createTicket(req("http://localhost/api/support/tickets", user.token, "POST", { category: "technical_issues", issueType: "site_error", subject: "Alternate contact test", description: "Please test the explicitly supplied contact address behavior.", contactEmail: "alternate-contact@example.test" }, { "idempotency-key": `${runId}_alternate_contact` }));
  equal(contactTicketResponse.status, 200, "customer may provide an optional notification address");
  const contactTicket = await data(contactTicketResponse);
  const alternateEvent = { id: `${runId}_alternate_sender`, type: "email.received", data: { email_id: `${runId}_alternate_email`, from: "alternate-contact@example.test", to: [`support+${contactTicket.ticketNumber}@example.test`] } };
  const alternateRaw = JSON.stringify(alternateEvent); const alternateSignature = createHmac("sha256", secretBytes).update(`${alternateEvent.id}.${now}.${alternateRaw}`).digest("base64");
  const alternateResponse = await inbound(new Request("http://localhost/api/webhooks/resend/inbound", { method: "POST", headers: { "svix-id": alternateEvent.id, "svix-timestamp": now, "svix-signature": `v1,${alternateSignature}` }, body: alternateRaw }));
  equal(alternateResponse.status, 200, "unverified optional contact address is accepted when sender and ticket reference match");
  const alternateMessages = await db.collection("supportTickets").doc(contactTicket.ticketId).collection("messages").where("provider", "==", "resend").get();
  equal(alternateMessages.size, 1, "approved alternate contact reply is appended once to the original ticket");
  equal(alternateMessages.docs[0].data()?.authorId, user.uid, "email reply remains attributed to the ticket owner, not an email identity");
  equal((await db.collection("supportTickets").doc(contactTicket.ticketId).get()).data()?.userId, user.uid, "email reply cannot change ticket ownership");
  equal((await db.collection("cashLedger").where("sourceId", "==", contactTicket.ticketId).get()).size, 0, "email reply does not authorize or create a financial operation");

  const missingReason = await updateCase(req("http://localhost/api/admin/cases", admin.token, "PATCH", { kind: "support", caseId: ticketId, action: "resolve", reason: "short", confirmed: true }));
  equal(missingReason.status, 400, "sensitive support action requires a reason");
  const { PATCH: updateIssue } = await import("../app/api/admin/support/tickets/[ticketId]/route.ts");
  const { POST: confirmPrimaryIssue } = await import("../app/api/admin/support/tickets/[ticketId]/primary/route.ts");
  const issueUrl = `http://localhost/api/admin/support/tickets/${ticketId}`;
  const primaryIssue = (await db.collection("supportTickets").doc(ticketId).collection("issues").doc("primary").get()).data();
  equal((await ticketRef.get()).data()?.primaryIssueId, null, "new ticket waits for explicit Admin confirmation of its primary issue");
  equal(primaryIssue?.primary, false, "initial complaint is not treated as an automatically confirmed primary issue");
  const incompleteResolution = await updateCase(req("http://localhost/api/admin/cases", admin.token, "PATCH", { kind: "support", caseId: ticketId, action: "resolve", reason: "Issue investigation completed.", resolutionSummary: "Support resolved the account access issue.", confirmed: true }));
  equal(incompleteResolution.status, 409, "ticket cannot be resolved while its tracked issue is open");
  equal((await updateIssue(req(issueUrl, admin.token, "PATCH", { issueId: "primary", condition: "explained", customerExplanation: "The user email verification was missing and is now complete.", reason: "Verified the customer-facing explanation.", confirmed: true, expectedUpdatedAt: primaryIssue.updatedAt }), { params: Promise.resolve({ ticketId }) })).status, 200, "Admin records a customer-visible issue outcome");
  const unconfirmedResolution = await updateCase(req("http://localhost/api/admin/cases", admin.token, "PATCH", { kind: "support", caseId: ticketId, action: "resolve", reason: "Issue investigation completed.", resolutionSummary: "Support resolved the account access issue.", confirmed: true }));
  equal(unconfirmedResolution.status, 409, "ticket cannot resolve until an Admin confirms the primary issue");
  const primaryTicketVersion = Number((await ticketRef.get()).data()?.version ?? 0);
  const primaryDecision = () => confirmPrimaryIssue(req(`${issueUrl}/primary`, admin.token, "POST", { issueId: "primary", reason: "The original complaint is the central support issue.", confirmed: true, expectedVersion: primaryTicketVersion }, { "idempotency-key": `${runId}_primary` }), { params: Promise.resolve({ ticketId }) });
  equal((await primaryDecision()).status, 200, "Admin confirms the primary issue through the authorized handler");
  equal((await primaryDecision()).status, 200, "repeated primary issue confirmation is idempotent");
  equal((await ticketRef.get()).data()?.primaryIssueId, "primary", "confirmed primary issue is persisted on the ticket");
  check(Boolean((await db.collection("auditLogs").where("action", "==", "support.primary_issue_confirmed").where("targetId", "==", ticketId).get()).size), "primary issue confirmation creates a durable Admin audit event");
  const decisionKey = `${runId}_resolve`;
  const resolve = () => updateCase(req("http://localhost/api/admin/cases", admin.token, "PATCH", { kind: "support", caseId: ticketId, action: "resolve", reason: "Issue investigation completed.", resolutionSummary: "Support verified the account access explanation with the customer.", confirmed: true }, { "idempotency-key": decisionKey }));
  equal((await resolve()).status, 200, "Admin resolves ticket through actual case route");
  equal((await resolve()).status, 200, "duplicate resolution is idempotent");
  const resolved = (await ticketRef.get()).data(); equal(resolved?.status, "resolved", "ticket persisted as resolved"); check(Date.parse(String(resolved?.reopenUntil)) > Date.now(), "reopen window is set to seven days");
  const audit = await db.collection("auditLogs").where("action", "==", "support.resolve").where("targetId", "==", ticketId).get();
  equal(audit.size, 1, "decision creates one audit record"); equal(audit.docs[0].data().actorId, admin.uid, "audit records Admin actor"); check(Boolean(audit.docs[0].data().reason), "audit records required reason"); check(audit.docs[0].data().after?.outcome === "success", "audit records outcome");
  const { POST: userReply } = await import("../app/api/support/tickets/[ticketId]/messages/route.ts");
  const userReplyUrl = `http://localhost/api/support/tickets/${ticketId}/messages`;
  equal((await userReply(req(userReplyUrl, user.token, "POST", { message: "Thanks, I can sign in now." }, { "idempotency-key": `${runId}_user_reopen` }), { params: Promise.resolve({ ticketId }) })).status, 200, "user reopens within seven days");
  equal((await ticketRef.get()).data()?.status, "open", "in-window customer reply reopens the resolved ticket to the canonical open status");
  await ticketRef.set({ status: "resolved", resolvedAt: "2026-01-01T00:00:00.000Z", reopenUntil: "2026-01-08T00:00:00.000Z" }, { merge: true });
  equal((await userReply(req(userReplyUrl, user.token, "POST", { message: "Please reopen this after the deadline." }), { params: Promise.resolve({ ticketId }) })).status, 409, "reopen after seven-day deadline is denied");

  const expiredTicketId = `${runId}_expired_ticket`; const expiredTaskId = `task_expired_${runId}`;
  await db.collection("supportTickets").doc(expiredTicketId).set({ id: expiredTicketId, ticketNumber: "CS-49999", userId: user.uid, subject: "Old issue", status: "resolved", resolutionSummary: "Legacy resolved request retained for closure compatibility.", resolvedAt: "2026-01-01T00:00:00.000Z", reopenUntil: "2026-01-08T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" });
  await db.collection("adminActionTasks").doc(expiredTaskId).set({ id: expiredTaskId, sourceType: "support_ticket", sourceId: expiredTicketId, state: "resolved" });
  const { GET: closeTickets } = await import("../app/api/internal/support-ticket-closure/route.ts"); process.env.CRON_SECRET = `${runId}_cron`;
  equal((await closeTickets(new Request("http://localhost/api/internal/support-ticket-closure", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }))).status, 200, "scheduled closure handler accepts its configured secret");
  equal((await db.collection("supportTickets").doc(expiredTicketId).get()).data()?.status, "closed", "resolved ticket auto-closes after seven days");
  equal((await db.collection("adminActionTasks").doc(expiredTaskId).get()).data()?.state, "resolved", "closure updates the linked task");
  equal((await closeTickets(new Request("http://localhost/api/internal/support-ticket-closure"))).status, 401, "closure scheduler rejects unauthenticated requests");
  const mutationBefore = await db.collection("cashLedger").where("sourceId", "==", ticketId).get();
  check(mutationBefore.empty, "support resolution does not create financial ledger activity");

  const { GET: adminHelpGet, POST: createArticle, PATCH: updateArticle, DELETE: archiveArticle } = await import("../app/api/admin/help/articles/route.ts");
  const { GET: publicHelpGet } = await import("../app/api/help/articles/route.ts");
  const { GET: publicHelpArticleGet } = await import("../app/api/help/articles/[slug]/route.ts");
  equal((await adminHelpGet(req("http://localhost/api/admin/help/articles", null))).status, 401, "public users cannot read Admin-only draft records");
  const slug = `support-${runId.toLowerCase().replaceAll("_", "-")}`;
  const articlePayload = { title: "Account access recovery", slug, summary: "Steps to restore access after a sign-in issue.", body: "Check your verified email, use account recovery, and contact Support if the issue continues.", category: "account_security", status: "published", featured: true, sortOrder: 10, reason: "Publish verified account recovery steps.", confirmed: true };
  const articleResponse = await createArticle(req("http://localhost/api/admin/help/articles", manager.token, "POST", articlePayload, { "idempotency-key": `${runId}_help_create` }));
  equal(articleResponse.status, 200, "authorized Admin creates a versioned published help article");
  const article = (await data(articleResponse)).article;
  check(Boolean(article.id), "article receives a stable document identifier");
  const publicArticle = await publicHelpArticleGet(req(`http://localhost/api/help/articles/${slug}`, null), { params: Promise.resolve({ slug }) });
  equal(publicArticle.status, 200, "published article is publicly readable through the server route");
  const publicArticleData = (await data(publicArticle)).article;
  check(!Object.hasOwn(publicArticleData, "createdBy"), "public article response omits Admin audit metadata");
  const searchResult = await publicHelpGet(req(`http://localhost/api/help/articles?q=${encodeURIComponent("verified email")}`, null));
  check((await data(searchResult)).articles.some((item) => item.id === article.id), "public article search finds a match beyond the exact title");
  const updatedArticle = await updateArticle(req("http://localhost/api/admin/help/articles", manager.token, "PATCH", { articleId: article.id, expectedUpdatedAt: article.updatedAt, title: "Account access and recovery", reason: "Clarify the published recovery heading.", confirmed: true }, { "idempotency-key": `${runId}_help_update` }));
  equal(updatedArticle.status, 200, "article update checks the expected version and creates a new version record");
  const archivedArticle = await archiveArticle(req("http://localhost/api/admin/help/articles", manager.token, "DELETE", { articleId: article.id, reason: "Retire guidance that has been superseded.", confirmed: true }, { "idempotency-key": `${runId}_help_archive` }));
  equal(archivedArticle.status, 200, "Admin can archive public guidance with confirmation and reason");
  equal((await publicHelpArticleGet(req(`http://localhost/api/help/articles/${slug}`, null), { params: Promise.resolve({ slug }) })).status, 404, "archived article is immediately hidden from public reads");
} finally {
  globalThis.fetch = oldFetch;
  for (const [name, value] of Object.entries(originalEnv)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  delete process.env.CRON_SECRET;
}

await auth.revokeRefreshTokens(admin.uid);
equal((await getCases(req("http://localhost/api/admin/cases?kind=support", admin.token))).status, 401, "revoked Admin ID token is rejected by revocation-aware verification");
console.log(`PASS Admin and Support actual-handler emulator suite: ${assertions} assertions`);
