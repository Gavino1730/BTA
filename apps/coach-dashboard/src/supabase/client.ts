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
