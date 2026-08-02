import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const a=read("lib/public-site/analytics.ts"),h=read("components/public-site/public-home.tsx");for(const event of ["public_search","hero_mode_changed","category_opened","calculator_completed","plan_selected"])assert(a.includes(event)&&h.includes(event),event);assert(a.includes("challenge-suite:analytics"));assert(!a.includes("email"));console.log("public analytics events are privacy-safe: ok");
