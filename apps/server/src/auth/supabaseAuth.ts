import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type AuthenticatedSupabaseUser = {
  authUserId: string;
  email: string | null;
};

let supabaseClient: SupabaseClient | null = null;
let loggedMissingConfiguration = false;

export function isSupabaseAuthConfigured(): boolean {
  const supabaseUrl = process.env.SERVER_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.SERVER_SUPABASE_ANON_KEY?.trim();
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export async function verifySupabaseAccessToken(
  accessToken: string,
): Promise<AuthenticatedSupabaseUser | null> {
  const client = getSupabaseServerClient();
  if (!client) {
    return null;
  }

  const normalizedToken = accessToken.trim();
  if (!normalizedToken) {
    return null;
  }

  const { data, error } = await client.auth.getUser(normalizedToken);
  if (error || !data.user) {
    return null;
  }

  return {
    authUserId: data.user.id,
    email: data.user.email ?? null,
  };
}

function getSupabaseServerClient(): SupabaseClient | null {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.SERVER_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.SERVER_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !supabaseAnonKey) {
    if (!loggedMissingConfiguration) {
      loggedMissingConfiguration = true;
      console.warn(
        '[auth] SERVER_SUPABASE_URL or SERVER_SUPABASE_ANON_KEY is missing; auth is disabled.',
      );
    }
    return null;
  }

  supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  return supabaseClient;
}
