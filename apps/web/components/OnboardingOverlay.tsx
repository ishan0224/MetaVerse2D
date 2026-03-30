'use client';

import {
  normalizeEmail,
  USERNAME_MAX_LENGTH,
  validateEmailAddress,
  validateUsername,
} from '@metaverse2d/shared';
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import {
  AVATAR_IDS,
  AVATAR_WALK_FRAMES,
  type AvatarId,
  CHARACTER_SPRITE_FRAME_HEIGHT,
  CHARACTER_SPRITE_FRAME_WIDTH,
  CHARACTER_SPRITE_SHEET_PATH,
  normalizeAvatarId,
} from '@/game/config/characterSpriteConfig';
import {
  getAuthAccessToken,
  getAuthSessionState,
  initializeAuthSession,
  signInWithEmailPassword,
  signOutFromAuth,
  signUpWithEmailPassword,
  subscribeToAuthSession,
} from '@/network/auth/authSession';
import { checkEmailAvailability } from '@/network/auth/emailAvailabilityClient';
import { upsertUserProfile } from '@/network/auth/userProfileClient';

export type OnboardingStep = 'name' | 'avatar' | 'world' | 'roomConfirm';

export interface OnboardingDraft {
  name: string;
  avatarId: AvatarId;
  worldId: string;
  roomId: string;
}

type OnboardingOverlayProps = {
  initialDraft: OnboardingDraft;
  onComplete: (result: OnboardingDraft) => void;
  onVisualStateChange?: (state: { step: OnboardingStep; worldId: string }) => void;
};

type SpriteSheetMetrics = {
  width: number;
  columns: number;
};

type WorldOption = {
  id: string;
  title: string;
  subtitle: string;
  previewImage: string;
};

type AuthMode = 'LOGIN' | 'SIGN_UP';

const ROOM_PATTERN = /^[A-Za-z0-9_-]+$/;
const STRIP_EXIT_DURATION_MS = 220;
const AVATAR_PREVIEW_SCALE = 7;
const AVATAR_ANIMATION_MS = 110;
const EMAIL_DEBOUNCE_MS = 400;

type AvailabilityState = 'idle' | 'checking' | 'available' | 'taken' | 'error';

const WORLD_OPTIONS: readonly WorldOption[] = [
  {
    id: '1',
    title: 'World 1',
    subtitle: 'Starter District',
    previewImage: '/world-previews/world1-selection.png',
  },
] as const;

let spriteSheetMetricsPromise: Promise<SpriteSheetMetrics> | null = null;

