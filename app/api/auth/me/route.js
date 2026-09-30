import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth.js';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ user: null }, { status: 401 });
    return NextResponse.json({ user: { username: user.username } });
  } catch (error) {
    console.error('session_check_failed', error);
    return NextResponse.json({ user: null }, { status: 503 });
  }
}
