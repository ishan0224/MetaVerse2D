type ProximityVoiceAdapter = {
  createConnection: (targetId: string) => Promise<void>;
  closeConnection: (targetId: string) => void;
};

type ProximityVoiceSystemOptions = {
  adapter: ProximityVoiceAdapter;
  disconnectDebounceMs?: number;
};

const DEFAULT_DISCONNECT_DEBOUNCE_MS = 300;

export class ProximityVoiceSystem {
  private readonly adapter: ProximityVoiceAdapter;
  private readonly disconnectDebounceMs: number;
  private nearbySet = new Set<string>();
  private readonly activeConnections = new Set<string>();
  private readonly disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

  public constructor(options: ProximityVoiceSystemOptions) {
    this.adapter = options.adapter;
    this.disconnectDebounceMs = options.disconnectDebounceMs ?? DEFAULT_DISCONNECT_DEBOUNCE_MS;
  }

  public update(localPlayerId: string | null, nearbyPlayerIds: string[]): void {
    if (!localPlayerId) {
      return;
    }

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
        continue;
      }

      this.activeConnections.add(playerId);
      if (shouldInitiateConnection(localPlayerId, playerId)) {
        void this.adapter.createConnection(playerId).catch(() => {
          this.activeConnections.delete(playerId);
        });
      }
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
      }, this.disconnectDebounceMs);

      this.disconnectTimers.set(playerId, disconnectTimer);
    }

    this.nearbySet = nextNearbySet;
  }

  public destroy(): void {
    for (const disconnectTimer of this.disconnectTimers.values()) {
      clearTimeout(disconnectTimer);
    }
    this.disconnectTimers.clear();

    for (const playerId of this.activeConnections) {
      this.adapter.closeConnection(playerId);
    }
    this.activeConnections.clear();
    this.nearbySet.clear();
  }
}

function shouldInitiateConnection(localPlayerId: string, targetPlayerId: string): boolean {
  return localPlayerId.localeCompare(targetPlayerId) < 0;
}
