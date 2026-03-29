import { computeNearbyPlayers, type NearbyPlayersMap, type Player } from '@metaverse2d/shared';

const DEFAULT_PROXIMITY_ENTER_THRESHOLD = 200;
const DEFAULT_PROXIMITY_EXIT_THRESHOLD = 250;

export class ProximitySystem {
  private readonly roomProximity = new Map<string, NearbyPlayersMap>();

  public updateRoom(
    roomId: string,
    players: Player[],
    enterThreshold = DEFAULT_PROXIMITY_ENTER_THRESHOLD,
    exitThreshold = DEFAULT_PROXIMITY_EXIT_THRESHOLD,
  ): NearbyPlayersMap {
    const previousProximity = this.roomProximity.get(roomId) ?? {};
    const proximity = computeNearbyPlayers(players, enterThreshold, {
      exitThreshold,
      previousProximity,
    });
    if (players.length === 0) {
      this.roomProximity.delete(roomId);
      return proximity;
    }

    this.roomProximity.set(roomId, proximity);
    return proximity;
  }

  public getRoomProximity(roomId: string): NearbyPlayersMap {
    return this.roomProximity.get(roomId) ?? {};
  }
}
