/** @module apps/server/src/domain/spawnSystem.ts */

import type { Player } from '@metaverse2d/shared';

import { WORLD_BOUNDS } from './worldConfig';

type Position2D = {
  x: number;
  y: number;
};

type RoomSpawnRegion = {
  roomId: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

const ROOM_SPLIT_X = (WORLD_BOUNDS.minX + WORLD_BOUNDS.maxX) / 2;
const ROOM_SPLIT_Y = (WORLD_BOUNDS.minY + WORLD_BOUNDS.maxY) / 2;
const CENTER_SEARCH_STEP = 48;
const MAX_CENTER_SEARCH_RADIUS = 480;
const MIN_SPAWN_DISTANCE = 30;
const ROOM_SPAWN_REGIONS: readonly RoomSpawnRegion[] = [
  {
    roomId: '1',
    minX: WORLD_BOUNDS.minX,
    maxX: ROOM_SPLIT_X,
    minY: WORLD_BOUNDS.minY,
    maxY: ROOM_SPLIT_Y,
  },
  {
    roomId: '2',
    minX: ROOM_SPLIT_X,
    maxX: WORLD_BOUNDS.maxX,
    minY: WORLD_BOUNDS.minY,
    maxY: ROOM_SPLIT_Y,
  },
  {
    roomId: '3',
    minX: WORLD_BOUNDS.minX,
    maxX: ROOM_SPLIT_X,
    minY: ROOM_SPLIT_Y,
    maxY: WORLD_BOUNDS.maxY,
  },
  {
    roomId: '4',
    minX: ROOM_SPLIT_X,
    maxX: WORLD_BOUNDS.maxX,
    minY: ROOM_SPLIT_Y,
    maxY: WORLD_BOUNDS.maxY,
  },
] as const;

export function getRandomRoomId(): string {
  const roomIndex = Math.floor(Math.random() * ROOM_SPAWN_REGIONS.length);
  return ROOM_SPAWN_REGIONS[roomIndex]?.roomId ?? ROOM_SPAWN_REGIONS[0].roomId;
}

export function getSpawnPositionForRoom(roomId: string, playersInRoom: Player[]): Position2D {
  const region = getRoomRegion(roomId);
  const centerCandidate = getRoomCenter(region);
  if (hasSafeDistance(centerCandidate, playersInRoom)) {
    return centerCandidate;
  }

  for (
    let radius = CENTER_SEARCH_STEP;
    radius <= MAX_CENTER_SEARCH_RADIUS;
    radius += CENTER_SEARCH_STEP
  ) {
    for (const candidate of getSideFirstRingCandidates(centerCandidate, region, radius)) {
      if (!hasSafeDistance(candidate, playersInRoom)) {
        continue;
      }

      return candidate;
    }
  }

  return centerCandidate;
}

function getRoomRegion(roomId: string): RoomSpawnRegion {
  const region = ROOM_SPAWN_REGIONS.find((entry) => entry.roomId === roomId);
  return region ?? ROOM_SPAWN_REGIONS[0];
}

function getRoomCenter(region: RoomSpawnRegion): Position2D {
  return {
    x: Math.round((region.minX + region.maxX) / 2),
    y: Math.round((region.minY + region.maxY) / 2),
  };
}

function getSideFirstRingCandidates(
  center: Position2D,
  region: RoomSpawnRegion,
  radius: number,
): Position2D[] {
  const ringCandidates: Position2D[] = [];
  const sideOffsets: Position2D[] = [
    { x: -radius, y: 0 },
    { x: radius, y: 0 },
    { x: 0, y: radius },
    { x: 0, y: -radius },
    { x: -radius, y: radius },
    { x: radius, y: radius },
    { x: -radius, y: -radius },
    { x: radius, y: -radius },
  ];

  for (const offset of sideOffsets) {
    const candidate = { x: center.x + offset.x, y: center.y + offset.y };
    if (isWithinRegion(candidate, region)) {
      ringCandidates.push(candidate);
    }
  }

  for (let offset = CENTER_SEARCH_STEP; offset < radius; offset += CENTER_SEARCH_STEP) {
    const edgeCandidates: Position2D[] = [
      { x: center.x - radius, y: center.y + offset },
      { x: center.x - radius, y: center.y - offset },
      { x: center.x + radius, y: center.y + offset },
      { x: center.x + radius, y: center.y - offset },
      { x: center.x + offset, y: center.y + radius },
      { x: center.x - offset, y: center.y + radius },
      { x: center.x + offset, y: center.y -radius },
      { x: center.x - offset, y: center.y - radius },
    ];

    for (const candidate of edgeCandidates) {
      if (!isWithinRegion(candidate, region)) {
        continue;
      }

      ringCandidates.push(candidate);
    }
  }

  return ringCandidates;
}

function isWithinRegion(position: Position2D, region: RoomSpawnRegion): boolean {
  return (
    position.x >= region.minX &&
    position.x <= region.maxX &&
    position.y >= region.minY &&
    position.y <= region.maxY
  );
}

function clampToWorldBounds(position: Position2D): Position2D {
  return {
    x: clamp(position.x, WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX),
    y: clamp(position.y, WORLD_BOUNDS.minY, WORLD_BOUNDS.maxY),
  };
}

function hasSafeDistance(candidate: Position2D, playersInRoom: Player[]): boolean {
  const boundedCandidate = clampToWorldBounds(candidate);
  return playersInRoom.every(
    (player) =>
      Math.hypot(boundedCandidate.x - player.x, boundedCandidate.y - player.y) >=
      MIN_SPAWN_DISTANCE,
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
