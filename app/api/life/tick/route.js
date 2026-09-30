import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth.js';
import { ensureSchema } from '../../../../lib/db.js';
import { tickLifeEngine } from '../../../../lib/life-scheduler.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request){
  try{
    await ensureSchema();
    const user=await getCurrentUser();
    if(!user)return NextResponse.json({error:'No autorizado.'},{status:401});
    const result=await tickLifeEngine(user.id,request.nextUrl.searchParams.get('timezone')||'UTC');
    return NextResponse.json(result,{headers:{'Cache-Control':'no-store, max-age=0'}});
  }catch(error){
    console.error('life_tick_failed',error);
    return NextResponse.json({error:'No se pudo actualizar el mundo.'},{status:500});
  }
}
