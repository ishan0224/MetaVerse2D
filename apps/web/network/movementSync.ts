import type { InputState } from '@metaverse2d/shared/types/InputState';

import { sendInput } from '@/network/socket/socketClient';

const DEFAULT_SYNC_INTERVAL_MS = 75;
const VECTOR_CHANGE_EPSILON = 0.08;
const MAX_REPLAY_HISTORY_MS = 400;
const MAX_REPLAY_HISTORY_ENTRIES = 64;

export type SentInputCommand = {
  seq: number;
  input: InputState;
  deltaMs: number;
  sentAtMs: number;
};

export class MovementSyncEmitter {
  private readonly syncIntervalMs: number;
  private pendingInput: InputState | null = null;
  private lastSentInput: InputState | null = null;
  private accumulatedDeltaMs = 0;
  private lastSentAtMs = 0;
  private nextInputSeq = 1;
  private readonly sentInputHistory: SentInputCommand[] = [];

  public constructor(syncIntervalMs: number = DEFAULT_SYNC_INTERVAL_MS) {
    this.syncIntervalMs = Math.max(50, syncIntervalMs);
  }

  public pushInput(input: InputState, deltaMs: number): void {
    const normalizedInput = sanitizeInputState(input);
    const safeDeltaMs = Math.max(0, deltaMs);
    this.pendingInput = normalizedInput;
    this.accumulatedDeltaMs += safeDeltaMs;

    const nowMs = performance.now();
    const elapsedSinceLastSend = nowMs - this.lastSentAtMs;
    const intervalElapsed = elapsedSinceLastSend >= this.syncIntervalMs;
    const becameIdle = isMoving(this.lastSentInput) && !isMoving(normalizedInput);
    const currentlyMoving = isMoving(normalizedInput);
    const inputChanged = hasMeaningfulInputChange(this.lastSentInput, normalizedInput);
    const hasNoPreviousEmit = this.lastSentInput === null;

    if (!intervalElapsed && !becameIdle) {
      return;
    }

    if (!this.pendingInput) {
      return;
    }

    if (!currentlyMoving && !isMoving(this.lastSentInput) && !becameIdle) {
      this.pendingInput = null;
      this.accumulatedDeltaMs = 0;
      return;
    }

    const shouldSend =
      hasNoPreviousEmit || becameIdle || (intervalElapsed && (currentlyMoving || inputChanged));
    if (!shouldSend) {
      return;
    }

    const inputSeq = this.nextInputSeq;
    this.nextInputSeq += 1;
    const sentAtMs = nowMs;
    sendInput(normalizedInput, this.accumulatedDeltaMs, inputSeq);
    this.sentInputHistory.push({
      seq: inputSeq,
      input: { ...normalizedInput },
      deltaMs: this.accumulatedDeltaMs,
      sentAtMs,
    });
    this.pruneReplayHistory(sentAtMs);

    this.lastSentInput = normalizedInput;
    this.pendingInput = null;
    this.accumulatedDeltaMs = 0;
    this.lastSentAtMs = nowMs;
  }

  public getPendingReplayCommands(lastProcessedInputSeq: number | null | undefined): SentInputCommand[] {
    this.pruneReplayHistory(performance.now());

    const acknowledgedSeq = normalizeAcknowledgedSeq(lastProcessedInputSeq);
    return this.sentInputHistory
      .filter((command) => command.seq > acknowledgedSeq)
      .map((command) => ({
        seq: command.seq,
        input: { ...command.input },
        deltaMs: command.deltaMs,
        sentAtMs: command.sentAtMs,
      }));
  }

  public acknowledgeProcessedInput(lastProcessedInputSeq: number | null | undefined): void {
    const acknowledgedSeq = normalizeAcknowledgedSeq(lastProcessedInputSeq);
    if (acknowledgedSeq <= 0 || this.sentInputHistory.length === 0) {
      return;
    }

    while (this.sentInputHistory.length > 0 && this.sentInputHistory[0].seq <= acknowledgedSeq) {
      this.sentInputHistory.shift();
    }
  }

  public reset(): void {
    this.pendingInput = null;
    this.lastSentInput = null;
    this.accumulatedDeltaMs = 0;
    this.lastSentAtMs = 0;
    this.nextInputSeq = 1;
    this.sentInputHistory.length = 0;
  }

  private pruneReplayHistory(nowMs: number): void {
    while (this.sentInputHistory.length > MAX_REPLAY_HISTORY_ENTRIES) {
      this.sentInputHistory.shift();
    }

    while (
      this.sentInputHistory.length > 0 &&
      nowMs - this.sentInputHistory[0].sentAtMs > MAX_REPLAY_HISTORY_MS
    ) {
      this.sentInputHistory.shift();
    }
  }
}

function sanitizeInputState(input: InputState): InputState {
  return {
    up: Boolean(input.up),
    down: Boolean(input.down),
    left: Boolean(input.left),
    right: Boolean(input.right),
    moveX: clampAxis(input.moveX ?? 0),
    moveY: clampAxis(input.moveY ?? 0),
  };
}

function hasMeaningfulInputChange(previous: InputState | null, next: InputState): boolean {
  if (!previous) {
    return true;
  }

  if (
    previous.up !== next.up ||
    previous.down !== next.down ||
    previous.left !== next.left ||
    previous.right !== next.right
  ) {
    return true;
  }

  return (
    Math.abs((previous.moveX ?? 0) - (next.moveX ?? 0)) >= VECTOR_CHANGE_EPSILON ||
    Math.abs((previous.moveY ?? 0) - (next.moveY ?? 0)) >= VECTOR_CHANGE_EPSILON
  );
}

function isMoving(input: InputState | null): boolean {
  if (!input) {
    return false;
  }

  if (input.up || input.down || input.left || input.right) {
    return true;
  }

  return Math.hypot(input.moveX ?? 0, input.moveY ?? 0) > 0.001;
}

function clampAxis(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(-1, Math.min(1, value));
}

function normalizeAcknowledgedSeq(lastProcessedInputSeq: number | null | undefined): number {
  if (
    typeof lastProcessedInputSeq !== 'number' ||
    !Number.isFinite(lastProcessedInputSeq) ||
    !Number.isInteger(lastProcessedInputSeq)
  ) {
    return 0;
  }

  return Math.max(0, lastProcessedInputSeq);
}
