type Position2D = {
  x: number;
  y: number;
};

export type StaticCollider = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AxisAlignedBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type TilemapProperty = {
  name?: string;
  value?: unknown;
};

type TilemapLayerBase = {
  type?: string;
  name?: string;
  properties?: TilemapProperty[] | null;
  visible?: boolean;
};

export type TilemapTileLayer = TilemapLayerBase & {
  type: 'tilelayer';
  width: number;
  height: number;
  data: number[];
};

export type TilemapObject = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  visible?: boolean;
  gid?: number;
  ellipse?: boolean;
  polygon?: Array<{ x: number; y: number }>;
  polyline?: Array<{ x: number; y: number }>;
  properties?: TilemapProperty[] | null;
};

export type TilemapObjectLayer = TilemapLayerBase & {
  type: 'objectgroup';
  objects: TilemapObject[];
};

export type TilemapData = {
  tilewidth: number;
  tileheight: number;
  layers: TilemapLayerBase[];
  tilesets?: TilemapTileset[];
};

export type StaticCollisionIndex = {
  cellSize: number;
  colliders: StaticCollider[];
  cells: Map<string, number[]>;
};

export type CollisionExtractionOptions = {
  collidableLayerNames?: string[];
  collidableTilesetNames?: string[];
  cellSize?: number;
};

type ResolveStaticCollisionsParams = {
  currentPosition: Position2D;
  intendedPosition: Position2D;
  playerSize: number;
  collisionIndex: StaticCollisionIndex | null;
};

type PositionCollisionParams = {
  position: Position2D;
  playerSize: number;
  collisionIndex: StaticCollisionIndex | null;
};

const DEFAULT_CELL_SIZE = 64;
const GID_MASK = 0x1fffffff;
const EPSILON = 0.0001;
const COLLIDABLE_PROPERTY_NAMES = ['collides', 'collision', 'blocked', 'obstacle'] as const;
const COLLIDABLE_PROPERTY_SET = new Set<string>(COLLIDABLE_PROPERTY_NAMES);
const DEFAULT_COLLIDABLE_LAYER_NAMES = [
  'wall',
  'walls',
  'object',
  'objects',
  'obstacle',
  'obstacles',
  'collision',
  'collisions',
  'blocked',
  'furniture',
] as const;
const DEFAULT_COLLIDABLE_TILESET_NAMES = [
  'wall',
  'walls',
  'obstacle',
  'obstacles',
  'collision',
  'collisions',
  'blocked',
  'furniture',
  'bookcase',
  'bookcases',
] as const;
const DECORATIVE_LAYER_NAMES = ['object', 'objects', 'decor', 'decoration', 'deco', 'prop', 'props'] as const;
const DECORATIVE_TILESET_NAMES = ['floor', 'floors', 'carpet', 'rug', 'mat'] as const;

type TilemapTilesetTile = {
  id?: number;
  properties?: TilemapProperty[] | null;
};

type TilemapTileset = {
  firstgid: number;
  name?: string;
  tilecount?: number;
  tiles?: TilemapTilesetTile[];
};

type TilesetLookupEntry = {
  firstGid: number;
  lastGid: number;
  normalizedName: string;
  nameTokens: string[];
  collidableByName: boolean;
  collidableTileIds: Set<number>;
};

