export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export function getEmailConfigStatus() {
  const provider = process.env.EMAIL_PROVIDER || "resend";
  const from = process.env.EMAIL_FROM;
  const resendApiKey = process.env.RESEND_API_KEY;
  const missing = [
    !from ? "EMAIL_FROM" : null,
    provider === "resend" && !resendApiKey ? "RESEND_API_KEY" : null
  ].filter(Boolean) as string[];

  return { configured: missing.length === 0, provider, missing };
}

export async function sendEmail(message: EmailMessage) {
  const status = getEmailConfigStatus();
  if (!status.configured) {
    throw new Error(`Email delivery is not configured. Missing: ${status.missing.join(", ")}.`);
  }
  if (status.provider !== "resend") {
    throw new Error(`Unsupported email provider: ${status.provider}.`);
  }

  const response = await fetch("https://api.resend.com/emails", {
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

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body || "Email provider rejected the message.");
  }
}
