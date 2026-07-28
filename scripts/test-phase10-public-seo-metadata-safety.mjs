import fs from "node:fs";
const layout=fs.readFileSync("app/layout.tsx","utf8"), robots=fs.readFileSync("app/robots.ts","utf8"), sitemap=fs.readFileSync("app/sitemap.ts","utf8");
if(!layout.includes("metadataBase")||!layout.includes("Challenge Suite")) throw new Error("Safe root metadata missing");
if(!robots.includes("robots")||!sitemap.includes("sitemap")) throw new Error("Public crawl metadata missing");
console.log("phase10 public SEO metadata safety: ok");
