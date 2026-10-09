import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST is required");
assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST, "FIREBASE_AUTH_EMULATOR_HOST is required");

const projectId = process.env.FIREBASE_PROJECT_ID ?? "demo-challenge-suite";
const app = initializeApp({ projectId });
const db = getFirestore(app);
const auth = getAuth(app);
const runId = `discovery_${randomUUID().replaceAll("-", "")}`;
const orgA = `${runId}_org_a`;
const orgB = `${runId}_org_b`;
let assertions = 0;

function check(condition, message) { assert.ok(condition, message); assertions += 1; }
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions += 1; }
async function createUser(label) {
  const email = `${runId}_${label}@example.test`;
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!", returnSecureToken: true })
  });
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  await db.collection("users").doc(body.localId).set({ emailVerified: true, accountStatus: "active" });
  return { uid: body.localId, token: body.idToken };
}
function request(url, token, method = "GET", body) {
  return new Request(url, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
function isoDay(offset) { const date = new Date(Date.UTC(2026, 6, 1 + offset)); return date.toISOString().slice(0, 10); }

try {
  const sponsor = await createUser("sponsor");
  const ordinary = await createUser("ordinary");
  const otherSponsor = await createUser("other_sponsor");
  await Promise.all([
    db.collection("sponsorOrganizations").doc(orgA).set({ id: orgA, name: "Org A", status: "active", sponsorOnboardingComplete: true }),
    db.collection("sponsorOrganizations").doc(orgB).set({ id: orgB, name: "Org B", status: "active", sponsorOnboardingComplete: true }),
    db.collection("sponsorProfiles").doc(orgA).set({ sponsorOrganizationId: orgA, sponsorVerificationStatus: "approved", subscriptionStatus: "active", sponsorOnboardingComplete: true }),
    db.collection("sponsorProfiles").doc(orgB).set({ sponsorOrganizationId: orgB, sponsorVerificationStatus: "approved", subscriptionStatus: "active", sponsorOnboardingComplete: true }),
    db.collection("sponsorMemberships").doc(`${orgA}_${sponsor.uid}`).set({ sponsorOrganizationId: orgA, userId: sponsor.uid, role: "owner", status: "active" }),
    db.collection("sponsorMemberships").doc(`${orgB}_${otherSponsor.uid}`).set({ sponsorOrganizationId: orgB, userId: otherSponsor.uid, role: "owner", status: "active" })
  ]);

  const { GET: creatorsGet } = await import("../app/api/sponsor/discover/creators/route.ts");
  equal((await creatorsGet(request("http://localhost/api/sponsor/discover/creators"))).status, 401, "creator discovery rejects unauthenticated requests");
  equal((await creatorsGet(request("http://localhost/api/sponsor/discover/creators", ordinary.token))).status, 403, "creator discovery rejects users without Sponsor workspace access");
  const profileBatch = [];
  for (let index = 0; index < 275; index += 1) {
    const id = `${runId}_profile_${String(index).padStart(3, "0")}`;
    const privateProfile = index === 245;
    const disabled = index === 246;
    profileBatch.push(db.collection("profiles").doc(id).set({
      displayName: `Creator ${String(index).padStart(3, "0")}`,
      username: `creator${String(index).padStart(3, "0")}`,
      accountType: "creator",
      creatorProfileCompletedAt: "2026-01-01T00:00:00.000Z",
      sponsorReadyEnabled: true,
      profileVisibility: privateProfile ? "private" : "public",
      accountStatus: disabled ? "suspended" : "active",
      creatorNiche: index === 274 ? "rare spectral niche" : "visual arts"
    }));
  }
  await Promise.all(profileBatch);
  const discoveredCreatorIds = new Set();
  const creatorPages = [];
  let cursor = "";
  let page = 1;
  do {
    const url = `http://localhost/api/sponsor/discover/creators?page=${page}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const response = await creatorsGet(request(url, sponsor.token));
    equal(response.status, 200, `Sponsor creator page ${page} is authorized`);
    const payload = (await response.json()).data;
    creatorPages.push(payload.creators);
    for (const creator of payload.creators) {
      check(!discoveredCreatorIds.has(creator.id), "creator cursor pages contain no duplicates");
      discoveredCreatorIds.add(creator.id);
      check(!Object.hasOwn(creator, "email") && !Object.hasOwn(creator, "phone"), "creator discovery returns no private contact fields");
    }
    equal(payload.pagination.total, null, "discovery does not present a partial sample as a total");
    cursor = payload.pagination.nextCursor ?? "";
    page += 1;
    if (page > 20) throw new Error("Creator discovery pagination did not terminate.");
  } while (cursor);
  const stableCreatorPage = await creatorsGet(request("http://localhost/api/sponsor/discover/creators", sponsor.token));
  const stableCreatorIds = (await stableCreatorPage.json()).data.creators.map((creator) => creator.id);
  assert.deepEqual(stableCreatorIds, creatorPages[0].map((creator) => creator.id), "creator first-page ordering is stable across repeated requests");
  assertions += 1;
  check(discoveredCreatorIds.has(`${runId}_profile_274`), "eligible creator beyond the prior 200-profile boundary is discoverable");
  check(!discoveredCreatorIds.has(`${runId}_profile_245`), "private creator profiles are excluded");
  check(!discoveredCreatorIds.has(`${runId}_profile_246`), "suspended creator accounts are excluded");
  const creatorSearch = await creatorsGet(request(`http://localhost/api/sponsor/discover/creators?q=${encodeURIComponent("spectral niche")}`, sponsor.token));
  const creatorSearchPayload = (await creatorSearch.json()).data;
  check(creatorSearchPayload.creators.some((creator) => creator.id === `${runId}_profile_274`), "contains search finds a matching creator beyond the former cap");
  equal((await creatorsGet(request("http://localhost/api/sponsor/discover/creators?page=2", sponsor.token))).status, 400, "page-number continuation without a cursor is rejected");
  const tailProfiles = [];
  for (let index = 0; index < 510; index += 1) {
    const id = `${runId}_tail_${String(index).padStart(3, "0")}`;
    tailProfiles.push(db.collection("profiles").doc(id).set({ displayName: `Tail Creator ${index}`, username: `tailcreator${index}`, accountType: "creator", creatorProfileCompletedAt: "2026-01-01T00:00:00.000Z", sponsorReadyEnabled: true, profileVisibility: "public", accountStatus: "active", creatorNiche: index === 509 ? "tail-only-match" : "ceramics" }));
  }
  await Promise.all(tailProfiles);
  const firstTailSearchPage = await creatorsGet(request(`http://localhost/api/sponsor/discover/creators?q=${encodeURIComponent("tail-only-match")}`, sponsor.token));
  const firstTailPayload = (await firstTailSearchPage.json()).data;
  equal(firstTailPayload.creators.length, 0, "bounded creator search may expose an empty scan window before a later cursor window");
  check(firstTailPayload.pagination.hasMore && firstTailPayload.pagination.nextCursor, "empty creator search window retains a continuation cursor");
  const lastTailSearchPage = await creatorsGet(request(`http://localhost/api/sponsor/discover/creators?q=${encodeURIComponent("tail-only-match")}&page=2&cursor=${encodeURIComponent(firstTailPayload.pagination.nextCursor)}`, sponsor.token));
  const lastTailPayload = (await lastTailSearchPage.json()).data;
  equal(lastTailPayload.creators.length, 1, "cursor continuation finds a search match beyond 500 scanned profiles");
  equal(lastTailPayload.creators[0].id, `${runId}_tail_509`, "late creator search result is returned without an unbounded request scan");

  const { GET: sponsorChallengesGet } = await import("../app/api/sponsor/discover/challenges/route.ts");
  const challengeWrites = [];
  for (let index = 0; index < 80; index += 1) {
    const id = `${runId}_opportunity_${String(index).padStart(3, "0")}`;
    const ended = index === 1;
    challengeWrites.push(db.collection("challenges").doc(id).set({
      id, title: index === 79 ? "Rare Needle Opportunity" : `Public Opportunity ${String(index).padStart(3, "0")}`,
      creatorId: `creator_${index}`, creatorName: "Creator Opportunity", category: index % 2 ? "Arts" : "Dance",
      visibility: "public", status: "active", sponsorEnabled: true, publishedAt: "2026-01-01T00:00:00.000Z",
      createdAt: new Date(Date.UTC(2026, 0, 1 + index)).toISOString(),
      ...(ended ? { votingDeadline: "2020-01-01T00:00:00.000Z" } : {})
    }));
  }
  challengeWrites.push(db.collection("challenges").doc(`${runId}_hidden_opportunity`).set({ id: `${runId}_hidden_opportunity`, title: "Rare Needle Hidden", visibility: "private", status: "active", sponsorEnabled: true, createdAt: "2026-02-01T00:00:00.000Z" }));
  challengeWrites.push(db.collection("challenges").doc(`${runId}_cancelled_opportunity`).set({ id: `${runId}_cancelled_opportunity`, title: "Rare Needle Cancelled", visibility: "public", status: "cancelled", sponsorEnabled: true, createdAt: "2026-02-02T00:00:00.000Z" }));
  await Promise.all(challengeWrites);
  const opportunityIds = new Set();
  let firstOpportunityIds = [];
  cursor = ""; page = 1;
  do {
    const response = await sponsorChallengesGet(request(`http://localhost/api/sponsor/discover/challenges?page=${page}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, sponsor.token));
    equal(response.status, 200, `Sponsor opportunity page ${page} is authorized`);
    const payload = (await response.json()).data;
    if (page === 1) firstOpportunityIds = payload.challenges.map((challenge) => challenge.id);
    equal(payload.pagination.total, null, "opportunity search does not expose the unfiltered candidate count");
    for (const challenge of payload.challenges) {
      check(!opportunityIds.has(challenge.id), "opportunity cursor pages contain no duplicates");
      opportunityIds.add(challenge.id);
    }
    cursor = payload.pagination.nextCursor ?? "";
    page += 1;
    if (page > 10) throw new Error("Sponsor opportunity pagination did not terminate.");
  } while (cursor);
  const stableOpportunityPage = await sponsorChallengesGet(request("http://localhost/api/sponsor/discover/challenges", sponsor.token));
  assert.deepEqual((await stableOpportunityPage.json()).data.challenges.map((challenge) => challenge.id), firstOpportunityIds, "Sponsor opportunity first-page ordering is stable across repeated requests");
  assertions += 1;
  equal(opportunityIds.size, 80, "all 80 public sponsor-ready opportunities paginate beyond the 36-result threshold");
  check(!opportunityIds.has(`${runId}_hidden_opportunity`), "private unavailable opportunities are not disclosed");
  check(!opportunityIds.has(`${runId}_cancelled_opportunity`), "cancelled opportunities are excluded");
  const rareOpportunity = await sponsorChallengesGet(request(`http://localhost/api/sponsor/discover/challenges?q=${encodeURIComponent("needle")}`, sponsor.token));
  const rarePayload = (await rareOpportunity.json()).data;
  equal(rarePayload.challenges.length, 1, "filtered opportunity search scans past the first 36 candidates");
  equal(rarePayload.challenges[0].id, `${runId}_opportunity_079`, "the late matching opportunity is returned");
  const endedOpportunity = await sponsorChallengesGet(request(`http://localhost/api/sponsor/discover/challenges?q=${encodeURIComponent("opportunity 001")}`, sponsor.token));
  const endedPayload = (await endedOpportunity.json()).data;
  if (endedPayload.challenges.length) check(endedPayload.challenges[0].fundable === false, "closed funding windows are never presented as fundable");
  equal((await sponsorChallengesGet(request("http://localhost/api/sponsor/discover/challenges?page=2", sponsor.token))).status, 400, "opportunity page-number continuation without a cursor is rejected");
  equal((await sponsorChallengesGet(request("http://localhost/api/sponsor/discover/challenges", otherSponsor.token))).status, 200, "other Sponsor organization can access only its own public discovery feed");

  const { GET: analyticsGet } = await import("../app/api/sponsor/analytics/route.ts");
  const analyticsDocs = [];
  let impressions = 0; let clicks = 0; let visits = 0;
  for (let index = 0; index < 155; index += 1) {
    const date = isoDay(index % 77);
    const rowImpressions = index % 4;
    const rowClicks = index % 3 === 0 ? 1 : 0;
    const rowVisits = index % 5;
    impressions += rowImpressions; clicks += rowClicks; visits += rowVisits;
    analyticsDocs.push(db.collection("sponsorAnalyticsDaily").doc(`${runId}_daily_${String(index).padStart(3, "0")}`).set({ sponsorId: orgA, sponsorOrganizationId: orgA, campaignId: `${runId}_campaign_${index % 5}`, date, validImpressions: rowImpressions, uniqueCtaClicks: rowClicks, uniqueSessions: rowVisits, invalidEventsExcluded: index % 7 }));
  }
  await Promise.all([
    ...analyticsDocs,
    db.collection("sponsorAnalyticsDaily").doc(`${runId}_outside_before`).set({ sponsorId: orgA, date: "2026-06-30", validImpressions: 900, uniqueCtaClicks: 900, uniqueSessions: 900 }),
    db.collection("sponsorAnalyticsDaily").doc(`${runId}_outside_after`).set({ sponsorId: orgA, date: "2026-09-16", validImpressions: 800, uniqueCtaClicks: 800, uniqueSessions: 800 }),
    db.collection("sponsorAnalyticsDaily").doc(`${runId}_foreign`).set({ sponsorId: orgB, date: "2026-08-01", validImpressions: 7000, uniqueCtaClicks: 7000, uniqueSessions: 7000 }),
    db.collection("sponsorships").doc(`${runId}_sponsorship`).set({ sponsorId: orgA, challengeId: `${runId}_opportunity_001`, status: "active", visibility: { requestedPlacements: ["challenge_header"] } })
  ]);
  equal((await analyticsGet(request("http://localhost/api/sponsor/analytics?start=2026-07-01T00:00:00.000Z&end=2026-09-15T23:59:59.000Z"))).status, 401, "analytics rejects unauthenticated requests");
  const analyticsResponse = await analyticsGet(request("http://localhost/api/sponsor/analytics?start=2026-07-01T00:00:00.000Z&end=2026-09-15T23:59:59.000Z", sponsor.token));
  equal(analyticsResponse.status, 200, "authorized Sponsor receives analytics");
  const analyticsPayload = (await analyticsResponse.json()).data.analytics.live;
  equal(analyticsPayload.metrics.validImpressions, impressions, "analytics totals include all 155 daily records across campaign sources");
  equal(analyticsPayload.metrics.uniqueCtaClicks, clicks, "click totals include every record in the selected date range");
  equal(analyticsPayload.metrics.uniqueSessions, visits, "visit totals include every record in the selected date range");
  equal(analyticsPayload.metrics.clickThroughRate, Number(((clicks / impressions) * 100).toFixed(2)), "CTR uses complete-range clicks and impressions");
  equal(analyticsPayload.daily.length, 77, "daily chart aggregates multiple source rows by UTC date");
  equal(analyticsPayload.completeForRequestedRange, true, "range aggregates are explicitly complete");
  check(!JSON.stringify(analyticsPayload).includes("7000"), "Org A analytics do not contain Org B activity");
  const zeroImpression = await db.collection("sponsorAnalyticsDaily").doc(`${runId}_zero_day`).set({ sponsorId: orgA, date: "2026-09-20", validImpressions: 0, uniqueCtaClicks: 3, uniqueSessions: 1 });
  await zeroImpression;
  const { GET: analyticsReload } = await import("../app/api/sponsor/analytics/route.ts");
  const zeroResponse = await analyticsReload(request("http://localhost/api/sponsor/analytics?start=2026-09-20T00:00:00.000Z&end=2026-09-20T23:59:59.000Z", sponsor.token));
  const zeroMetrics = (await zeroResponse.json()).data.analytics.live.metrics;
  equal(zeroMetrics.clickThroughRate, null, "CTR is null when impressions are zero");
  equal(zeroMetrics.uniqueCtaClicks, 3, "zero-impression date retains its authoritative click count");

  const { POST: analyticsEventPost } = await import("../app/api/sponsor/analytics/events/route.ts");
  const eventRequest = () => new Request("http://localhost/api/sponsor/analytics/events", { method: "POST", headers: { "content-type": "application/json", "user-agent": "DiscoveryTestBrowser/1.0" }, body: JSON.stringify({ sponsorshipId: `${runId}_sponsorship`, challengeId: `${runId}_opportunity_001`, placementId: "challenge_header", eventType: "placement_impression", sessionId: `${runId}_stable-session-identifier` }) });
  const beforeDailyCount = await db.collection("sponsorAnalyticsEvents").where("sponsorshipId", "==", `${runId}_sponsorship`).count().get();
  const eventOne = await analyticsEventPost(eventRequest());
  const eventTwo = await analyticsEventPost(eventRequest());
  equal(eventOne.status, 200, "valid event is persisted");
  equal(eventTwo.status, 200, "duplicate event retry is accepted idempotently");
  const eventCount = await db.collection("sponsorAnalyticsEvents").where("sponsorshipId", "==", `${runId}_sponsorship`).count().get();
  equal(eventCount.data().count - beforeDailyCount.data().count, 1, "duplicate analytics events persist one deduplicated activity record");

  const { GET: exploreGet } = await import("../app/api/explore/challenges/route.ts");
  const exploreWrites = [];
  for (let index = 0; index < 42; index += 1) {
    const id = `${runId}_explore_${String(index).padStart(3, "0")}`;
    exploreWrites.push(db.collection("challenges").doc(id).set({ id, title: `Needle Arts Challenge ${String(index).padStart(2, "0")}`, shortDescription: "Public challenge", category: "Arts", type: "Public Challenge", visibility: "public", status: index === 40 ? "scheduled" : "active", createdAt: new Date(Date.UTC(2026, 0, 1 + index)).toISOString(), publishedAt: "2026-01-01T00:00:00.000Z", publicVisibility: true }));
  }
  const lockedId = `${runId}_explore_locked`;
  const canceledId = `${runId}_explore_cancelled`;
  const expiredId = `${runId}_explore_expired`;
  const recentCompletedId = `${runId}_explore_recent_completed`;
  const oldCompletedId = `${runId}_explore_old_completed`;
  const hiddenPrivateId = `${runId}_explore_private_hidden`;
  const hiddenPublicId = `${runId}_explore_public_hidden`;
  exploreWrites.push(
    db.collection("challenges").doc(lockedId).set({ id: lockedId, title: "Needle Locked Preview", shortDescription: "Public preview text", description: "SECRET PRIVATE DESCRIPTION", votingSettings: { secret: true }, rules: "SECRET RULES", category: "Arts", type: "Private / Exclusive", visibility: "private", publicPreviewEnabled: true, status: "active", createdAt: "2026-03-01T00:00:00.000Z", publishedAt: "2026-01-01T00:00:00.000Z" }),
    db.collection("challenges").doc(canceledId).set({ id: canceledId, title: "Needle Cancelled", category: "Arts", visibility: "public", status: "cancelled", createdAt: "2026-04-01T00:00:00.000Z" }),
    db.collection("challenges").doc(expiredId).set({ id: expiredId, title: "Needle Old Winners", category: "Arts", visibility: "public", status: "completed", winnersAnnounced: true, winnersAnnouncedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(), createdAt: "2026-05-01T00:00:00.000Z" }),
    db.collection("challenges").doc(recentCompletedId).set({ id: recentCompletedId, title: "Needle Recent Winners", category: "Arts", visibility: "public", status: "completed", winnersAnnounced: true, winnersAnnouncedAt: new Date(Date.now() - 60 * 1000).toISOString(), createdAt: "2026-05-02T00:00:00.000Z" }),
    db.collection("challenges").doc(oldCompletedId).set({ id: oldCompletedId, title: "Needle Hidden Results", category: "Arts", visibility: "public", status: "winners_announced", winnersAnnounced: true, winnersAnnouncedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(), createdAt: "2026-05-03T00:00:00.000Z" }),
    db.collection("challenges").doc(hiddenPrivateId).set({ id: hiddenPrivateId, title: "Needle Private No Preview", category: "Arts", type: "Private / Exclusive", visibility: "private", publicPreviewEnabled: false, status: "active", createdAt: "2026-06-01T00:00:00.000Z" }),
    db.collection("challenges").doc(hiddenPublicId).set({ id: hiddenPublicId, title: "Needle Public Hidden", category: "Arts", visibility: "public", publicVisibility: false, status: "active", createdAt: "2026-06-02T00:00:00.000Z" })
  );
  await Promise.all(exploreWrites);
  const exploreIds = new Set();
  let firstExploreIds = [];
  cursor = ""; page = 1;
  do {
    const url = `http://localhost/api/explore/challenges?q=needle&category=arts&page=${page}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const response = await exploreGet(new Request(url));
    equal(response.status, 200, `Explore filtered page ${page} loads`);
    const payload = (await response.json()).data;
    if (page === 1) firstExploreIds = payload.challenges.map((challenge) => challenge.id);
    equal(payload.total, null, "Explore does not present a partial candidate batch as a total");
    for (const challenge of payload.challenges) {
      check(!exploreIds.has(challenge.id), "Explore cursor pages contain no duplicate challenges");
      exploreIds.add(challenge.id);
    }
    cursor = payload.nextCursor ?? "";
    page += 1;
    if (page > 10) throw new Error("Explore pagination did not terminate.");
  } while (cursor);
  const stableExplorePage = await exploreGet(new Request("http://localhost/api/explore/challenges?q=needle&category=arts"));
  assert.deepEqual((await stableExplorePage.json()).data.challenges.map((challenge) => challenge.id), firstExploreIds, "Explore first-page ordering is stable across repeated requests");
  assertions += 1;
  check(exploreIds.has(`${runId}_explore_041`), "matching Explore challenge beyond the first 36 records is discoverable");
  check(exploreIds.has(lockedId), "publicly locked Private Challenge remains discoverable");
  check(exploreIds.has(recentCompletedId), "challenge remains visible inside the five-minute winner window");
  check(!exploreIds.has(canceledId), "cancelled Challenge is not public");
  check(!exploreIds.has(expiredId) && !exploreIds.has(oldCompletedId), "completed challenges disappear after the five-minute winner window even with filters");
  check(!exploreIds.has(hiddenPrivateId) && !exploreIds.has(hiddenPublicId), "hidden/private content without public preview is excluded");
  const lockedResponse = await exploreGet(new Request(`http://localhost/api/explore/challenges?q=${encodeURIComponent("Needle Locked Preview")}`));
  const lockedResult = (await lockedResponse.json()).data.challenges.find((challenge) => challenge.id === lockedId);
  equal(lockedResult?.cta?.action, "locked_preview", "locked private preview routes viewers to the locked challenge detail");
  check(!JSON.stringify(lockedResult).includes("SECRET PRIVATE") && !Object.hasOwn(lockedResult ?? {}, "votingSettings") && !Object.hasOwn(lockedResult ?? {}, "rules"), "locked preview excludes protected challenge content");

  const sponsorDailyBefore = await db.collection("sponsorAnalyticsDaily").where("sponsorId", "==", orgA).count().get();
  const sponsorDailyAfter = await db.collection("sponsorAnalyticsDaily").where("sponsorId", "==", orgA).count().get();
  check(sponsorDailyAfter.data().count >= sponsorDailyBefore.data().count, "finance-safe analytics reads do not remove source aggregates");
  console.log(`Discovery and analytics scalability tests passed (${assertions} assertions).`);
} finally {
  await app.delete();
}
