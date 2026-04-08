import { useEffect } from 'react';

import { resetRoomChatState } from '@/lib/chatUiStore';
import { resetRuntimeUiState } from '@/lib/runtimeUiStore';
import { resetVoiceControlState } from '@/lib/voiceControlStore';
import { getSocketClient } from '@/network';
import { getRTCManager } from '@/network/rtc/rtcManager';
import { resetMovementInput } from '@/store/useInputStore';

type UseGameCanvasRuntimeEffectsOptions = {
  baseBackdropSrc: string;
  worldSelectionBackdropSrc: string;
  destroyGame: () => void;
  resetHandoff: () => void;
  hasJoinedFlowStarted: boolean;
  shouldGuardPortraitGameplay: boolean;
  viewportHeight: number;
  viewportWidth: number;
  syncGameScaleToContainer: () => void;
};

export function useGameCanvasRuntimeEffects({
  baseBackdropSrc,
  worldSelectionBackdropSrc,
  destroyGame,
  resetHandoff,
  hasJoinedFlowStarted,
  shouldGuardPortraitGameplay,
  viewportHeight,
  viewportWidth,
  syncGameScaleToContainer,
}: UseGameCanvasRuntimeEffectsOptions) {
  useEffect(() => {
    resetMovementInput();
    resetVoiceControlState();
    resetRoomChatState();
    resetRuntimeUiState();
    resetHandoff();

    const baseBackdrop = new Image();
    baseBackdrop.src = baseBackdropSrc;
    const worldSelectionBackdrop = new Image();
    worldSelectionBackdrop.src = worldSelectionBackdropSrc;

    return () => {
      const socket = getSocketClient();
      if (socket.connected) {
        socket.disconnect();
      }
      getRTCManager().destroy();
      destroyGame();
      resetMovementInput();
      resetVoiceControlState();
      resetRoomChatState();
      resetRuntimeUiState();
    };
  }, [baseBackdropSrc, destroyGame, resetHandoff, worldSelectionBackdropSrc]);

  useEffect(() => {
    if (!hasJoinedFlowStarted || shouldGuardPortraitGameplay) {
      resetMovementInput();
    }
  }, [hasJoinedFlowStarted, shouldGuardPortraitGameplay]);

  useEffect(() => {
    if (!hasJoinedFlowStarted) {
      return;
    }

    syncGameScaleToContainer();
  }, [hasJoinedFlowStarted, syncGameScaleToContainer, viewportHeight, viewportWidth]);
}
