import { webEnv } from '@/config/env';

type UpsertUserProfileResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      message: string;
      code?: string;
      status?: number;
    };

export async function upsertUserProfile(
  accessToken: string,
  username: string,
): Promise<UpsertUserProfileResult> {
  const response = await fetch(`${webEnv.socketUrl}/api/users`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ username }),
  });

  if (response.ok) {
    return { ok: true };
  }

  const responseBody = (await response.json().catch(() => null)) as
    | { error?: string; code?: string }
    | null;
  return {
    ok: false,
    message: responseBody?.error?.trim() || 'Unable to save profile right now.',
    code: responseBody?.code,
    status: response.status,
  };
}
