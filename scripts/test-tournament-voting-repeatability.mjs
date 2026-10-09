import { spawnSync } from "node:child_process";

const repetitions = 5;

for (let run = 1; run <= repetitions; run += 1) {
  console.log(`\n=== Tournament voting concurrency run ${run}/${repetitions} ===`);
  const result = spawnSync(process.execPath, [
    "--experimental-loader",
    "./scripts/ts-alias-loader.mjs",
    "scripts/test-tournament-voting-route.mjs"
  ], { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`Tournament voting concurrency test passed ${repetitions}/${repetitions} runs.`);
