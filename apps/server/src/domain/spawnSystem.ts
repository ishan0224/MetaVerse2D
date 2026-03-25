import type { Player } from '@metaverse2d/shared';

import { WORLD_BOUNDS } from './worldConfig';

type Position2D = {
  x: number;
  y: number;
};

const SPAWN_PADDING = 64;
const SPAWN_STEP = 48;
const MIN_SPAWN_DISTANCE = 30;
const MAX_SPAWN_CANDIDATE_CHECKS = 400;

export function getSpawnPositionForRoom(playersInRoom: Player[]): Position2D {
  const initialIndex = playersInRoom.length;

  for (let offset = 0; offset < MAX_SPAWN_CANDIDATE_CHECKS; offset += 1) {
    const candidate = getSpawnCandidate(initialIndex + offset);
    if (hasSafeDistance(candidate, playersInRoom)) {
      return candidate;
    }
  }

  return getSpawnCandidate(initialIndex);
}

function getSpawnCandidate(index: number): Position2D {
  const usableWidth = WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX - SPAWN_PADDING * 2;
  const columns = Math.max(1, Math.floor(usableWidth / SPAWN_STEP));
  const column = index % columns;
  const row = Math.floor(index / columns);

  const x = WORLD_BOUNDS.minX + SPAWN_PADDING + column * SPAWN_STEP;
  const y = WORLD_BOUNDS.minY + SPAWN_PADDING + row * SPAWN_STEP;

  return {
    x: clamp(x, WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX),
    y: clamp(y, WORLD_BOUNDS.minY, WORLD_BOUNDS.maxY),
  };
}

function hasSafeDistance(candidate: Position2D, playersInRoom: Player[]): boolean {
  return playersInRoom.every((player) => Math.hypot(candidate.x - player.x, candidate.y - player.y) >= MIN_SPAWN_DISTANCE);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
