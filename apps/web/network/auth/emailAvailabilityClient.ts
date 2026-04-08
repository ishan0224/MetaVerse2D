/** @module apps/web/network/auth/emailAvailabilityClient.ts */

import { normalizeEmail, validateEmailAddress } from '@metaverse2d/shared';

type EmailAvailabilityResult =
  | {
      ok: true;
      available: boolean;
      email: string;
    }
  | {
      ok: false;
      message: string;
      status?: number;
    };

export async function checkEmailAvailability(
  email: string,
  signal?: AbortSignal,
): Promise<EmailAvailabilityResult> {
  const validation = validateEmailAddress(email);
  if (!validation.ok) {
    return {
      ok: false,
      message: validation.message,
      status: 400,
    };
  }

  const normalizedEmail = normalizeEmail(validation.value);

  try {
    const query = new URLSearchParams({ email: normalizedEmail });
    const response = await fetch(`/api/check-email?${query.toString()}`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        accept: 'application/json',
      },
      signal,
    });

    const responseBody = (await response.json().catch(() => null)) as
      | {
          available?: boolean;
          error?: string;
        }
      | null;

    if (!response.ok) {
      return {
        ok: false,
        message: responseBody?.error?.trim() || 'Unable to verify email right now.',
        status: response.status,
      };
    }

    return {
      ok: true,
      available: Boolean(responseBody?.available),
      email: normalizedEmail,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }

    return {
      ok: false,
      message: 'Unable to verify email right now.',
    };
  }
}
