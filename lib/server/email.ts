export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type EmailProvider = "resend";

export type EmailErrorReason =
  | "missing_resend_api_key"
  | "missing_email_from"
  | "invalid_email_provider"
  | "invalid_email_from"
  | "resend_testing_recipient_restricted"
  | "resend_sender_domain_unverified"
  | "resend_api_key_invalid"
  | "resend_rate_limited"
  | "resend_quota_exceeded"
  | "resend_api_error"
  | "email_provider_network_error";

export class EmailDeliveryError extends Error {
  reason: EmailErrorReason;
  status?: number;
  provider: string;
  providerCode?: string;
  providerMessage?: string;

  constructor(input: { reason: EmailErrorReason; message: string; provider?: string; status?: number; providerCode?: string; providerMessage?: string }) {
    super(input.message);
    this.name = "EmailDeliveryError";
    this.reason = input.reason;
    this.status = input.status;
    this.provider = input.provider ?? "resend";
    this.providerCode = input.providerCode;
    this.providerMessage = input.providerMessage;
  }
}

export function getEmailConfigStatus() {
  const provider = (process.env.EMAIL_PROVIDER || "resend").trim().toLowerCase();
  const from = process.env.EMAIL_FROM?.trim();
  const resendApiKey = process.env.RESEND_API_KEY;
  const missing = [
    !from ? "EMAIL_FROM" : null,
    provider === "resend" && !resendApiKey ? "RESEND_API_KEY" : null
  ].filter(Boolean) as string[];

  const invalid = [provider !== "resend" ? "EMAIL_PROVIDER" : null].filter(Boolean) as string[];

  return {
    configured: missing.length === 0 && invalid.length === 0,
    provider,
    missing,
    invalid,
    hasResendApiKey: Boolean(resendApiKey),
    hasEmailFrom: Boolean(from),
    fromDomain: from ? extractEmailDomain(from) : null,
    fromUsesResendTestingDomain: from?.toLowerCase().includes("@resend.dev") ?? false
  };
}

function extractEmailDomain(value: string) {
  const match = value.match(/<([^>]+)>/)?.[1] ?? value;
  const email = match.trim().toLowerCase();
  return email.includes("@") ? email.split("@").pop() ?? null : null;
}

function parseResendError(rawBody: string): { code?: string; message?: string; name?: string } {
  if (!rawBody) return {};
  try {
    const parsed = JSON.parse(rawBody) as { name?: string; message?: string; error?: string; code?: string };
    return {
      code: parsed.name ?? parsed.code ?? parsed.error,
      message: parsed.message ?? parsed.error,
      name: parsed.name
    };
  } catch {
    return { message: rawBody.slice(0, 500) };
  }
}

function classifyResendError(status: number, code?: string, message = ""): EmailErrorReason {
  const normalized = `${code ?? ""} ${message}`.toLowerCase();
  if (normalized.includes("missing api key")) return "missing_resend_api_key";
  if (normalized.includes("api key is invalid") || normalized.includes("invalid_api_key")) return "resend_api_key_invalid";
  if (normalized.includes("invalid `from`") || normalized.includes("invalid_from_address")) return "invalid_email_from";
  if (normalized.includes("only send testing emails to your own email")) return "resend_testing_recipient_restricted";
  if (normalized.includes("domain is not verified") || normalized.includes("not verified")) return "resend_sender_domain_unverified";
  if (normalized.includes("monthly_quota_exceeded") || normalized.includes("daily_quota_exceeded") || normalized.includes("quota")) return "resend_quota_exceeded";
  if (status === 429 || normalized.includes("rate_limit_exceeded")) return "resend_rate_limited";
  return "resend_api_error";
}

export function safeEmailErrorDetails(error: unknown) {
  if (error instanceof EmailDeliveryError) {
    return {
      reason: error.reason,
      provider: error.provider,
      status: error.status,
      providerCode: error.providerCode,
      providerMessage: error.providerMessage
    };
  }
  return {
    reason: "resend_api_error" as EmailErrorReason,
    provider: "resend",
    providerMessage: error instanceof Error ? error.message : "Unknown email delivery error."
  };
}

export function logEmailDeliveryError(context: string, error: unknown, extra: Record<string, unknown> = {}) {
  const details = safeEmailErrorDetails(error);
  console.error(`[email] ${context}`, {
    ...details,
    ...extra
  });
}

export async function sendEmail(message: EmailMessage) {
  const status = getEmailConfigStatus();
  if (status.invalid.length) {
    throw new EmailDeliveryError({ reason: "invalid_email_provider", provider: status.provider, message: "Unsupported email provider." });
  }
  if (status.missing.includes("EMAIL_FROM")) {
    throw new EmailDeliveryError({ reason: "missing_email_from", provider: status.provider, message: "EMAIL_FROM is not configured." });
  }
  if (status.missing.includes("RESEND_API_KEY")) {
    throw new EmailDeliveryError({ reason: "missing_resend_api_key", provider: status.provider, message: "RESEND_API_KEY is not configured." });
  }

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text
      })
    });
  } catch (error) {
    throw new EmailDeliveryError({
      reason: "email_provider_network_error",
      provider: status.provider,
      message: "Email provider network request failed.",
      providerMessage: error instanceof Error ? error.message : "Unknown network error."
    });
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const providerError = parseResendError(body);
    throw new EmailDeliveryError({
      reason: classifyResendError(response.status, providerError.code, providerError.message),
      provider: status.provider,
      status: response.status,
      providerCode: providerError.code,
      providerMessage: providerError.message,
      message: "Email provider rejected the message."
    });
  }
}
