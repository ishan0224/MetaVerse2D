/** @module apps/web/network/auth/authSession.ts */

import type { Session, User } from '@supabase/supabase-js';

import { createObservableStore } from '@/lib/createObservableStore';
import { getSupabaseBrowserClient } from '@/network/auth/supabaseClient';

type AuthSessionState = {
  isInitialized: boolean;
  accessToken: string | null;
  user: User | null;
};

type AuthResult = {
  ok: boolean;
  message?: string;
  user: User | null;
};

const DEFAULT_STATE: AuthSessionState = {
  isInitialized: false,
  accessToken: null,
  user: null,
};

const store = createObservableStore(DEFAULT_STATE);
let hasAuthStateSubscription = false;

export async function initializeAuthSession(): Promise<void> {
  if (hasAuthStateSubscription) {
    return;
  }

  const client = getSupabaseBrowserClient();
  const { data, error } = await client.auth.getSession();
  if (error) {
    store.setState(() => ({
      isInitialized: true,
      accessToken: null,
      user: null,
    }));
  } else {
    applySession(data.session);
  }

  client.auth.onAuthStateChange((_event, session) => {
    applySession(session);
  });
  hasAuthStateSubscription = true;
}

export function subscribeToAuthSession(listener: () => void): () => void {
  return store.subscribe(listener);
}

export function getAuthSessionState(): AuthSessionState {
  return store.getState();
}

export function getAuthAccessToken(): string | null {
  return store.getState().accessToken;
}

export async function signUpWithEmailPassword(email: string, password: string): Promise<AuthResult> {
  const client = getSupabaseBrowserClient();
  const { data, error } = await client.auth.signUp({
    email,
    password,
  });
  if (error) {
    return { ok: false, message: error.message, user: null };
  }

  applySession(data.session);
  return {
    ok: true,
    user: data.user ?? data.session?.user ?? null,
  };
}

export async function signInWithEmailPassword(email: string, password: string): Promise<AuthResult> {
  const client = getSupabaseBrowserClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    return { ok: false, message: error.message, user: null };
  }

  applySession(data.session);
  return {
    ok: true,
    user: data.user ?? data.session?.user ?? null,
  };
}

export async function signOutFromAuth(): Promise<void> {
  const client = getSupabaseBrowserClient();
  await client.auth.signOut();
  applySession(null);
}

function applySession(session: Session | null): void {
  store.setState(() => ({
    isInitialized: true,
    accessToken: session?.access_token ?? null,
    user: session?.user ?? null,
  }));
}
