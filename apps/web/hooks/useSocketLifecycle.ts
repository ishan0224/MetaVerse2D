'use client';

import { useEffect } from 'react';

import type { OnboardingDraft } from '@/components/OnboardingOverlay';
import { ENABLE_TEST_MINIMAP } from '@/config/features';
import { normalizeAvatarId } from '@/game/config/characterSpriteConfig';
import { WORLD_CONFIG } from '@/game/config/worldConfig';
import {
  appendRoomChatMessage,
  resetRoomChatState,
  setRoomChatScope,
} from '@/lib/chatUiStore';
import { applyJoinIdentity } from '@/lib/playerIdentityBridge';
import {
  resetRuntimeUiState,
  setJoinUiPhase,
  setMicPermissionStatus,
  setMinimapSnapshot,
  setRoomPopulation,
  setRuntimeAvatar,
  setSocketUiStatus,
} from '@/lib/runtimeUiStore';
import { resetVoiceControlState } from '@/lib/voiceControlStore';
import { getSocketClient, listenToRoomChatMessages } from '@/network';
import { getAuthAccessToken } from '@/network/auth/authSession';
import { getRTCManager } from '@/network/rtc/rtcManager';
import { resetMovementInput } from '@/store/useInputStore';

type UseSocketLifecycleParams = {
  isGameReady: boolean;
  joinIdentity: OnboardingDraft | null;
};

type PlayersUpdatePayload = {
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
};

export function useSocketLifecycle({
  isGameReady,
  joinIdentity,
}: UseSocketLifecycleParams): void {
  useEffect(() => {
    if (!isGameReady || !joinIdentity) {
      return;
    }

    let isMounted = true;
    let hasSeenLocalPlayer = false;
    let didRequestMic = false;

    const socket = getSocketClient();
    const rtcManager = getRTCManager();
    const requestedWorldId = joinIdentity.worldId;
    const requestedRoomId = joinIdentity.roomId;
    const requestedAvatarId = normalizeAvatarId(joinIdentity.avatarId);
    const accessToken = getAuthAccessToken();
    if (!accessToken) {
      setSocketUiStatus('FAILED');
      setJoinUiPhase('CONNECT_FAILED');
      return;
    }

    resetVoiceControlState();
    resetRoomChatState();
    resetRuntimeUiState();
    setSocketUiStatus('CONNECTING');
    setJoinUiPhase('CONNECTING');
    setMicPermissionStatus('IDLE');
    setRoomPopulation(1);
    applyJoinIdentity(joinIdentity);
    setRoomChatScope(requestedWorldId, requestedRoomId);

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

    const onPlayersUpdateProbe = (payload: PlayersUpdatePayload) => {
      const localPlayerId = socket.id;
      const localPlayerFromPayload = localPlayerId
        ? payload.players.find((player) => player.id === localPlayerId)
        : undefined;

      const activeWorldId = localPlayerFromPayload?.worldId ?? requestedWorldId;
      const activeRoomId = localPlayerFromPayload?.roomId ?? requestedRoomId;
      const scopedPlayers = payload.players.filter(
        (player) => player.worldId === activeWorldId && player.roomId === activeRoomId,
      );
      setRoomChatScope(activeWorldId, activeRoomId);
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
    const unsubscribeRoomChatMessages = listenToRoomChatMessages((message) => {
      appendRoomChatMessage(message);
    });

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
      unsubscribeRoomChatMessages();

      rtcManager.destroy();
      resetMovementInput();
      resetVoiceControlState();
      resetRoomChatState();
      resetRuntimeUiState();
    };
  }, [isGameReady, joinIdentity]);
}
