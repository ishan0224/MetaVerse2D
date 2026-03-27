import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..', '..');
const SOURCE_DIR = path.join(REPO_ROOT, 'MetaVerse 2D');
const SOURCE_MAP_PATH = path.join(SOURCE_DIR, 'FullMap16x16.tmj');
const OUTPUT_DIR = path.join(REPO_ROOT, 'apps', 'web', 'public', 'tilemaps', 'fullmap16x16');
const OUTPUT_IMAGES_DIR = path.join(OUTPUT_DIR, 'images');
const OUTPUT_MAP_PATH = path.join(OUTPUT_DIR, 'FullMap16x16.normalized.tmj');
const OUTPUT_MANIFEST_PATH = path.join(OUTPUT_DIR, 'tileset-manifest.json');

const DOWNLOADS_ROOT = path.join(process.env.HOME ?? '', 'Downloads');
const execFileAsync = promisify(execFile);

await mkdir(OUTPUT_IMAGES_DIR, { recursive: true });

const mapRaw = await readFile(SOURCE_MAP_PATH, 'utf8');
const mapJson = JSON.parse(mapRaw);

const normalizedTilesets = [];
const manifest = [];

for (let index = 0; index < mapJson.tilesets.length; index += 1) {
  const tilemapTileset = mapJson.tilesets[index];
  const tsxSource = tilemapTileset.source;
  if (!tsxSource) {
    normalizedTilesets.push(tilemapTileset);
    continue;
  }

  const tsxPath = path.join(SOURCE_DIR, tsxSource);
  const tsxRaw = await readFile(tsxPath, 'utf8');

  const tilesetAttrs = parseAttrsFromTag(tsxRaw, 'tileset');
  const imageAttrs = parseAttrsFromTag(tsxRaw, 'image');

  const sourceImage = imageAttrs.source;
  if (!sourceImage) {
    throw new Error(`Missing image source in TSX: ${tsxSource}`);
  }

  const resolvedImagePath = await resolveTilesetImagePath(tsxPath, sourceImage);
  const sourceBasename = path.basename(sourceImage);
  const outputImageName = sanitizeFilename(sourceBasename);
  const outputImagePath = path.join(OUTPUT_IMAGES_DIR, outputImageName);
  await copyFile(resolvedImagePath, outputImagePath);
  await normalizeImageSizeToTileMultiple(
    outputImagePath,
    toNumber(tilesetAttrs.tilewidth, mapJson.tilewidth),
    toNumber(tilesetAttrs.tileheight, mapJson.tileheight),
  );

  const tilesetName = tilesetAttrs.name || `tileset-${index}`;
  manifest.push({
    tilesetName,
    imageKey: `tileset-${index}-${sanitizeKey(tilesetName)}`,
    imagePath: `/tilemaps/fullmap16x16/images/${outputImageName}`,
  });

  normalizedTilesets.push({
    firstgid: tilemapTileset.firstgid,
    columns: toNumber(tilesetAttrs.columns, 1),
    image: `images/${outputImageName}`,
    imageheight: toNumber(imageAttrs.height, 0),
    imagewidth: toNumber(imageAttrs.width, 0),
    margin: toNumber(tilesetAttrs.margin, 0),
    name: tilesetName,
    spacing: toNumber(tilesetAttrs.spacing, 0),
    tilecount: toNumber(tilesetAttrs.tilecount, 0),
    tileheight: toNumber(tilesetAttrs.tileheight, mapJson.tileheight),
    tilewidth: toNumber(tilesetAttrs.tilewidth, mapJson.tilewidth),
  });
}

const normalizedMap = {
  ...mapJson,
  tilesets: normalizedTilesets,
};

await writeFile(OUTPUT_MAP_PATH, JSON.stringify(normalizedMap, null, 2), 'utf8');
await writeFile(OUTPUT_MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');

console.log(`Normalized map written to: ${OUTPUT_MAP_PATH}`);
console.log(`Tileset manifest written to: ${OUTPUT_MANIFEST_PATH}`);
console.log(`Copied ${manifest.length} tileset images into: ${OUTPUT_IMAGES_DIR}`);

function parseAttrsFromTag(xml, tagName) {
  const tagRegex = new RegExp(`<${tagName}\\s+([^>]+)>`, 'i');
  const tagMatch = xml.match(tagRegex);
  if (!tagMatch?.[1]) {
    return {};
  }

  const attrString = tagMatch[1];
  const attrs = {};
  const attrRegex = /(\w+)="([^"]*)"/g;
  let match = attrRegex.exec(attrString);
  while (match) {
    attrs[match[1]] = match[2];
    match = attrRegex.exec(attrString);
  }

  return attrs;
}

async function resolveTilesetImagePath(tsxPath, sourceImage) {
  const candidateFromTsxDir = path.resolve(path.dirname(tsxPath), sourceImage);
  if (await fileExists(candidateFromTsxDir)) {
    return candidateFromTsxDir;
  }

  const downloadsRelative = sourceImage.replace(/^(\.\.\/)+Downloads\//, '');
  const candidateFromDownloads = path.join(DOWNLOADS_ROOT, downloadsRelative);
  if (await fileExists(candidateFromDownloads)) {
    return candidateFromDownloads;
  }

  throw new Error(
    `Unable to resolve tileset image "${sourceImage}" from TSX "${tsxPath}". ` +
      `Checked "${candidateFromTsxDir}" and "${candidateFromDownloads}".`,
  );
}

async function fileExists(filePath) {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizeFilename(filename) {
  return filename.replace(/\s+/g, '_');
}

function sanitizeKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

async function normalizeImageSizeToTileMultiple(imagePath, tileWidth, tileHeight) {
  if (tileWidth <= 0 || tileHeight <= 0) {
    return;
  }

  const dimensions = await getImageDimensions(imagePath);
  if (!dimensions) {
    return;
  }

  const normalizedWidth = dimensions.width - (dimensions.width % tileWidth);
  const normalizedHeight = dimensions.height - (dimensions.height % tileHeight);
  if (normalizedWidth === dimensions.width && normalizedHeight === dimensions.height) {
    return;
  }

  if (normalizedWidth <= 0 || normalizedHeight <= 0) {
    return;
  }

  await execFileAsync('sips', [
    '--cropToHeightWidth',
    String(normalizedHeight),
    String(normalizedWidth),
    '--cropOffset',
    '0',
    '0',
    imagePath,
    '--out',
    imagePath,
  ]);
}

async function getImageDimensions(imagePath) {
  try {
    const { stdout } = await execFileAsync('sips', [
      '--getProperty',
      'pixelWidth',
      '--getProperty',
      'pixelHeight',
      imagePath,
    ]);
    const widthMatch = stdout.match(/pixelWidth:\s*(\d+)/);
    const heightMatch = stdout.match(/pixelHeight:\s*(\d+)/);
    if (!widthMatch || !heightMatch) {
      return null;
    }

    return {
      width: Number(widthMatch[1]),
      height: Number(heightMatch[1]),
    };
  } catch {
    return null;
  }
}
