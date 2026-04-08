/** @module apps/server/src/core/origin.ts */

export function normalizeOrigin(origin: string): string | null {
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    return parsed.origin;
  } catch {
    return null;
  }
}

export function isOriginAllowed(
  origin: string,
  allowedOrigins: Set<string>,
  allowDevTunnelOrigins: boolean,
): boolean {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) {
    return false;
  }

  if (allowedOrigins.has(normalizedOrigin)) {
    return true;
  }

  return allowDevTunnelOrigins && normalizedOrigin.endsWith('.trycloudflare.com');
}
