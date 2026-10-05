import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const switcher = read("components/workspace-switcher.tsx");
const workspace = read("app/api/auth/workspace/route.ts");
const access = read("lib/enterprise-access.ts");

assert.doesNotMatch(switcher, /Sponsor Workspace/);
assert.match(switcher, /\["personal", "enterprise"\]/);
assert.match(workspace, /workspace !== "personal" && workspace !== "enterprise"/);
assert.doesNotMatch(access, /source\.activeWorkspace === "sponsor"/);

console.log("Sponsor remains a dedicated panel, not a switchable workspace: ok");
