import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('../', import.meta.url));
const pin = JSON.parse(readFileSync(new URL('./firebase-emulator-toolchain.json', import.meta.url)));
assert.ok(process.argv[2], 'Supply the installed firebase-tools package directory; see the contention release report');
const cli = resolve(process.argv[2]);
const version = JSON.parse(readFileSync(join(cli, 'package.json'))).version;
const emulator = JSON.parse(readFileSync(join(cli, 'lib/emulator/downloadableEmulatorInfo.json'))).firestore;
assert.equal(version, pin.firebaseTools, 'Release acceptance requires the verified Firebase CLI');
assert.equal(emulator.version, pin.firestoreEmulator);
assert.equal(emulator.expectedChecksumSHA256, pin.firestoreSha256);
const require = createRequire(import.meta.url);
const adminRequire = createRequire(require.resolve('firebase-admin/firestore'));
assert.equal(adminRequire('@google-cloud/firestore/package.json').version, pin.firestoreSdk);
// Separate versions so a diagnostic CLI cannot remove a release binary.
const cache = join(tmpdir(), 'challenge-suite-verified-emulators', pin.firestoreEmulator);
mkdirSync(cache, { recursive: true });
const binary = join(cache, `cloud-firestore-emulator-v${pin.firestoreEmulator}.jar`);
function verifyCachedBinary() {
  if (existsSync(binary)) assert.equal(createHash('sha256').update(readFileSync(binary)).digest('hex'), pin.firestoreSha256, 'Cached emulator binary must match the official pinned checksum');
}
verifyCachedBinary();
const env = { ...process.env, FIREBASE_EMULATORS_PATH: cache, CHALLENGE_SUITE_CONTINUE_REGRESSIONS: 'true' };
// The pinned CLI verifies its official downloaded binary. Never accept overrides.
delete env.FIRESTORE_EMULATOR_BINARY_PATH;
delete env.FIRESTORE_EMULATOR_VERSION;
delete env.CHALLENGE_SUITE_DIAGNOSTIC_FIRESTORE_PATH;
delete env.NODE_OPTIONS;
console.log(JSON.stringify({ verificationToolchain: pin, node: process.version, cache }));
const result = spawnSync(process.execPath, [join(root, 'scripts/run-isolated-p0-emulators.mjs'), cli, ...process.argv.slice(3)], { cwd: root, env, stdio: 'inherit' });
if (result.error) throw result.error;
verifyCachedBinary();
process.exitCode = result.status ?? 1;
