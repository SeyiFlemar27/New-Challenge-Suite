import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const api=read("app/api/public/home/route.ts"),home=read("components/public-site/public-home.tsx");assert(api.includes('collection("successStories")'));assert(api.includes("d.adminApproved!==true"));assert(home.includes("if(!items.length)return null"));assert(!home.includes("Customer story"));assert(!home.includes("earned $"));console.log("public social proof is admin-approved and hidden when empty: ok");
