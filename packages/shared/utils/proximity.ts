type ProximityPlayer = {
  id: string;
  x: number;
  y: number;
};

export type NearbyPlayersMap = Record<string, string[]>;

export function computeNearbyPlayers(
  players: ProximityPlayer[],
  threshold: number,
  options?: {
    exitThreshold?: number;
    previousProximity?: NearbyPlayersMap;
  },
): NearbyPlayersMap {
  const exitThreshold = options?.exitThreshold ?? threshold;
  const previousProximity = options?.previousProximity ?? {};
  const orderedPlayers = [...players].sort((left, right) => left.id.localeCompare(right.id));
  const nearbyByPlayer = new Map<string, Set<string>>();

  for (const player of orderedPlayers) {
    nearbyByPlayer.set(player.id, new Set<string>());
  }

  for (let index = 0; index < orderedPlayers.length; index += 1) {
    const currentPlayer = orderedPlayers[index];

    for (let nextIndex = index + 1; nextIndex < orderedPlayers.length; nextIndex += 1) {
      const otherPlayer = orderedPlayers[nextIndex];
      const distance = Math.hypot(currentPlayer.x - otherPlayer.x, currentPlayer.y - otherPlayer.y);

      const wasNearby =
        previousProximity[currentPlayer.id]?.includes(otherPlayer.id) ?? false;
      const activeThreshold = wasNearby ? exitThreshold : threshold;

      if (distance > activeThreshold) {
        continue;
      }

      nearbyByPlayer.get(currentPlayer.id)?.add(otherPlayer.id);
      nearbyByPlayer.get(otherPlayer.id)?.add(currentPlayer.id);
    }
  }

  const result: NearbyPlayersMap = {};
  for (const player of orderedPlayers) {
    result[player.id] = Array.from(nearbyByPlayer.get(player.id) ?? []).sort((left, right) =>
      left.localeCompare(right),
    );
  }

  return result;
}
