import { NextResponse } from 'next/server';
import { isCurrentAdmin } from '../../../../lib/auth.js';
import { ensureSchema, query } from '../../../../lib/db.js';

export const runtime = 'nodejs';

export async function GET() {
  try {
    if (!(await isCurrentAdmin())) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
    }
    await ensureSchema();
    const result = await query(
      `SELECT u.id, u.username, u.created_at, u.last_login_at,
              gs.updated_at, gs.save_data
         FROM private_life.users u
         LEFT JOIN private_life.game_saves gs ON gs.user_id = u.id
        ORDER BY COALESCE(gs.updated_at, u.last_login_at, u.created_at) DESC`
    );
    const users = result.rows.map((row) => {
      const save = row.save_data || {};
      return {
        id: String(row.id),
        username: row.username,
        createdAt: row.created_at,
        lastLoginAt: row.last_login_at,
        updatedAt: row.updated_at,
        hasSave: Boolean(row.save_data),
        identity: save.identity || {},
        profile: save.profile || {},
        characterCount: Array.isArray(save.world?.characters) ? save.world.characters.length : 0,
        eventCount: Array.isArray(save.world?.events) ? save.world.events.length : 0,
      };
    });
    return NextResponse.json({ users });
  } catch (error) {
    console.error('admin_users_failed', error);
    return NextResponse.json({ error: 'No se pudieron cargar los jugadores.' }, { status: 500 });
  }
}
