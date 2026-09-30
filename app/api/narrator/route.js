import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../lib/auth.js';

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  return NextResponse.json({ ok: true, status: 'central-narrator-ready' });
}
