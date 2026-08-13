export class InvalidFirestorePayloadError extends Error {
  constructor(readonly fieldPath: string) {
    super("Firestore payload contains an undefined value.");
    this.name = "InvalidFirestorePayloadError";
  }
}

function isPlainObject(value: object) {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function assertNoUndefinedFirestoreValues(value: unknown, path = "payload"): void {
  if (value === undefined) throw new InvalidFirestorePayloadError(path);
  if (value === null || typeof value !== "object") return;

  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoUndefinedFirestoreValues(entry, `${path}[${index}]`));
    return;
  }

  if (!isPlainObject(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    assertNoUndefinedFirestoreValues(entry, `${path}.${key}`);
  }
}

export function sanitizeFirestorePayload<T>(value: T, path = "payload"): T {
  if (value === undefined) throw new InvalidFirestorePayloadError(path);
  if (value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map((entry, index) => sanitizeFirestorePayload(entry, `${path}[${index}]`)) as T;
  }

  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, sanitizeFirestorePayload(entry, `${path}.${key}`)])
  ) as T;
}
