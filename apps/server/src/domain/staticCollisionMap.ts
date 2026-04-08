/** @module apps/server/src/domain/staticCollisionMap.ts */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { buildStaticCollisionIndexFromTilemap, type StaticCollisionIndex, type TilemapData } from '@metaverse2d/shared';

const TILEMAP_FILE_NAME = 'FullMap16x16.normalized.tmj';
const TILEMAP_RELATIVE_DIRECTORY = path.join('tilemaps', 'fullmap16x16');

const moduleDirectory = __dirname;
const mapPathFromModule = path.resolve(
  moduleDirectory,
  '../../../web/public',
  TILEMAP_RELATIVE_DIRECTORY,
  TILEMAP_FILE_NAME,
);

const mapPathFromRepoRootCwd = path.resolve(
  process.cwd(),
  'apps',
  'web',
  'public',
  TILEMAP_RELATIVE_DIRECTORY,
  TILEMAP_FILE_NAME,
);

const mapPathFromServerCwd = path.resolve(
  process.cwd(),
  '..',
  'web',
  'public',
  TILEMAP_RELATIVE_DIRECTORY,
  TILEMAP_FILE_NAME,
);

const mapPathCandidates = [mapPathFromModule, mapPathFromRepoRootCwd, mapPathFromServerCwd];

export const STATIC_COLLISION_INDEX = loadStaticCollisionIndex();

function loadStaticCollisionIndex(): StaticCollisionIndex {
  const tilemapPath = resolveTilemapPath();
  const tilemapRaw = readFileSync(tilemapPath, 'utf8');
  const tilemapData = JSON.parse(tilemapRaw) as TilemapData;
  return buildStaticCollisionIndexFromTilemap(tilemapData);
}

function resolveTilemapPath(): string {
  for (const candidatePath of mapPathCandidates) {
    if (existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  throw new Error(
    `Unable to locate normalized tilemap for server collision map. Checked: ${mapPathCandidates.join(', ')}`,
  );
}
