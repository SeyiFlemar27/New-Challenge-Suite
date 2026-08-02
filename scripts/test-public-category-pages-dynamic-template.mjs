import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const p=read("app/categories/[slug]/page.tsx"),v=read("components/public-site/category-experience.tsx");assert(p.includes("generateStaticParams"));assert(p.includes("categoryBySlug"));assert(v.includes("/api/explore/challenges?"));assert(v.includes("Load more"));assert(v.includes("specialties.map"));console.log("dynamic category template and real filters: ok");
