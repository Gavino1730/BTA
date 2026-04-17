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
  setTimeout(() => controller.abort(), timeoutMs).unref?.();
  return controller.signal;
}

export function readSupabaseEmailConfig(): {
  supabaseUrl: string;
  supabasePublishableKey: string;
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
  };
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