export function buildStaticCollidersFromTilemap(
  tilemapData: TilemapData,
  options: CollisionExtractionOptions = {},
): StaticCollider[] {
  const tileWidth = Math.max(1, Math.floor(tilemapData.tilewidth));
  const tileHeight = Math.max(1, Math.floor(tilemapData.tileheight));
  const collidableLayerNames = new Set(
    [...DEFAULT_COLLIDABLE_LAYER_NAMES, ...(options.collidableLayerNames ?? [])]
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean),
  );
  const collidableTilesetNames = new Set(
    [...DEFAULT_COLLIDABLE_TILESET_NAMES, ...(options.collidableTilesetNames ?? [])]
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean),
  );
  const collidableTileGidsFromLayers = collectCollidableTileGidsFromLayers(
    tilemapData.layers,
    collidableLayerNames,
  );
  const tilesetLookup = createTilesetLookup(tilemapData.tilesets ?? [], collidableTilesetNames);

  const colliders: StaticCollider[] = [];
  for (const layer of tilemapData.layers) {
    const layerCollidable = isLayerCollidable(layer, collidableLayerNames);
    if (isTileLayer(layer)) {
      colliders.push(
        ...extractTileLayerColliders({
          layer,
          tileWidth,
          tileHeight,
          layerCollidable,
          collidableTileGidsFromLayers,
          tilesetLookup,
        }),
      );
      continue;
    }

    if (isObjectLayer(layer)) {
      colliders.push(
        ...extractObjectLayerColliders({
          layer,
          tileWidth,
          tileHeight,
          layerCollidable,
        }),
      );
    }
  }

  return colliders;
}

export function createStaticCollisionIndex(
  colliders: StaticCollider[],
  cellSize: number = DEFAULT_CELL_SIZE,
): StaticCollisionIndex {
  const normalizedCellSize = Math.max(1, Math.floor(cellSize));
  const cells = new Map<string, number[]>();

  for (let index = 0; index < colliders.length; index += 1) {
    const collider = colliders[index];
    const minCellX = Math.floor(collider.x / normalizedCellSize);
    const minCellY = Math.floor(collider.y / normalizedCellSize);
    const maxCellX = Math.floor((collider.x + collider.width - EPSILON) / normalizedCellSize);
    const maxCellY = Math.floor((collider.y + collider.height - EPSILON) / normalizedCellSize);

    for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        const cellKey = createCellKey(cellX, cellY);
        const cellColliders = cells.get(cellKey);
        if (cellColliders) {
          cellColliders.push(index);
          continue;
        }

        cells.set(cellKey, [index]);
      }
    }
  }

  return {
    cellSize: normalizedCellSize,
    colliders: colliders.map((collider) => ({ ...collider })),
    cells,
  };
}

export function buildStaticCollisionIndexFromTilemap(
  tilemapData: TilemapData,
  options: CollisionExtractionOptions = {},
): StaticCollisionIndex {
  const colliders = buildStaticCollidersFromTilemap(tilemapData, options);
  return createStaticCollisionIndex(colliders, options.cellSize);
}

export function resolveStaticCollisions({
  currentPosition,
  intendedPosition,
  playerSize,
  collisionIndex,
}: ResolveStaticCollisionsParams): Position2D {
  if (!collisionIndex || collisionIndex.colliders.length === 0 || playerSize <= 0) {
    return { ...intendedPosition };
  }

  const halfSize = playerSize / 2;
  const resolvedX = resolveAxisX({
    collisionIndex,
    currentX: currentPosition.x,
    intendedX: intendedPosition.x,
    fixedY: currentPosition.y,
    halfSize,
  });
  const resolvedY = resolveAxisY({
    collisionIndex,
    currentY: currentPosition.y,
    intendedY: intendedPosition.y,
    fixedX: resolvedX,
    halfSize,
  });

  return {
    x: resolvedX,
    y: resolvedY,
  };
}

export function isStaticCollisionAtPosition({
  position,
  playerSize,
  collisionIndex,
}: PositionCollisionParams): boolean {
  if (!collisionIndex || collisionIndex.colliders.length === 0 || playerSize <= 0) {
    return false;
  }

  const halfSize = playerSize / 2;
  const playerBox: AxisAlignedBox = {
    x: position.x - halfSize,
    y: position.y - halfSize,
    width: playerSize,
    height: playerSize,
  };

  const colliders = queryStaticColliders(collisionIndex, playerBox);
  return colliders.some((collider) => intersects(playerBox, collider));
}

