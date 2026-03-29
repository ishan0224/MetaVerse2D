import { VOICE_CONFIG } from '@/game/config/voiceConfig';
import { getVoiceControlState, type VoiceMode } from '@/game/systems/voiceControlStore';

type ProximityVoiceAdapter = {
  createConnection: (targetId: string) => Promise<void>;
  hasActiveConnection: (targetId: string) => boolean;
  closeConnection: (targetId: string) => void;
  setPeerVolume: (targetId: string, volume: number) => void;
  setPeerMuted: (targetId: string, muted: boolean) => void;
  setLocalMicEnabled: (enabled: boolean) => void;
  setLocalCameraEnabled: (enabled: boolean) => void;
};

type Position2D = {
  x: number;
  y: number;
};

type RemoteVoicePlayer = {
  id: string;
  x: number;
  y: number;
};

type ProximityVoiceSystemOptions = {
  adapter: ProximityVoiceAdapter;
  disconnectDebounceMs?: number;
  maxAudibleDistance?: number;
  minVolume?: number;
  volumeSmoothingFactor?: number;
  volumeCurveExponent?: number;
};

type ProximityVoiceUpdateInput = {
  localPlayerId: string | null;
  localPlayerPosition: Position2D | null;
  nearbyPlayerIds: string[];
  remotePlayers: RemoteVoicePlayer[];
};

const DEFAULT_DISCONNECT_DEBOUNCE_MS = 1500;
const RECONNECT_RETRY_COOLDOWN_MS = 1200;

export class ProximityVoiceSystem {
  private readonly adapter: ProximityVoiceAdapter;
  private readonly disconnectDebounceMs: number;
  private readonly maxAudibleDistance: number;
  private readonly minVolume: number;
  private readonly volumeSmoothingFactor: number;
  private readonly volumeCurveExponent: number;
  private nearbySet = new Set<string>();
  private readonly activeConnections = new Set<string>();
  private readonly disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly reconnectRetryAtByPeer = new Map<string, number>();
  private readonly currentVolumeByPeer = new Map<string, number>();
  private mutedByPeer: Record<string, boolean> = {};
  private localPlayerId: string | null = null;
  private micEnabled = false;
  private cameraEnabled = false;

  public constructor(options: ProximityVoiceSystemOptions) {
    this.adapter = options.adapter;
    this.disconnectDebounceMs = options.disconnectDebounceMs ?? DEFAULT_DISCONNECT_DEBOUNCE_MS;
    this.maxAudibleDistance = options.maxAudibleDistance ?? VOICE_CONFIG.maxAudibleDistance;
    this.minVolume = clamp(options.minVolume ?? VOICE_CONFIG.minVolume, 0, 1);
    this.volumeSmoothingFactor = clamp(
      options.volumeSmoothingFactor ?? VOICE_CONFIG.volumeSmoothingFactor,
      0,
      1,
    );
    this.volumeCurveExponent = Math.max(options.volumeCurveExponent ?? VOICE_CONFIG.volumeCurveExponent, 0.1);
    this.adapter.setLocalMicEnabled(false);
  }

