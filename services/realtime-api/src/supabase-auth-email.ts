import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { EmailDeliveryResult } from "./email.js";

function readFirstEnv(...names: string[]): string {
  for (const name of names) {
    const value = (process.env[name] ?? "").trim();
    if (value) {
      return value;
    }
  }
  return "";
}

function withTimeout(timeoutMs: number): AbortSignal | undefined {
  if (typeof AbortController === "undefined") {
    return undefined;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (typeof (timer as NodeJS.Timeout).unref === "function") {
    (timer as NodeJS.Timeout).unref();
  }
  return controller.signal;
}

export function readSupabaseEmailConfig(): {
  supabaseUrl: string;
  supabasePublishableKey: string;
  supabaseServiceRoleKey: string;
} {
  return {
    supabaseUrl: readFirstEnv(
      "SUPABASE_URL",
      "VITE_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
    ),
    supabasePublishableKey: readFirstEnv(
      "SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_ANON_KEY",
      "VITE_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ),
    supabaseServiceRoleKey: readFirstEnv(
      "SUPABASE_SERVICE_ROLE_KEY",
    ),
  };
}

function createSupabaseAdminClient(): SupabaseClient | null {
  const { supabaseUrl, supabaseServiceRoleKey } = readSupabaseEmailConfig();
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function requestSupabasePasswordResetEmail(input: {
  email: string;
  redirectTo: string;
  timeoutMs?: number;
}): Promise<EmailDeliveryResult> {
  const { supabaseUrl, supabasePublishableKey } = readSupabaseEmailConfig();
  if (!supabaseUrl || !supabasePublishableKey) {
    return {
      delivered: false,
      skipped: true,
      provider: "supabase-auth",
      reason: "Supabase password reset email is not configured on the API service.",
    };
  }

  const timeoutMs = Math.max(1000, Math.floor(input.timeoutMs ?? 15000));
  const endpoint = new URL("/auth/v1/recover", supabaseUrl);
  endpoint.searchParams.set("redirect_to", input.redirectTo);

  try {
    const response = await fetch(endpoint.toString(), {
      method: "POST",
      headers: {
        apikey: supabasePublishableKey,
        Authorization: `Bearer ${supabasePublishableKey}`,
        "Content-Type": "application/json;charset=UTF-8",
        "X-Client-Info": "bta-realtime-api",
      },
      body: JSON.stringify({
        email: input.email,
        gotrue_meta_security: {},
      }),
      signal: withTimeout(timeoutMs),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      return {
        delivered: false,
        skipped: false,
        provider: "supabase-auth",
        reason: `Supabase password reset failed (${response.status})${details ? `: ${details}` : ""}`,
      };
    }

    return {
      delivered: true,
      skipped: false,
      provider: "supabase-auth",
    };
  } catch (error) {
    return {
      delivered: false,
      skipped: false,
      provider: "supabase-auth",
      reason: error instanceof Error ? error.message : "Supabase password reset request failed.",
    };
  }
}

export async function sendSupabasePasswordResetEmail(input: {
  email: string;
  redirectTo: string;
  sendEmail: (message: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }) => Promise<EmailDeliveryResult>;
}): Promise<EmailDeliveryResult> {
  const adminClient = createSupabaseAdminClient();
  if (!adminClient) {
    return requestSupabasePasswordResetEmail({
      email: input.email,
      redirectTo: input.redirectTo,
    });
  }

  const { data, error } = await adminClient.auth.admin.generateLink({
    type: "recovery",
    email: input.email,
    options: {
      redirectTo: input.redirectTo,
    },
  });

  if (error) {
    return {
      delivered: false,
      skipped: false,
      provider: "supabase-admin",
      reason: error.message || "Could not generate a password reset link.",
    };
  }

  const actionLink = typeof data?.properties?.action_link === "string"
    ? data.properties.action_link.trim()
    : "";
  if (!actionLink) {
    return {
      delivered: false,
      skipped: false,
      provider: "supabase-admin",
      reason: "Supabase did not return a password reset link.",
    };
  }

  return input.sendEmail({
    to: input.email,
    subject: "Reset your BTA password",
    text: [
      "We received a request to reset your BTA password.",
      `Use this secure link to choose a new password: ${actionLink}`,
      "",
      "If you were invited but never created your account, use the invite email instead.",
    ].join("\n"),
    html: [
      "<p>We received a request to reset your BTA password.</p>",
      `<p><a href="${actionLink}">Choose a new password</a></p>`,
      "<p>If you were invited but never created your account, use the invite email instead.</p>",
    ].join(""),
  });
}
