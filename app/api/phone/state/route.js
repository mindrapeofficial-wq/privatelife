import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth.js';
import { ensureSchema, query } from '../../../../lib/db.js';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    await ensureSchema();
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

    const body = await request.json();
    const state = body?.state && typeof body.state === 'object' && !Array.isArray(body.state) ? body.state : {};
    const event = body?.event && typeof body.event === 'object' && !Array.isArray(body.event) ? body.event : null;
    const serialized = JSON.stringify(state);
    if (Buffer.byteLength(serialized, 'utf8') > 20000) {
      return NextResponse.json({ error: 'Estado de teléfono demasiado grande.' }, { status: 413 });
    }

    await query(
      `INSERT INTO private_life.phone_state (user_id, state_data, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET state_data = private_life.phone_state.state_data || EXCLUDED.state_data,
                     updated_at = NOW()`,
      [user.id, serialized]
    );

    if (event?.type) {
      const type = String(event.type).slice(0, 60);
      const label = event.label == null ? null : String(event.label).slice(0, 160);
      const data = event.data && typeof event.data === 'object' && !Array.isArray(event.data) ? event.data : {};
      await query(
        `INSERT INTO private_life.phone_activity (user_id, event_type, event_label, event_data)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [user.id, type, label, JSON.stringify(data)]
      );
      await query(
        `DELETE FROM private_life.phone_activity
          WHERE user_id = $1
            AND id NOT IN (
              SELECT id FROM private_life.phone_activity
               WHERE user_id = $1
               ORDER BY created_at DESC
               LIMIT 300
            )`,
        [user.id]
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('phone_state_write_failed', error);
    return NextResponse.json({ error: 'No se pudo actualizar el estado del teléfono.' }, { status: 500 });
  }
}