function isTileLayer(layer: TilemapLayerBase): layer is TilemapTileLayer {
  return layer.type === 'tilelayer' && Array.isArray((layer as TilemapTileLayer).data);
}

function isObjectLayer(layer: TilemapLayerBase): layer is TilemapObjectLayer {
  return layer.type === 'objectgroup' && Array.isArray((layer as TilemapObjectLayer).objects);
}

function isLayerCollidable(layer: TilemapLayerBase, collidableLayerNames: Set<string>): boolean {
  if (hasCollidableProperty(layer.properties)) {
    return true;
  }

  const normalizedLayerName = (layer.name ?? '').trim().toLowerCase();
  if (!normalizedLayerName) {
    return false;
  }

  if (collidableLayerNames.has(normalizedLayerName)) {
    return true;
  }

  const layerNameTokens = normalizedLayerName.split(/[^a-z0-9]+/g).filter(Boolean);
  return layerNameTokens.some((token) => collidableLayerNames.has(token));
}

function hasCollidableProperty(properties: TilemapProperty[] | null | undefined): boolean {
  if (!Array.isArray(properties)) {
    return false;
  }

  for (const property of properties) {
    const normalizedPropertyName = property.name?.trim().toLowerCase();
    if (!normalizedPropertyName || !COLLIDABLE_PROPERTY_SET.has(normalizedPropertyName)) {
      continue;
    }

    if (isTruthy(property.value)) {
      return true;
    }
  }

  return false;
}

function isTruthy(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
  }

  return false;
}

function extractTileLayerColliders(
  {
    layer,
    tileWidth,
    tileHeight,
    layerCollidable,
    collidableTileGidsFromLayers,
    tilesetLookup,
  }: {
    layer: TilemapTileLayer;
    tileWidth: number;
    tileHeight: number;
    layerCollidable: boolean;
    collidableTileGidsFromLayers: Set<number>;
    tilesetLookup: TilesetLookupEntry[];
  },
): StaticCollider[] {
  const colliders: StaticCollider[] = [];
  const layerWidth = Math.max(0, Math.floor(layer.width));
  const layerHeight = Math.max(0, Math.floor(layer.height));
  if (layerWidth === 0 || layerHeight === 0 || layer.data.length === 0) {
    return colliders;
  }

  let activeRunByKey = new Map<string, StaticCollider>();

  for (let row = 0; row < layerHeight; row += 1) {
    const runsInRow: StaticCollider[] = [];
    let column = 0;
    while (column < layerWidth) {
      const startIndex = row * layerWidth + column;
      const startTileGid = layer.data[startIndex] ?? 0;
      if (
        !isCollidableTile({
          rawGid: startTileGid,
          layerName: layer.name ?? '',
          layerCollidable,
          collidableTileGidsFromLayers,
          tilesetLookup,
        })
      ) {
        column += 1;
        continue;
      }

      const runStart = column;
      column += 1;
      while (column < layerWidth) {
        const tileGid = layer.data[row * layerWidth + column] ?? 0;
        if (
          !isCollidableTile({
            rawGid: tileGid,
            layerName: layer.name ?? '',
            layerCollidable,
            collidableTileGidsFromLayers,
            tilesetLookup,
          })
        ) {
          break;
        }
        column += 1;
      }

      runsInRow.push({
        x: runStart * tileWidth,
        y: row * tileHeight,
        width: (column - runStart) * tileWidth,
        height: tileHeight,
      });
    }

    const nextActiveRunByKey = new Map<string, StaticCollider>();
    for (const run of runsInRow) {
      const runKey = `${run.x}:${run.width}`;
      const previousRun = activeRunByKey.get(runKey);
      if (previousRun && previousRun.y + previousRun.height === run.y) {
        previousRun.height += run.height;
        nextActiveRunByKey.set(runKey, previousRun);
        continue;
      }

      const nextCollider: StaticCollider = { ...run };
      colliders.push(nextCollider);
      nextActiveRunByKey.set(runKey, nextCollider);
    }

    activeRunByKey = nextActiveRunByKey;
  }

  return colliders;
}

