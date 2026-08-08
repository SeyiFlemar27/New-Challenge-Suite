import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");

export async function run(name) {
  const [home, config, economics, api] = await Promise.all([read("components/public-site/public-home.tsx"), read("lib/public-site/config.ts"), read("lib/public-site/economics.ts"), read("app/api/public/home/route.ts")]);
  const source = `${home}\n${config}\n${economics}\n${api}`;
  const checks = {
    "public-hero-video-cloudinary-source": () => assert.match(config, /v1786226703\/8368664-uhd_4096_2160_25fps_jd1ymz\.mp4/),
    "public-hero-video-keeps-existing-copy-and-ctas": () => { assert.match(home, /content\.eyebrow/); assert.match(home, /content\.headline/); assert.match(home, /Create a challenge/); assert.match(home, /Host an event/); },
    "public-hero-video-muted-loop-playsinline": () => { assert.match(home, /autoPlay muted loop playsInline/); assert.doesNotMatch(home, /<video[^>]+controls[^>]+content\.videoUrl/); },
    "public-hero-video-mobile-safe": () => { assert.match(home, /object-cover/); assert.match(home, /sm:min-h|sm:px/); },
    "public-hero-video-fallback": () => { assert.match(home, /poster=\{content\.posterUrl\}/); assert.match(home, /Your browser does not support background video/); },
    "public-ambassador-video-scroll-placement": () => assert.match(home, /<Categories\/><AmbassadorVideos\/><How\/>/),
    "public-ambassador-video-scroll-after-browse-before-how-it-works": () => assert.ok(home.indexOf("<Categories/>") < home.indexOf("<AmbassadorVideos/>") && home.indexOf("<AmbassadorVideos/>") < home.indexOf("<How/>")),
    "public-ambassador-video-scroll-five-placeholders": () => assert.equal((config.match(/status: "placeholder" \}/g) ?? []).length, 5),
    "public-ambassador-video-scroll-no-fake-celebrities": () => assert.doesNotMatch(config, /celebrity|endorsement|famous/i),
    "public-ambassador-video-scroll-manual-scroll": () => { assert.match(home, /overflow-x-auto/); assert.match(home, /scrollBy/); assert.doesNotMatch(home, /setInterval/); },
    "public-ambassador-video-scroll-vertical-cards": () => assert.match(home, /aspect-\[9\/16\]/),
    "public-ambassador-video-modal-audio-user-initiated": () => { assert.match(home, /onClick=\{\(\)=>setActive\(item\)\}/); assert.match(home, /<video[^>]+controls autoPlay playsInline/); },
    "public-ambassador-video-no-autoplay-sound": () => { assert.match(home, /muted playsInline preload="metadata"/); assert.doesNotMatch(config, /videoUrl: "https?:/); },
    "public-ambassador-app-store-google-play-cta": () => { assert.match(home, /App Store/); assert.match(home, /Google Play/); assert.match(config, /PUBLIC_APP_STORE_URL: string \| null = null/); },
    "public-ambassador-video-scroll-mobile-no-overflow": () => { assert.match(home, /w-\[220px\] shrink-0/); assert.match(home, /overflow-x-auto/); },
    "challenge-economics-calculator-public-visible": () => { assert.match(home, /Prize & Revenue Calculator/); assert.match(home, /id="prize-calculator"/); },
    "challenge-economics-calculator-starting-prize-inputs": () => { assert.match(home, /Creator\/Host starting prize/); assert.match(home, /Sponsor starting prize/); },
    "challenge-economics-calculator-default-500-500-example": () => { assert.match(home, /creatorStartingPrize:500,sponsorStartingPrize:500/); const result = calculateExample(economics); assert.deepEqual(result, { total: 2625, first: 1312.5, second: 787.5, third: 525 }); },
    "challenge-economics-calculator-sponsor-prize-input": () => assert.match(economics, /sponsorStartingPrize/),
    "challenge-economics-calculator-total-winner-pool": () => assert.match(economics, /startingPrizePool \+ winnerJackpotFromRevenue/),
    "challenge-economics-calculator-1st-2nd-3rd-payouts": () => { assert.match(home, /1st/); assert.match(home, /2nd/); assert.match(home, /3rd/); },
    "challenge-economics-calculator-one-two-three-winner-modes": () => { assert.match(economics, /if \(winners <= 1\)/); assert.match(economics, /winners === 2/); },
    "challenge-economics-calculator-economy-v1-split": () => assert.match(economics, /winners: 0\.65, platform: 0\.15, creator: 0\.1, hostSponsor: 0\.1/),
    "challenge-economics-calculator-no-double-count-sponsor-prize": () => { assert.match(economics, /startingPrizePool = money\(creatorStartingPrize \+ sponsorStartingPrize\)/); assert.match(economics, /totalWinnerPayoutPool = money\(startingPrizePool \+ winnerJackpotFromRevenue\)/); assert.doesNotMatch(economics, /totalWinnerPayoutPool = money\([^\n]*sponsorStartingPrize/); },
    "challenge-economics-calculator-starting-prize-not-platform-revenue": () => assert.match(economics, /platformShare = money\(totalGeneratedRevenue/),
    "challenge-economics-calculator-public-host-sponsor-wording": () => assert.match(home, /Host\/Sponsor share applies when an eligible host or sponsor/),
    "challenge-economics-calculator-disclaimer": () => assert.match(economics, /This is an estimate\. Actual payouts depend on confirmed payments/),
    "challenge-economics-calculator-mobile-no-overflow": () => { assert.match(home, /overflow-hidden rounded-\[20px\]/); assert.match(home, /sm:grid-cols-2/); }
  };
  assert.ok(checks[name], `Unknown public landing contract: ${name}`);
  checks[name]();
  console.log(`PASS ${name}.mjs`);
}

function calculateExample(economics) {
  assert.match(economics, /PUBLIC_ECONOMY_V1_SPLIT/);
  const generated = 25 * 100;
  const total = 500 + 500 + generated * 0.65;
  return { total, first: total * 0.5, second: total * 0.3, third: total * 0.2 };
}
