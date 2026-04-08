'use client';

import { normalizeEmail, USERNAME_MAX_LENGTH } from '@metaverse2d/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  Button,
  FormLabel,
  InlineMessage,
  PanelSection,
  TextInput,
} from '@/components/ui';
import {
  deriveDisplayNameFromEmail,
  formatDisplayNameValidationMessage,
  getInlineEmailError,
  getInlinePasswordError,
  getInlineUsernameError,
  isAuthPotentiallyValid,
  validateEmail,
  validateName,
  validatePassword,
} from '@/lib/onboardingValidation';
import {
  getAuthAccessToken,
  signInWithEmailPassword,
  signOutFromAuth,
  signUpWithEmailPassword,
} from '@/network/auth/authSession';
import { checkEmailAvailability } from '@/network/auth/emailAvailabilityClient';
import { upsertUserProfile } from '@/network/auth/userProfileClient';

import type { AuthMode, AvailabilityState } from '../onboardingTypes';

const EMAIL_DEBOUNCE_MS = 400;

type AuthSessionSnapshot = {
  accessToken: string | null;
  user: {
    email?: string | null;
  } | null;
};

type NameAuthStepProps = {
  visible: boolean;
  nameValue: string;
  onNameValueChange: (value: string) => void;
  authSession: AuthSessionSnapshot;
  onContinue: (result: { resolvedName: string; resolvedEmail: string }) => void;
};

