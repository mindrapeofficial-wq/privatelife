import { NextResponse } from 'next/server';
import { isCurrentAdmin } from '../../../../lib/auth.js';
import { ensureSchema, query } from '../../../../lib/db.js';

export const runtime = 'nodejs';

export async function GET(request) {
  try {
    if (!(await isCurrentAdmin())) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
    await ensureSchema();
    const userId = request.nextUrl.searchParams.get('userId');
    if (!/^\d+$/.test(String(userId || ''))) {
      return NextResponse.json({ error: 'Jugador no válido.' }, { status: 400 });
    }
    const result = await query(
      `SELECT u.id, u.username, u.created_at, u.last_login_at,
              gs.updated_at, gs.save_data
         FROM private_life.users u
         LEFT JOIN private_life.game_saves gs ON gs.user_id = u.id
        WHERE u.id = $1
        LIMIT 1`,
      [userId]
    );
    const row = result.rows[0];
    if (!row) return NextResponse.json({ error: 'Jugador no encontrado.' }, { status: 404 });

    const phoneState = await query(
      'SELECT state_data, updated_at FROM private_life.phone_state WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    const phoneActivity = await query(
      `SELECT id, event_type, event_label, event_data, created_at
         FROM private_life.phone_activity
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 120`,
      [userId]
    );

    return NextResponse.json({
      player: {
        id: String(row.id),
        username: row.username,
        createdAt: row.created_at,
        lastLoginAt: row.last_login_at,
        updatedAt: row.updated_at,
        save: row.save_data || {},
        phone: {
          state: phoneState.rows[0]?.state_data || {},
          updatedAt: phoneState.rows[0]?.updated_at || null,
          activity: phoneActivity.rows.map(x => ({
            id: String(x.id),
            type: x.event_type,
            label: x.event_label,
            data: x.event_data || {},
            createdAt: x.created_at,
          })),
        },
      },
    });
  } catch (error) {
    console.error('admin_player_read_failed', error);
    return NextResponse.json({ error: 'No se pudo cargar la partida.' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    if (!(await isCurrentAdmin())) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
    await ensureSchema();
    const body = await request.json();
    const userId = String(body?.userId || '');
    const save = body?.save;
    if (!/^\d+$/.test(userId) || !save || typeof save !== 'object' || Array.isArray(save)) {
      return NextResponse.json({ error: 'Datos de partida no válidos.' }, { status: 400 });
    }
    const exists = await query('SELECT id FROM private_life.users WHERE id = $1 LIMIT 1', [userId]);
    if (!exists.rows[0]) return NextResponse.json({ error: 'Jugador no encontrado.' }, { status: 404 });
    const serialized = JSON.stringify(save);
    if (Buffer.byteLength(serialized, 'utf8') > 2_000_000) {
      return NextResponse.json({ error: 'La partida supera el tamaño permitido.' }, { status: 413 });
    }
    await query(
      `INSERT INTO private_life.game_saves (user_id, save_data, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET save_data = EXCLUDED.save_data, updated_at = NOW()`,
      [userId, serialized]
    );
    return NextResponse.json({ ok: true, save });
  } catch (error) {
    console.error('admin_player_write_failed', error);
    return NextResponse.json({ error: 'No se pudo guardar la intervención.' }, { status: 500 });
  }
}
