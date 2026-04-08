import * as Phaser from 'phaser';

const pendingTextureLoadsByKey = new Map<string, Promise<boolean>>();
const avatarTextureRefCountsByKey = new Map<string, number>();

export function normalizeAvatarUrl(avatarUrl: string | null | undefined): string | null {
  const trimmed = avatarUrl?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

export async function ensureAvatarTexture(
  scene: Phaser.Scene,
  avatarUrl: string,
): Promise<string | null> {
  const normalized = normalizeAvatarUrl(avatarUrl);
  if (!normalized) {
    return null;
  }

  const textureKey = getAvatarTextureKey(normalized);
  if (scene.textures.exists(textureKey)) {
    return textureKey;
  }

  let loadStatus = pendingTextureLoadsByKey.get(textureKey);
  if (!loadStatus) {
    loadStatus = trackPendingTextureLoad(textureKey, loadTexture(scene, textureKey, normalized));
  }

  const didLoad = await loadStatus;
  if (!didLoad || !scene.textures.exists(textureKey)) {
    return null;
  }

  return textureKey;
}

export function retainAvatarTexture(textureKey: string): void {
  const nextCount = (avatarTextureRefCountsByKey.get(textureKey) ?? 0) + 1;
  avatarTextureRefCountsByKey.set(textureKey, nextCount);
}

export function releaseAvatarTexture(scene: Phaser.Scene, textureKey: string | null): void {
  if (!textureKey) {
    return;
  }

  const currentCount = avatarTextureRefCountsByKey.get(textureKey) ?? 0;
  if (currentCount <= 1) {
    avatarTextureRefCountsByKey.delete(textureKey);
    if (scene.textures.exists(textureKey)) {
      scene.textures.remove(textureKey);
    }
    return;
  }

  avatarTextureRefCountsByKey.set(textureKey, currentCount - 1);
}

function trackPendingTextureLoad(textureKey: string, loadStatus: Promise<boolean>): Promise<boolean> {
  const trackedLoad = loadStatus.finally(() => {
    pendingTextureLoadsByKey.delete(textureKey);
  });
  pendingTextureLoadsByKey.set(textureKey, trackedLoad);
  return trackedLoad;
}

function loadTexture(scene: Phaser.Scene, textureKey: string, avatarUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new window.Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        if (!scene.textures.exists(textureKey)) {
          scene.textures.addImage(textureKey, image);
        }
        resolve(true);
      } catch {
        resolve(false);
      }
    };
    image.onerror = () => {
      resolve(false);
    };
    image.src = avatarUrl;
  });
}

function getAvatarTextureKey(avatarUrl: string): string {
  return `avatar:${hashString(avatarUrl)}`;
}

function hashString(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(16);
}