  public update({
    localPlayerId,
    localPlayerPosition,
    nearbyPlayerIds,
    remotePlayers,
  }: ProximityVoiceUpdateInput): void {
    const voiceState = getVoiceControlState();
    const shouldEnableMic = resolveMicEnabled(voiceState.mode, voiceState);
    if (shouldEnableMic !== this.micEnabled) {
      this.adapter.setLocalMicEnabled(shouldEnableMic);
      this.micEnabled = shouldEnableMic;
    }

    if (!localPlayerId) {
      this.resetConnections();
      this.localPlayerId = null;
      return;
    }

    if (this.localPlayerId && this.localPlayerId !== localPlayerId) {
      this.resetConnections();
    }
    this.localPlayerId = localPlayerId;

    const nextNearbySet = new Set(
      nearbyPlayerIds
        .map((playerId) => playerId.trim())
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right)),
    );

    for (const playerId of nextNearbySet) {
      const disconnectTimer = this.disconnectTimers.get(playerId);
      if (disconnectTimer) {
        clearTimeout(disconnectTimer);
        this.disconnectTimers.delete(playerId);
      }

      if (this.activeConnections.has(playerId)) {
        this.reconnectRetryAtByPeer.delete(playerId);
        continue;
      }

      this.activeConnections.add(playerId);
      if (shouldInitiateConnection(localPlayerId, playerId)) {
        void this.adapter.createConnection(playerId).catch(() => {
          this.activeConnections.delete(playerId);
          this.reconnectRetryAtByPeer.set(playerId, Date.now() + RECONNECT_RETRY_COOLDOWN_MS);
        });
      }
    }

    for (const playerId of nextNearbySet) {
      if (!this.activeConnections.has(playerId)) {
        continue;
      }

      if (!shouldInitiateConnection(localPlayerId, playerId)) {
        this.reconnectRetryAtByPeer.delete(playerId);
        continue;
      }

      if (this.adapter.hasActiveConnection(playerId)) {
        this.reconnectRetryAtByPeer.delete(playerId);
        continue;
      }

      const nowMs = Date.now();
      const retryAt = this.reconnectRetryAtByPeer.get(playerId) ?? 0;
      if (nowMs < retryAt) {
        continue;
      }

      this.reconnectRetryAtByPeer.set(playerId, nowMs + RECONNECT_RETRY_COOLDOWN_MS);
      void this.adapter.createConnection(playerId).catch(() => {
        return;
      });
    }

    for (const playerId of this.activeConnections) {
      if (nextNearbySet.has(playerId) || this.disconnectTimers.has(playerId)) {
        continue;
      }

      const disconnectTimer = setTimeout(() => {
        this.disconnectTimers.delete(playerId);
        if (this.nearbySet.has(playerId)) {
          return;
        }

        this.adapter.closeConnection(playerId);
        this.activeConnections.delete(playerId);
        this.reconnectRetryAtByPeer.delete(playerId);
      }, this.disconnectDebounceMs);

      this.disconnectTimers.set(playerId, disconnectTimer);
    }

    this.nearbySet = nextNearbySet;
    const shouldEnableCamera = voiceState.cameraEnabled;
    if (shouldEnableCamera !== this.cameraEnabled) {
      this.adapter.setLocalCameraEnabled(shouldEnableCamera);
      this.cameraEnabled = shouldEnableCamera;
    }

    this.applyRemoteVoiceState(localPlayerPosition, remotePlayers, voiceState.mutedRemotePlayerIds);
  }

  public destroy(): void {
    this.adapter.setLocalMicEnabled(false);
    this.micEnabled = false;
    this.adapter.setLocalCameraEnabled(false);
    this.cameraEnabled = false;
    this.localPlayerId = null;
    this.resetConnections();
  }

  private resetConnections(): void {
    for (const disconnectTimer of this.disconnectTimers.values()) {
      clearTimeout(disconnectTimer);
    }
    this.disconnectTimers.clear();

    for (const playerId of Array.from(this.activeConnections)) {
      this.adapter.closeConnection(playerId);
    }
    this.activeConnections.clear();
    this.reconnectRetryAtByPeer.clear();
    this.currentVolumeByPeer.clear();
    this.mutedByPeer = {};
    this.nearbySet.clear();
  }

  private applyRemoteVoiceState(
    localPlayerPosition: Position2D | null,
    remotePlayers: RemoteVoicePlayer[],
    mutedRemotePlayerIds: Record<string, boolean>,
  ): void {
    const remotePlayerById = new Map<string, RemoteVoicePlayer>(
      remotePlayers.map((player) => [player.id, player]),
    );

    for (const [playerId, muted] of Object.entries(mutedRemotePlayerIds)) {
      const currentMuted = Boolean(this.mutedByPeer[playerId]);
      if (currentMuted === muted) {
        continue;
      }

      this.adapter.setPeerMuted(playerId, muted);
    }
    this.mutedByPeer = { ...mutedRemotePlayerIds };

    for (const playerId of this.activeConnections) {
      const targetVolume = this.getTargetVolume(playerId, localPlayerPosition, remotePlayerById);
      const previousVolume = this.currentVolumeByPeer.get(playerId) ?? 1;
      const smoothedVolume =
        previousVolume + (targetVolume - previousVolume) * this.volumeSmoothingFactor;
      const clampedVolume = clamp(smoothedVolume, 0, 1);
      if (Math.abs(clampedVolume - previousVolume) < 0.01) {
        continue;
      }

      this.adapter.setPeerVolume(playerId, clampedVolume);
      this.currentVolumeByPeer.set(playerId, clampedVolume);
    }
  }

  private getTargetVolume(
    playerId: string,
    localPlayerPosition: Position2D | null,
    remotePlayerById: Map<string, RemoteVoicePlayer>,
  ): number {
    const remotePlayer = remotePlayerById.get(playerId);
    if (!localPlayerPosition || !remotePlayer) {
      return this.minVolume;
    }

    const distance = Math.hypot(
      localPlayerPosition.x - remotePlayer.x,
      localPlayerPosition.y - remotePlayer.y,
    );
    const normalized = clamp(1 - distance / this.maxAudibleDistance, 0, 1);
    const curved = Math.pow(normalized, this.volumeCurveExponent);
    return this.minVolume + (1 - this.minVolume) * curved;
  }
}

function shouldInitiateConnection(localPlayerId: string, targetPlayerId: string): boolean {
  return localPlayerId.localeCompare(targetPlayerId) < 0;
}

function resolveMicEnabled(
  mode: VoiceMode,
  voiceState: ReturnType<typeof getVoiceControlState>,
): boolean {
  if (mode === 'MUTED') {
    return false;
  }

  if (mode === 'ALWAYS_ON') {
    return true;
  }

  return voiceState.keyboardPushToTalkPressed || voiceState.uiPushToTalkPressed;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
