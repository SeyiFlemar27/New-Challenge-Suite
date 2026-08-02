import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const s=read("components/public-site/public-shell.tsx");for(const token of ['aria-haspopup="true"','aria-expanded={open===menu.label}','role="menu"','role="menuitem"','event.key==="Escape"','onMouseEnter','onFocus'])assert(s.includes(token),token);assert(s.includes("position:static")||read("app/globals.css").includes(".public-header{position:static"));console.log("public mega menu accessibility: ok");
