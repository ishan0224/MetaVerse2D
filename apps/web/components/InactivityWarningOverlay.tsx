'use client';

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import {
  type AvatarId,
  CHARACTER_SPRITE_FRAME_HEIGHT,
  CHARACTER_SPRITE_FRAME_WIDTH,
  CHARACTER_SPRITE_SHEET_PATH,
  getIdleFrame,
  normalizeAvatarId,
} from '@/game/config/characterSpriteConfig';
import { getRuntimeUiState, subscribeToRuntimeUiState } from '@/lib/runtimeUiStore';

import styles from './InactivityWarningOverlay.module.css';

type InactivityWarningOverlayProps = {
  countdownSeconds: number;
  onStay: () => void;
  onLeave: () => void;
};

type SpriteSheetMetrics = {
  width: number;
  height: number;
  columns: number;
};

const EXIT_ANIMATION_MS = 180;
const URGENT_COUNTDOWN_THRESHOLD_S = 10;
let spriteSheetMetricsPromise: Promise<SpriteSheetMetrics> | null = null;

export function InactivityWarningOverlay({
  countdownSeconds,
  onStay,
  onLeave,
}: InactivityWarningOverlayProps) {
  const runtimeUiState = useSyncExternalStore(
    subscribeToRuntimeUiState,
    getRuntimeUiState,
    getRuntimeUiState,
  );
  const [spriteSheetMetrics, setSpriteSheetMetrics] = useState<SpriteSheetMetrics | null>(null);
  const [isExiting, setIsExiting] = useState(false);
  const exitTimerRef = useRef<number | null>(null);
  const avatarId = normalizeAvatarId(runtimeUiState.avatarId);

  useEffect(() => {
    let cancelled = false;
    void getSpriteSheetMetrics()
      .then((metrics) => {
        if (cancelled) {
          return;
        }
        setSpriteSheetMetrics(metrics);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setSpriteSheetMetrics(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const dismissWithExitAnimation = useCallback(() => {
    if (isExiting) {
      return;
    }

    setIsExiting(true);
    if (exitTimerRef.current !== null) {
      window.clearTimeout(exitTimerRef.current);
    }

    exitTimerRef.current = window.setTimeout(() => {
      exitTimerRef.current = null;
      onStay();
    }, EXIT_ANIMATION_MS);
  }, [isExiting, onStay]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      event.preventDefault();
      dismissWithExitAnimation();
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [dismissWithExitAnimation]);

  useEffect(() => {
    return () => {
      if (exitTimerRef.current !== null) {
        window.clearTimeout(exitTimerRef.current);
      }
    };
  }, []);

  return (
    <div
      className={`${styles.overlay} ${isExiting ? styles.overlayExiting : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="inactivity-warning-title"
    >
      <div className={`${styles.card} ${isExiting ? styles.cardExiting : ''}`}>
        <div className={styles.avatarSlot}>
          <div className={styles.avatarBob}>
            <div className={styles.avatarScale}>
              {spriteSheetMetrics ? (
                <div
                  className={styles.avatarSprite}
                  style={buildAvatarSpriteStyle(avatarId, spriteSheetMetrics)}
                />
              ) : (
                <div className={styles.avatarFallback} />
              )}
            </div>
          </div>
        </div>

        <h2 id="inactivity-warning-title" className={styles.title}>
          Are you still there?
        </h2>

        <p className={styles.subtitle}>
          You&apos;ve been inactive for a while. You&apos;ll be removed from this space in:
        </p>

        <p
          className={`${styles.countdown} ${
            countdownSeconds <= URGENT_COUNTDOWN_THRESHOLD_S ? styles.countdownUrgent : ''
          }`}
        >
          {formatCountdown(countdownSeconds)}
        </p>

        <div className={styles.actions}>
          <button
            type="button"
            onClick={dismissWithExitAnimation}
            disabled={isExiting}
            className={styles.primaryButton}
          >
            I&apos;m here
          </button>

          <button
            type="button"
            onClick={onLeave}
            disabled={isExiting}
            className={styles.secondaryButton}
          >
            Leave space
          </button>
        </div>
      </div>
    </div>
  );
}

function formatCountdown(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainderSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainderSeconds).padStart(2, '0')}`;
}

function getSpriteSheetMetrics(): Promise<SpriteSheetMetrics> {
  if (!spriteSheetMetricsPromise) {
    spriteSheetMetricsPromise = new Promise<SpriteSheetMetrics>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const columns = Math.max(1, Math.floor(image.naturalWidth / CHARACTER_SPRITE_FRAME_WIDTH));
        resolve({
          width: image.naturalWidth,
          height: image.naturalHeight,
          columns,
        });
      };
      image.onerror = () => {
        reject(new Error(`Failed to load sprite sheet: ${CHARACTER_SPRITE_SHEET_PATH}`));
      };
      image.src = CHARACTER_SPRITE_SHEET_PATH;
    });
  }

  return spriteSheetMetricsPromise;
}

function buildAvatarSpriteStyle(avatarId: AvatarId, spriteSheetMetrics: SpriteSheetMetrics): CSSProperties {
  const frameIndex = getIdleFrame(avatarId, 'down');
  const column = frameIndex % spriteSheetMetrics.columns;
  const row = Math.floor(frameIndex / spriteSheetMetrics.columns);
  const offsetX = column * CHARACTER_SPRITE_FRAME_WIDTH;
  const offsetY = row * CHARACTER_SPRITE_FRAME_HEIGHT;

  return {
    width: `${CHARACTER_SPRITE_FRAME_WIDTH}px`,
    height: `${CHARACTER_SPRITE_FRAME_HEIGHT}px`,
    backgroundImage: `url(${CHARACTER_SPRITE_SHEET_PATH})`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: `-${offsetX}px -${offsetY}px`,
    imageRendering: 'pixelated',
  };
}
