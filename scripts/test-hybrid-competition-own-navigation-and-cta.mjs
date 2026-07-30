import assert from "node:assert/strict";
import { exists, read } from "./production-flow-test-utils.mjs";

assert(exists("app/host/hybrid/page.tsx"));
assert(exists("app/host/hybrid/create/page.tsx"));
const sidebar = read("components/sidebar.tsx");
const workspace = read("app/host/hybrid/page.tsx");

assert(sidebar.includes('{ href: "/host/hybrid", label: "Hybrid Competition"'));
assert(sidebar.includes('pathname.startsWith("/host/hybrid/create")'));
assert(workspace.includes('href="/host/hybrid/create"'));
assert(workspace.includes("Create Hybrid Competition"));
assert(workspace.includes("hostedChallenges"));
console.log("Hybrid competition navigation and CTA checks passed.");
