import fs from "node:fs";
const admin=fs.readFileSync("lib/server/auth.ts","utf8"), sponsor=fs.readFileSync("lib/server/sponsor.ts","utf8"), dashboard=fs.readFileSync("app/api/sponsor/dashboard/route.ts","utf8");
if(!admin.includes("requireAdminUser")||!admin.includes("verifyIdToken")||!sponsor.includes("requireSponsorContext")||!sponsor.includes("assertSponsorOwnedDoc")||!dashboard.includes("requireSponsorContext(request)")) throw new Error("Production route authorization guard missing");
console.log("phase10 production security route authorization: ok");
