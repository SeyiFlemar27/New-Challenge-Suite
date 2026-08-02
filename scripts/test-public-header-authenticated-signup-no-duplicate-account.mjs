import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const shell=read("components/public-site/public-shell.tsx"),onboarding=read("app/onboarding/account-type/page.tsx");
assert(shell.includes('const signUpHref=user?"/onboarding/account-type":"/auth/register"'));
assert(onboarding.includes('/api/auth/profile/bootstrap'));assert(!onboarding.includes("createUserWithEmailAndPassword"));
console.log("authenticated public Sign up reuses one Firebase identity: ok");
