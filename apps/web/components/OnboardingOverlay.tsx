'use client';

import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  AVATAR_IDS,
  AVATAR_WALK_FRAMES,
  CHARACTER_SPRITE_FRAME_HEIGHT,
  CHARACTER_SPRITE_FRAME_WIDTH,
  CHARACTER_SPRITE_SHEET_PATH,
  type AvatarId,
  normalizeAvatarId,
} from '@/game/config/characterSpriteConfig';

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

const NAME_PATTERN = /^[A-Za-z0-9_ ]+$/;
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
  const [avatarId, setAvatarId] = useState<AvatarId>(normalizeAvatarId(initialDraft.avatarId));
  const [worldId, setWorldId] = useState<string>(resolveWorldId(initialDraft.worldId));
  const [roomId, setRoomId] = useState(initialDraft.roomId);
  const [nameError, setNameError] = useState<string | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [isClosingRoomStrip, setIsClosingRoomStrip] = useState(false);

  const roomInputRef = useRef<HTMLInputElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);

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

  const canProceedFromName = isNamePotentiallyValid(nameValue);
  const canConfirmRoom = isRoomPotentiallyValid(roomId);

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

  const proceedFromName = () => {
    const validation = validateName(nameValue);
    if (!validation.ok) {
      setNameError(validation.message);
      return;
    }

    setNameValue(validation.value);
    setNameError(null);
    setStep('avatar');
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
      name: nameValue.trim(),
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
      className="onboarding-readable-text absolute inset-0 z-40 flex items-center justify-center bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.16),transparent_44%),radial-gradient(circle_at_80%_80%,rgba(251,146,60,0.16),transparent_42%),rgba(3,7,18,0.34)] p-4 sm:p-6"
      onKeyDown={handleRootKeyDown}
      style={{ fontFamily: '"Space Grotesk", "Avenir Next", "Segoe UI", sans-serif' }}
    >
      {step !== 'roomConfirm' ? (
        <div className="w-full max-w-5xl">
          <div className="mb-3 text-center sm:mb-4">
            <span className="inline-flex rounded-full bg-black/30 px-4 py-1.5">
              <h1 className="onboarding-readable-text-strong text-2xl font-extrabold uppercase tracking-[0.18em] text-orange-100 sm:text-4xl">
                Meta Verse 2D
              </h1>
            </span>
          </div>

          <div className="onboarding-panel-in [contain:layout_paint] overflow-hidden rounded-2xl border border-sky-200/25 bg-[#0c1320]/88 shadow-[0_12px_34px_rgba(2,6,23,0.62)]">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3 sm:px-7">
              <span className="text-xs uppercase tracking-[0.18em] text-sky-100/80">Onboarding</span>
              <span className="text-xs font-semibold text-sky-50/80">Step {currentStepNumber} / 4</span>
            </div>

            {step === 'name' ? (
              <div className="grid grid-cols-1 md:grid-cols-2">
                <section className="border-b border-white/10 p-5 md:border-b-0 md:border-r md:border-white/10 md:p-8">
                  <h2 className="text-2xl font-bold text-white">Hello User</h2>
                  <p className="mt-2 text-sm text-zinc-300">Please enter your name</p>
                  <label htmlFor="onboarding-name" className="mt-5 block text-xs uppercase tracking-widest text-zinc-400">
                    Username
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
                        proceedFromName();
                      }
                    }}
                    autoFocus
                    maxLength={20}
                    className="mt-2 w-full rounded-xl border border-sky-100/20 bg-black/40 px-4 py-3 text-base text-zinc-100 outline-none transition-colors duration-75 ease-out focus:border-sky-300/60 focus:ring-2 focus:ring-sky-300/40"
                    placeholder="Type your name"
                  />
                  <div className="min-h-6 pt-2 text-sm text-rose-300">{nameError ?? ''}</div>

                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={proceedFromName}
                      disabled={!canProceedFromName}
                      className="rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition duration-75 ease-out hover:from-sky-400 hover:to-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-200 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:from-sky-500 disabled:hover:to-cyan-400"
                    >
                      Continue
                    </button>
                  </div>
                </section>

                <section className="flex items-center justify-center p-6 md:p-8">
                  <div className="max-w-sm text-center">
                    <p className="text-xl font-semibold text-sky-100 sm:text-2xl">Welcome to your 2D world</p>
                    <p className="mt-3 text-sm text-zinc-300">
                      Build your identity, choose an avatar, and jump into your room.
                    </p>
                  </div>
                </section>
              </div>
            ) : null}

            {step === 'avatar' ? (
              <div className="grid grid-cols-1 md:grid-cols-2">
                <section className="border-b border-white/10 p-5 md:border-b-0 md:border-r md:border-white/10 md:p-8">
                  <h2 className="text-2xl font-bold text-white">Please select your avatar</h2>
                  <div className="mt-5 grid gap-2">
                    {AVATAR_IDS.map((candidate) => {
                      const selected = candidate === avatarId;
                      return (
                        <button
                          key={candidate}
                          type="button"
                          onClick={() => setAvatarId(candidate)}
                          className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors duration-75 ease-out ${
                            selected
                              ? 'border-cyan-200/80 bg-cyan-400/20 text-cyan-50 shadow-[0_0_0_1px_rgba(125,211,252,0.4)]'
                              : 'border-white/10 bg-black/30 text-zinc-200 hover:border-cyan-200/40 hover:bg-cyan-500/10'
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
                      className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-zinc-100 transition-colors duration-75 ease-out hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={proceedFromAvatar}
                      className="rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition duration-75 ease-out hover:from-sky-400 hover:to-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-200"
                    >
                      Continue
                    </button>
                  </div>
                </section>

                <section className="flex items-center justify-center p-6 md:p-8">
                  <div className="w-full max-w-xs rounded-2xl border border-cyan-200/20 bg-[#0a1222] p-5 shadow-[0_10px_26px_rgba(14,116,144,0.16)]">
                    <p className="text-center text-xs uppercase tracking-[0.2em] text-cyan-100/70">Animated Preview</p>
                    <div className="mt-4 flex items-center justify-center rounded-xl border border-white/10 bg-black/35 py-8">
                      <AvatarSpritePreview avatarId={avatarId} />
                    </div>
                  </div>
                </section>
              </div>
            ) : null}

            {step === 'world' ? (
              <section className="p-5 md:p-8">
                <h2 className="text-center text-2xl font-bold text-white">Select your desired world</h2>
                <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {WORLD_OPTIONS.map((world) => {
                    const selected = world.id === worldId;
                    return (
                      <button
                        key={world.id}
                        type="button"
                        onClick={() => setWorldId(world.id)}
                        className={`group relative overflow-hidden rounded-2xl border text-left transition-[transform,border-color] duration-90 ease-out will-change-transform hover:-translate-y-1 hover:scale-[1.008] ${
                          selected
                            ? 'border-cyan-200/80 shadow-[0_12px_28px_rgba(6,182,212,0.24)]'
                            : 'border-white/15 hover:border-cyan-200/60'
                        }`}
                      >
                        <div
                          className="h-28 w-full bg-cover bg-center"
                          style={{
                            backgroundImage: `linear-gradient(to top, rgba(2,6,23,0.62), rgba(2,6,23,0.1)), url(${world.previewImage})`,
                          }}
                        />
                        <div className="bg-black/45 p-4">
                          <p className="text-base font-semibold text-zinc-100">{world.title}</p>
                          <p className="mt-1 text-sm text-zinc-300">{world.subtitle}</p>
                        </div>
                        {selected ? (
                          <span className="absolute right-3 top-3 rounded-md bg-cyan-300/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-950">
                            Selected
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-5 text-right text-xs uppercase tracking-widest text-zinc-400">
                  More worlds to be added soon
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={handleBack}
                    className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-zinc-100 transition-colors duration-75 ease-out hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={proceedFromWorld}
                    className="rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition duration-75 ease-out hover:from-sky-400 hover:to-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-200"
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
          className={`[contain:layout_paint] w-full max-w-5xl rounded-2xl border border-cyan-200/35 bg-[#09101d]/92 px-5 py-6 shadow-[0_12px_34px_rgba(2,6,23,0.66)] sm:px-7 ${
            isClosingRoomStrip ? 'onboarding-room-strip-out' : 'onboarding-room-strip-in'
          }`}
        >
          <div className="grid gap-5 sm:grid-cols-[2fr_1fr] sm:items-end">
            <div>
              <h2 className="text-xl font-bold text-zinc-100 sm:text-2xl">Enter room ID</h2>
              <p className="mt-1 text-sm text-zinc-300">Use the same room ID to join friends in the same world.</p>
              <label htmlFor="onboarding-room-id" className="mt-4 block text-xs uppercase tracking-widest text-zinc-400">
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
                className="mt-2 w-full rounded-xl border border-sky-100/20 bg-black/40 px-4 py-3 text-base text-zinc-100 outline-none transition-colors duration-75 ease-out focus:border-sky-300/60 focus:ring-2 focus:ring-sky-300/40 disabled:cursor-not-allowed disabled:opacity-70"
                placeholder="example-room-01"
              />
              <div className="min-h-6 pt-2 text-sm text-rose-300">{roomError ?? ''}</div>
            </div>

            <div className="sm:pb-1">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-100/80">Are you sure?</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleRoomNo}
                  disabled={isClosingRoomStrip}
                  className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-zinc-100 transition-colors duration-75 ease-out hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={confirmRoomSelection}
                  disabled={isClosingRoomStrip || !canConfirmRoom}
                  className="rounded-xl bg-gradient-to-r from-orange-400 to-amber-300 px-4 py-2 text-sm font-bold text-slate-950 transition duration-75 ease-out hover:from-orange-300 hover:to-amber-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-100 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:from-orange-400 disabled:hover:to-amber-300"
                >
                  Yes
                </button>
              </div>
              <button
                type="button"
                onClick={handleBack}
                disabled={isClosingRoomStrip}
                className="mt-3 w-full rounded-xl border border-cyan-100/30 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-cyan-100 transition-colors duration-75 ease-out hover:bg-cyan-200/10 disabled:cursor-not-allowed disabled:opacity-70"
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

function isNamePotentiallyValid(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 2 && trimmed.length <= 20 && NAME_PATTERN.test(trimmed);
}

function isRoomPotentiallyValid(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= 24 && ROOM_PATTERN.test(trimmed);
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
