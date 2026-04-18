interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export interface EmailDeliveryResult {
  delivered: boolean;
  skipped: boolean;
  provider: string;
  id?: string;
  reason?: string;
}

export interface TestEmailMessage extends EmailMessage {
  sentAtIso: string;
}

const testEmailOutbox: TestEmailMessage[] = [];

function resolveProvider(): string {
  if (process.env.BTA_AUTH_TEST_MODE === "1") {
    return "test";
  }

  return (process.env.BTA_EMAIL_PROVIDER ?? "").trim().toLowerCase();
}

function resolveFromAddress(): string {
  return (process.env.BTA_EMAIL_FROM ?? "").trim();
}

function resolveReplyTo(): string {
  return (process.env.BTA_EMAIL_REPLY_TO ?? "").trim();
}

async function sendViaResend(message: EmailMessage): Promise<EmailDeliveryResult> {
  const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
  const from = resolveFromAddress();

  if (!apiKey || !from) {
    return {
      delivered: false,
      skipped: true,
      provider: "resend",
      reason: "RESEND_API_KEY and BTA_EMAIL_FROM are required for Resend delivery.",
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        reply_to: message.replyTo ?? resolveReplyTo() || undefined,
      }),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      return {
        delivered: false,
        skipped: false,
        provider: "resend",
        reason: `Resend delivery failed (${response.status})${details ? `: ${details}` : ""}`,
      };
    }

    const payload = await response.json() as { id?: string };
    return {
      delivered: true,
      skipped: false,
      provider: "resend",
      id: payload.id,
    };
  } catch (error) {
    return {
      delivered: false,
      skipped: false,
      provider: "resend",
      reason: error instanceof Error ? error.message : "Resend delivery failed.",
    };
  }
}

export async function sendTransactionalEmail(message: EmailMessage): Promise<EmailDeliveryResult> {
  const provider = resolveProvider();

  if (provider === "test") {
    testEmailOutbox.push({
      ...message,
      sentAtIso: new Date().toISOString(),
    });
    return {
      delivered: true,
      skipped: false,
      provider,
      id: `test-${testEmailOutbox.length}`,
    };
  }

  if (!provider) {
    return {
      delivered: false,
      skipped: true,
      provider: "none",
      reason: "BTA_EMAIL_PROVIDER is not configured.",
    };
  }

  if (provider === "resend") {
    return sendViaResend(message);
  }

  return {
    delivered: false,
    skipped: true,
    provider,
    reason: `Unsupported email provider: ${provider}`,
  };
}

export function readTestEmailOutbox(): TestEmailMessage[] {
  return testEmailOutbox.slice();
}

export function clearTestEmailOutbox(): void {
  testEmailOutbox.length = 0;
}
