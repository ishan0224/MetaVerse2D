export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmailValidationResult =
  | { ok: true; value: string }
  | { ok: false; message: string };

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validateEmailAddress(value: string): EmailValidationResult {
  const normalized = normalizeEmail(value);
  if (!normalized) {
    return { ok: false, message: 'Email is required.' };
  }

  if (!EMAIL_PATTERN.test(normalized)) {
    return { ok: false, message: 'Please enter a valid email address.' };
  }

  return { ok: true, value: normalized };
}
