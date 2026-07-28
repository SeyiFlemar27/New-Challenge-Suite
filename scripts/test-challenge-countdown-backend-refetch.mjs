import fs from "node:fs";
const page = fs.readFileSync("app/challenges/[id]/page.tsx", "utf8");
if (!page.includes("onOpen={onRefresh}") || !page.includes("onOpen();")) throw new Error("Countdown must refetch backend state at zero.");
if (!page.includes('action === "submit_entry"')) throw new Error("Submit action must remain backend journey driven.");
console.log("Challenge countdown backend refetch checks passed.");
