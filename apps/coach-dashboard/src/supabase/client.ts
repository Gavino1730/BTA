import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
