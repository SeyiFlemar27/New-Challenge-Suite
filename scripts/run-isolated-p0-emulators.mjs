import { mkdtempSync, writeFileSync, createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "node:net";
import { spawn } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const artifacts = mkdtempSync(join(tmpdir(), "challenge-suite-p0-isolated-"));
const project = `demo-p0-${Date.now()}`;
async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
const ports = new Set();
while (ports.size < 7) ports.add(await freePort());
const [auth, firestore, storage, hub, logging, websocketPort, web] = [...ports];
const config = { firestore: { rules: join(root, "firestore.rules"), indexes: join(root, "firestore.indexes.json") }, storage: { rules: join(root, "storage.rules") }, emulators: { singleProjectMode: true, ui: { enabled: false }, auth: { host: "127.0.0.1", port: auth }, firestore: { host: "127.0.0.1", port: firestore, websocketPort }, storage: { host: "127.0.0.1", port: storage }, hub: { host: "127.0.0.1", port: hub }, logging: { host: "127.0.0.1", port: logging } } };
const configPath = join(artifacts, "firebase.json");
writeFileSync(configPath, JSON.stringify(config, null, 2));
const env = { ...process.env, GCLOUD_PROJECT: project, GOOGLE_CLOUD_PROJECT: project, FIREBASE_PROJECT_ID: project, NEXT_PUBLIC_FIREBASE_PROJECT_ID: project, CHALLENGE_SUITE_E2E_PROJECT_ID: project, FIREBASE_PRIVATE_KEY: "", FIREBASE_CLIENT_EMAIL: "", GOOGLE_APPLICATION_CREDENTIALS: "", STRIPE_SECRET_KEY: "sk_test_deterministic_p0_regressions", STRIPE_WEBHOOK_SECRET: "whsec_deterministic_p0_regressions" };
Object.assign(env, { NORMAL_EMAIL_DELIVERY_ENABLED: "false", TOURNAMENT_EMAIL_DELIVERY_ENABLED: "false", SUPPORT_EMAIL_DELIVERY_ENABLED: "false", NORMAL_AUTOMATIC_REFUNDS_ENABLED: "false", RESEND_API_KEY: "", EMAIL_FROM: "" });
env.CHALLENGE_SUITE_TEST_RESULTS_PATH = join(artifacts, "suite-results.json");
for (const key of Object.keys(env)) if (key.startsWith("TOURNAMENT_CLOUD_TASKS_") || key.startsWith("GOOGLE_WORKLOAD_IDENTITY_")) delete env[key];
const cli = process.argv[2];
if (!cli) throw new Error("Pass the installed firebase-tools directory explicitly.");
const selected = process.argv[3] ?? "scripts/run-p0-emulator-regressions.mjs";
if (!["scripts/run-p0-emulator-regressions.mjs", "scripts/test-tournament-team-entitlements-emulator.mjs", "scripts/test-tournament-notifications-emulator.mjs", "scripts/test-tournament-complete-lifecycles-emulator.mjs", "scripts/qa/run-p1-browser-e2e.mjs"].includes(selected)) throw new Error("Unsupported isolated suite");
if (selected === "scripts/qa/run-p1-browser-e2e.mjs") Object.assign(env, { CHALLENGE_SUITE_E2E_PROJECT_ID: project, CHALLENGE_SUITE_E2E_WEB_PORT: String(web), CHALLENGE_SUITE_E2E_AUTH_PORT: String(auth), CHALLENGE_SUITE_E2E_FIRESTORE_PORT: String(firestore), CHALLENGE_SUITE_E2E_STORAGE_PORT: String(storage), CHALLENGE_SUITE_E2E_MEDIA_UPLOADS_ENABLED: "true", CHALLENGE_SUITE_E2E_NEXT_MODE: "production", CHALLENGE_SUITE_E2E_JOURNEY: process.env.CHALLENGE_SUITE_E2E_JOURNEY ?? "", CHALLENGE_SUITE_E2E_PREBUILT_DIST_DIR: "" });
const command = `node --experimental-transform-types --experimental-loader "${pathToFileURL(join(root, "scripts/ts-alias-loader.mjs")).href}" "${join(root, "scripts/run-local-verification-suite.mjs")}" "${selected}"`;
// Unique working directory isolates Firebase logs and hub files as well as every
// TCP service. No existing process is reused or terminated.
const child = spawn(process.execPath, [join(root, "scripts/run-media-publish-emulators.cjs"), cli, "emulators:exec", "--project", project, "--only", "auth,firestore,storage", "--config", configPath, command], { cwd: artifacts, env, stdio: ["ignore", "pipe", "pipe"] });
const log = createWriteStream(join(artifacts, "execution.log"));
process.stdout.on("error", error => { if (error.code !== "EPIPE") throw error; });
process.stderr.on("error", error => { if (error.code !== "EPIPE") throw error; });
for (const [stream, destination] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) stream.on("data", chunk => { log.write(chunk); destination.write(chunk); });
console.log(`Isolated emulator evidence: ${artifacts}`);
const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", value => resolve(value ?? 1)); });
log.end();
writeFileSync(join(artifacts, "result.json"), JSON.stringify({ project, selected, exitCode: code, completedAt: new Date().toISOString(), configPath }, null, 2));
process.exitCode = code;
