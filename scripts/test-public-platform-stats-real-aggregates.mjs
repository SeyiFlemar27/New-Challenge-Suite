import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const s=read("app/api/public/home/route.ts"),home=read("components/public-site/public-home.tsx");assert(s.includes('collection("platformStats").doc("public")'));assert(s.includes("typeof value===\"number\""));assert(home.includes("if(!items.length)return null"));assert(!s.includes("registeredTalents:"));console.log("public stats use trusted aggregate document: ok");
