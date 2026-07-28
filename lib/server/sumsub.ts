import { createHmac, timingSafeEqual } from "crypto";

export type SumsubEnvironment = "sandbox" | "production";
export type ChallengeSuiteKycStatus =
  | "not_required"
  | "required"
  | "not_started"
  | "in_progress"
  | "pending_review"
  | "verified"
  | "rejected"
  | "expired"
  | "needs_resubmission"
  | "provider_not_configured"
  | "provider_error";

export type SumsubConfig = {
  configured: boolean;
  appToken?: string;
  secretKey?: string;
  levelName?: string;
  webhookSecret?: string;
  baseUrl: string;
  environment: SumsubEnvironment;
  publicEnabled: boolean;
};

type SumsubApplicantResponse = Record<string, unknown> & { id?: string };
type SumsubAccessTokenResponse = Record<string, unknown> & { token?: string; expiresIn?: number; userId?: string };

export function getSumsubConfig(): SumsubConfig {
  const environment = process.env.SUMSUB_ENVIRONMENT === "production" ? "production" : "sandbox";
  const baseUrl = String(process.env.SUMSUB_BASE_URL || "https://api.sumsub.com").replace(/\/$/, "");
  const appToken = process.env.SUMSUB_APP_TOKEN;
  const secretKey = process.env.SUMSUB_SECRET_KEY;
  const levelName = process.env.SUMSUB_LEVEL_NAME;
  const webhookSecret = process.env.SUMSUB_WEBHOOK_SECRET;
  const publicEnabled = process.env.NEXT_PUBLIC_SUMSUB_ENABLED === "true";
  return { configured: Boolean(appToken && secretKey && levelName), appToken, secretKey, levelName, webhookSecret, baseUrl, environment, publicEnabled };
}

export function isSumsubConfigured() {
  return getSumsubConfig().configured;
}

function signRequest(secretKey: string, timestamp: string, method: string, pathWithQuery: string, body = "") {
  return createHmac("sha256", secretKey).update(`${timestamp}${method.toUpperCase()}${pathWithQuery}${body}`).digest("hex");
}

function sumsubPath(pathname: string, query?: URLSearchParams) {
  const queryString = query?.toString();
  return `${pathname.startsWith("/") ? pathname : `/${pathname}`}${queryString ? `?${queryString}` : ""}`;
}

export class SumsubClient {
  private config = getSumsubConfig();

  isConfigured() {
    return this.config.configured;
  }

  levelName() {
    return this.config.levelName ?? "";
  }

  environment() {
    return this.config.environment;
  }

  async request<T>(method: string, pathname: string, body?: unknown, query?: URLSearchParams): Promise<T> {
    if (!this.config.appToken || !this.config.secretKey) throw new Error("SUMSUB_NOT_CONFIGURED");
    const pathWithQuery = sumsubPath(pathname, query);
    const bodyText = body === undefined ? "" : JSON.stringify(body);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = signRequest(this.config.secretKey, timestamp, method, pathWithQuery, bodyText);
    const response = await fetch(`${this.config.baseUrl}${pathWithQuery}`, {
      method,
      headers: {
        "X-App-Token": this.config.appToken,
        "X-App-Access-Ts": timestamp,
        "X-App-Access-Sig": signature,
        ...(body === undefined ? {} : { "Content-Type": "application/json" })
      },
      body: body === undefined ? undefined : bodyText,
      cache: "no-store"
    });
    const text = await response.text();
    const parsed = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const data = parsed as Record<string, unknown>;
      const message = typeof data.description === "string" ? data.description : typeof data.message === "string" ? data.message : "Sumsub API request failed.";
      throw new Error(message);
    }
    return parsed as T;
  }

  async getApplicantByExternalUserId(externalUserId: string) {
    const query = new URLSearchParams({ externalUserId });
    return this.request<SumsubApplicantResponse>("GET", "/resources/applicants/-;externalUserId", undefined, query);
  }

  async createApplicant(externalUserId: string, metadata?: { email?: string | null; fullName?: string | null }) {
    const query = new URLSearchParams({ levelName: this.levelName() });
    const body = { externalUserId, email: metadata?.email ?? undefined, fixedInfo: metadata?.fullName ? { firstName: metadata.fullName } : undefined };
    return this.request<SumsubApplicantResponse>("POST", "/resources/applicants", body, query);
  }

  async createAccessToken(externalUserId: string, applicantId?: string | null) {
    const query = new URLSearchParams({ userId: externalUserId, levelName: this.levelName(), ttlInSecs: "1200" });
    if (applicantId) query.set("applicantId", applicantId);
    return this.request<SumsubAccessTokenResponse>("POST", "/resources/accessTokens/sdk", undefined, query);
  }
}

