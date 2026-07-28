import fs from "node:fs";
const route=fs.readFileSync("app/api/explore/challenges/route.ts","utf8");
if(!route.includes(".limit(180).get()")||!route.includes("Math.min(48")||!route.includes("hasMore")) throw new Error("Explore query is not bounded/paginated");
if(/collection("challenges").get()/.test(route)) throw new Error("Explore loads the full collection");
console.log("phase10 Explore query performance: ok");
