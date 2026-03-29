'use client';

import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
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
  getAuthSessionState,
  initializeAuthSession,
  signInWithEmailPassword,
  signOutFromAuth,
  signUpWithEmailPassword,
  subscribeToAuthSession,
} from '@/network/auth/authSession';

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

const NAME_PATTERN = /^[A-Za-z0-9_ ]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROOM_PATTERN = /^[A-Za-z0-9_-]+$/;
const STRIP_EXIT_DURATION_MS = 220;
const AVATAR_PREVIEW_SCALE = 7;
const AVATAR_ANIMATION_MS = 110;

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

  const canProceedFromName = isAuthPotentiallyValid(emailValue, passwordValue) && !isAuthSubmitting;
  const canConfirmRoom = isRoomPotentiallyValid(roomId);
  const hasSavedSession = Boolean(authSession.accessToken && authSession.user?.email);

  const currentStepNumber = step === 'name' ? 1 : step === 'avatar' ? 2 : step === 'world' ? 3 : 4;

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
    if (nameValue.trim()) {
      const nameValidation = validateName(nameValue);
      if (!nameValidation.ok) {
        setNameError(nameValidation.message);
        return;
      }

      resolvedName = nameValidation.value;
    }

    setAuthError(null);
    setNameError(null);
    setIsAuthSubmitting(true);

    const authResult =
      authMode === 'LOGIN'
        ? await signInWithEmailPassword(emailValidation.value, passwordValidation.value)
        : await signUpWithEmailPassword(emailValidation.value, passwordValidation.value);

    setIsAuthSubmitting(false);

    if (!authResult.ok) {
      setAuthError(authResult.message ?? 'Authentication failed. Please try again.');
      return;
    }

    setNameValue(resolvedName);
    setStep('avatar');
  };

  const continueWithSavedSession = () => {
    const sessionEmail = authSession.user?.email?.trim().toLowerCase();
    if (!authSession.accessToken || !sessionEmail) {
      return;
    }

    let resolvedName = deriveDisplayNameFromEmail(sessionEmail);
    if (nameValue.trim()) {
      const nameValidation = validateName(nameValue);
      if (!nameValidation.ok) {
        setNameError(nameValidation.message);
        return;
      }
      resolvedName = nameValidation.value;
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
      className="onboarding-readable-text absolute inset-0 z-40 flex items-start justify-center overflow-y-auto bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.2),transparent_44%),radial-gradient(circle_at_80%_80%,rgba(251,146,60,0.2),transparent_42%),rgba(3,7,18,0.72)] px-3 py-4 sm:items-center sm:p-6"
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

          <div className="onboarding-panel-in [contain:layout_paint] overflow-hidden rounded-2xl border border-sky-200/35 bg-[#0c1320]/82 shadow-[0_16px_42px_rgba(2,6,23,0.64)] backdrop-blur-[1.5px]">
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
                      onClick={() => setAuthMode('LOGIN')}
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold uppercase tracking-wider transition-colors duration-75 ease-out sm:text-base ${authMode === 'LOGIN'
                        ? 'border-cyan-100/85 bg-cyan-300 text-slate-950'
                        : 'border-white/40 text-zinc-100 hover:border-white/65 hover:bg-white/20'
                        }`}
                    >
                      Login
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthMode('SIGN_UP')}
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

                  <label htmlFor="onboarding-password" className="mt-4 block text-base uppercase tracking-widest text-zinc-200 sm:text-lg">
                    Password
                  </label>
                  <input
                    id="onboarding-password"
                    type="password"
                    value={passwordValue}
                    onChange={(event) => {
                      setPasswordValue(event.target.value);
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

                  <label htmlFor="onboarding-name" className="mt-4 block text-base uppercase tracking-widest text-zinc-200 sm:text-lg">
                    Display Name (Optional)
                  </label>
                  <input
                    id="onboarding-name"
                    value={nameValue}
                    onChange={(event) => {
                      setNameValue(event.target.value);
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
                    maxLength={20}
                    className="mt-2 w-full rounded-xl border border-sky-100/45 bg-black/52 px-4 py-3 text-xl text-zinc-50 outline-none transition-colors duration-75 ease-out focus:border-sky-300/85 focus:ring-2 focus:ring-sky-300/50 sm:text-2xl"
                    placeholder="Defaults to email prefix"
                    autoComplete="nickname"
                  />

                  <div className="min-h-6 pt-2 text-base text-rose-300 sm:text-lg">{authError ?? nameError ?? ''}</div>

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
                        onClick={continueWithSavedSession}
                        className="w-full rounded-xl border border-emerald-200/75 bg-emerald-300/35 px-4 py-2 text-base font-semibold text-emerald-50 transition duration-75 ease-out hover:bg-emerald-200/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-100 sm:w-auto sm:text-lg"
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
                      className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 px-4 py-2 text-base font-semibold text-slate-950 transition duration-75 ease-out hover:from-sky-400 hover:to-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-200 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:from-sky-500 disabled:hover:to-cyan-400 sm:w-auto sm:text-lg"
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
        <div
          className={`[contain:layout_paint] w-full max-w-5xl rounded-2xl border border-cyan-200/45 bg-[#09101d]/82 px-5 py-6 shadow-[0_16px_40px_rgba(2,6,23,0.66)] backdrop-blur-[1.5px] sm:px-7 ${
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
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 20) {
    return { ok: false, message: 'Name must be between 2 and 20 characters.' };
  }
  if (!NAME_PATTERN.test(trimmed)) {
    return { ok: false, message: 'Use letters, numbers, spaces, and underscore only.' };
  }
  return { ok: true, value: trimmed };
}

function validateEmail(value: string): { ok: true; value: string } | { ok: false; message: string } {
  const trimmed = value.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(trimmed)) {
    return { ok: false, message: 'Please enter a valid email address.' };
  }
  return { ok: true, value: trimmed };
}

function validatePassword(value: string): { ok: true; value: string } | { ok: false; message: string } {
  const trimmed = value.trim();
  if (trimmed.length < 8) {
    return { ok: false, message: 'Password must be at least 8 characters.' };
  }
  return { ok: true, value: trimmed };
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
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPassword = password.trim();
  return EMAIL_PATTERN.test(normalizedEmail) && normalizedPassword.length >= 8;
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

  return sanitized.slice(0, 20);
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
