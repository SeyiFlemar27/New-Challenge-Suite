import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const shell=read("components/public-site/public-shell.tsx");
assert(shell.includes('const signInHref=user?dashboardHref(user):"/auth/login"'));
assert(shell.includes("if(user.isAdmin)return\"/admin\"")&&shell.includes("if(user.isSponsor)return\"/sponsor/dashboard\""));
console.log("authenticated public Sign in routes to existing workspace safely: ok");
