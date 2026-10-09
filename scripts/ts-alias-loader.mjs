import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const extensions = [".ts", ".js", ".mjs", ".json"];
function locate(base) {
  if (path.extname(base) && fs.existsSync(base)) return base;
  for (const extension of extensions) if (fs.existsSync(base + extension)) return base + extension;
  for (const extension of extensions) if (fs.existsSync(path.join(base, "index" + extension))) return path.join(base, "index" + extension);
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/server") return nextResolve("next/server.js", context);
  if (specifier.startsWith("@/")) {
    const target = locate(path.resolve(process.cwd(), specifier.slice(2)));
    if (target) return { url: pathToFileURL(target).href, shortCircuit: true };
  }
  if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    const target = locate(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier));
    if (target) return { url: pathToFileURL(target).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
