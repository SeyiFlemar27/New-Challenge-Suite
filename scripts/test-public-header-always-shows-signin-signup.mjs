import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const shell=read("components/public-site/public-shell.tsx");
assert(shell.includes('className="public-login">Sign in</Link>'));
assert(shell.includes('className="public-primary-button">Sign up</Link>'));
assert(shell.includes('className="public-primary-button justify-center">Sign up</Link>'));
assert(shell.includes('className="public-secondary-button justify-center">Sign in</Link>'));
console.log("public header always renders Sign in and Sign up: ok");
