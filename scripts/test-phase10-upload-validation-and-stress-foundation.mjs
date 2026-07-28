import fs from "node:fs";
const media=fs.readFileSync("lib/media-upload.ts","utf8"), validation=fs.readFileSync("lib/server/submission-validation.ts","utf8"), route=fs.readFileSync("app/api/submissions/route.ts","utf8");
if(!media.includes('kind === "video" ? 250 : 15')||!validation.includes("maxBytes")||!validation.includes("fileSize <= 0")) throw new Error("Upload size validation missing");
if(!route.includes("consumeRateLimit")||!route.includes("RATE_LIMITED")) throw new Error("Submission abuse throttle missing");
console.log("phase10 upload validation and stress foundation: ok");
