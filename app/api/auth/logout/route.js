import { NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  adminCookieOptions,
  cookieOptions,
  destroyCurrentSession,
  SESSION_COOKIE,
} from '../../../../lib/auth.js';

export const runtime = 'nodejs';

export async function POST() {
  try {
    await destroyCurrentSession();
  } catch (error) {
    console.error('logout_cleanup_failed', error);
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', { ...cookieOptions(), maxAge: 0 });
  response.cookies.set(ADMIN_SESSION_COOKIE, '', { ...adminCookieOptions(), maxAge: 0 });
  return response;
}
