import fs from "node:fs";
const publicFields=fs.readFileSync("lib/server/public-challenge.ts","utf8"), responses=fs.readFileSync("lib/server/responses.ts","utf8");
if(!publicFields.includes("publicChallengeFields")||!publicFields.includes("publicSubmissionFields")) throw new Error("Public sanitizers missing");
if(!responses.includes('process.env.NODE_ENV === "development" ? details : undefined')) throw new Error("Production errors may expose internal details");
console.log("phase10 public/private data exposure: ok");
