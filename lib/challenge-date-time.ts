export const DEFAULT_CHALLENGE_TIME_ZONE = "Africa/Lagos";

type ChallengeTimeZoneSource = string | Record<string, unknown> | null | undefined;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function resolveChallengeTimeZone(source?: ChallengeTimeZoneSource) {
  const candidates = typeof source === "string"
    ? [source]
    : source
      ? [source.timezone, source.creatorTimeZone, source.creatorTimezone, source.timeZone, source.displayTimeZone]
      : [];
  const selected = candidates.map(text).find((candidate) => candidate && validTimeZone(candidate));
  return selected ?? DEFAULT_CHALLENGE_TIME_ZONE;
}

export function challengeDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.toDate === "function") {
      const date = (record.toDate as () => Date)();
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
    }
    const seconds = Number(record.seconds ?? record._seconds);
    if (Number.isFinite(seconds)) {
      const nanoseconds = Number(record.nanoseconds ?? record._nanoseconds ?? 0);
      const date = new Date(seconds * 1000 + Math.floor(nanoseconds / 1_000_000));
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatChallengeDateTime(value: unknown, source?: ChallengeTimeZoneSource) {
  const date = challengeDate(value);
  if (!date) return null;
  const timeZone = resolveChallengeTimeZone(source);
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short"
  }).format(date);
  if (timeZone === "Africa/Lagos") return formatted.replace(/\bGMT\+1\b|\bGMT\+01:00\b/, "WAT");
  return formatted;
}
