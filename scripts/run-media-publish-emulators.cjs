// Test-only compatibility for Firebase CLI 15.22.4's GCS null-metadata bug.
// The stock emulator deletes customMetadata[key], but retains downloadTokens.
// Real GCS deletes the bearer-token metadata key. Never imported by the app.
const path = require("node:path");
const root = process.argv[2];
if (!root || !process.env.GCLOUD_PROJECT?.startsWith("demo-")) throw new Error("Explicit firebase-tools path and isolated demo project required");
if (process.argv[3] !== "emulators:exec" || process.argv[process.argv.indexOf("--project") + 1] !== process.env.GCLOUD_PROJECT) throw new Error("Only emulators:exec for the explicit demo project is permitted");
const { StoredFileMetadata } = require(path.join(root, "lib/emulator/storage/metadata.js"));
const original = StoredFileMetadata.prototype.update;
if (!original.toString().includes("setDownloadTokensFromCustomMetadata")) throw new Error("Unknown emulator metadata implementation; review compatibility before testing");
StoredFileMetadata.prototype.update = function (incoming, ...args) {
  if (incoming?.metadata && Object.hasOwn(incoming.metadata, "firebaseStorageDownloadTokens") && incoming.metadata.firebaseStorageDownloadTokens === null) this.downloadTokens = [];
  return original.call(this, incoming, ...args);
};
console.log("TEST EMULATOR ONLY: GCS explicit-null token deletion compatibility enabled; vendor files unchanged.");
process.argv = [process.execPath, path.join(root, "lib/bin/firebase.js"), ...process.argv.slice(3)];
require(path.join(root, "lib/bin/firebase.js"));