export function NameAuthStep({
  visible,
  nameValue,
  onNameValueChange,
  authSession,
  onContinue,
}: NameAuthStepProps) {
  const [authMode, setAuthMode] = useState<AuthMode>('LOGIN');
  const [emailValue, setEmailValue] = useState('');
  const [passwordValue, setPasswordValue] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [emailAvailabilityState, setEmailAvailabilityState] =
    useState<AvailabilityState>('idle');
  const [emailAvailabilityMessage, setEmailAvailabilityMessage] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);

  const emailCacheRef = useRef<Map<string, boolean>>(new Map());
  const emailRequestIdRef = useRef(0);
  const emailDebounceTimerRef = useRef<number | null>(null);
  const emailAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const sessionEmail = authSession.user?.email?.trim().toLowerCase();
    if (!sessionEmail) {
      return;
    }

    if (!emailValue.trim()) {
      setEmailValue(sessionEmail);
    }
  }, [authSession.user?.email, emailValue]);

  useEffect(() => {
    return () => {
      if (emailDebounceTimerRef.current) {
        window.clearTimeout(emailDebounceTimerRef.current);
      }
      emailAbortControllerRef.current?.abort();
    };
  }, []);

  const usernameValidation = validateName(nameValue);
  const emailInlineError = emailTouched ? getInlineEmailError(emailValue) : null;
  const passwordInlineError = passwordTouched ? getInlinePasswordError(passwordValue) : null;
  const usernameInlineError =
    authMode === 'SIGN_UP' && usernameTouched
      ? getInlineUsernameError(nameValue)
      : null;
  const shouldShowEmailAvailability =
    authMode === 'SIGN_UP' && emailTouched && !emailInlineError;
  const canProceedFromName =
    isAuthPotentiallyValid(emailValue, passwordValue) &&
    (authMode !== 'SIGN_UP' || usernameValidation.ok) &&
    (authMode !== 'SIGN_UP' ||
      (emailAvailabilityState !== 'checking' &&
        emailAvailabilityState !== 'taken')) &&
    !isAuthSubmitting;
  const hasSavedSession = Boolean(authSession.accessToken && authSession.user?.email);

  const clearPendingEmailCheck = useCallback(() => {
    if (emailDebounceTimerRef.current) {
      window.clearTimeout(emailDebounceTimerRef.current);
      emailDebounceTimerRef.current = null;
    }
    emailAbortControllerRef.current?.abort();
    emailAbortControllerRef.current = null;
  }, []);

  const runEmailAvailabilityCheck = useCallback(
    async (
      email: string,
      signal?: AbortSignal,
    ): Promise<{ ok: boolean; available: boolean; message?: string }> => {
      const normalizedEmail = normalizeEmail(email);
      const cachedAvailability = emailCacheRef.current.get(normalizedEmail);
      if (typeof cachedAvailability === 'boolean') {
        return { ok: true, available: cachedAvailability };
      }

      const result = await checkEmailAvailability(normalizedEmail, signal);
      if (!result.ok) {
        return { ok: false, available: false, message: result.message };
      }

      emailCacheRef.current.set(normalizedEmail, result.available);
      return { ok: true, available: result.available };
    },
    [],
  );

  useEffect(() => {
    if (authMode !== 'SIGN_UP') {
      clearPendingEmailCheck();
      setEmailAvailabilityState('idle');
      setEmailAvailabilityMessage(null);
      return;
    }

    const emailValidation = validateEmail(emailValue);
    if (!emailValidation.ok) {
      clearPendingEmailCheck();
      setEmailAvailabilityState('idle');
      setEmailAvailabilityMessage(null);
      return;
    }

    const normalizedEmail = emailValidation.value;
    const cachedAvailability = emailCacheRef.current.get(normalizedEmail);
    if (typeof cachedAvailability === 'boolean') {
      setEmailAvailabilityState(cachedAvailability ? 'available' : 'taken');
      setEmailAvailabilityMessage(cachedAvailability ? 'Email available.' : 'Email is already registered.');
      return;
    }

    const requestId = emailRequestIdRef.current + 1;
    emailRequestIdRef.current = requestId;
    clearPendingEmailCheck();
    setEmailAvailabilityState('checking');
    setEmailAvailabilityMessage('Checking email...');

    emailDebounceTimerRef.current = window.setTimeout(() => {
      const activeRequestId = requestId;
      const abortController = new AbortController();
      emailAbortControllerRef.current = abortController;

      void runEmailAvailabilityCheck(normalizedEmail, abortController.signal)
        .then((result) => {
          if (emailRequestIdRef.current !== activeRequestId) {
            return;
          }

          if (!result.ok) {
            setEmailAvailabilityState('error');
            setEmailAvailabilityMessage(result.message ?? 'Unable to verify email right now.');
            return;
          }

          if (result.available) {
            setEmailAvailabilityState('available');
            setEmailAvailabilityMessage('Email available.');
            return;
          }

          setEmailAvailabilityState('taken');
          setEmailAvailabilityMessage('Email is already registered.');
        })
        .catch(() => {
          if (emailRequestIdRef.current !== activeRequestId) {
            return;
          }
          setEmailAvailabilityState('error');
          setEmailAvailabilityMessage('Unable to verify email right now.');
        });
    }, EMAIL_DEBOUNCE_MS);

    return () => {
      clearPendingEmailCheck();
    };
  }, [authMode, clearPendingEmailCheck, emailValue, runEmailAvailabilityCheck]);

  const handleAuthModeChange = (nextMode: AuthMode) => {
    setAuthMode(nextMode);
    setAuthError(null);
    setNameError(null);
    setEmailAvailabilityState('idle');
    setEmailAvailabilityMessage(null);
    clearPendingEmailCheck();
  };

  const proceedFromName = async () => {
    if (isAuthSubmitting) {
      return;
    }

    setEmailTouched(true);
    setPasswordTouched(true);
    if (authMode === 'SIGN_UP') {
      setUsernameTouched(true);
    }

    const emailValidation = validateEmail(emailValue);
    if (!emailValidation.ok) {
      setAuthError(emailValidation.message);
      return;
    }

    const passwordValidation = validatePassword(passwordValue);
    if (!passwordValidation.ok) {
      setAuthError(passwordValidation.message);
      return;
    }

    let resolvedName = deriveDisplayNameFromEmail(emailValidation.value);
    if (authMode === 'SIGN_UP') {
      if (emailAvailabilityState === 'checking') {
        setAuthError('Checking email availability...');
        return;
      }

      if (emailAvailabilityState === 'taken') {
        setAuthError('Email is already registered.');
        return;
      }

      const emailAvailability = await runEmailAvailabilityCheck(emailValidation.value);
      if (!emailAvailability.ok) {
        const message = emailAvailability.message ?? 'Unable to verify email right now.';
        setAuthError(message);
        setEmailAvailabilityState('error');
        setEmailAvailabilityMessage(message);
        return;
      }

      if (!emailAvailability.available) {
        setAuthError('Email is already registered.');
        setEmailAvailabilityState('taken');
        setEmailAvailabilityMessage('Email is already registered.');
        emailCacheRef.current.set(emailValidation.value, false);
        return;
      }

      const signUpNameValidation = validateName(nameValue);
      if (!signUpNameValidation.ok) {
        setNameError(formatDisplayNameValidationMessage(signUpNameValidation.message));
        return;
      }
      resolvedName = signUpNameValidation.value;
    } else if (nameValue.trim()) {
      const loginNameValidation = validateName(nameValue);
      if (!loginNameValidation.ok) {
        setNameError(formatDisplayNameValidationMessage(loginNameValidation.message));
        return;
      }

      resolvedName = loginNameValidation.value;
    }

    setAuthError(null);
    setNameError(null);
    setIsAuthSubmitting(true);

    try {
      const hasMatchingSession =
        authMode === 'SIGN_UP' &&
        Boolean(authSession.accessToken) &&
        authSession.user?.email?.trim().toLowerCase() === emailValidation.value;

      const authResult: {
        ok: boolean;
        message?: string;
        user: {
          email?: string | null;
        } | null;
      } = hasMatchingSession
        ? { ok: true, message: undefined, user: authSession.user ?? null }
        : authMode === 'LOGIN'
          ? await signInWithEmailPassword(emailValidation.value, passwordValidation.value)
          : await signUpWithEmailPassword(emailValidation.value, passwordValidation.value);

      if (authResult.ok && authMode === 'SIGN_UP') {
        const accessToken = getAuthAccessToken();
        if (!accessToken) {
          setAuthError('Authentication succeeded, but no active session is available yet.');
          return;
        }

        const profileResult = await upsertUserProfile(accessToken, resolvedName);
        if (!profileResult.ok) {
          if (profileResult.code === 'EMAIL_TAKEN' || profileResult.status === 409) {
            setAuthError('Email is already registered.');
            setEmailAvailabilityState('taken');
            setEmailAvailabilityMessage('Email is already registered.');
            emailCacheRef.current.set(emailValidation.value, false);
            return;
          }

          setAuthError(profileResult.message);
          return;
        }
      }

      if (!authResult.ok) {
        setAuthError(authResult.message ?? 'Authentication failed. Please try again.');
        return;
      }

      onContinue({
        resolvedName,
        resolvedEmail: emailValidation.value,
      });
    } catch (error) {
      console.error('onboarding proceedFromName failed', error);
      setAuthError('Unable to complete authentication right now. Please retry.');
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const continueWithSavedSession = async () => {
    const sessionEmail = authSession.user?.email?.trim().toLowerCase();
    if (!authSession.accessToken || !sessionEmail) {
      return;
    }

    let resolvedName = deriveDisplayNameFromEmail(sessionEmail);
    if (authMode === 'SIGN_UP') {
      setUsernameTouched(true);
      const signUpNameValidation = validateName(nameValue);
      if (!signUpNameValidation.ok) {
        setNameError(formatDisplayNameValidationMessage(signUpNameValidation.message));
        return;
      }
      resolvedName = signUpNameValidation.value;

      setIsAuthSubmitting(true);
      try {
        const profileResult = await upsertUserProfile(authSession.accessToken, resolvedName);
        if (!profileResult.ok) {
          if (profileResult.code === 'EMAIL_TAKEN' || profileResult.status === 409) {
            setAuthError('Email is already registered.');
            setEmailAvailabilityState('taken');
            setEmailAvailabilityMessage('Email is already registered.');
            emailCacheRef.current.set(sessionEmail, false);
            return;
          }

          setAuthError(profileResult.message);
          return;
        }
      } catch (error) {
        console.error('onboarding continueWithSavedSession failed', error);
        setAuthError('Unable to save profile right now. Please retry.');
        return;
      } finally {
        setIsAuthSubmitting(false);
      }
    } else if (nameValue.trim()) {
      const loginNameValidation = validateName(nameValue);
      if (!loginNameValidation.ok) {
        setNameError(formatDisplayNameValidationMessage(loginNameValidation.message));
        return;
      }
      resolvedName = loginNameValidation.value;
    }

    setAuthError(null);
    setNameError(null);
    onContinue({
      resolvedName,
      resolvedEmail: sessionEmail,
    });
  };

  const handleSignOut = () => {
    void signOutFromAuth()
      .then(() => {
        setAuthError(null);
        setPasswordValue('');
      })
      .catch((error) => {
        console.error('failed to sign out', error);
        setAuthError('Unable to sign out right now. Please retry.');
      });
  };

  if (!visible) {
    return null;
  }

  return (
    <PanelSection
      left={
        <>
          <h2 className="text-4xl font-bold text-white sm:text-5xl">Account Access</h2>
          <p className="mt-2 text-lg text-zinc-200 sm:text-xl">Sign in or create an account to continue.</p>

          <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-black/42 p-1">
            <button
              type="button"
              onClick={() => handleAuthModeChange('LOGIN')}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold uppercase tracking-wider transition-colors duration-75 ease-out sm:text-base ${
                authMode === 'LOGIN'
                  ? 'border-cyan-100/85 bg-cyan-300 text-slate-950'
                  : 'border-white/40 text-zinc-100 hover:border-white/65 hover:bg-white/20'
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => handleAuthModeChange('SIGN_UP')}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold uppercase tracking-wider transition-colors duration-75 ease-out sm:text-base ${
                authMode === 'SIGN_UP'
                  ? 'border-cyan-100/85 bg-cyan-300 text-slate-950'
                  : 'border-white/40 text-zinc-100 hover:border-white/65 hover:bg-white/20'
              }`}
            >
              Sign Up
            </button>
          </div>

          <FormLabel htmlFor="onboarding-email">Email</FormLabel>
          <TextInput
            id="onboarding-email"
            value={emailValue}
            onChange={(event) => {
              setEmailValue(event.target.value);
              setEmailTouched(true);
              if (authError) {
                setAuthError(null);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void proceedFromName();
              }
            }}
            autoFocus
            maxLength={120}
            placeholder="you@example.com"
            autoComplete="email"
          />
          <InlineMessage type="hint">
            {emailInlineError ? (
              <span className="text-rose-300">{emailInlineError}</span>
            ) : shouldShowEmailAvailability ? (
              <span className={resolveAvailabilityMessageClass(emailAvailabilityState)}>
                {emailAvailabilityMessage ?? ''}
              </span>
            ) : null}
          </InlineMessage>

          <FormLabel htmlFor="onboarding-password">Password</FormLabel>
          <TextInput
            id="onboarding-password"
            type="password"
            value={passwordValue}
            onChange={(event) => {
              setPasswordValue(event.target.value);
              setPasswordTouched(true);
              if (authError) {
                setAuthError(null);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void proceedFromName();
              }
            }}
            maxLength={128}
            placeholder={authMode === 'SIGN_UP' ? 'Create password (8+ chars)' : 'Enter password'}
            autoComplete={authMode === 'SIGN_UP' ? 'new-password' : 'current-password'}
            error={passwordInlineError ?? ''}
          />

          <FormLabel htmlFor="onboarding-name">
            {authMode === 'SIGN_UP' ? 'Display Name' : 'Display Name (Optional)'}
          </FormLabel>
          <TextInput
            id="onboarding-name"
            value={nameValue}
            onChange={(event) => {
              onNameValueChange(event.target.value);
              if (authMode === 'SIGN_UP') {
                setUsernameTouched(true);
              }
              if (nameError) {
                setNameError(null);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void proceedFromName();
              }
            }}
            maxLength={USERNAME_MAX_LENGTH}
            placeholder={authMode === 'SIGN_UP' ? 'Choose display name' : 'Defaults to email prefix'}
            autoComplete="nickname"
          />
          <InlineMessage type={authMode === 'SIGN_UP' && usernameInlineError ? 'error' : 'hint'}>
            {authMode === 'SIGN_UP' ? usernameInlineError ?? '' : 'Optional.'}
          </InlineMessage>

          <InlineMessage type="error" className="pt-2 text-base sm:text-lg">
            {nameError ?? authError ?? ''}
          </InlineMessage>

          {hasSavedSession ? (
            <div className="mb-3 rounded-xl border border-emerald-200/75 bg-emerald-400/18 px-3 py-2 text-sm text-emerald-50 sm:text-base">
              <span>Signed in as </span>
              <span className="font-semibold">{authSession.user?.email}</span>
            </div>
          ) : null}

          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            {hasSavedSession ? (
              <Button
                onClick={() => {
                  void continueWithSavedSession();
                }}
                disabled={isAuthSubmitting}
                variant="primary"
                size="sm"
                fullWidthOnMobile
                className="rounded-lg uppercase tracking-wider"
              >
                Continue Saved Session
              </Button>
            ) : null}
            {hasSavedSession ? (
              <Button onClick={handleSignOut} variant="secondary" fullWidthOnMobile>
                Sign Out
              </Button>
            ) : null}
            <Button
              onClick={() => {
                void proceedFromName();
              }}
              disabled={!canProceedFromName}
              variant="primary"
              fullWidthOnMobile
              className="uppercase tracking-wider disabled:opacity-55"
            >
              {isAuthSubmitting ? 'Please wait...' : authMode === 'LOGIN' ? 'Login' : 'Sign Up'}
            </Button>
          </div>
        </>
      }
      right={
        <div className="max-w-sm text-center">
          <p className="text-4xl font-semibold leading-tight text-sky-100 sm:text-5xl lg:text-6xl">Welcome to your 2D world</p>
          <p className="mt-3 text-2xl text-zinc-200 sm:text-3xl">
            Build your identity, choose an avatar, and jump into your room.
          </p>
        </div>
      }
    />
  );
}

function resolveAvailabilityMessageClass(state: AvailabilityState): string {
  if (state === 'taken' || state === 'error') {
    return 'text-rose-300';
  }

  if (state === 'available') {
    return 'text-emerald-200';
  }

  if (state === 'checking') {
    return 'text-cyan-200';
  }

  return 'text-zinc-300/85';
}
