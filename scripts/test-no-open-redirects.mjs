import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

for (const file of ["app/auth/login/page.tsx", "app/sign-in/page.tsx"]) {
  const source = read(file);
  assert(source.includes("safeInternalPath"), `${file} must sanitize redirect destinations`);
  assert(source.includes('startsWith("/")'), `${file} must allow only internal paths`);
  assert(source.includes('startsWith("//")'), `${file} must reject protocol-relative paths`);
}
const publicRoutes = read("lib/public-site/config.ts");
assert(publicRoutes.includes("safePublicPath"), "public landing actions must use the centralized safe-path helper");
assert(publicRoutes.includes('startsWith("/")'), "public landing actions must allow only internal paths");
assert(publicRoutes.includes('startsWith("//")'), "public landing actions must reject protocol-relative paths");
assert(publicRoutes.includes('includes("://")'), "public landing actions must reject absolute external URLs");
console.log("Open redirect protection checks passed.");
