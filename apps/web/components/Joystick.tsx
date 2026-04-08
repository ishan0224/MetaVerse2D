'use client';

import type { JoystickManager, JoystickOutputData, Options } from 'nipplejs';
import { useEffect, useRef } from 'react';

import { resetMovementInput, setJoystickVector } from '@/store/useInputStore';

const JOYSTICK_SIZE_PX = 104;
const JOYSTICK_BASE_ALPHA = 0.6;

export function Joystick() {
  const zoneRef = useRef<HTMLDivElement | null>(null);
  const joystickManagerRef = useRef<JoystickManager | null>(null);

  useEffect(() => {
    const zoneElement = zoneRef.current;
    if (!zoneElement) {
      return;
    }

    if (!isTouchCapableDevice()) {
      resetMovementInput();
      return;
    }

    let disposed = false;
    let activeIdentifier: number | null = null;
    let createJoystickFactory: ((options: Options) => JoystickManager) | null = null;
    let isManagerInitializationInFlight = false;
    let shouldReinitializeManagerAfterInit = false;
    let zoneMutationObserver: MutationObserver | null = null;

    const joystickOptions: Options = {
      zone: zoneElement,
      mode: 'static',
      position: { left: '50%', top: '50%' },
      multitouch: false,
      maxNumberOfNipples: 1,
      size: JOYSTICK_SIZE_PX,
      color: 'white',
      dynamicPage: true,
      restOpacity: JOYSTICK_BASE_ALPHA,
      fadeTime: 150,
    };

    const releaseMovement = (eventData?: unknown, outputData?: unknown) => {
      const identifier = resolveEventIdentifier(eventData, outputData);
      if (identifier !== null && activeIdentifier !== null && identifier !== activeIdentifier) {
        return;
      }

      activeIdentifier = null;
      resetMovementInput();
    };

    const clearZoneArtifacts = () => {
      zoneElement.replaceChildren();
    };

    const destroyManager = () => {
      const manager = joystickManagerRef.current;
      if (!manager) {
        clearZoneArtifacts();
        return;
      }

      manager.off('start', handleStart);
      manager.off('move', handleMove);
      manager.off('end', releaseMovement);
      manager.off('removed', releaseMovement);
      manager.off('destroyed', releaseMovement);
      manager.destroy();
      joystickManagerRef.current = null;
      clearZoneArtifacts();
    };

    const createManager = () => {
      if (!createJoystickFactory || disposed) {
        return;
      }

      releaseMovement();
      destroyManager();

      const nextManager = createJoystickFactory(joystickOptions);
      if (disposed) {
        nextManager.destroy();
        clearZoneArtifacts();
        return;
      }

      joystickManagerRef.current = nextManager;
      nextManager.on('start', handleStart);
      nextManager.on('move', handleMove);
      nextManager.on('end', releaseMovement);
      nextManager.on('removed', releaseMovement);
      nextManager.on('destroyed', releaseMovement);
    };

    const reinitializeManager = () => {
      if (disposed) {
        return;
      }

      if (isManagerInitializationInFlight) {
        shouldReinitializeManagerAfterInit = true;
        return;
      }

      createManager();
    };

    const ensureSingleJoystickInstance = () => {
      const renderedJoysticks = zoneElement.querySelectorAll('[id^="joystick_"]');
      if (renderedJoysticks.length <= 1) {
        return;
      }

      reinitializeManager();
    };

    const handleStart = (eventData: unknown, outputData?: unknown) => {
      ensureSingleJoystickInstance();
      const identifier = resolveEventIdentifier(eventData, outputData);
      if (activeIdentifier === null) {
        activeIdentifier = identifier;
      }
    };

    const handleMove = (eventData: unknown, outputData?: unknown) => {
      const identifier = resolveEventIdentifier(eventData, outputData);
      if (activeIdentifier !== null && identifier !== null && identifier !== activeIdentifier) {
        return;
      }

      if (activeIdentifier === null) {
        activeIdentifier = identifier;
      }

      const safeOutputData = resolveJoystickOutputData(eventData, outputData);
      const rawX = clampAxis(safeOutputData.vector?.x ?? 0);
      const rawY = clampAxis(safeOutputData.vector?.y ?? 0);
      const rawMagnitude = Math.hypot(rawX, rawY);
      const force = clampUnit(
        typeof safeOutputData.force === 'number' ? safeOutputData.force : rawMagnitude,
      );

      setJoystickVector({
        x: rawX * force,
        // nipplejs vector Y is positive upward; gameplay input expects positive downward.
        y: -rawY * force,
      });
    };

    const handleViewportChange = () => {
      releaseMovement();
    };

    const handleWindowBlur = () => {
      releaseMovement();
    };

    const handlePageHide = () => {
      releaseMovement();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        releaseMovement();
      }
    };

    const handleTouchCancel = (event: TouchEvent) => {
      if (shouldReleaseFromTouchEvent(event, activeIdentifier)) {
        releaseMovement();
      }
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (shouldReleaseFromTouchEvent(event, activeIdentifier)) {
        releaseMovement();
      }
    };

    window.addEventListener('orientationchange', handleViewportChange);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pointercancel', releaseMovement);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('touchcancel', handleTouchCancel, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    if (typeof MutationObserver !== 'undefined') {
      zoneMutationObserver = new MutationObserver(() => {
        ensureSingleJoystickInstance();
      });
      zoneMutationObserver.observe(zoneElement, { childList: true });
    }

    const initializeManager = async () => {
      if (disposed || isManagerInitializationInFlight) {
        return;
      }

      isManagerInitializationInFlight = true;
      try {
        if (!createJoystickFactory) {
          const nippleModule = await import('nipplejs');
          if (disposed) {
            return;
          }

          const createJoystick =
            nippleModule.create ??
            (nippleModule.default as { create?: typeof nippleModule.create } | undefined)?.create;
          if (!createJoystick) {
            throw new Error('nipplejs create() is unavailable');
          }

          createJoystickFactory = createJoystick;
        }

        createManager();
      } catch (error) {
        console.error('virtual joystick failed to initialize', error);
        releaseMovement();
        destroyManager();
      } finally {
        isManagerInitializationInFlight = false;
        if (shouldReinitializeManagerAfterInit && !disposed) {
          shouldReinitializeManagerAfterInit = false;
          createManager();
        }
      }
    };

    void initializeManager();

    return () => {
      disposed = true;
      releaseMovement();
      zoneMutationObserver?.disconnect();
      window.removeEventListener('orientationchange', handleViewportChange);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pointercancel', releaseMovement);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('touchcancel', handleTouchCancel);
      document.removeEventListener('touchend', handleTouchEnd);
      destroyManager();
    };
  }, []);

  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 z-30 sm:bottom-4 sm:left-4">
      <div
        ref={zoneRef}
        className="joystick-touch-zone relative h-[104px] w-[104px] rounded-full border border-white/20 bg-black/35 shadow-md backdrop-blur"
        aria-label="Movement joystick"
        role="application"
      />
    </div>
  );
}

