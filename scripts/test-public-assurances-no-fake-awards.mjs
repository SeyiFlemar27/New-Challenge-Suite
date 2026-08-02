import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const c=read("lib/public-site/config.ts"),h=read("components/public-site/public-home.tsx");assert(c.includes("Transparent prize funding"));assert(c.includes("Moderated submissions"));for(const bad of ["award-winning","five-star","certified by","trusted by thousands"])assert(!h.toLowerCase().includes(bad),bad);console.log("public assurances contain no fake awards: ok");
