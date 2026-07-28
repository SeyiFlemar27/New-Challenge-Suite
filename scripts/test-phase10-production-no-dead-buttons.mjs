import fs from "node:fs";
const explore=fs.readFileSync("app/explore/page.tsx","utf8"), challenge=fs.readFileSync("app/challenges/[id]/page.tsx","utf8");
if(!explore.includes("detailHref")||!explore.includes("cta.href")) throw new Error("Explore card actions are not routed");
if(!challenge.includes("/join")||!challenge.includes("/votes")) throw new Error("Challenge primary actions lack destinations");
console.log("phase10 production no dead buttons: ok");