function isCollidableTile({
  rawGid,
  layerName,
  layerCollidable,
  collidableTileGidsFromLayers,
  tilesetLookup,
}: {
  rawGid: number;
  layerName: string;
  layerCollidable: boolean;
  collidableTileGidsFromLayers: Set<number>;
  tilesetLookup: TilesetLookupEntry[];
}): boolean {
  const normalizedGid = normalizeGid(rawGid);
  if (normalizedGid === 0) {
    return false;
  }

  const tileset = getTilesetForGid(normalizedGid, tilesetLookup);
  if (tileset && shouldTreatTileAsDecorativePassThrough(layerName, tileset)) {
    return false;
  }

  if (layerCollidable) {
    return true;
  }

  if (collidableTileGidsFromLayers.has(normalizedGid)) {
    return true;
  }

  if (!tileset) {
    return false;
  }

  if (tileset.collidableByName) {
    return true;
  }

  const tileId = normalizedGid - tileset.firstGid;
  return tileset.collidableTileIds.has(tileId);
}

function createTilesetLookup(
  tilesets: TilemapTileset[],
  collidableTilesetNames: Set<string>,
): TilesetLookupEntry[] {
  if (!Array.isArray(tilesets) || tilesets.length === 0) {
    return [];
  }

  const sorted = [...tilesets]
    .filter((tileset) => Number.isFinite(tileset.firstgid))
    .sort((left, right) => left.firstgid - right.firstgid);

  const lookup: TilesetLookupEntry[] = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const tileset = sorted[index];
    const nextTileset = sorted[index + 1];
    const fallbackTileCount = Math.max(0, Math.floor(tileset.tilecount ?? 0));
    const computedLastGid =
      fallbackTileCount > 0 ? tileset.firstgid + fallbackTileCount - 1 : tileset.firstgid;
    const lastGid = nextTileset ? nextTileset.firstgid - 1 : computedLastGid;
    const normalizedName = (tileset.name ?? '').trim().toLowerCase();
    const nameTokens = normalizedName.split(/[^a-z0-9]+/g).filter(Boolean);
    const collidableByName =
      Boolean(normalizedName) &&
      Array.from(collidableTilesetNames).some(
        (keyword) =>
          normalizedName.includes(keyword) || nameTokens.some((token) => token.startsWith(keyword)),
      );
    const collidableTileIds = new Set<number>();

    if (Array.isArray(tileset.tiles)) {
      for (const tile of tileset.tiles) {
        if (!hasCollidableProperty(tile.properties)) {
          continue;
        }

        if (typeof tile.id === 'number' && Number.isFinite(tile.id)) {
          collidableTileIds.add(tile.id);
        }
      }
    }

    lookup.push({
      firstGid: tileset.firstgid,
      lastGid: Math.max(tileset.firstgid, lastGid),
      normalizedName,
      nameTokens,
      collidableByName,
      collidableTileIds,
    });
  }

  return lookup;
}

function getTilesetForGid(gid: number, lookup: TilesetLookupEntry[]): TilesetLookupEntry | null {
  for (let index = 0; index < lookup.length; index += 1) {
    const entry = lookup[index];
    if (gid >= entry.firstGid && gid <= entry.lastGid) {
      return entry;
    }
  }

  return null;
}

function collectCollidableTileGidsFromLayers(
  layers: TilemapLayerBase[],
  collidableLayerNames: Set<string>,
): Set<number> {
  const collidableTileGids = new Set<number>();
  for (const layer of layers) {
    if (!isTileLayer(layer)) {
      continue;
    }

    if (!isLayerCollidable(layer, collidableLayerNames)) {
      continue;
    }

    for (const rawGid of layer.data) {
      const normalizedGid = normalizeGid(rawGid);
      if (normalizedGid !== 0) {
        collidableTileGids.add(normalizedGid);
      }
    }
  }

  return collidableTileGids;
}

