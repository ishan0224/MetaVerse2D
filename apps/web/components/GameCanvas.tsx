'use client';

import { useEffect, useRef } from 'react';

import { JoinStatusOverlay } from '@/components/JoinStatusOverlay';
import { MicModeCircle } from '@/components/MicModeCircle';
import { TopRightStatusCluster } from '@/components/TopRightStatusCluster';
import { VoiceControls } from '@/components/VoiceControls';
import { resetVoiceControlState } from '@/game/systems/voiceControlStore';
import { normalizeAvatarUrl } from '@/game/utils/avatarTexture';
import {
  resetRuntimeUiState,
  setJoinUiPhase,
  setMicPermissionStatus,
  setRoomPopulation,
  setRuntimeAvatar,
  setRuntimeIdentity,
  setSocketUiStatus,
} from '@/lib/runtimeUiStore';
import { getSocketClient, setPlayerAvatarUrl, setPlayerName, setRoomId } from '@/network';
import { getRTCManager } from '@/network/rtc/rtcManager';

type GameInstance = {
  destroy: (removeCanvas: boolean, noReturn?: boolean) => void;
};

const PLAYER_NAME_STORAGE_KEY = 'metaverse2d:player-name';
const ROOM_ID_STORAGE_KEY = 'metaverse2d:room-id';
const AVATAR_URL_STORAGE_KEY = 'metaverse2d:avatar-url';
const DEFAULT_ROOM_ID = 'lobby';

export function GameCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<GameInstance | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || gameRef.current) {
      return;
    }

    let isMounted = true;

    const socket = getSocketClient();
    const rtcManager = getRTCManager();

    const requestedName = getOrRequestPlayerName();
    const requestedRoomId = getOrRequestRoomId();
    const requestedAvatarUrl = getOrRequestAvatarUrl();
    resetVoiceControlState();
    resetRuntimeUiState();
    setRuntimeIdentity(requestedName, requestedRoomId);
    setPlayerName(requestedName);
    setRoomId(requestedRoomId);
    setPlayerAvatarUrl(requestedAvatarUrl);
    rtcManager.initialize();
    setSocketUiStatus('CONNECTING');
    setJoinUiPhase('CONNECTING');
    setMicPermissionStatus('IDLE');
    setRoomPopulation(1);
    setRuntimeAvatar(requestedAvatarUrl, 0x3b82f6);

    let hasSeenLocalPlayer = false;
    let didRequestMic = false;

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

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.io.on('reconnect_attempt', onReconnectAttempt);

    const onPlayersUpdateProbe = (payload: {
      players: Array<{
        id: string;
        x: number;
        y: number;
        name: string;
        color: number;
        roomId: string;
        avatarUrl?: string;
        timestamp: number;
      }>;
      proximity: Record<string, string[]>;
    }) => {
      const roomPopulation = payload.players.filter((player) => player.roomId === requestedRoomId).length;
      setRoomPopulation(roomPopulation > 0 ? roomPopulation : payload.players.length);

      const localPlayerId = socket.id;
      if (!localPlayerId) {
        return;
      }

      const localPlayer = payload.players.find((player) => player.id === localPlayerId);
      if (!localPlayer) {
        return;
      }

      setRuntimeAvatar(localPlayer.avatarUrl ?? requestedAvatarUrl, localPlayer.color);
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

    socket.on('players:update', onPlayersUpdateProbe);

    socket.connect();

    void (async () => {
      const { initializeGame } = await import('@/game');
      if (!isMounted) {
        return;
      }

      gameRef.current = initializeGame(container);
    })();

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

      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }

      resetVoiceControlState();
      resetRuntimeUiState();
    };
  }, []);

  return (
    <div className="relative h-screen w-full overflow-hidden">
      <div ref={containerRef} className="h-full w-full" />
      <TopRightStatusCluster />
      <JoinStatusOverlay />
      <MicModeCircle />
      <VoiceControls />
    </div>
  );
}

function requestPlayerName(): string {
  while (true) {
    const input = window.prompt('Enter your player name');
    const name = input?.trim();

    if (name) {
      return name;
    }
  }
}

function getOrRequestPlayerName(): string {
  const cachedName = window.sessionStorage.getItem(PLAYER_NAME_STORAGE_KEY)?.trim();
  if (cachedName) {
    return cachedName;
  }

  const name = requestPlayerName();
  window.sessionStorage.setItem(PLAYER_NAME_STORAGE_KEY, name);
  return name;
}

function requestRoomId(): string {
  const input = window.prompt('Enter room ID', DEFAULT_ROOM_ID);
  const roomId = input?.trim();
  return roomId || DEFAULT_ROOM_ID;
}

function getOrRequestRoomId(): string {
  const cachedRoomId = window.sessionStorage.getItem(ROOM_ID_STORAGE_KEY)?.trim();
  if (cachedRoomId) {
    return cachedRoomId;
  }

  const roomId = requestRoomId();
  window.sessionStorage.setItem(ROOM_ID_STORAGE_KEY, roomId);
  return roomId;
}

function requestAvatarUrl(): string | null {
  while (true) {
    const input = window.prompt(
      'Optional: enter avatar image URL (http/https). Leave blank to use default avatar.',
      '',
    );
    const normalized = normalizeAvatarUrl(input ?? '');
    if (!input?.trim()) {
      return null;
    }

    if (normalized) {
      return normalized;
    }
  }
}

function getOrRequestAvatarUrl(): string | null {
  const cachedAvatarUrl = normalizeAvatarUrl(window.sessionStorage.getItem(AVATAR_URL_STORAGE_KEY));
  if (cachedAvatarUrl) {
    return cachedAvatarUrl;
  }

  const avatarUrl = requestAvatarUrl();
  if (!avatarUrl) {
    window.sessionStorage.removeItem(AVATAR_URL_STORAGE_KEY);
    return null;
  }

  window.sessionStorage.setItem(AVATAR_URL_STORAGE_KEY, avatarUrl);
  return avatarUrl;
}
