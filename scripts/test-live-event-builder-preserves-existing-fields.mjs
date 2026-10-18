import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const wizard=readFileSync("components/host/live-event-builder-v2.tsx","utf8");
for(const field of ["title","description","category","coverImageUrl","coverImagePath","venueName","eventAddress","eventCity","eventCountry","startsAt","endsAt","maxParticipants","prizeDescription","winnerSelection","sponsorEnabled"])assert(wizard.includes(field),field);
assert(wizard.includes("...legacy.current"),"Historical fields remain preserved rather than silently deleted");
assert(wizard.includes("ops.schemaVersion===2")&&wizard.includes("old[Number(data.creationStep)"),"Legacy step restoration remains explicit");
assert(!wizard.includes('value="digital_submission"'),"Retired digital fields are not reintroduced as controls");
console.log("Live Event current fields and legacy draft preservation contracts passed.");
