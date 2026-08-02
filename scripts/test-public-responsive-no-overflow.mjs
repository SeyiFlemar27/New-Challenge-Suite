import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const css=read("app/globals.css"),h=read("components/public-site/public-home.tsx"),shell=read("components/public-site/public-shell.tsx");assert(css.includes("overflow-x:clip"));assert(css.includes("@media(max-width:639px)"));assert(h.includes("grid-cols-2"));assert(shell.includes("width:min(90vw,390px)")||css.includes("width:min(90vw,390px)"));console.log("public responsive overflow controls: ok");
