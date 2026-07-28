import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const root = process.cwd();

export function exists(file) {
  return existsSync(join(root, file));
}

export function read(file) {
  assert.ok(exists(file), `${file} must exist.`);
  return readFileSync(join(root, file), "utf8");
}

export function includes(file, needle, message) {
  assert.ok(read(file).includes(needle), message ?? `${file} must include ${needle}`);
}

export function notIncludes(file, needle, message) {
  assert.ok(!read(file).includes(needle), message ?? `${file} must not include ${needle}`);
}

export function anyIncludes(file, needles, message) {
  const text = read(file);
  assert.ok(needles.some((needle) => text.includes(needle)), message ?? `${file} must include one expected marker.`);
}

export function allFilesDoNotInclude(files, needles, message) {
  for (const file of files) {
    const text = read(file);
    for (const needle of needles) {
      assert.ok(!text.includes(needle), `${message ?? "Unexpected marker"}: ${needle} in ${file}`);
    }
  }
}