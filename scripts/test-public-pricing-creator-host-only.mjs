import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const s=read("components/public-site/public-home.tsx"),plans=read("lib/server/subscriptions.ts");assert(s.includes('p.id==="creator"||p.id==="host"'));assert(s.includes("239.9"));assert(s.includes("1142.4"));assert(s.includes("Yearly · save 20%"));assert(plans.includes('id: "creator"')&&plans.includes('id: "host"'));assert(!s.includes('name:"Enterprise"'));assert(!s.includes('name:"Pro"'));console.log("public pricing shows Creator and Host only: ok");
