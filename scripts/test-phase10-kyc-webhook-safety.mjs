import fs from "node:fs";
const sumsub=fs.readFileSync("lib/server/sumsub.ts","utf8"), route=fs.readFileSync("app/api/kyc/sumsub/webhook/route.ts","utf8");
if(!sumsub.includes("timingSafeEqual")||!sumsub.includes("/^[a-f0-9]{64}$/")) throw new Error("Strict Sumsub signature verification missing");
if(!route.includes("sumsubWebhookEvents")||!route.includes("duplicate: true")||!route.includes("rawIdentityStored: false")) throw new Error("KYC webhook safety invariant missing");
console.log("phase10 KYC webhook safety: ok");
