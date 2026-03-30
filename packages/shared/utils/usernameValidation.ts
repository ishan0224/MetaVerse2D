export const USERNAME_MIN_LENGTH = 2;
export const USERNAME_MAX_LENGTH = 20;
export const USERNAME_PATTERN = /^[A-Za-z0-9_ ]+$/;

type UsernameValidationOptions = {
  minLength?: number;
  maxLength?: number;
};

export type UsernameValidationResult =
  | { ok: true; value: string }
  | { ok: false; message: string };

export function normalizeUsername(value: string): string {
  return value.trim();
}

export function validateUsername(
  value: string,
  options: UsernameValidationOptions = {},
): UsernameValidationResult {
  const minLength = options.minLength ?? USERNAME_MIN_LENGTH;
  const maxLength = options.maxLength ?? USERNAME_MAX_LENGTH;
  const normalized = normalizeUsername(value);

  if (normalized.length === 0) {
    return { ok: false, message: 'Username is required.' };
  }

  if (normalized.length < minLength || normalized.length > maxLength) {
    return {
      ok: false,
      message: `Username must be between ${minLength} and ${maxLength} characters.`,
    };
  }

  if (!USERNAME_PATTERN.test(normalized)) {
    return { ok: false, message: 'Use letters, numbers, spaces, and underscore only.' };
  }

  return { ok: true, value: normalized };
}
