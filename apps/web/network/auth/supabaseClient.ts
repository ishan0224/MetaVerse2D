/** @module apps/web/network/auth/supabaseClient.ts */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { webEnv } from '@/config/env';

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = webEnv.supabaseUrl.trim();
  const supabaseAnonKey = webEnv.supabaseAnonKey.trim();
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase auth is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }

  supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return supabaseClient;
}
