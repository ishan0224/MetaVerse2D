export type VoiceBubblePerspective = 'LOCAL_SELF' | 'REMOTE_OTHER';

export type DeriveVoiceBubbleVisibilityInput = {
  perspective: VoiceBubblePerspective;
  nowMs: number;
  hasAudioStream: boolean;
  hasSignal: boolean;
  signalHoldMs: number;
  lastSignalAtMs: number | null;
  micGateOpen: boolean;
  inProximity: boolean;
};

export type DerivedVoiceBubbleVisibility = {
  visible: boolean;
  isTransmitting: boolean;
  nextLastSignalAtMs: number | null;
};

export function deriveVoiceBubbleVisibility(
  input: DeriveVoiceBubbleVisibilityInput,
): DerivedVoiceBubbleVisibility {
  let nextLastSignalAtMs = input.lastSignalAtMs;

  if (!input.hasAudioStream) {
    nextLastSignalAtMs = null;
  }

  if (input.perspective === 'LOCAL_SELF' && !input.micGateOpen) {
    nextLastSignalAtMs = null;
  }

  if (input.perspective === 'REMOTE_OTHER' && !input.inProximity) {
    nextLastSignalAtMs = null;
  }

  const canCaptureSignal =
    input.hasAudioStream &&
    (input.perspective === 'LOCAL_SELF' ? input.micGateOpen : input.inProximity);
  if (canCaptureSignal && input.hasSignal) {
    nextLastSignalAtMs = input.nowMs;
  }

  const hasRecentSignal =
    nextLastSignalAtMs !== null && input.nowMs - nextLastSignalAtMs <= input.signalHoldMs;
  const isTransmitting = canCaptureSignal && hasRecentSignal;
  const visible =
    input.perspective === 'LOCAL_SELF'
      ? input.micGateOpen && isTransmitting
      : input.inProximity && isTransmitting;

  return {
    visible,
    isTransmitting,
    nextLastSignalAtMs,
  };
}
