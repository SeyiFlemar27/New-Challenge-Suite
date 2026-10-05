export function isInternalStoragePath(path: string, prefixes: readonly string[]) {
  return Boolean(path && prefixes.some((prefix) => path.startsWith(prefix)) && !path.includes("..") && !/^https?:/i.test(path));
}

export function isStorageDownloadUrlForPath(url: string, path: string) {
  if (!url || !path) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const decodedPath = decodeURIComponent(parsed.pathname);
    const firebaseHost = parsed.hostname === "firebasestorage.googleapis.com";
    const googleStorageHost = parsed.hostname === "storage.googleapis.com";
    const localStorageHost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (firebaseHost) return decodedPath.includes(`/o/${path}`);
    if (googleStorageHost || localStorageHost) return decodedPath.endsWith(`/${path}`);
    return false;
  } catch {
    return false;
  }
}

export function validateOwnedStorageMedia(input: { url: string; path: string; prefixes: readonly string[] }) {
  if (!input.url && !input.path) return { valid: true as const };
  if (!input.url || !input.path) return { valid: false as const, code: "MEDIA_URL_PATH_PAIR_REQUIRED", message: "Uploaded media must include both its download URL and confirmed storage path." };
  if (!isInternalStoragePath(input.path, input.prefixes)) return { valid: false as const, code: "INVALID_MEDIA_STORAGE_PATH", message: "Media must use an authenticated Challenge Suite storage path." };
  if (!isStorageDownloadUrlForPath(input.url, input.path)) return { valid: false as const, code: "UNVERIFIED_MEDIA_URL", message: "Media URL must match its confirmed Challenge Suite storage path." };
  return { valid: true as const };
}
