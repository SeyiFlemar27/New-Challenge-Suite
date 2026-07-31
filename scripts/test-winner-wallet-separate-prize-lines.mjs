import { assert, read, settlement } from "./settlement-test-utils.mjs";
const source = settlement();
const wallet = read("app/earnings/page.tsx");
assert(source.includes('sourceType: "challenge_winner_prize"') && source.includes('sourceType: "sponsor_prize"'), "wallet must receive separate prize source types");
assert(wallet.includes("Challenge winner prize") && wallet.includes("Sponsor-funded prize"), "wallet must label prize lines separately");
assert(wallet.includes("Gross") && wallet.includes("Platform fee") && wallet.includes("Net credited"), "wallet must show sponsor fee detail");
console.log("winner wallet separate prize line checks passed");
