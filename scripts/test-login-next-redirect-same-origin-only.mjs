import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const login = readFileSync("app/auth/login/page.tsx", "utf8");
const guard = readFileSync("components/verification-guard.tsx", "utf8");

assert(login.includes('value.startsWith("/")'));
assert(login.includes('value.startsWith("//")'));
assert(login.includes('value.includes("://")'));
assert(login.includes("safeInternalPath(new URLSearchParams(window.location.search).get(\"next\"))"));
assert(guard.includes("/auth/login?next="));
assert(guard.includes("encodeURIComponent(pathname)"));
assert(!login.includes("window.location.href = nextPath"), "login continuation must remain router-based and sanitized.");

console.log("Login next-redirect same-origin checks passed.");
