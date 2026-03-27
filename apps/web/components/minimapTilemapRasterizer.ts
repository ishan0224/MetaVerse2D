import { FULL_MAP_TILEMAP_JSON_PATH } from '@/game/config/tilemapConfig';

const FLIPPED_HORIZONTALLY_FLAG = 0x80000000;
const FLIPPED_VERTICALLY_FLAG = 0x40000000;
const FLIPPED_DIAGONALLY_FLAG = 0x20000000;
const TILE_ID_MASK =
  ~(FLIPPED_HORIZONTALLY_FLAG | FLIPPED_VERTICALLY_FLAG | FLIPPED_DIAGONALLY_FLAG) >>> 0;

type TileLayer = {
  type: 'tilelayer';
  visible?: boolean;
  width: number;
  height: number;
  data: number[];
};

type Tileset = {
  firstgid: number;
  image: string;
  imagewidth: number;
  imageheight: number;
  tilewidth: number;
  tileheight: number;
  tilecount: number;
  columns: number;
  margin?: number;
  spacing?: number;
};

type TilemapJson = {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: Array<TileLayer | Record<string, unknown>>;
  tilesets: Tileset[];
};

type RasterizedMinimapMap = {
  dataUrl: string;
  width: number;
  height: number;
};

type RasterizedTileset = Tileset & {
  imageElement: HTMLImageElement;
};

const rasterizedMapCache = new Map<string, Promise<RasterizedMinimapMap>>();

export function getRasterizedMinimapMap(targetWidth: number, targetHeight: number): Promise<RasterizedMinimapMap> {
  const safeTargetWidth = Math.max(1, Math.round(targetWidth));
  const safeTargetHeight = Math.max(1, Math.round(targetHeight));
  const cacheKey = `${FULL_MAP_TILEMAP_JSON_PATH}:${safeTargetWidth}x${safeTargetHeight}`;
  const cached = rasterizedMapCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const mapPromise = buildRasterizedMinimapMap(safeTargetWidth, safeTargetHeight);
  rasterizedMapCache.set(cacheKey, mapPromise);
  return mapPromise;
}

async function buildRasterizedMinimapMap(
  targetWidth: number,
  targetHeight: number,
): Promise<RasterizedMinimapMap> {
  const response = await fetch(FULL_MAP_TILEMAP_JSON_PATH, { cache: 'force-cache' });
  if (!response.ok) {
    throw new Error(`Failed to load minimap TMJ: ${response.status}`);
  }

  const map = (await response.json()) as TilemapJson;
  const rasterizedTilesets = await loadTilesets(map.tilesets);
  const worldWidth = map.width * map.tilewidth;
  const worldHeight = map.height * map.tileheight;
  const scaleX = targetWidth / worldWidth;
  const scaleY = targetHeight / worldHeight;

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Failed to create minimap canvas context');
  }

  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, targetWidth, targetHeight);

  const sortedTilesets = [...rasterizedTilesets].sort((left, right) => left.firstgid - right.firstgid);
  const tileLayers = map.layers.filter(
    (layer): layer is TileLayer => layer.type === 'tilelayer' && layer.visible !== false,
  );

  for (const layer of tileLayers) {
    drawLayer(context, layer, sortedTilesets, map.tilewidth, map.tileheight, scaleX, scaleY);
  }

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: targetWidth,
    height: targetHeight,
  };
}

async function loadTilesets(tilesets: Tileset[]): Promise<RasterizedTileset[]> {
  const mapBasePath = FULL_MAP_TILEMAP_JSON_PATH.slice(0, FULL_MAP_TILEMAP_JSON_PATH.lastIndexOf('/') + 1);
  const result: RasterizedTileset[] = [];

  for (const tileset of tilesets) {
    const imagePath = resolveImagePath(tileset.image, mapBasePath);
    const imageElement = await loadImage(imagePath);
    result.push({
      ...tileset,
      imageElement,
    });
  }

  return result;
}

function drawLayer(
  context: CanvasRenderingContext2D,
  layer: TileLayer,
  tilesets: RasterizedTileset[],
  mapTileWidth: number,
  mapTileHeight: number,
  scaleX: number,
  scaleY: number,
): void {
  for (let index = 0; index < layer.data.length; index += 1) {
    const rawGid = layer.data[index] >>> 0;
    const tileId = rawGid & TILE_ID_MASK;
    if (tileId === 0) {
      continue;
    }

    const tileset = findTilesetForTileId(tileId, tilesets);
    if (!tileset) {
      continue;
    }

    const tileLocalId = tileId - tileset.firstgid;
    if (tileLocalId < 0 || tileLocalId >= tileset.tilecount) {
      continue;
    }

    const sourcePosition = getTilesetSourcePosition(tileLocalId, tileset);
    const tileX = index % layer.width;
    const tileY = Math.floor(index / layer.width);
    const destinationX = tileX * mapTileWidth * scaleX;
    const destinationY = tileY * mapTileHeight * scaleY;
    const destinationWidth = mapTileWidth * scaleX;
    const destinationHeight = mapTileHeight * scaleY;

    context.drawImage(
      tileset.imageElement,
      sourcePosition.x,
      sourcePosition.y,
      tileset.tilewidth,
      tileset.tileheight,
      destinationX,
      destinationY,
      destinationWidth,
      destinationHeight,
    );
  }
}

function findTilesetForTileId(tileId: number, tilesets: RasterizedTileset[]): RasterizedTileset | null {
  for (let index = tilesets.length - 1; index >= 0; index -= 1) {
    const tileset = tilesets[index];
    if (tileId >= tileset.firstgid) {
      return tileset;
    }
  }

  return null;
}

function getTilesetSourcePosition(tileLocalId: number, tileset: Tileset): { x: number; y: number } {
  const margin = tileset.margin ?? 0;
  const spacing = tileset.spacing ?? 0;
  const column = tileLocalId % tileset.columns;
  const row = Math.floor(tileLocalId / tileset.columns);

  return {
    x: margin + column * (tileset.tilewidth + spacing),
    y: margin + row * (tileset.tileheight + spacing),
  };
}

function resolveImagePath(imagePath: string, basePath: string): string {
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://') || imagePath.startsWith('/')) {
    return imagePath;
  }

  return `${basePath}${imagePath}`;
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve(image);
    };
    image.onerror = () => {
      reject(new Error(`Failed to load tileset image: ${source}`));
    };
    image.src = source;
  });
}
