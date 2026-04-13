import {
  ACTIVITY_CHECK_INTERVAL_MS,
  IDLE_TIMEOUT_MS,
  type InactivityActivitySource,
  type InactivityPhase,
  KICK_TIMEOUT_MS,
  WARNING_COUNTDOWN_S,
  WARNING_TIMEOUT_MS,
} from '@metaverse2d/shared';

import {
  sendInactivityActivity,
  sendInactivityKickRequest,
  sendInactivityPhase,
} from '@/network';

const ACTIVITY_BROADCAST_THROTTLE_MS = 1200;

export type InactivityUiState = {
  inactivityPhase: InactivityPhase;
  lastMovedAt: number;
  phaseOneTriggeredAt: number | null;
  warningCountdownS: number;
};

const INITIAL_STATE: InactivityUiState = {
  inactivityPhase: 0,
  lastMovedAt: Date.now(),
  phaseOneTriggeredAt: null,
  warningCountdownS: WARNING_COUNTDOWN_S,
};

let state: InactivityUiState = { ...INITIAL_STATE };
let inactivityTimerRef: ReturnType<typeof setInterval> | null = null;
let phaseTwoTimerRef: ReturnType<typeof setInterval> | null = null;
let lastActivityBroadcastAt = 0;
let kickRequested = false;
const listeners = new Set<() => void>();

export function subscribeToInactivityUiState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getInactivityUiState(): InactivityUiState {
  return state;
}

export function startInactivityMonitor(): void {
  if (!inactivityTimerRef) {
    inactivityTimerRef = setInterval(() => {
      evaluateInactivityPhase(Date.now());
    }, ACTIVITY_CHECK_INTERVAL_MS);
  }

  evaluateInactivityPhase(Date.now());
}

export function stopInactivityMonitor(): void {
  if (inactivityTimerRef) {
    clearInterval(inactivityTimerRef);
    inactivityTimerRef = null;
  }

  stopWarningCountdown();
  kickRequested = false;
  state = {
    ...INITIAL_STATE,
    lastMovedAt: Date.now(),
  };
  emit();
}

export function resetInactivityTimer(
  source: InactivityActivitySource,
  options?: {
    forceBroadcast?: boolean;
  },
): void {
  const nowMs = Date.now();
  const wasInactive = state.inactivityPhase !== 0;
  const shouldBroadcastActivity =
    options?.forceBroadcast === true || nowMs - lastActivityBroadcastAt >= ACTIVITY_BROADCAST_THROTTLE_MS;

  kickRequested = false;
  const nextState: InactivityUiState = {
    inactivityPhase: 0,
    lastMovedAt: nowMs,
    phaseOneTriggeredAt: null,
    warningCountdownS: WARNING_COUNTDOWN_S,
  };
  state = nextState;
  stopWarningCountdown();
  if (wasInactive) {
    emit();
  }

  if (shouldBroadcastActivity) {
    sendInactivityActivity({
      source,
      at: nowMs,
    });
    lastActivityBroadcastAt = nowMs;
  }

  if (wasInactive) {
    sendInactivityPhase({
      phase: 0,
      lastMovedAt: nowMs,
    });
  }
}

export function requestInactivityKick(reason: 'timeout' | 'leave'): void {
  if (kickRequested) {
    return;
  }

  kickRequested = true;
  sendInactivityKickRequest({
    reason,
    requestedAt: Date.now(),
  });
}

function evaluateInactivityPhase(nowMs: number): void {
  const elapsedMs = nowMs - state.lastMovedAt;
  let nextPhase: InactivityPhase = 0;

  if (elapsedMs >= KICK_TIMEOUT_MS) {
    nextPhase = 3;
  } else if (elapsedMs >= WARNING_TIMEOUT_MS) {
    nextPhase = 2;
  } else if (elapsedMs >= IDLE_TIMEOUT_MS) {
    nextPhase = 1;
  }

  if (nextPhase !== state.inactivityPhase) {
    applyPhaseTransition(nextPhase, nowMs);
  }

  if (nextPhase === 2) {
    updateWarningCountdown(nowMs);
    return;
  }

  if (nextPhase === 3) {
    requestInactivityKick('timeout');
  }
}

function applyPhaseTransition(nextPhase: InactivityPhase, nowMs: number): void {
  if (nextPhase === 0) {
    stopWarningCountdown();
    state = {
      ...state,
      inactivityPhase: 0,
      phaseOneTriggeredAt: null,
      warningCountdownS: WARNING_COUNTDOWN_S,
    };
    emit();
    return;
  }

  if (nextPhase === 1) {
    stopWarningCountdown();
    state = {
      ...state,
      inactivityPhase: 1,
      phaseOneTriggeredAt: state.phaseOneTriggeredAt ?? nowMs,
      warningCountdownS: WARNING_COUNTDOWN_S,
    };
    emit();
    sendInactivityPhase({
      phase: 1,
      lastMovedAt: state.lastMovedAt,
    });
    return;
  }

  if (nextPhase === 2) {
    state = {
      ...state,
      inactivityPhase: 2,
    };
    emit();
    sendInactivityPhase({
      phase: 2,
      lastMovedAt: state.lastMovedAt,
    });
    startWarningCountdown();
    return;
  }

  state = {
    ...state,
    inactivityPhase: 3,
    warningCountdownS: 0,
  };
  stopWarningCountdown();
  emit();
}

function startWarningCountdown(): void {
  if (phaseTwoTimerRef) {
    return;
  }

  phaseTwoTimerRef = setInterval(() => {
    updateWarningCountdown(Date.now());
  }, 1000);
  updateWarningCountdown(Date.now());
}

function stopWarningCountdown(): void {
  if (!phaseTwoTimerRef) {
    return;
  }

  clearInterval(phaseTwoTimerRef);
  phaseTwoTimerRef = null;
}

function updateWarningCountdown(nowMs: number): void {
  const kickAtMs = state.lastMovedAt + KICK_TIMEOUT_MS;
  const remainingSeconds = Math.max(0, Math.ceil((kickAtMs - nowMs) / 1000));
  if (remainingSeconds === state.warningCountdownS) {
    return;
  }

  state = {
    ...state,
    warningCountdownS: remainingSeconds,
  };
  emit();

  if (remainingSeconds <= 0) {
    requestInactivityKick('timeout');
  }
}

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}
