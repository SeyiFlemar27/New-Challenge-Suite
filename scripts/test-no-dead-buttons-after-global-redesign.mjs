import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
for (const path of ["app/explore/page.tsx", "app/challenges/[id]/page.tsx", "app/challenges/[id]/prediction/page.tsx", "app/earnings/page.tsx", "app/dorocoins/page.tsx"]) {
  const source = read(path);
  assert(!source.includes('href="#"'), `${path} contains a dead hash link`);
  assert(!source.includes('onClick={() => {}}'), `${path} contains an empty click handler`);
}
console.log("core redesign dead-button checks passed");
