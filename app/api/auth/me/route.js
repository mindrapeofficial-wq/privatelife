import { NextResponse } from 'next/server';
import { adminUsername, getCurrentUser, isCurrentAdmin } from '../../../../lib/auth.js';

export const runtime = 'nodejs';

export async function GET() {
  try {
    if (await isCurrentAdmin()) {
      return NextResponse.json({ user: { username: adminUsername(), role: 'admin' } });
    }
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ user: null }, { status: 401 });
    return NextResponse.json({ user: { username: user.username, role: 'player' } });
  } catch (error) {
    console.error('session_check_failed', error);
    return NextResponse.json({ user: null }, { status: 503 });
  }
}
