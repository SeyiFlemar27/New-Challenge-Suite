import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const c=read("lib/public-site/config.ts"),home=read("components/public-site/public-home.tsx");for(const n of ["Fitness","Gaming","Design & Creative","Music Making","Photography","Food","Education","Business","Development & IT","Fashion & Modelling"])assert(c.includes('"' + n + '"'),n);assert((c.match(/^\["/gm)||[]).length===10);assert(home.includes("PUBLIC_CATEGORIES.map"));console.log("public category grid has ten canonical categories: ok");
