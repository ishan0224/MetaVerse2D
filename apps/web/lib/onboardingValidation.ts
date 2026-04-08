import {
  USERNAME_MAX_LENGTH,
  validateEmailAddress,
  validateUsername,
} from '@metaverse2d/shared';

const ROOM_PATTERN = /^[A-Za-z0-9_-]+$/;

export function validateName(
  value: string,
): { ok: true; value: string } | { ok: false; message: string } {
  return validateUsername(value);
}

export function validateEmail(
  value: string,
): { ok: true; value: string } | { ok: false; message: string } {
  return validateEmailAddress(value);
}

export function validatePassword(
  value: string,
): { ok: true; value: string } | { ok: false; message: string } {
  const trimmed = value.trim();
  if (trimmed.length < 8) {
    return { ok: false, message: 'Password must be at least 8 characters.' };
  }
  return { ok: true, value: trimmed };
}

export function getInlineEmailError(value: string): string | null {
  const validation = validateEmailAddress(value);
  return validation.ok ? null : validation.message;
}

export function getInlinePasswordError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'Password is required.';
  }

  if (trimmed.length < 8) {
    return 'Password must be at least 8 characters.';
  }

  return null;
}

export function getInlineUsernameError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'Display name is required.';
  }

  const validation = validateUsername(value);
  if (!validation.ok) {
    return formatDisplayNameValidationMessage(validation.message);
  }

  return null;
}

export function formatDisplayNameValidationMessage(message: string): string {
  return message.replace(/^Username\b/, 'Display name');
}

export function validateRoomId(
  value: string,
): { ok: true; value: string } | { ok: false; message: string } {
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > 24) {
    return { ok: false, message: 'Room ID must be between 1 and 24 characters.' };
  }
  if (!ROOM_PATTERN.test(trimmed)) {
    return { ok: false, message: 'Use letters, numbers, dash, and underscore only.' };
  }
  return { ok: true, value: trimmed };
}

export function isAuthPotentiallyValid(email: string, password: string): boolean {
  const normalizedPassword = password.trim();
  return validateEmailAddress(email).ok && normalizedPassword.length >= 8;
}

export function isRoomPotentiallyValid(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= 24 && ROOM_PATTERN.test(trimmed);
}

export function deriveDisplayNameFromEmail(email: string): string {
  const emailPrefix = email.trim().split('@')[0]?.trim();
  if (!emailPrefix) {
    return 'player';
  }

  const sanitized = emailPrefix.replace(/[^A-Za-z0-9_ ]+/g, ' ').trim();
  if (!sanitized) {
    return 'player';
  }

  return sanitized.slice(0, USERNAME_MAX_LENGTH);
}
