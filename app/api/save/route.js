import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../lib/auth.js';
import { ensureSchema, query } from '../../../lib/db.js';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await ensureSchema();
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

    const result = await query(
      'SELECT save_data, updated_at FROM private_life.game_saves WHERE user_id = $1',
      [user.id]
    );
    const row = result.rows[0];
    return NextResponse.json({ save: row?.save_data || null, updatedAt: row?.updated_at || null });
  } catch (error) {
    console.error('save_read_failed', error);
    return NextResponse.json({ error: 'No se pudo cargar la partida.' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    await ensureSchema();
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

    const body = await request.json();
    const save = body?.save;
    if (!save || typeof save !== 'object' || Array.isArray(save)) {
      return NextResponse.json({ error: 'Partida no válida.' }, { status: 400 });
    }

    const serialized = JSON.stringify(save);
    if (Buffer.byteLength(serialized, 'utf8') > 2_000_000) {
      return NextResponse.json({ error: 'La partida supera el tamaño permitido.' }, { status: 413 });
    }

    await query(
      `INSERT INTO private_life.game_saves (user_id, save_data, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET save_data = EXCLUDED.save_data, updated_at = NOW()`,
      [user.id, serialized]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('save_write_failed', error);
    return NextResponse.json({ error: 'No se pudo guardar la partida.' }, { status: 500 });
  }
}
