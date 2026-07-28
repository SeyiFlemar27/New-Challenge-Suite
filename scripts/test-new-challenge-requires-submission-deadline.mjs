import fs from "node:fs";
const validation = fs.readFileSync("lib/server/challenge-validation.ts", "utf8");
const builder = fs.readFileSync("components/challenge-builder.tsx", "utf8");
for (const token of ["Please set a submission deadline before publishing this challenge.", "SUBMISSION_DEADLINE_NOT_AFTER_START", "submissionDeadline <= submissionStartAt"]) {
  if (!validation.includes(token)) throw new Error(`Missing publish deadline validation: ${token}`);
}
if (!builder.includes("registrationDeadline: form.registrationDeadline") || !builder.includes("submissionStartAt: form.registrationDeadline")) throw new Error("Builder must persist separate registration/submission timing.");
console.log("New challenge submission deadline checks passed.");
