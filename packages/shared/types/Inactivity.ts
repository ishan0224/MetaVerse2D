export const IDLE_TIMEOUT_MS = 2 * 60 * 1000;
export const WARNING_TIMEOUT_MS = 4 * 60 * 1000;
export const KICK_TIMEOUT_MS = 5 * 60 * 1000;
export const WARNING_COUNTDOWN_S = 60;
export const ACTIVITY_CHECK_INTERVAL_MS = 5000;

export const INACTIVITY_ACTIVITY_EVENT = 'inactivity:activity';
export const INACTIVITY_PHASE_EVENT = 'inactivity:phase';
export const INACTIVITY_KICK_REQUEST_EVENT = 'inactivity:kick-request';

export type InactivityPhase = 0 | 1 | 2 | 3;

export type InactivityActivitySource =
  | 'movement'
  | 'chat'
  | 'ptt'
  | 'canvas-click'
  | 'world-interaction'
  | 'manual-presence';

export type InactivityActivityPayload = {
  source: InactivityActivitySource;
  at: number;
};

export type InactivityPhasePayload = {
  phase: InactivityPhase;
  lastMovedAt: number;
};

export type InactivityKickRequestPayload = {
  reason: 'timeout' | 'leave';
  requestedAt: number;
};
