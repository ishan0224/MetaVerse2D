'use client';

import { useCallback, useEffect, useState } from 'react';

import type { OnboardingDraft, OnboardingStep } from '@/components/OnboardingOverlay';
import { DEFAULT_AVATAR_ID, normalizeAvatarId } from '@/game/config/characterSpriteConfig';

const PLAYER_NAME_STORAGE_KEY = 'metaverse2d:player-name';
const WORLD_ID_STORAGE_KEY = 'metaverse2d:world-id';
const ROOM_ID_STORAGE_KEY = 'metaverse2d:room-id';
const AVATAR_ID_STORAGE_KEY = 'metaverse2d:avatar-id';
export const DEFAULT_WORLD_ID = '1';
export const DEFAULT_ROOM_ID = '1';
export const DEFAULT_ONBOARDING_DRAFT: OnboardingDraft = {
  name: '',
  avatarId: DEFAULT_AVATAR_ID,
  worldId: DEFAULT_WORLD_ID,
  roomId: DEFAULT_ROOM_ID,
};

export type OnboardingVisualState = {
  step: OnboardingStep;
  worldId: string;
};

type UseOnboardingSessionResult = {
  hasJoinedFlowStarted: boolean;
  initialOnboardingDraft: OnboardingDraft;
  joinIdentity: OnboardingDraft | null;
  onboardingVisualState: OnboardingVisualState;
  handleOnboardingComplete: (result: OnboardingDraft) => void;
  handleOnboardingVisualStateChange: (state: OnboardingVisualState) => void;
};

export function useOnboardingSession(): UseOnboardingSessionResult {
  const [joinIdentity, setJoinIdentity] = useState<OnboardingDraft | null>(null);
  const [initialOnboardingDraft, setInitialOnboardingDraft] = useState<OnboardingDraft>(() =>
    readOnboardingDraftFromSession(),
  );
  const [onboardingVisualState, setOnboardingVisualState] = useState<OnboardingVisualState>(() => ({
    step: 'name',
    worldId: initialOnboardingDraft.worldId,
  }));

  const handleOnboardingComplete = useCallback((result: OnboardingDraft) => {
    persistOnboardingDraftToSession(result);
    setInitialOnboardingDraft(result);
    setJoinIdentity(result);
  }, []);

  const handleOnboardingVisualStateChange = useCallback((state: OnboardingVisualState) => {
    setOnboardingVisualState((previous) => {
      if (previous.step === state.step && previous.worldId === state.worldId) {
        return previous;
      }
      return state;
    });
  }, []);

  useEffect(() => {
    if (joinIdentity !== null) {
      return;
    }
    setOnboardingVisualState({
      step: 'name',
      worldId: initialOnboardingDraft.worldId,
    });
  }, [initialOnboardingDraft.worldId, joinIdentity]);

  return {
    hasJoinedFlowStarted: joinIdentity !== null,
    initialOnboardingDraft,
    joinIdentity,
    onboardingVisualState,
    handleOnboardingComplete,
    handleOnboardingVisualStateChange,
  };
}

function readOnboardingDraftFromSession(): OnboardingDraft {
  if (typeof window === 'undefined') {
    return DEFAULT_ONBOARDING_DRAFT;
  }

  const cachedName = window.sessionStorage.getItem(PLAYER_NAME_STORAGE_KEY)?.trim() ?? '';
  const cachedWorldId = window.sessionStorage.getItem(WORLD_ID_STORAGE_KEY)?.trim() ?? DEFAULT_WORLD_ID;
  const cachedRoomId = window.sessionStorage.getItem(ROOM_ID_STORAGE_KEY)?.trim() ?? DEFAULT_ROOM_ID;
  const cachedAvatarIdRaw = window.sessionStorage.getItem(AVATAR_ID_STORAGE_KEY)?.trim() ?? '';
  const cachedAvatarId = Number.parseInt(cachedAvatarIdRaw, 10);

  return {
    name: cachedName,
    worldId: cachedWorldId || DEFAULT_WORLD_ID,
    roomId: cachedRoomId || DEFAULT_ROOM_ID,
    avatarId: normalizeAvatarId(cachedAvatarId),
  };
}

function persistOnboardingDraftToSession(draft: OnboardingDraft): void {
  window.sessionStorage.setItem(PLAYER_NAME_STORAGE_KEY, draft.name);
  window.sessionStorage.setItem(WORLD_ID_STORAGE_KEY, draft.worldId);
  window.sessionStorage.setItem(ROOM_ID_STORAGE_KEY, draft.roomId);
  window.sessionStorage.setItem(AVATAR_ID_STORAGE_KEY, String(draft.avatarId));
}
