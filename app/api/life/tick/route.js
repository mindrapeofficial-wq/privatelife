import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth.js';
import { ensureSchema } from '../../../../lib/db.js';
import { tickLifeEngine } from '../../../../lib/life-scheduler.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

async function runTick(request,contacts=[]){
  await ensureSchema();
  const user=await getCurrentUser();
  if(!user)return NextResponse.json({error:'No autorizado.'},{status:401});
  const timezone=request.nextUrl.searchParams.get('timezone')||'UTC';
  const result=await tickLifeEngine(user.id,timezone,contacts);
  return NextResponse.json(result,{headers:{'Cache-Control':'no-store, max-age=0'}});
}

export async function GET(request){
  try{return await runTick(request,[])}
  catch(error){
    console.error('life_tick_failed',error);
    return NextResponse.json({error:'No se pudo actualizar el mundo.'},{status:500});
  }
}

export async function POST(request){
  try{
    const body=await request.json().catch(()=>({}));
    return await runTick(request,Array.isArray(body?.contacts)?body.contacts:[]);
  }catch(error){
    console.error('life_tick_failed',error);
    return NextResponse.json({error:'No se pudo actualizar el mundo.'},{status:500});
  }
}
