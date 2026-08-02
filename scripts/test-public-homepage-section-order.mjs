import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const s=read("components/public-site/public-home.tsx");const order=["<PublicHeader","<Hero","<Metrics","<Categories","<How","<Calculator","<Pricing","<Stories","<Assurances","<Final","<PublicFooter"];let at=-1;for(const token of order){const next=s.indexOf(token);assert(next>at,token+" is out of order");at=next}assert(!s.includes("Trending Challenges"));console.log("public homepage section order: ok");
