/** @module apps/server/src/socket/normalizers.ts */

import { MAX_CHAT_TEXT_LENGTH } from '@metaverse2d/shared';

export function resolvePlayerName(
  requestedName: string | undefined,
  persistedUsername: string | undefined,
  fallbackEmail: string,
): string {
  const trimmedRequested = requestedName?.trim();
  if (trimmedRequested) {
    return trimmedRequested.slice(0, 32);
  }

  const trimmedPersisted = persistedUsername?.trim();
  if (trimmedPersisted) {
    return trimmedPersisted.slice(0, 32);
  }

  const fallbackFromEmail = fallbackEmail.split('@')[0]?.trim();
  if (fallbackFromEmail) {
    return fallbackFromEmail.slice(0, 32);
  }

  return 'player';
}

export function normalizeAvatarId(avatarId: number | undefined): number | undefined {
  if (typeof avatarId !== 'number' || Number.isNaN(avatarId)) {
    return undefined;
  }

  const rounded = Math.round(avatarId);
  return Math.max(1, Math.min(4, rounded));
}

export function normalizeWorldId(worldId: string | undefined): string {
  const trimmed = worldId?.trim();
  return trimmed || '1';
}

export function normalizeRoomId(roomId: string | undefined): string {
  const trimmed = roomId?.trim();
  return trimmed || '1';
}

export function buildScopeId(worldId: string, roomId: string): string {
  return `${worldId}::${roomId}`;
}

export function isValidInputSeq(inputSeq: number | undefined): inputSeq is number {
  return (
    typeof inputSeq === 'number' &&
    Number.isFinite(inputSeq) &&
    Number.isInteger(inputSeq) &&
    inputSeq > 0
  );
}

export function normalizeChatText(text: string | undefined): string {
  const trimmed = text?.trim() ?? '';
  if (!trimmed) {
    return '';
  }

  return trimmed.slice(0, MAX_CHAT_TEXT_LENGTH);
}

export function createRoomChatMessageId(socketId: string): string {
  return `${Date.now()}-${socketId}-${Math.random().toString(36).slice(2, 8)}`;
}
