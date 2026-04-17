import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { apiBase, apiKeyHeader } from "../platform.js";

let cachedClient: SupabaseClient | null = null;

function getEnv(name: string): string {
  return (import.meta.env[name] ?? "").toString().trim();
}

export function createSupabaseClient(): SupabaseClient | null {
  if (cachedClient) {
    return cachedClient;
  }

  const supabaseUrl = getEnv("VITE_SUPABASE_URL") || getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabasePublishableKey =
    getEnv("VITE_SUPABASE_PUBLISHABLE_KEY")
    || getEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY")
    || getEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

  if (!supabaseUrl || !supabasePublishableKey) {
    console.warn("[bta] Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
    return null;
  }

  cachedClient = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return cachedClient;
}

export async function initSupabaseSessionRefresh(): Promise<void> {
  const client = createSupabaseClient();
  if (!client) {
    return;
  }

  await client.auth.getSession();
}

export async function getSupabaseAccessToken(): Promise<string | null> {
  const client = createSupabaseClient();
  if (!client) {
    return null;
  }

  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function getSupabaseSessionIdentity(): Promise<{
  token: string | null;
  email?: string;
  fullName?: string;
  userId?: string;
} | null> {
  const client = createSupabaseClient();
  if (!client) {
    return null;
  }

  const { data } = await client.auth.getSession();
  const session = data.session;
  const user = session?.user;
  if (!session || !user) {
    return null;
  }

  return {
    token: session.access_token,
    email: user.email ?? undefined,
    fullName: typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name
        : undefined,
    userId: user.id ?? undefined,
  };
}

export async function initializeSupabaseRecoverySessionFromUrl(): Promise<{
  token: string | null;
  email?: string;
  fullName?: string;
  userId?: string;
} | null> {
  const client = createSupabaseClient();
  if (!client || typeof window === "undefined") {
    return null;
  }

  const url = new URL(window.location.href);
  const type = (url.searchParams.get("type") ?? "").trim().toLowerCase();
  const tokenHash = (url.searchParams.get("token_hash") ?? "").trim();
  const code = (url.searchParams.get("code") ?? "").trim();
  let changedUrl = false;

  if (tokenHash && type === "recovery") {
    const { error } = await client.auth.verifyOtp({
      token_hash: tokenHash,
      type: "recovery",
    });
    if (error) {
      throw new Error(error.message || "Could not verify password reset link.");
    }
    url.searchParams.delete("token_hash");
    url.searchParams.delete("type");
    changedUrl = true;
  } else if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) {
      throw new Error(error.message || "Could not verify recovery session.");
    }
    url.searchParams.delete("code");
    changedUrl = true;
  }

  if (changedUrl) {
    const nextSearch = url.searchParams.toString();
    const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ""}${url.hash || ""}`;
    window.history.replaceState({}, "", nextUrl);
  }

  return getSupabaseSessionIdentity();
}

export async function signInWithSupabase(email: string, password: string): Promise<{
  token: string;
  email?: string;
  fullName?: string;
}> {
  const client = createSupabaseClient();
  if (!client) {
    throw new Error("Supabase auth is not configured.");
  }

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) {
    throw new Error(error?.message || "Could not sign in.");
  }

  return {
    token: data.session.access_token,
    email: data.user.email ?? undefined,
    fullName: typeof data.user.user_metadata?.full_name === "string"
      ? data.user.user_metadata.full_name
      : typeof data.user.user_metadata?.name === "string"
        ? data.user.user_metadata.name
        : undefined,
  };
}

export async function signUpWithSupabase(email: string, password: string, metadata?: Record<string, unknown>): Promise<{
  token: string | null;
  email?: string;
  fullName?: string;
  userId?: string;
}> {
  const client = createSupabaseClient();
  if (!client) {
    throw new Error("Supabase auth is not configured.");
  }

  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: metadata,
    },
  });
  if (error) {
    throw new Error(error.message || "Could not create account.");
  }

  return {
    token: data.session?.access_token ?? null,
    email: data.user?.email ?? undefined,
    fullName: typeof data.user?.user_metadata?.full_name === "string"
      ? data.user.user_metadata.full_name
      : typeof data.user?.user_metadata?.name === "string"
        ? data.user.user_metadata.name
        : undefined,
    userId: data.user?.id ?? undefined,
  };
}

export async function signOutSupabase(): Promise<void> {
  const client = createSupabaseClient();
  if (!client) {
    return;
  }

  await client.auth.signOut();
}

export async function requestSupabasePasswordReset(email: string, redirectTo: string): Promise<void> {
  const response = await fetch(`${apiBase}/api/auth/password-reset/email`, {
    method: "POST",
    headers: apiKeyHeader(true),
    body: JSON.stringify({
      email,
      redirectTo,
    }),
  });

  const payload = await response.json().catch(() => ({})) as {
    error?: string;
    emailDelivery?: { reason?: string };
  };
  if (!response.ok) {
    throw new Error(
      payload.error
      || payload.emailDelivery?.reason
      || "Could not send password reset email.",
    );
  }
}

export async function updateSupabasePassword(password: string): Promise<void> {
  const client = createSupabaseClient();
  if (!client) {
    throw new Error("Supabase auth is not configured.");
  }

  const { error } = await client.auth.updateUser({ password });
  if (error) {
    throw new Error(error.message || "Could not update password.");
  }
}
