import fs from "node:fs";
const paths=fs.readFileSync("lib/media-upload-paths.ts","utf8"), submissions=fs.readFileSync("app/api/submissions/route.ts","utf8"), challenge=fs.readFileSync("lib/server/challenge-validation.ts","utf8");
if(!paths.includes("submissionMediaPath")||!paths.includes("profileMediaPath")||!paths.includes("sponsorMediaPath")) throw new Error("Owned Storage paths missing");
if(!submissions.includes("expectedSubmissionPrefix")||!challenge.includes("validStoragePath")) throw new Error("Server Storage ownership validation missing");
console.log("phase10 Firestore/Storage rule readiness: ok (deployment remains manual)");
