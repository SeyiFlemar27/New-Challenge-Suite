import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const h=read("components/public-site/public-home.tsx"),s=read("components/public-site/public-shell.tsx"),t=read("components/public-site/for-talent-experience.tsx");for(const token of ["ArrowDown","ArrowUp","Escape",'aria-activedescendant','aria-autocomplete="list"'])assert(h.includes(token),token);assert(s.includes('event.key==="Tab"'));assert(t.includes("aria-expanded"));assert(read("app/globals.css").includes(":focus-visible"));console.log("public keyboard journey: ok");
