import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const config = read("lib/public-site/config.ts");
const login = read("app/auth/login/page.tsx");
const register = read("app/auth/register/page.tsx");
const create = read("app/challenges/create/page.tsx");
const guard = read("components/verification-guard.tsx");

assert(config.includes('!path.startsWith("//")'));
assert(config.includes('!path.includes("://")'));
assert(login.includes("safeInternalPath"));
assert(register.includes("requestedReturnPath"));
assert(register.includes("returnUrl="));
assert(create.includes("window.location.search"));
assert(guard.includes('"/explore"'));
assert(guard.includes('"/for-talent"'));
assert(guard.includes('"/categories"'));
assert(guard.includes('pathname.startsWith(`${prefix}/`)'));
console.log("public auth return flow preserves safe intent: ok");
