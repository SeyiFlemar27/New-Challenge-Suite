import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

for (const file of ["app/auth/login/page.tsx", "app/sign-in/page.tsx", "app/landing/page.tsx"]) {
  const source = read(file);
  assert(source.includes("safeInternalPath"), `${file} must sanitize redirect destinations`);
  assert(source.includes('startsWith("/")'), `${file} must allow only internal paths`);
  assert(source.includes('startsWith("//")'), `${file} must reject protocol-relative paths`);
}
console.log("Open redirect protection checks passed.");
