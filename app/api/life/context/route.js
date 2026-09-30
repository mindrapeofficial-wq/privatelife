import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth.js';
import { ensureSchema } from '../../../../lib/db.js';
import { ensurePlayerContext, getWorldNow, setPlayerContext, LIFE_LOCATION_PRESETS, LIFE_ACTIVITY_PRESETS } from '../../../../lib/life-scheduler.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request){
  try{
    await ensureSchema();
    const user=await getCurrentUser();
    if(!user)return NextResponse.json({error:'No autorizado.'},{status:401});
    const timezone=request.nextUrl.searchParams.get('timezone')||'UTC';
    const clock=await getWorldNow(user.id,timezone);
    const context=await ensurePlayerContext(user.id,new Date(clock.game_now));
    return NextResponse.json({context,gameNow:clock.game_now,timezone:clock.timezone,speed:Number(clock.speed)||1,paused:!!clock.paused,locations:LIFE_LOCATION_PRESETS,activities:LIFE_ACTIVITY_PRESETS},{headers:{'Cache-Control':'no-store, max-age=0'}});
  }catch(error){
    console.error('life_context_read_failed',error);
    return NextResponse.json({error:'No se pudo cargar tu estado actual.'},{status:500});
  }
}

export async function PUT(request){
  try{
    await ensureSchema();
    const user=await getCurrentUser();
    if(!user)return NextResponse.json({error:'No autorizado.'},{status:401});
    const body=await request.json();
    const clock=await getWorldNow(user.id,body?.timezone||'UTC');
    const context=await setPlayerContext(user.id,body,new Date(clock.game_now));
    return NextResponse.json({ok:true,context,gameNow:clock.game_now,timezone:clock.timezone});
  }catch(error){
    console.error('life_context_write_failed',error);
    return NextResponse.json({error:'No se pudo actualizar tu situación.'},{status:500});
  }
}
