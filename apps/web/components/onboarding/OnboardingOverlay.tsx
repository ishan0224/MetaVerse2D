'use client';

import { type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { normalizeAvatarId } from '@/game/config/characterSpriteConfig';
import { deriveDisplayNameFromEmail, isRoomPotentiallyValid, validateRoomId } from '@/lib/onboardingValidation';
import { getAuthSessionState, initializeAuthSession, subscribeToAuthSession } from '@/network/auth/authSession';

import { getOnboardingStepNumber, getPreviousOnboardingStep } from './onboardingFlow';
import { OnboardingMainPanel } from './OnboardingMainPanel';
import type { OnboardingDraft, OnboardingStep } from './onboardingTypes';
import { AvatarStep } from './steps/AvatarStep';
import { NameAuthStep } from './steps/NameAuthStep';
import { RoomConfirmStep } from './steps/RoomConfirmStep';
import { WorldStep } from './steps/WorldStep';
import { resolveWorldId } from './worldOptions';

const STRIP_EXIT_DURATION_MS = 220;

type OnboardingOverlayProps = {
  initialDraft: OnboardingDraft;
  onComplete: (result: OnboardingDraft) => void;
  onVisualStateChange?: (state: { step: OnboardingStep; worldId: string }) => void;
};

export function OnboardingOverlay({
  initialDraft,
  onComplete,
  onVisualStateChange,
}: OnboardingOverlayProps) {
  const [step, setStep] = useState<OnboardingStep>('name');
  const [nameValue, setNameValue] = useState(initialDraft.name);
  const [avatarId, setAvatarId] = useState(normalizeAvatarId(initialDraft.avatarId));
  const [worldId, setWorldId] = useState<string>(resolveWorldId(initialDraft.worldId));
  const [roomId, setRoomId] = useState(initialDraft.roomId);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [isClosingRoomStrip, setIsClosingRoomStrip] = useState(false);
  const [resolvedAuthEmail, setResolvedAuthEmail] = useState('');
  const authSession = useSyncExternalStore(
    subscribeToAuthSession,
    getAuthSessionState,
    getAuthSessionState,
  );
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    void initializeAuthSession().catch((error) => {
      console.error('failed to initialize onboarding auth session', error);
    });
  }, []);

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
    onVisualStateChange?.({ step, worldId });
  }, [onVisualStateChange, step, worldId]);

  const canConfirmRoom = isRoomPotentiallyValid(roomId);
  const currentStepNumber = getOnboardingStepNumber(step);

  const handleNameStepContinue = useCallback((result: { resolvedName: string; resolvedEmail: string }) => {
    setNameValue(result.resolvedName);
    setResolvedAuthEmail(result.resolvedEmail);
    setStep('avatar');
  }, []);

  const handleBack = () => {
    if (isClosingRoomStrip) {
      return;
    }

    const previousStep = getPreviousOnboardingStep(step);
    if (previousStep) {
      setStep(previousStep);
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
      name: nameValue.trim() || deriveDisplayNameFromEmail(resolvedAuthEmail || authSession.user?.email || ''),
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
  };

  const handleRoomIdChange = (value: string) => {
    setRoomId(value);
    if (roomError) {
      setRoomError(null);
    }
  };

  return (
    <div
      className="onboarding-shell onboarding-readable-text absolute inset-0 z-40 flex items-start justify-center overflow-y-auto bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.2),transparent_44%),radial-gradient(circle_at_80%_80%,rgba(251,146,60,0.2),transparent_42%),rgba(3,7,18,0.72)] px-3 sm:px-6"
      onKeyDown={handleRootKeyDown}
      style={{ fontFamily: '"Small Pixel-7", "Neon Pixel-7", "Pixelify Sans", "Space Grotesk", "Avenir Next", "Segoe UI", sans-serif' }}
    >
      {step !== 'roomConfirm' ? (
        <OnboardingMainPanel currentStepNumber={currentStepNumber}>
          <NameAuthStep visible={step === 'name'} nameValue={nameValue} onNameValueChange={setNameValue} authSession={authSession} onContinue={handleNameStepContinue} />
          <AvatarStep visible={step === 'avatar'} avatarId={avatarId} onAvatarChange={setAvatarId} onBack={handleBack} onContinue={proceedFromAvatar} />
          <WorldStep visible={step === 'world'} worldId={worldId} onWorldChange={setWorldId} onBack={handleBack} onContinue={proceedFromWorld} />
        </OnboardingMainPanel>
      ) : null}

      <RoomConfirmStep
        visible={step === 'roomConfirm'}
        roomId={roomId}
        roomError={roomError}
        isClosingRoomStrip={isClosingRoomStrip}
        canConfirmRoom={canConfirmRoom}
        onRoomIdChange={handleRoomIdChange}
        onBack={handleBack}
        onNo={handleRoomNo}
        onConfirm={confirmRoomSelection}
      />
    </div>
  );
}

export type { OnboardingDraft, OnboardingStep } from './onboardingTypes';
