import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const s=read("components/public-site/public-shell.tsx");for(const x of ['role="dialog"','aria-modal="true"','event.key==="Tab"','document.body.style.overflow="hidden"','public-drawer','setExpanded'])assert(s.includes(x),x);console.log("public mobile drawer: ok");
