import fs from "node:fs";
const route=fs.readFileSync("app/api/dashboard/route.ts","utf8");
for(const token of ['limit(50).get()','limit(8).get()','limit(12).get()','db.getAll']) if(!route.includes(token)) throw new Error("Dashboard bounded query invariant missing: "+token);
console.log("phase10 dashboard query performance: ok");
