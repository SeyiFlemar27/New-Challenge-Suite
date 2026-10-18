import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const wizard=readFileSync("components/host/live-event-builder-v2.tsx","utf8");
for(const token of ["ChallengeBuilderFrame","BuilderSurface","BuilderFooter","finishLater","save().then","liveEventBuilderSteps"])assert(wizard.includes(token),token);
assert(!wizard.includes("HostVerticalStepper")&&!wizard.includes("function WizardStep"));
assert(wizard.includes("uploading")&&wizard.includes("onStatusChange"),"Leaving and saving must respect active uploads");
console.log("Live Event vertical layout and safe-exit contracts passed.");
