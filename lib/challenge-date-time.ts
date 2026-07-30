export const DEFAULT_CHALLENGE_TIME_ZONE = "America/New_York";

export const CHALLENGE_TIME_ZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern Time" },
  { value: "America/Chicago", label: "Central Time" },
  { value: "America/Denver", label: "Mountain Time" },
  { value: "America/Los_Angeles", label: "Pacific Time" },
  { value: "America/Anchorage", label: "Alaska Time" },
  { value: "Pacific/Honolulu", label: "Hawaii Time" },
  { value: "Africa/Lagos", label: "WAT / Lagos" }
] as const;

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

function localDateTimeParts(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] ?? 0),
    millisecond: Number(String(match[7] ?? "0").padEnd(3, "0"))
  };
}

function zonedParts(date: Date, timeZone: string) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)])
  );
  return { year: values.year, month: values.month, day: values.day, hour: values.hour, minute: values.minute, second: values.second };
}

function timeZoneOffsetAt(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - date.getTime();
}

function pad(value: number) {
  return String(value).padStart(2, "0");
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

export function challengeLocalDateTimeToDate(value: unknown, source?: ChallengeTimeZoneSource) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = text(value);
  if (!raw) return null;
  const local = localDateTimeParts(raw);
  if (!local) return challengeDate(raw);
  const timeZone = resolveChallengeTimeZone(source);
  const wallClockUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second, local.millisecond);
  let candidate = new Date(wallClockUtc);
  candidate = new Date(wallClockUtc - timeZoneOffsetAt(candidate, timeZone));
  candidate = new Date(wallClockUtc - timeZoneOffsetAt(candidate, timeZone));
  const roundTrip = zonedParts(candidate, timeZone);
  if (roundTrip.year !== local.year || roundTrip.month !== local.month || roundTrip.day !== local.day || roundTrip.hour !== local.hour || roundTrip.minute !== local.minute || roundTrip.second !== local.second) return null;
  return candidate;
}

export function challengeDateTimeForStorage(value: unknown, source?: ChallengeTimeZoneSource) {
  const date = challengeLocalDateTimeToDate(value, source);
  return date?.toISOString() ?? "";
}

export function challengeDateTimeInputValue(value: unknown, source?: ChallengeTimeZoneSource) {
  const raw = text(value);
  if (localDateTimeParts(raw)) return raw.slice(0, 16);
  const date = challengeDate(value);
  if (!date) return "";
  const parts = zonedParts(date, resolveChallengeTimeZone(source));
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
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
  const labels: Record<string, string> = {
    "America/New_York": "ET", "America/Chicago": "CT", "America/Denver": "MT",
    "America/Los_Angeles": "PT", "America/Anchorage": "AKT", "Pacific/Honolulu": "HT", "Africa/Lagos": "WAT"
  };
  const label = labels[timeZone];
  return label ? formatted.replace(/(?:GMT[+-]\d+(?::\d+)?|EDT|EST|CDT|CST|MDT|MST|PDT|PST|AKDT|AKST|HST)$/, label) : formatted;
}

export function formatChallengeLocalDateTime(value: unknown, source?: ChallengeTimeZoneSource) {
  const date = challengeLocalDateTimeToDate(value, source);
  return date ? formatChallengeDateTime(date, source) : null;
}

const TIMELINE_DATE_FIELDS = [
  "registrationDeadline", "registrationEndAt", "registrationClosesAt", "startsAt", "challengeStartsAt",
  "submissionStartAt", "submissionOpensAt", "submissionDeadline", "submissionEndAt", "submissionClosesAt",
  "votingStartsAt", "votingStartAt", "votingOpensAt", "votingDeadline", "votingEndsAt", "votingEndAt",
  "votingClosesAt", "endsAt", "winnerAnnouncementAt", "winnersAnnouncedAt"
] as const;

export function normalizeChallengeTimelineForStorage<T extends Record<string, unknown>>(input: T, fallbackSource?: ChallengeTimeZoneSource): T {
  const timeZone = resolveChallengeTimeZone(input.timezone ? input : input.timeZone ? input : fallbackSource);
  const normalized: Record<string, unknown> = { ...input, timeZone, timezone: timeZone };
  for (const field of TIMELINE_DATE_FIELDS) {
    if (input[field] === undefined || input[field] === null || input[field] === "") continue;
    const value = challengeDateTimeForStorage(input[field], timeZone);
    if (value) normalized[field] = value;
  }
  return normalized as T;
}
