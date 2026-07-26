export function financialIdempotencyKey(...parts: Array<string | number | null | undefined>) {
  return parts.map((part) => encodeURIComponent(String(part ?? "none").trim().toLowerCase())).join(":");
}

export function isDuplicateProviderEvent(existingEventIds: string[], providerEventId: string) {
  return existingEventIds.includes(providerEventId);
}
