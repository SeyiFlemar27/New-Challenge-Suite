export type SignupEmailState =
  | "available"
  | "active_account_exists"
  | "deletion_pending"
  | "deleted_but_auth_not_released"
  | "deleted_email_reuse_allowed"
  | "provider_conflict"
  | "enforcement_review_required"
  | "unknown_conflict";

const messages: Record<Exclude<SignupEmailState, "available" | "deleted_email_reuse_allowed">, string> = {
  active_account_exists: "An account already exists with this email. Please sign in or reset your password.",
  deletion_pending: "This email is still linked to an account deletion in progress. You can reuse it once deletion is complete.",
  deleted_but_auth_not_released: "This email has not been fully released yet. Please try again later or contact support.",
  provider_conflict: "This email is already connected to another sign-in method. Please use the original sign-in option.",
  enforcement_review_required: "This email cannot be used to create a new account right now. Please contact support.",
  unknown_conflict: "We could not create your account right now. Please try again or contact support."
};

export class AuthFlowError extends Error {
  constructor(public readonly state: SignupEmailState, message = authStateMessage(state)) {
    super(message);
    this.name = "AuthFlowError";
  }
}

export function authStateMessage(state: SignupEmailState) {
  if (state === "available" || state === "deleted_email_reuse_allowed") return "Account creation can continue.";
  return messages[state];
}

export function safeAuthError(error: unknown, priorState: SignupEmailState = "unknown_conflict") {
  if (error instanceof AuthFlowError) return error;
  const code = String((error as { code?: string })?.code ?? "");
  if (code === "auth/email-already-in-use") {
    const state = priorState === "deleted_email_reuse_allowed" ? "deleted_but_auth_not_released" : priorState === "provider_conflict" ? "provider_conflict" : "active_account_exists";
    return new AuthFlowError(state);
  }
  if (["auth/account-exists-with-different-credential", "auth/credential-already-in-use"].includes(code)) return new AuthFlowError("provider_conflict");
  if (["auth/weak-password", "auth/invalid-email", "auth/operation-not-allowed", "auth/too-many-requests", "auth/network-request-failed"].includes(code)) {
    const friendly = code === "auth/weak-password"
      ? "Use a stronger password and try again."
      : code === "auth/invalid-email"
        ? "Enter a valid email address."
        : code === "auth/too-many-requests"
          ? "Too many attempts were made. Please wait a moment and try again."
          : code === "auth/network-request-failed"
            ? "We could not reach the authentication service. Check your connection and try again."
            : "Account creation is temporarily unavailable. Please try again or contact support.";
    return new AuthFlowError("unknown_conflict", friendly);
  }
  return new AuthFlowError("unknown_conflict");
}
