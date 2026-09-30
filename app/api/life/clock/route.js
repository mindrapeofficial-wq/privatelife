import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth.js';
import { ensureSchema, query } from '../../../../lib/db.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeTimezone(value){
  const timezone=String(value||'UTC').trim().slice(0,80)||'UTC';
  try{
    new Intl.DateTimeFormat('en-US',{timeZone:timezone}).format(new Date());
    return timezone;
  }catch{
    return 'UTC';
  }
}

export async function GET(request){
  try{
    await ensureSchema();
    const user=await getCurrentUser();
    if(!user)return NextResponse.json({error:'No autorizado.'},{status:401});

    const timezone=normalizeTimezone(new URL(request.url).searchParams.get('timezone'));

    await query(
      `INSERT INTO private_life.world_clock
        (user_id,anchor_real_at,anchor_game_at,speed,paused,timezone,created_at,updated_at)
       VALUES ($1,NOW(),NOW(),1,FALSE,$2,NOW(),NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET
         timezone=EXCLUDED.timezone,
         updated_at=CASE
           WHEN private_life.world_clock.timezone IS DISTINCT FROM EXCLUDED.timezone THEN NOW()
           ELSE private_life.world_clock.updated_at
         END`,
      [user.id,timezone]
    );

    const result=await query(
      `SELECT
         user_id,
         anchor_real_at,
         anchor_game_at,
         speed,
         paused,
         timezone,
         created_at,
         updated_at,
         NOW() AS server_now,
         CASE
           WHEN paused THEN anchor_game_at
           ELSE anchor_game_at + ((NOW() - anchor_real_at) * speed)
         END AS game_now
       FROM private_life.world_clock
       WHERE user_id=$1`,
      [user.id]
    );

    const row=result.rows[0];
    return NextResponse.json({
      gameNow:row.game_now,
      serverNow:row.server_now,
      anchorRealAt:row.anchor_real_at,
      anchorGameAt:row.anchor_game_at,
      speed:row.speed,
      paused:row.paused,
      timezone:row.timezone,
      startedAt:row.created_at,
      updatedAt:row.updated_at
    },{headers:{'Cache-Control':'no-store, max-age=0'}});
  }catch(error){
    console.error('life_clock_read_failed',error);
    return NextResponse.json({error:'No se pudo sincronizar el reloj del mundo.'},{status:500});
  }
}
