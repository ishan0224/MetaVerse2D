'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { CircularMinimap } from '@/components/CircularMinimap';
import { JoinStatusOverlay } from '@/components/JoinStatusOverlay';
import { MicModeCircle } from '@/components/MicModeCircle';
import {
  OnboardingOverlay,
  type OnboardingDraft,
  type OnboardingStep,
} from '@/components/OnboardingOverlay';
import { TopRightStatusCluster } from '@/components/TopRightStatusCluster';
import { VoiceKeyboardBindings } from '@/components/VoiceKeyboardBindings';
import { ENABLE_TEST_MINIMAP } from '@/config/features';
import { DEFAULT_AVATAR_ID, normalizeAvatarId } from '@/game/config/characterSpriteConfig';
import { WORLD_CONFIG } from '@/game/config/worldConfig';
import { resetVoiceControlState } from '@/game/systems/voiceControlStore';
import {
  resetRuntimeUiState,
  setJoinUiPhase,
  setMicPermissionStatus,
  setMinimapSnapshot,
  setRoomPopulation,
  setRuntimeAvatar,
  setRuntimeIdentity,
  setSocketUiStatus,
} from '@/lib/runtimeUiStore';
import {
  getSocketClient,
  setPlayerAvatarId,
  setPlayerAvatarUrl,
  setPlayerName,
  setRoomId,
  setWorldId,
} from '@/network';
import { getRTCManager } from '@/network/rtc/rtcManager';

type GameInstance = {
  destroy: (removeCanvas: boolean, noReturn?: boolean) => void;
};

const PLAYER_NAME_STORAGE_KEY = 'metaverse2d:player-name';
const WORLD_ID_STORAGE_KEY = 'metaverse2d:world-id';
const ROOM_ID_STORAGE_KEY = 'metaverse2d:room-id';
const AVATAR_ID_STORAGE_KEY = 'metaverse2d:avatar-id';
const DEFAULT_WORLD_ID = '1';
const DEFAULT_ROOM_ID = '1';
const DEFAULT_ONBOARDING_DRAFT: OnboardingDraft = {
  name: '',
  avatarId: DEFAULT_AVATAR_ID,
  worldId: DEFAULT_WORLD_ID,
  roomId: DEFAULT_ROOM_ID,
};
const ONBOARDING_BASE_BACKDROP_SRC = '/world-previews/world1-onboarding-bg.png';
const WORLD_ONE_SELECTION_BACKDROP_SRC = '/world-previews/world1-selection.png';
const MAP_CROSSFADE_DURATION_MS = 240;

type BackdropHandoffState =
  | 'SCREENSHOT_VISIBLE'
  | 'REAL_MAP_READY_HIDDEN'
  | 'CROSSFADE'
  | 'REAL_MAP_VISIBLE';

type OnboardingVisualState = {
  step: OnboardingStep;
  worldId: string;
};

