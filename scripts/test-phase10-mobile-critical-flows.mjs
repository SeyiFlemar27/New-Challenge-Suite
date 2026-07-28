import fs from "node:fs";
const pages=["app/challenges/[id]/page.tsx","app/challenges/[id]/join/page.tsx","app/explore/page.tsx","app/wallet/withdraw/page.tsx"].map(p=>fs.readFileSync(p,"utf8")).join("\n");
if(!pages.includes("sm:")&&!pages.includes("md:")&&!pages.includes("lg:")) throw new Error("Responsive critical-flow classes missing");
if(!pages.includes("min-w-0")&&!pages.includes("break-words")) throw new Error("Mobile overflow safeguards missing");
console.log("phase10 mobile critical flows: ok");