function isTouchCapableDevice(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const maxTouchPoints = window.navigator.maxTouchPoints ?? 0;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  return maxTouchPoints > 0 || coarsePointer;
}

function resolveEventIdentifier(eventData: unknown, outputData?: unknown): number | null {
  if (typeof outputData === 'object' && outputData !== null && 'identifier' in outputData) {
    const value = (outputData as { identifier?: unknown }).identifier;
    if (typeof value === 'number') {
      return value;
    }
  }

  if (typeof eventData !== 'object' || eventData === null) {
    return null;
  }

  if ('identifier' in eventData) {
    const value = (eventData as { identifier?: unknown }).identifier;
    if (typeof value === 'number') {
      return value;
    }
  }

  if ('data' in eventData) {
    const nestedData = (eventData as { data?: unknown }).data;
    if (typeof nestedData === 'object' && nestedData !== null && 'identifier' in nestedData) {
      const value = (nestedData as { identifier?: unknown }).identifier;
      if (typeof value === 'number') {
        return value;
      }
    }
  }

  if ('target' in eventData) {
    const target = (eventData as { target?: unknown }).target;
    if (typeof target === 'object' && target !== null && 'identifier' in target) {
      const value = (target as { identifier?: unknown }).identifier;
      if (typeof value === 'number') {
        return value;
      }
    }
  }

  return null;
}

function resolveJoystickOutputData(eventData: unknown, outputData?: unknown): JoystickOutputData {
  if (isJoystickOutputData(outputData)) {
    return outputData;
  }

  if (isJoystickOutputData(eventData)) {
    return eventData;
  }

  if (typeof eventData === 'object' && eventData !== null && 'data' in eventData) {
    const nestedData = (eventData as { data?: unknown }).data;
    if (isJoystickOutputData(nestedData)) {
      return nestedData;
    }
  }

  return {};
}

function isJoystickOutputData(value: unknown): value is JoystickOutputData {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return 'vector' in value || 'force' in value;
}

function clampAxis(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(-1, Math.min(1, value));
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function shouldReleaseFromTouchEvent(event: TouchEvent, activeIdentifier: number | null): boolean {
  if (activeIdentifier === null) {
    return true;
  }

  for (let index = 0; index < event.changedTouches.length; index += 1) {
    if (event.changedTouches.item(index)?.identifier === activeIdentifier) {
      return true;
    }
  }

  for (let index = 0; index < event.touches.length; index += 1) {
    if (event.touches.item(index)?.identifier === activeIdentifier) {
      return false;
    }
  }

  return true;
}
