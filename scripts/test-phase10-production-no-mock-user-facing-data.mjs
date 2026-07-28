import fs from "node:fs";
const sources=["app/api/explore/challenges/route.ts","app/api/dashboard/route.ts","app/api/sponsor/dashboard/route.ts","app/api/predictions/route.ts","lib/server/monetization-payments.ts"].map(p=>fs.readFileSync(p,"utf8")).join("\n");
for(const bad of ["mockChallenges","fakeBalance","fakeWinner","fakePayment","Math.random()"]){if(sources.includes(bad)) throw new Error("Mock production data marker found: "+bad);}
if(!sources.includes("realDataOnly: true")||!sources.includes("webhookConfirmed")) throw new Error("Real-data/provider-confirmed markers missing");
console.log("phase10 production no mock user-facing data: ok");