function shouldTreatTileAsDecorativePassThrough(
  layerName: string,
  tileset: TilesetLookupEntry,
): boolean {
  const normalizedLayerName = layerName.trim().toLowerCase();
  if (!normalizedLayerName) {
    return false;
  }

  const layerTokens = normalizedLayerName.split(/[^a-z0-9]+/g).filter(Boolean);
  const isDecorLayer = layerTokens.some((token) =>
    DECORATIVE_LAYER_NAMES.some((keyword) => token === keyword || token.startsWith(keyword)),
  );
  if (!isDecorLayer) {
    return false;
  }

  return DECORATIVE_TILESET_NAMES.some(
    (keyword) =>
      tileset.normalizedName.includes(keyword) ||
      tileset.nameTokens.some((token) => token === keyword || token.startsWith(keyword)),
  );
}

function normalizeGid(rawGid: number): number {
  return (rawGid >>> 0) & GID_MASK;
}

function extractObjectLayerColliders({
  layer,
  tileWidth,
  tileHeight,
  layerCollidable,
}: {
  layer: TilemapObjectLayer;
  tileWidth: number;
  tileHeight: number;
  layerCollidable: boolean;
}): StaticCollider[] {
  const colliders: StaticCollider[] = [];
  for (const object of layer.objects) {
    if (object.visible === false) {
      continue;
    }

    const objectCollidable = layerCollidable || hasCollidableProperty(object.properties);
    if (!objectCollidable) {
      continue;
    }

    const objectCollider = toColliderFromObject(object, tileWidth, tileHeight);
    if (objectCollider) {
      colliders.push(objectCollider);
    }
  }

  return colliders;
}

function toColliderFromObject(
  object: TilemapObject,
  tileWidth: number,
  tileHeight: number,
): StaticCollider | null {
  const baseX = object.x ?? 0;
  const baseY = object.y ?? 0;
  const polygonPoints = object.polygon ?? object.polyline;
  if (Array.isArray(polygonPoints) && polygonPoints.length > 0) {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const point of polygonPoints) {
      minX = Math.min(minX, baseX + point.x);
      minY = Math.min(minY, baseY + point.y);
      maxX = Math.max(maxX, baseX + point.x);
      maxY = Math.max(maxY, baseY + point.y);
    }

    return normalizeCollider({
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    });
  }

  let width = object.width ?? 0;
  let height = object.height ?? 0;
  let y = baseY;

  if (typeof object.gid === 'number') {
    width = width > 0 ? width : tileWidth;
    height = height > 0 ? height : tileHeight;
    // Tiled tile-object origin is bottom-left; convert to top-left box.
    y -= height;
  }

  if (object.ellipse) {
    return normalizeCollider({
      x: baseX,
      y,
      width,
      height,
    });
  }

  return normalizeCollider({
    x: baseX,
    y,
    width,
    height,
  });
}

function normalizeCollider(collider: StaticCollider): StaticCollider | null {
  let { x, y, width, height } = collider;
  if (width < 0) {
    x += width;
    width = Math.abs(width);
  }
  if (height < 0) {
    y += height;
    height = Math.abs(height);
  }

  if (width <= 0 || height <= 0) {
    return null;
  }

  return {
    x,
    y,
    width,
    height,
  };
}

function queryStaticColliders(collisionIndex: StaticCollisionIndex, box: AxisAlignedBox): StaticCollider[] {
  const minCellX = Math.floor(box.x / collisionIndex.cellSize);
  const minCellY = Math.floor(box.y / collisionIndex.cellSize);
  const maxCellX = Math.floor((box.x + box.width - EPSILON) / collisionIndex.cellSize);
  const maxCellY = Math.floor((box.y + box.height - EPSILON) / collisionIndex.cellSize);

  const colliderIndexes = new Set<number>();
  for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      const cellKey = createCellKey(cellX, cellY);
      const cell = collisionIndex.cells.get(cellKey);
      if (!cell) {
        continue;
      }

      for (const colliderIndex of cell) {
        colliderIndexes.add(colliderIndex);
      }
    }
  }

  const colliders: StaticCollider[] = [];
  for (const colliderIndex of colliderIndexes) {
    const collider = collisionIndex.colliders[colliderIndex];
    if (collider) {
      colliders.push(collider);
    }
  }

  return colliders;
}

