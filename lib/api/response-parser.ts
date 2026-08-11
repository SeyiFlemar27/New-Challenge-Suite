export interface ApiResult<T> {
  ok: boolean;
  message: string;
  data?: T;
  setupRequired?: boolean;
  code?: string;
  details?: unknown;
  error?: {
    code: string;
    message: string;
  };
  status?: number;
}

export const FRIENDLY_API_MESSAGES = {
  general: "We couldn't complete this request right now. Please try again.",
  session: "Your session may have expired. Please sign in again.",
  permission: "You do not have permission to perform this action.",
  validation: "Please check the form and try again.",
  conflict: "This action could not be completed because the current record state has changed.",
  provider: "We could not confirm this with the provider yet. Please try again shortly.",
  network: "Network error. Please check your connection and try again."
} as const;

function failure<T>(code: string, message: string, status = 0): ApiResult<T> {
  return { ok: false, code, message, error: { code, message }, status };
}

export function networkFailure<T>(): ApiResult<T> {
  return failure("NETWORK_ERROR", FRIENDLY_API_MESSAGES.network);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeServerMessage(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const message = value.trim();
  if (/invalid\s+server\s+response|firebaseerror|stripeerror|auth\/[a-z-]+|syntaxerror|unexpected token|<!doctype|<html|\bat\s+\w+\s*\(/i.test(message)) return null;
  return message;
}

function fallbackForStatus(status: number, redirected: boolean) {
  if (redirected || (status >= 300 && status < 400) || status === 401) return { code: "SESSION_REQUIRED", message: FRIENDLY_API_MESSAGES.session };
  if (status === 403) return { code: "PERMISSION_DENIED", message: FRIENDLY_API_MESSAGES.permission };
  if (status === 409) return { code: "CONFLICT", message: FRIENDLY_API_MESSAGES.conflict };
  if (status === 422) return { code: "BUSINESS_RULE_BLOCKED", message: FRIENDLY_API_MESSAGES.validation };
  return { code: status >= 500 ? "SERVER_ERROR" : "UNEXPECTED_RESPONSE", message: FRIENDLY_API_MESSAGES.general };
}

export async function parseApiResponse<T>(response: Response): Promise<ApiResult<T>> {
  const fallback = fallbackForStatus(response.status, response.redirected);
  if (response.redirected || (response.status >= 300 && response.status < 400)) return failure(fallback.code, fallback.message, response.status);

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json") && !contentType.includes("+json")) return failure(fallback.code, fallback.message, response.status);

  const text = await response.text().catch(() => "");
  if (!text.trim()) return failure(fallback.code, fallback.message, response.status);

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return failure(fallback.code, fallback.message, response.status);
  }
  if (!isRecord(payload) || typeof payload.ok !== "boolean") return failure(fallback.code, fallback.message, response.status);

  if (payload.ok) {
    return {
      ...(payload as unknown as ApiResult<T>),
      ok: true,
      message: safeServerMessage(payload.message) ?? "Action completed successfully.",
      status: response.status
    };
  }

  const nestedError = isRecord(payload.error) ? payload.error : null;
  const rawCode = nestedError?.code ?? payload.code;
  const code = typeof rawCode === "string" && /^[A-Z0-9_]+$/.test(rawCode) ? rawCode : fallback.code;
  const providerPending = /PROVIDER|PAYMENT.*PENDING|CONFIRMATION.*PENDING/.test(code);
  const safeMessage = response.status >= 500
    ? providerPending
      ? FRIENDLY_API_MESSAGES.provider
      : fallback.message
    : safeServerMessage(nestedError?.message ?? payload.message) ?? fallback.message;

  return {
    ...(payload as unknown as ApiResult<T>),
    ok: false,
    code,
    message: safeMessage,
    error: { code, message: safeMessage },
    status: response.status
  };
}
