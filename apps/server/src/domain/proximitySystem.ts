import { computeNearbyPlayers, type NearbyPlayersMap, type Player } from '@metaverse2d/shared';

const DEFAULT_PROXIMITY_THRESHOLD = 220;

export class ProximitySystem {
  private readonly roomProximity = new Map<string, NearbyPlayersMap>();

  public updateRoom(roomId: string, players: Player[], threshold = DEFAULT_PROXIMITY_THRESHOLD): NearbyPlayersMap {
    const proximity = computeNearbyPlayers(players, threshold);
    this.roomProximity.set(roomId, proximity);
    return proximity;
  }

  public getRoomProximity(roomId: string): NearbyPlayersMap {
    return this.roomProximity.get(roomId) ?? {};
  }
}
