export type ProviderReadinessState = "ready" | "missing_configuration" | "setup_only" | "disabled" | "unknown" | "requires_manual_verification";

export type ProviderReadinessItem = {
  id: string;
  name: string;
  status: ProviderReadinessState;
  configured: boolean;
  explanation: string;
};

function present(value: string | undefined) {
  return Boolean(value?.trim());
}

function item(id: string, name: string, configured: boolean, explanation: string, status?: ProviderReadinessState): ProviderReadinessItem {
  return { id, name, configured, status: status ?? (configured ? "ready" : "missing_configuration"), explanation };
}

export function imageLessChallengePublishingAllowed() {
  return process.env.ALLOW_IMAGELESS_CHALLENGE_PUBLISHING === "true";
}

export function challengeMediaReadiness() {
  const configured = present(process.env.FIREBASE_STORAGE_BUCKET) || present(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
  const explicitlyDisabled = process.env.NEXT_PUBLIC_DISABLE_MEDIA_UPLOADS === "true";
  return {
    configured: configured && !explicitlyDisabled,
    imageLessPublishingAllowed: imageLessChallengePublishingAllowed(),
    status: explicitlyDisabled ? "disabled" as const : configured ? "ready" as const : "missing_configuration" as const
  };
}

export function getProviderReadiness(): ProviderReadinessItem[] {
  const stripe = present(process.env.STRIPE_SECRET_KEY);
  const stripeWebhook = present(process.env.STRIPE_WEBHOOK_SECRET);
  const kyc = present(process.env.SUMSUB_APP_TOKEN) && present(process.env.SUMSUB_SECRET_KEY);
  const media = challengeMediaReadiness();
  const email = present(process.env.RESEND_API_KEY) && present(process.env.EMAIL_PROVIDER);

  return [
    item("authentication", "Authentication", present(process.env.FIREBASE_PROJECT_ID) || present(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID), "Firebase server authentication configuration is required."),
    item("payments", "Stripe checkout", stripe, "Stripe server configuration is required before checkout can start."),
    item("payment_webhook", "Stripe payment confirmation", stripe && stripeWebhook, "Provider webhook confirmation is required before payments become active.", stripe && stripeWebhook ? "requires_manual_verification" : "missing_configuration"),
    item("uploads", "Challenge media uploads", media.configured, media.configured ? "Storage is configured; runtime upload checks still apply." : media.imageLessPublishingAllowed ? "Storage is unavailable and image-less publishing was explicitly enabled." : "Storage is required for production challenge publishing.", media.status),
    item("identity_verification", "Identity verification", kyc, "KYC provider configuration and webhook verification are required.", kyc ? "requires_manual_verification" : "missing_configuration"),
    item("sponsor_funding", "Sponsor funding", stripe && stripeWebhook, "Sponsor funds become confirmed only through the Stripe webhook.", stripe && stripeWebhook ? "requires_manual_verification" : "setup_only"),
    item("email", "Email delivery", email, "Email delivery remains inactive until its provider is configured."),
    item("push", "Push notifications", false, "Push delivery is not active in this release.", "disabled"),
    item("payouts", "External payouts", false, "External payout execution remains disabled and subject to operational review.", "disabled"),
    item("app_stores", "Mobile app stores", false, "Official mobile store releases are not active yet.", "disabled")
  ];
}

export function providerReadinessById() {
  return Object.fromEntries(getProviderReadiness().map((entry) => [entry.id, entry]));
}
