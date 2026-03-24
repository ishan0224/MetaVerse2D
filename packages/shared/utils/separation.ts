export type CollidablePlayer = {
  id: string;
  x: number;
  y: number;
};

type SeparationConfig = {
  minDistance?: number;
  maxPushPerUpdate?: number;
};

const DEFAULT_MIN_DISTANCE = 30;
const DEFAULT_MAX_PUSH = 2.5;

function createStableOrder<T extends CollidablePlayer>(players: T[]): T[] {
  return [...players].sort((left, right) => left.id.localeCompare(right.id));
}

export function resolvePlayerCollisions<T extends CollidablePlayer>(
  players: T[],
  config: SeparationConfig = {},
): T[] {
  const minDistance = config.minDistance ?? DEFAULT_MIN_DISTANCE;
  const maxPushPerUpdate = config.maxPushPerUpdate ?? DEFAULT_MAX_PUSH;
  const orderedPlayers = createStableOrder(players).map((player) => ({ ...player }));

  for (let i = 0; i < orderedPlayers.length; i += 1) {
    for (let j = i + 1; j < orderedPlayers.length; j += 1) {
      const first = orderedPlayers[i];
      const second = orderedPlayers[j];

      const deltaX = second.x - first.x;
      const deltaY = second.y - first.y;
      const rawDistance = Math.hypot(deltaX, deltaY);

      let directionX = deltaX;
      let directionY = deltaY;
      let distance = rawDistance;

      if (distance === 0) {
        directionX = first.id.localeCompare(second.id) <= 0 ? 1 : -1;
        directionY = 0;
        distance = 1;
      }

      if (distance >= minDistance) {
        continue;
      }

      const overlap = minDistance - distance;
      const pushAmount = Math.min(overlap / 2, maxPushPerUpdate);
      const normalizedX = directionX / distance;
      const normalizedY = directionY / distance;

      first.x -= normalizedX * pushAmount;
      first.y -= normalizedY * pushAmount;
      second.x += normalizedX * pushAmount;
      second.y += normalizedY * pushAmount;
    }
  }

  return orderedPlayers;
}
