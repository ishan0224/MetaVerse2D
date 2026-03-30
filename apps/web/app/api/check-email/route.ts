import { validateEmailAddress } from '@metaverse2d/shared';
import { NextRequest, NextResponse } from 'next/server';

import { webEnv } from '@/config/env';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const email = request.nextUrl.searchParams.get('email') ?? '';
  const validation = validateEmailAddress(email);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.message, available: false }, { status: 400 });
  }

  try {
    const upstreamUrl = new URL('/api/users/email-availability', webEnv.socketUrl);
    upstreamUrl.searchParams.set('email', validation.value);

    const upstreamResponse = await fetch(upstreamUrl, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        accept: 'application/json',
      },
    });

    if (!upstreamResponse.ok) {
      const fallbackMessage = `Email check failed (${upstreamResponse.status}).`;
      const upstreamBody = (await upstreamResponse.json().catch(() => null)) as
        | { error?: string; available?: boolean }
        | null;
      const message = upstreamBody?.error?.trim() || fallbackMessage;
      return NextResponse.json(
        { error: message, available: Boolean(upstreamBody?.available) },
        { status: upstreamResponse.status },
      );
    }

    const upstreamBody = (await upstreamResponse.json().catch(() => null)) as
      | { available?: boolean }
      | null;
    return NextResponse.json(
      { available: Boolean(upstreamBody?.available) },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { error: 'Email check is temporarily unavailable.', available: false },
      { status: 503 },
    );
  }
}