export function GameCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<GameInstance | null>(null);
  const handoffTimerRef = useRef<number | null>(null);
  const [isGameReady, setIsGameReady] = useState(false);
  const [joinIdentity, setJoinIdentity] = useState<OnboardingDraft | null>(null);
  const [initialOnboardingDraft, setInitialOnboardingDraft] = useState<OnboardingDraft>(() =>
    readOnboardingDraftFromSession(),
  );
  const [onboardingVisualState, setOnboardingVisualState] = useState<OnboardingVisualState>(() => ({
    step: 'name',
    worldId: initialOnboardingDraft.worldId,
  }));
  const [handoffState, setHandoffState] = useState<BackdropHandoffState>('SCREENSHOT_VISIBLE');

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

  useEffect(() => {
    resetVoiceControlState();
    resetRuntimeUiState();
    setIsGameReady(false);
    setHandoffState('SCREENSHOT_VISIBLE');
    const baseBackdrop = new Image();
    baseBackdrop.src = ONBOARDING_BASE_BACKDROP_SRC;
    const worldSelectionBackdrop = new Image();
    worldSelectionBackdrop.src = WORLD_ONE_SELECTION_BACKDROP_SRC;

    return () => {
      if (handoffTimerRef.current) {
        window.clearTimeout(handoffTimerRef.current);
        handoffTimerRef.current = null;
      }
      const socket = getSocketClient();
      if (socket.connected) {
        socket.disconnect();
      }
      getRTCManager().destroy();

      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }

      resetVoiceControlState();
      resetRuntimeUiState();
    };
  }, []);

  useEffect(() => {
    if (!joinIdentity || gameRef.current) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const { initializeGame } = await import('@/game');
      if (cancelled) {
        return;
      }

      gameRef.current = initializeGame(container);
      await waitForFirstPaint();
      if (cancelled) {
        return;
      }

      setIsGameReady(true);
      setHandoffState('REAL_MAP_READY_HIDDEN');
      window.requestAnimationFrame(() => {
        if (cancelled) {
          return;
        }
        setHandoffState('CROSSFADE');
      });
      handoffTimerRef.current = window.setTimeout(() => {
        if (cancelled) {
          return;
        }
        setHandoffState('REAL_MAP_VISIBLE');
        handoffTimerRef.current = null;
      }, MAP_CROSSFADE_DURATION_MS);
    })();

    return () => {
      cancelled = true;
      if (handoffTimerRef.current) {
        window.clearTimeout(handoffTimerRef.current);
        handoffTimerRef.current = null;
      }
    };
  }, [joinIdentity]);

  useEffect(() => {
    if (!isGameReady || !joinIdentity) {
      return;
    }

    let isMounted = true;
    let hasSeenLocalPlayer = false;
    let didRequestMic = false;

    const socket = getSocketClient();
    const rtcManager = getRTCManager();
    const requestedName = joinIdentity.name;
    const requestedWorldId = joinIdentity.worldId;
    const requestedRoomId = joinIdentity.roomId;
    const requestedAvatarId = normalizeAvatarId(joinIdentity.avatarId);

    resetVoiceControlState();
    resetRuntimeUiState();
    setSocketUiStatus('CONNECTING');
    setJoinUiPhase('CONNECTING');
    setMicPermissionStatus('IDLE');
    setRoomPopulation(1);
    setRuntimeAvatar(null, 0x3b82f6, requestedAvatarId);
    setRuntimeIdentity(requestedName, requestedRoomId);
    setPlayerName(requestedName);
    setWorldId(requestedWorldId);
    setRoomId(requestedRoomId);
    setPlayerAvatarId(requestedAvatarId);
    setPlayerAvatarUrl(null);

    const onConnect = () => {
      setSocketUiStatus('CONNECTED');
      if (!hasSeenLocalPlayer) {
        setJoinUiPhase('JOINING_ROOM');
      }
    };

    const onDisconnect = (reason: string) => {
      if (reason === 'io client disconnect') {
        setSocketUiStatus('DISCONNECTED');
        return;
      }

      hasSeenLocalPlayer = false;
      didRequestMic = false;
      setSocketUiStatus('RECONNECTING');
      setJoinUiPhase('RECONNECTING');
    };

    const onConnectError = () => {
      setSocketUiStatus('FAILED');
      setJoinUiPhase('CONNECT_FAILED');
    };

    const onReconnectAttempt = () => {
      setSocketUiStatus('RECONNECTING');
      setJoinUiPhase('RECONNECTING');
    };

    const onPlayersUpdateProbe = (payload: {
      players: Array<{
        id: string;
        x: number;
        y: number;
        name: string;
        worldId: string;
        color: number;
        roomId: string;
        avatarId?: number;
        avatarUrl?: string;
        timestamp: number;
      }>;
      proximity: Record<string, string[]>;
    }) => {
      const localPlayerId = socket.id;
      const localPlayerFromPayload = localPlayerId
        ? payload.players.find((player) => player.id === localPlayerId)
        : undefined;

      const activeWorldId = localPlayerFromPayload?.worldId ?? requestedWorldId;
      const activeRoomId = localPlayerFromPayload?.roomId ?? requestedRoomId;
      const scopedPlayers = payload.players.filter(
        (player) => player.worldId === activeWorldId && player.roomId === activeRoomId,
      );
      setRoomPopulation(scopedPlayers.length > 0 ? scopedPlayers.length : payload.players.length);

      if (ENABLE_TEST_MINIMAP) {
        setMinimapSnapshot({
          worldId: activeWorldId,
          roomId: activeRoomId,
          localPlayerId: localPlayerId ?? null,
          worldWidth: WORLD_CONFIG.width,
          worldHeight: WORLD_CONFIG.height,
          players: scopedPlayers.map((player) => ({
            id: player.id,
            x: player.x,
            y: player.y,
            color: player.color,
          })),
        });
      }

      if (!localPlayerId) {
        return;
      }

      const localPlayer = scopedPlayers.find((player) => player.id === localPlayerId);
      if (!localPlayer) {
        return;
      }

      setRuntimeAvatar(localPlayer.avatarUrl ?? null, localPlayer.color, localPlayer.avatarId ?? requestedAvatarId);

      if (hasSeenLocalPlayer) {
        return;
      }

      hasSeenLocalPlayer = true;
      setJoinUiPhase('REQUESTING_MIC');

      if (didRequestMic) {
        return;
      }

      didRequestMic = true;
      setMicPermissionStatus('REQUESTING');

      void rtcManager.requestMicrophoneAccess().then((result) => {
        if (!isMounted) {
          return;
        }

        if (result === 'granted') {
          setMicPermissionStatus('GRANTED');
          setJoinUiPhase('READY');
          return;
        }

        setMicPermissionStatus('BLOCKED');
        setJoinUiPhase('MIC_BLOCKED');
      });
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.io.on('reconnect_attempt', onReconnectAttempt);
    socket.on('players:update', onPlayersUpdateProbe);

    rtcManager.initialize();
    socket.connect();

    return () => {
      isMounted = false;

      if (socket.connected) {
        socket.disconnect();
      }

      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.io.off('reconnect_attempt', onReconnectAttempt);
      socket.off('players:update', onPlayersUpdateProbe);

      rtcManager.destroy();
      resetVoiceControlState();
      resetRuntimeUiState();
    };
  }, [isGameReady, joinIdentity]);

  const hasJoinedFlowStarted = joinIdentity !== null;
  const shouldUseSelectedWorldBackdrop =
    onboardingVisualState.worldId === DEFAULT_WORLD_ID &&
    (onboardingVisualState.step === 'world' ||
      onboardingVisualState.step === 'roomConfirm' ||
      hasJoinedFlowStarted);
  const onboardingBackdropSrc = shouldUseSelectedWorldBackdrop
    ? WORLD_ONE_SELECTION_BACKDROP_SRC
    : ONBOARDING_BASE_BACKDROP_SRC;
  const screenshotShouldRender = handoffState !== 'REAL_MAP_VISIBLE';
  const screenshotOpacityClass = handoffState === 'CROSSFADE' ? 'opacity-0' : 'opacity-100';
  const gameCanvasOpacityClass =
    handoffState === 'SCREENSHOT_VISIBLE' ? 'opacity-0' : 'opacity-100';

  return (
    <div className="relative h-screen w-full overflow-hidden bg-slate-950">
      {screenshotShouldRender ? (
        <div
          className={`pointer-events-none absolute inset-0 z-0 overflow-hidden transition-opacity duration-[240ms] ease-out ${screenshotOpacityClass}`}
        >
          <img
            src={onboardingBackdropSrc}
            alt=""
            aria-hidden="true"
            decoding="sync"
            fetchPriority="high"
            className="absolute inset-0 h-full w-full select-none object-cover object-center"
            draggable={false}
          />
        </div>
      ) : null}
      <div
        ref={containerRef}
        className={`relative z-10 h-full w-full transition-opacity duration-[240ms] ease-out ${gameCanvasOpacityClass}`}
      />
      {!hasJoinedFlowStarted ? (
        <OnboardingOverlay
          initialDraft={initialOnboardingDraft}
          onComplete={handleOnboardingComplete}
          onVisualStateChange={handleOnboardingVisualStateChange}
        />
      ) : null}
      {hasJoinedFlowStarted ? <VoiceKeyboardBindings /> : null}
      {hasJoinedFlowStarted ? <TopRightStatusCluster /> : null}
      {hasJoinedFlowStarted ? <JoinStatusOverlay /> : null}
      {hasJoinedFlowStarted ? <MicModeCircle placement="top-right-below" /> : null}
      {hasJoinedFlowStarted && ENABLE_TEST_MINIMAP ? <CircularMinimap /> : null}
    </div>
  );
}

async function waitForFirstPaint(): Promise<void> {
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      resolve();
    });
  });
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
