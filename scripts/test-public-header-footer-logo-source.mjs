import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const shell=read("components/public-site/public-shell.tsx"),nextConfig=read("next.config.ts");
assert(shell.includes("function PublicLogo"));assert(shell.includes("<PublicLogo/>")&&shell.includes("<PublicLogo size={36}/>"));
assert(shell.includes("object-contain"));assert(nextConfig.includes('hostname: "res.cloudinary.com"'));
console.log("public header and footer share contained approved logo: ok");