export function getSumsubClient() {
  return new SumsubClient();
}

export function verifySumsubWebhookSignature(rawBody: string, signatureHeader: string | null) {
  const secret = getSumsubConfig().webhookSecret;
  const signature = signatureHeader?.trim().toLowerCase() ?? "";
  if (!secret || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const expectedBuffer = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"), "hex");
  const receivedBuffer = Buffer.from(signature, "hex");
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function sumsubWebhookSignature(request: Request) {
  return request.headers.get("x-payload-digest") || request.headers.get("x-sumsub-signature") || request.headers.get("x-app-access-sig") || request.headers.get("x-signature");
}

export function normalizeSumsubKycStatus(payload: Record<string, unknown>): { status: ChallengeSuiteKycStatus; reason: string | null; reviewAnswer: string | null; reviewRejectType: string | null; providerStatus: string | null } {
  const reviewResult = payload.reviewResult && typeof payload.reviewResult === "object" ? payload.reviewResult as Record<string, unknown> : {};
  const reviewStatus = String(payload.reviewStatus ?? payload.applicantReviewStatus ?? payload.type ?? "").toLowerCase();
  const reviewAnswer = typeof reviewResult.reviewAnswer === "string" ? reviewResult.reviewAnswer : typeof payload.reviewAnswer === "string" ? payload.reviewAnswer : null;
  const rejectType = typeof reviewResult.reviewRejectType === "string" ? reviewResult.reviewRejectType : typeof payload.reviewRejectType === "string" ? payload.reviewRejectType : null;
  const moderationComment = typeof reviewResult.moderationComment === "string" ? reviewResult.moderationComment : null;
  const clientComment = typeof reviewResult.clientComment === "string" ? reviewResult.clientComment : null;
  const reason = moderationComment || clientComment || rejectType || null;

  if (reviewAnswer === "GREEN") return { status: "verified", reason: null, reviewAnswer, reviewRejectType: rejectType, providerStatus: reviewStatus || "completed" };
  if (reviewAnswer === "RED") return { status: rejectType === "FINAL" ? "rejected" : "needs_resubmission", reason, reviewAnswer, reviewRejectType: rejectType, providerStatus: reviewStatus || "rejected" };
  if (reviewStatus.includes("pending") || reviewStatus.includes("queue")) return { status: "pending_review", reason, reviewAnswer, reviewRejectType: rejectType, providerStatus: reviewStatus };
  if (reviewStatus.includes("init") || reviewStatus.includes("onhold") || reviewStatus.includes("review")) return { status: "in_progress", reason, reviewAnswer, reviewRejectType: rejectType, providerStatus: reviewStatus };
  if (reviewStatus.includes("expired")) return { status: "expired", reason, reviewAnswer, reviewRejectType: rejectType, providerStatus: reviewStatus };
  return { status: "pending_review", reason, reviewAnswer, reviewRejectType: rejectType, providerStatus: reviewStatus || null };
}

export function safeSumsubApplicantId(payload: Record<string, unknown>) {
  return typeof payload.applicantId === "string" ? payload.applicantId : payload.applicant && typeof payload.applicant === "object" && "id" in payload.applicant && typeof payload.applicant.id === "string" ? payload.applicant.id : null;
}

export function safeSumsubExternalUserId(payload: Record<string, unknown>) {
  return typeof payload.externalUserId === "string" ? payload.externalUserId : typeof payload.externalUserId === "number" ? String(payload.externalUserId) : null;
}
