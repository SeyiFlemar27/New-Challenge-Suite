import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const root=read("app/page.tsx"),cat=read("app/categories/[slug]/page.tsx"),talent=read("app/for-talent/page.tsx"),sitemap=read("app/sitemap.ts"),robots=read("app/robots.ts");assert(root.includes("SearchAction"));assert(root.includes("application/ld+json"));assert(cat.includes("generateMetadata"));assert(talent.includes("alternates"));assert(sitemap.includes("PUBLIC_CATEGORIES"));assert(robots.includes('"/categories/"'));console.log("public SEO metadata and discovery: ok");