export function OnboardingOverlay({
  initialDraft,
  onComplete,
  onVisualStateChange,
}: OnboardingOverlayProps) {
  const [step, setStep] = useState<OnboardingStep>('name');
  const [nameValue, setNameValue] = useState(initialDraft.name);
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
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [avatarId, setAvatarId] = useState<AvatarId>(normalizeAvatarId(initialDraft.avatarId));
  const [worldId, setWorldId] = useState<string>(resolveWorldId(initialDraft.worldId));
  const [roomId, setRoomId] = useState(initialDraft.roomId);
  const [nameError, setNameError] = useState<string | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [isClosingRoomStrip, setIsClosingRoomStrip] = useState(false);
  const authSession = useSyncExternalStore(
    subscribeToAuthSession,
    getAuthSessionState,
    getAuthSessionState,
  );

  const roomInputRef = useRef<HTMLInputElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const emailCacheRef = useRef<Map<string, boolean>>(new Map());
  const emailRequestIdRef = useRef(0);
  const emailDebounceTimerRef = useRef<number | null>(null);
  const emailAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void initializeAuthSession().catch((error) => {
      console.error('failed to initialize onboarding auth session', error);
    });
  }, []);

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
    setNameValue(initialDraft.name);
    setAvatarId(normalizeAvatarId(initialDraft.avatarId));
    setWorldId(resolveWorldId(initialDraft.worldId));
    setRoomId(initialDraft.roomId);
  }, [initialDraft.avatarId, initialDraft.name, initialDraft.roomId, initialDraft.worldId]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
      if (emailDebounceTimerRef.current) {
        window.clearTimeout(emailDebounceTimerRef.current);
      }
      emailAbortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (step === 'roomConfirm' && roomInputRef.current) {
      roomInputRef.current.focus();
    }
  }, [step]);

  useEffect(() => {
    onVisualStateChange?.({ step, worldId });
  }, [onVisualStateChange, step, worldId]);

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
  const canConfirmRoom = isRoomPotentiallyValid(roomId);
  const hasSavedSession = Boolean(authSession.accessToken && authSession.user?.email);

  const currentStepNumber = step === 'name' ? 1 : step === 'avatar' ? 2 : step === 'world' ? 3 : 4;

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

  const handleBack = () => {
    if (isClosingRoomStrip) {
      return;
    }

    if (step === 'avatar') {
      setStep('name');
      return;
    }
    if (step === 'world') {
      setStep('avatar');
      return;
    }
    if (step === 'roomConfirm') {
      setStep('world');
    }
  };

  const handleRootKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') {
      return;
    }
    if (step === 'name') {
      return;
    }
    event.preventDefault();
    handleBack();
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

      const authResult = hasMatchingSession
        ? { ok: true, user: authSession.user ?? null }
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

      setNameValue(resolvedName);
      setStep('avatar');
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
    setNameValue(resolvedName);
    setStep('avatar');
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

  const handleAuthModeChange = (nextMode: AuthMode) => {
    setAuthMode(nextMode);
    setAuthError(null);
    setNameError(null);
    setEmailAvailabilityState('idle');
    setEmailAvailabilityMessage(null);
    clearPendingEmailCheck();
  };

  const proceedFromAvatar = () => {
    setStep('world');
  };

  const proceedFromWorld = () => {
    if (!worldId) {
      return;
    }
    setStep('roomConfirm');
  };

  const confirmRoomSelection = () => {
    if (isClosingRoomStrip) {
      return;
    }

    const validation = validateRoomId(roomId);
    if (!validation.ok) {
      setRoomError(validation.message);
      return;
    }

    const finalResult: OnboardingDraft = {
      name: nameValue.trim() || deriveDisplayNameFromEmail(emailValue || authSession.user?.email || ''),
      avatarId,
      worldId: resolveWorldId(worldId),
      roomId: validation.value,
    };

    setRoomError(null);
    setRoomId(validation.value);
    setIsClosingRoomStrip(true);
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    closeTimerRef.current = window.setTimeout(() => {
      onComplete(finalResult);
    }, STRIP_EXIT_DURATION_MS);
  };

  const handleRoomNo = () => {
    if (isClosingRoomStrip) {
      return;
    }
    setRoomError(null);
    roomInputRef.current?.focus();
  };

  return (
    <div
      className="onboarding-shell onboarding-readable-text absolute inset-0 z-40 flex items-start justify-center overflow-y-auto bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.2),transparent_44%),radial-gradient(circle_at_80%_80%,rgba(251,146,60,0.2),transparent_42%),rgba(3,7,18,0.72)] px-3 sm:px-6"
      onKeyDown={handleRootKeyDown}
      style={{ fontFamily: '"Small Pixel-7", "Neon Pixel-7", "Pixelify Sans", "Space Grotesk", "Avenir Next", "Segoe UI", sans-serif' }}
    >
      {step !== 'roomConfirm' ? (
        <div className="w-full max-w-5xl">
          <div className="mb-3 text-center sm:mb-4">
            <span className="inline-flex rounded-full bg-black/30 px-4 py-1.5">
              <h1 className="onboarding-readable-text-strong text-4xl font-extrabold uppercase tracking-[0.12em] text-orange-100 sm:text-5xl sm:tracking-[0.18em] lg:text-6xl">
                Meta Verse 2D
              </h1>
            </span>
          </div>

          <div className="ui-flow-box onboarding-panel-in [contain:layout_paint] overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/15 px-5 py-3 sm:px-7">
              <span className="text-sm uppercase tracking-[0.18em] text-sky-100/90 sm:text-base">Onboarding</span>
              <span className="text-sm font-semibold text-sky-50/90 sm:text-base">Step {currentStepNumber} / 4</span>
            </div>

            {step === 'name' ? (
              <div className="grid grid-cols-1 md:grid-cols-2">
                <section className="border-b border-white/15 p-5 md:border-b-0 md:border-r md:border-white/15 md:p-8">
                  <h2 className="text-4xl font-bold text-white sm:text-5xl">Account Access</h2>
                  <p className="mt-2 text-lg text-zinc-200 sm:text-xl">Sign in or create an account to continue.</p>

                  <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-black/42 p-1">
                    <button
                      type="button"
                      onClick={() => handleAuthModeChange('LOGIN')}
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold uppercase tracking-wider transition-colors duration-75 ease-out sm:text-base ${authMode === 'LOGIN'
                        ? 'border-cyan-100/85 bg-cyan-300 text-slate-950'
                        : 'border-white/40 text-zinc-100 hover:border-white/65 hover:bg-white/20'
                        }`}
                    >
                      Login
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAuthModeChange('SIGN_UP')}
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold uppercase tracking-wider transition-colors duration-75 ease-out sm:text-base ${authMode === 'SIGN_UP'
                        ? 'border-cyan-100/85 bg-cyan-300 text-slate-950'
                        : 'border-white/40 text-zinc-100 hover:border-white/65 hover:bg-white/20'
                        }`}
                    >
                      Sign Up
                    </button>
                  </div>

                  <label htmlFor="onboarding-email" className="mt-4 block text-base uppercase tracking-widest text-zinc-200 sm:text-lg">
                    Email
                  </label>
                  <input
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
                    className="mt-2 w-full rounded-xl border border-sky-100/45 bg-black/52 px-4 py-3 text-xl text-zinc-50 outline-none transition-colors duration-75 ease-out focus:border-sky-300/85 focus:ring-2 focus:ring-sky-300/50 sm:text-2xl"
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                  <div className="min-h-6 pt-1 text-sm sm:text-base">
                    {emailInlineError ? (
                      <span className="text-rose-300">{emailInlineError}</span>
                    ) : shouldShowEmailAvailability ? (
                      <span className={resolveAvailabilityMessageClass(emailAvailabilityState)}>
                        {emailAvailabilityMessage ?? ''}
                      </span>
                    ) : null}
                  </div>

                  <label htmlFor="onboarding-password" className="mt-4 block text-base uppercase tracking-widest text-zinc-200 sm:text-lg">
                    Password
                  </label>
                  <input
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
                    className="mt-2 w-full rounded-xl border border-sky-100/45 bg-black/52 px-4 py-3 text-xl text-zinc-50 outline-none transition-colors duration-75 ease-out focus:border-sky-300/85 focus:ring-2 focus:ring-sky-300/50 sm:text-2xl"
                    placeholder={authMode === 'SIGN_UP' ? 'Create password (8+ chars)' : 'Enter password'}
                    autoComplete={authMode === 'SIGN_UP' ? 'new-password' : 'current-password'}
                  />
                  <div className="min-h-6 pt-1 text-sm text-rose-300 sm:text-base">
                    {passwordInlineError ?? ''}
                  </div>

                  <label htmlFor="onboarding-name" className="mt-4 block text-base uppercase tracking-widest text-zinc-200 sm:text-lg">
                    {authMode === 'SIGN_UP' ? 'Display Name' : 'Display Name (Optional)'}
                  </label>
                  <input
                    id="onboarding-name"
                    value={nameValue}
                    onChange={(event) => {
                      setNameValue(event.target.value);
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
                    className="mt-2 w-full rounded-xl border border-sky-100/45 bg-black/52 px-4 py-3 text-xl text-zinc-50 outline-none transition-colors duration-75 ease-out focus:border-sky-300/85 focus:ring-2 focus:ring-sky-300/50 sm:text-2xl"
                    placeholder={authMode === 'SIGN_UP' ? 'Choose display name' : 'Defaults to email prefix'}
                    autoComplete="nickname"
                  />
                  <div className="min-h-6 pt-1 text-sm sm:text-base">
                    {authMode === 'SIGN_UP' ? (
                      <span className={usernameInlineError ? 'text-rose-300' : 'text-zinc-300/85'}>
                        {usernameInlineError ?? ''}
                      </span>
                    ) : (
                      <span className="text-zinc-300/85">Optional.</span>
                    )}
                  </div>

                  <div className="min-h-6 pt-2 text-base text-rose-300 sm:text-lg">{nameError ?? authError ?? ''}</div>

                  {hasSavedSession ? (
                    <div className="mb-3 rounded-xl border border-emerald-200/75 bg-emerald-400/18 px-3 py-2 text-sm text-emerald-50 sm:text-base">
                      <span>Signed in as </span>
                      <span className="font-semibold">{authSession.user?.email}</span>
                    </div>
                  ) : null}

                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                    {hasSavedSession ? (
                      <button
                        type="button"
                        onClick={() => {
                          void continueWithSavedSession();
                        }}
                        disabled={isAuthSubmitting}
                        className="w-full rounded-lg border border-cyan-100/85 bg-cyan-300 px-3 py-2 text-sm font-semibold uppercase tracking-wider text-slate-950 transition-colors duration-75 ease-out hover:bg-cyan-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-100 sm:w-auto sm:text-base"
                      >
                        Continue Saved Session
                      </button>
                    ) : null}
                    {hasSavedSession ? (
                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="w-full rounded-xl border border-white/45 bg-white/12 px-4 py-2 text-base font-semibold text-zinc-50 transition duration-75 ease-out hover:bg-white/24 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80 sm:w-auto sm:text-lg"
                      >
                        Sign Out
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        void proceedFromName();
                      }}
                      disabled={!canProceedFromName}
                      className="w-full rounded-xl border border-cyan-100/85 bg-cyan-300 px-4 py-2 text-base font-semibold uppercase tracking-wider text-slate-950 transition duration-75 ease-out hover:bg-cyan-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-100 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-cyan-300 sm:w-auto sm:text-lg"
                    >
                      {isAuthSubmitting ? 'Please wait...' : authMode === 'LOGIN' ? 'Login' : 'Sign Up'}
                    </button>
                  </div>
                </section>

                <section className="flex items-center justify-center p-6 md:p-8">
                  <div className="max-w-sm text-center">
                    <p className="text-4xl font-semibold leading-tight text-sky-100 sm:text-5xl lg:text-6xl">Welcome to your 2D world</p>
                    <p className="mt-3 text-2xl text-zinc-200 sm:text-3xl">
                      Build your identity, choose an avatar, and jump into your room.
                    </p>
                  </div>
                </section>
              </div>
            ) : null}

            {step === 'avatar' ? (
              <div className="grid grid-cols-1 md:grid-cols-2">
                <section className="border-b border-white/15 p-5 md:border-b-0 md:border-r md:border-white/15 md:p-8">
                  <h2 className="text-4xl font-bold text-white sm:text-5xl">Please select your avatar</h2>
                  <div className="mt-5 grid gap-2">
                    {AVATAR_IDS.map((candidate) => {
                      const selected = candidate === avatarId;
                      return (
                        <button
                          key={candidate}
                          type="button"
                          onClick={() => setAvatarId(candidate)}
                          className={`rounded-xl border px-4 py-3 text-left text-lg font-semibold transition-colors duration-75 ease-out sm:text-xl ${selected
                            ? 'border-cyan-200/80 bg-cyan-400/20 text-cyan-50 shadow-[0_0_0_1px_rgba(125,211,252,0.4)]'
                            : 'border-white/30 bg-black/42 text-zinc-100 hover:border-cyan-200/60 hover:bg-cyan-500/20'
                            }`}
                        >
                          Avatar {candidate}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-6 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={handleBack}
                      className="rounded-xl border border-white/45 bg-white/12 px-4 py-2 text-base font-semibold text-zinc-50 transition-colors duration-75 ease-out hover:bg-white/24 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/75 sm:text-lg"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={proceedFromAvatar}
                      className="rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 px-4 py-2 text-base font-semibold text-slate-950 transition duration-75 ease-out hover:from-sky-400 hover:to-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-200 sm:text-lg"
                    >
                      Continue
                    </button>
                  </div>
                </section>

                <section className="flex items-center justify-center p-6 md:p-8">
                  <div className="w-full max-w-xs rounded-2xl border border-cyan-200/40 bg-slate-950/22 p-5 shadow-[0_12px_30px_rgba(14,116,144,0.26)]">
                    <p className="text-center text-sm uppercase tracking-[0.2em] text-cyan-100/95 sm:text-base">Animated Preview</p>
                    <div className="mt-4 flex items-center justify-center rounded-xl border border-white/30 bg-black/28 py-8">
                      <AvatarSpritePreview avatarId={avatarId} />
                    </div>
                  </div>
                </section>
              </div>
            ) : null}

            {step === 'world' ? (
              <section className="p-5 md:p-8">
                <h2 className="text-center text-4xl font-bold text-white sm:text-5xl">Select your desired world</h2>
                <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {WORLD_OPTIONS.map((world) => {
                    const selected = world.id === worldId;
                    return (
                      <button
                        key={world.id}
                        type="button"
                        onClick={() => setWorldId(world.id)}
                        className={`group relative min-h-[220px] overflow-hidden rounded-2xl border bg-cover bg-center text-left transition-[transform,border-color] duration-90 ease-out will-change-transform hover:-translate-y-1 hover:scale-[1.008] ${selected
                          ? 'border-cyan-200/80'
                          : 'border-white/40 hover:border-cyan-200/80'
                          }`}
                        style={{ backgroundImage: `url(${world.previewImage})` }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-slate-900/28 to-slate-900/10" />
                        <div className="relative flex h-full items-end p-2">
                          <div className="w-full rounded-xl border border-cyan-100/70 bg-black/38 p-4 shadow-[0_4px_14px_rgba(0,0,0,0.3)]">
                            <p className="text-xl font-semibold text-zinc-50 sm:text-2xl">{world.title}</p>
                            <p className="mt-1 text-lg text-zinc-200 sm:text-xl">{world.subtitle}</p>
                          </div>
                        </div>
                        {selected ? (
                          <span className="absolute right-3 top-3 z-10 rounded-md bg-cyan-300/90 px-2 py-1 text-xs font-bold uppercase tracking-wider text-slate-950">
                            Selected
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-5 text-right text-sm uppercase tracking-widest text-zinc-400 sm:text-base">
                  More worlds to be added soon
                </div>
                <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={handleBack}
                    className="w-full rounded-xl border border-white/45 bg-white/12 px-4 py-2 text-base font-semibold text-zinc-50 transition-colors duration-75 ease-out hover:bg-white/24 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/75 sm:w-auto sm:text-lg"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={proceedFromWorld}
                    className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 px-4 py-2 text-base font-semibold text-slate-950 transition duration-75 ease-out hover:from-sky-400 hover:to-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-200 sm:w-auto sm:text-lg"
                  >
                    Continue
                  </button>
                </div>
              </section>
            ) : null}
          </div>
        </div>
      ) : null}

      {step === 'roomConfirm' ? (
        <div className="w-full max-w-5xl sm:flex sm:min-h-full sm:items-center">
          <div
            className={`ui-flow-box [contain:layout_paint] w-full px-5 py-6 sm:px-7 ${
              isClosingRoomStrip ? 'onboarding-room-strip-out' : 'onboarding-room-strip-in'
            }`}
          >
            <div className="grid gap-5 sm:grid-cols-[2fr_1fr] sm:items-end">
              <div>
                <h2 className="text-4xl font-bold text-zinc-100 sm:text-5xl">Enter room ID</h2>
                <p className="mt-1 text-lg text-zinc-200 sm:text-xl">Use the same room ID to join friends in the same world.</p>
                <label htmlFor="onboarding-room-id" className="mt-4 block text-base uppercase tracking-widest text-zinc-200 sm:text-lg">
                  Room ID
                </label>
                <input
                  ref={roomInputRef}
                  id="onboarding-room-id"
                  value={roomId}
                  onChange={(event) => {
                    setRoomId(event.target.value);
                    if (roomError) {
                      setRoomError(null);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      confirmRoomSelection();
                    }
                  }}
                  disabled={isClosingRoomStrip}
                  maxLength={24}
                  className="mt-2 w-full rounded-xl border border-sky-100/45 bg-black/52 px-4 py-3 text-xl text-zinc-50 outline-none transition-colors duration-75 ease-out focus:border-sky-300/85 focus:ring-2 focus:ring-sky-300/50 disabled:cursor-not-allowed disabled:opacity-70 sm:text-2xl"
                  placeholder="example-room-01"
                />
                <div className="min-h-6 pt-2 text-base text-rose-300 sm:text-lg">{roomError ?? ''}</div>
              </div>

              <div className="sm:pb-1">
                <p className="text-lg font-semibold uppercase tracking-[0.18em] text-cyan-50 sm:text-xl">Are you sure?</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleRoomNo}
                    disabled={isClosingRoomStrip}
                    className="rounded-xl border-2 border-zinc-50/95 bg-zinc-100/55 px-4 py-2 text-base font-semibold text-slate-900 shadow-[0_2px_10px_rgba(0,0,0,0.34)] transition-colors duration-75 ease-out hover:bg-zinc-100/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-70 sm:text-lg"
                  >
                    No
                  </button>
                  <button
                    type="button"
                    onClick={confirmRoomSelection}
                    disabled={isClosingRoomStrip || !canConfirmRoom}
                    className="rounded-xl bg-gradient-to-r from-orange-400 to-amber-300 px-4 py-2 text-base font-bold text-slate-950 transition duration-75 ease-out hover:from-orange-300 hover:to-amber-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-100 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:from-orange-400 disabled:hover:to-amber-300 sm:text-lg"
                  >
                    Yes
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={isClosingRoomStrip}
                  className="mt-3 w-full rounded-xl border-2 border-cyan-100 bg-cyan-300/45 px-4 py-2 text-base font-semibold uppercase tracking-wider text-cyan-50 shadow-[0_2px_10px_rgba(0,0,0,0.34)] transition-colors duration-75 ease-out hover:bg-cyan-300/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-100 disabled:cursor-not-allowed disabled:opacity-70 sm:text-lg"
                >
                  Back
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AvatarSpritePreview({ avatarId }: { avatarId: AvatarId }) {
  const [spriteSheetMetrics, setSpriteSheetMetrics] = useState<SpriteSheetMetrics | null>(null);
  const [frameOffset, setFrameOffset] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void getSpriteSheetMetrics()
      .then((metrics) => {
        if (cancelled) {
          return;
        }
        setSpriteSheetMetrics(metrics);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        console.error('onboarding avatar preview unavailable', error);
        setSpriteSheetMetrics(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!spriteSheetMetrics) {
      return;
    }

    const frameRange = AVATAR_WALK_FRAMES[avatarId].down;
    const frameCount = frameRange.end - frameRange.start + 1;
    setFrameOffset(0);
    const intervalId = window.setInterval(() => {
      setFrameOffset((previous) => (previous + 1) % frameCount);
    }, AVATAR_ANIMATION_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [avatarId, spriteSheetMetrics]);

  const frameRange = AVATAR_WALK_FRAMES[avatarId].down;
  const activeFrame = frameRange.start + frameOffset;
  const previewStyle = spriteSheetMetrics
    ? buildSpriteFrameStyle(activeFrame, spriteSheetMetrics)
    : null;

  if (!previewStyle) {
    return <div className="h-14 w-14 animate-pulse rounded-lg bg-cyan-400/40" />;
  }

  return <div className="rounded-sm" style={previewStyle} aria-label={`Avatar ${avatarId} preview`} />;
}

function resolveWorldId(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return WORLD_OPTIONS[0].id;
  }

  const match = WORLD_OPTIONS.find((world) => world.id === trimmed);
  return match?.id ?? WORLD_OPTIONS[0].id;
}

function validateName(value: string): { ok: true; value: string } | { ok: false; message: string } {
  return validateUsername(value);
}

function validateEmail(value: string): { ok: true; value: string } | { ok: false; message: string } {
  return validateEmailAddress(value);
}

function validatePassword(value: string): { ok: true; value: string } | { ok: false; message: string } {
  const trimmed = value.trim();
  if (trimmed.length < 8) {
    return { ok: false, message: 'Password must be at least 8 characters.' };
  }
  return { ok: true, value: trimmed };
}

function getInlineEmailError(value: string): string | null {
  const validation = validateEmailAddress(value);
  return validation.ok ? null : validation.message;
}

function getInlinePasswordError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'Password is required.';
  }

  if (trimmed.length < 8) {
    return 'Password must be at least 8 characters.';
  }

  return null;
}

function getInlineUsernameError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'Display name is required.';
  }

  const validation = validateUsername(value);
  if (!validation.ok) {
    return formatDisplayNameValidationMessage(validation.message);
  }

  return null;
}

function formatDisplayNameValidationMessage(message: string): string {
  return message.replace(/^Username\b/, 'Display name');
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

function validateRoomId(value: string): { ok: true; value: string } | { ok: false; message: string } {
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > 24) {
    return { ok: false, message: 'Room ID must be between 1 and 24 characters.' };
  }
  if (!ROOM_PATTERN.test(trimmed)) {
    return { ok: false, message: 'Use letters, numbers, dash, and underscore only.' };
  }
  return { ok: true, value: trimmed };
}

function isAuthPotentiallyValid(email: string, password: string): boolean {
  const normalizedPassword = password.trim();
  return validateEmailAddress(email).ok && normalizedPassword.length >= 8;
}

function isRoomPotentiallyValid(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= 24 && ROOM_PATTERN.test(trimmed);
}

function deriveDisplayNameFromEmail(email: string): string {
  const emailPrefix = email.trim().split('@')[0]?.trim();
  if (!emailPrefix) {
    return 'player';
  }

  const sanitized = emailPrefix.replace(/[^A-Za-z0-9_ ]+/g, ' ').trim();
  if (!sanitized) {
    return 'player';
  }

  return sanitized.slice(0, USERNAME_MAX_LENGTH);
}

function getSpriteSheetMetrics(): Promise<SpriteSheetMetrics> {
  if (!spriteSheetMetricsPromise) {
    spriteSheetMetricsPromise = new Promise<SpriteSheetMetrics>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const columns = Math.max(1, Math.floor(image.naturalWidth / CHARACTER_SPRITE_FRAME_WIDTH));
        resolve({
          width: image.naturalWidth,
          columns,
        });
      };
      image.onerror = () => {
        reject(new Error(`Failed to load character sprite sheet: ${CHARACTER_SPRITE_SHEET_PATH}`));
      };
      image.src = CHARACTER_SPRITE_SHEET_PATH;
    });
  }

  return spriteSheetMetricsPromise;
}

function buildSpriteFrameStyle(frameIndex: number, metrics: SpriteSheetMetrics): CSSProperties {
  const column = frameIndex % metrics.columns;
  const row = Math.floor(frameIndex / metrics.columns);
  const previewWidth = CHARACTER_SPRITE_FRAME_WIDTH * AVATAR_PREVIEW_SCALE;
  const previewHeight = CHARACTER_SPRITE_FRAME_HEIGHT * AVATAR_PREVIEW_SCALE;
  const scaledSheetWidth = metrics.width * AVATAR_PREVIEW_SCALE;
  const offsetX = column * CHARACTER_SPRITE_FRAME_WIDTH * AVATAR_PREVIEW_SCALE;
  const offsetY = row * CHARACTER_SPRITE_FRAME_HEIGHT * AVATAR_PREVIEW_SCALE;

  return {
    width: `${previewWidth}px`,
    height: `${previewHeight}px`,
    backgroundImage: `url(${CHARACTER_SPRITE_SHEET_PATH})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${scaledSheetWidth}px auto`,
    backgroundPosition: `-${offsetX}px -${offsetY}px`,
    imageRendering: 'pixelated',
  };
}
