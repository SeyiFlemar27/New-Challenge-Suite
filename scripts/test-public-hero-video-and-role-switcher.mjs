import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const s=read("components/public-site/public-home.tsx"),c=read("lib/public-site/config.ts");for(const x of ["autoPlay","muted","loop","playsInline","preload=\"metadata\"","I'm a Talent","I'm a Sponsor","challenge_suite_public_role"])assert(s.includes(x),x);assert(c.includes("14999510_1920_1080_25fps_vvlpn9.mp4"));console.log("public hero video and role switcher: ok");
