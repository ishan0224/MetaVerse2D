import * as Phaser from 'phaser';

const pendingTextureLoadsByKey = new Map<string, Promise<boolean>>();

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