function createCellKey(cellX: number, cellY: number): string {
  return `${cellX}:${cellY}`;
}

function resolveAxisX({
  collisionIndex,
  currentX,
  intendedX,
  fixedY,
  halfSize,
}: {
  collisionIndex: StaticCollisionIndex;
  currentX: number;
  intendedX: number;
  fixedY: number;
  halfSize: number;
}): number {
  const deltaX = intendedX - currentX;
  if (deltaX === 0) {
    return intendedX;
  }

  let resolvedX = intendedX;
  const sweptBox: AxisAlignedBox = {
    x: Math.min(currentX, intendedX) - halfSize,
    y: fixedY - halfSize,
    width: Math.abs(deltaX) + halfSize * 2,
    height: halfSize * 2,
  };
  const colliders = queryStaticColliders(collisionIndex, sweptBox);
  const playerTop = fixedY - halfSize;
  const playerBottom = fixedY + halfSize;

  for (const collider of colliders) {
    const colliderTop = collider.y;
    const colliderBottom = collider.y + collider.height;
    if (!rangesOverlap(playerTop, playerBottom, colliderTop, colliderBottom)) {
      continue;
    }

    if (deltaX > 0) {
      const boundaryX = collider.x - halfSize;
      if (currentX <= boundaryX && resolvedX > boundaryX) {
        resolvedX = boundaryX;
      }
      continue;
    }

    const boundaryX = collider.x + collider.width + halfSize;
    if (currentX >= boundaryX && resolvedX < boundaryX) {
      resolvedX = boundaryX;
    }
  }

  return resolvedX;
}

function resolveAxisY({
  collisionIndex,
  currentY,
  intendedY,
  fixedX,
  halfSize,
}: {
  collisionIndex: StaticCollisionIndex;
  currentY: number;
  intendedY: number;
  fixedX: number;
  halfSize: number;
}): number {
  const deltaY = intendedY - currentY;
  if (deltaY === 0) {
    return intendedY;
  }

  let resolvedY = intendedY;
  const sweptBox: AxisAlignedBox = {
    x: fixedX - halfSize,
    y: Math.min(currentY, intendedY) - halfSize,
    width: halfSize * 2,
    height: Math.abs(deltaY) + halfSize * 2,
  };
  const colliders = queryStaticColliders(collisionIndex, sweptBox);
  const playerLeft = fixedX - halfSize;
  const playerRight = fixedX + halfSize;

  for (const collider of colliders) {
    const colliderLeft = collider.x;
    const colliderRight = collider.x + collider.width;
    if (!rangesOverlap(playerLeft, playerRight, colliderLeft, colliderRight)) {
      continue;
    }

    if (deltaY > 0) {
      const boundaryY = collider.y - halfSize;
      if (currentY <= boundaryY && resolvedY > boundaryY) {
        resolvedY = boundaryY;
      }
      continue;
    }

    const boundaryY = collider.y + collider.height + halfSize;
    if (currentY >= boundaryY && resolvedY < boundaryY) {
      resolvedY = boundaryY;
    }
  }

  return resolvedY;
}

function rangesOverlap(
  firstMin: number,
  firstMax: number,
  secondMin: number,
  secondMax: number,
): boolean {
  return firstMax > secondMin && firstMin < secondMax;
}

function intersects(box: AxisAlignedBox, collider: StaticCollider): boolean {
  return (
    box.x < collider.x + collider.width &&
    box.x + box.width > collider.x &&
    box.y < collider.y + collider.height &&
    box.y + box.height > collider.y
  );
}
