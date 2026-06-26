export function safeIdPart(value: unknown, fallback = "none") {
  const raw = String(value ?? "").trim();
  const normalized = raw.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120);
  return normalized || fallback;
}

export function deterministicId(...parts: unknown[]) {
  return parts.map((part) => safeIdPart(part)).join("_").slice(0, 500);
}

export function getRequestIdempotencyKey(request: Request, body?: unknown) {
  const headerKey = request.headers.get("idempotency-key") ?? request.headers.get("x-idempotency-key");
  const bodyKey = typeof body === "object" && body !== null && "idempotencyKey" in body
    ? (body as { idempotencyKey?: unknown }).idempotencyKey
    : null;
  const key = typeof headerKey === "string" && headerKey.trim() ? headerKey : bodyKey;
  return typeof key === "string" && key.trim() ? safeIdPart(key, "") : null;
}