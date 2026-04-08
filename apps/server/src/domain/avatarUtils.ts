/** @module apps/server/src/domain/avatarUtils.ts */

export function normalizeAvatarUrl(avatarUrl: string | undefined): string | undefined {
  const trimmed = avatarUrl?.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }

    return parsed.toString();
  } catch {
    return undefined;
  }
}
