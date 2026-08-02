import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const files=["lib/public-site/config.ts","components/public-site/public-home.tsx","components/public-site/public-shell.tsx","components/public-site/category-experience.tsx","components/public-site/for-talent-experience.tsx"];for(const file of files){const s=read(file);assert(!s.includes("Hybrid Competition"),file);assert(!s.includes("/host/hybrid"),file)}console.log("active Hybrid Competition is absent from public product: ok");
