import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const sidebar = read("components/sidebar.tsx");
const wizard = read("components/host/host-competition-wizard.tsx");
const publicCreate = read("app/hybrid/create/page.tsx");
const hostCreate = read("app/host/hybrid/create/page.tsx");
assert(!sidebar.includes('href: "/hybrid"'));
assert(!sidebar.includes('href: "/host/hybrid"'));
assert(!wizard.includes("HybridCompetitionBuilder"));
assert(!wizard.includes('type: "Hybrid Competition"'));
assert(publicCreate.includes('redirect("/hybrid")'));
assert(hostCreate.includes('redirect("/host/hybrid")'));
console.log("Hybrid Competition is removed from active navigation and creation UI: ok");
