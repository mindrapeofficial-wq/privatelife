import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { ensureSchema } from '../../../../lib/db.js';
import { processPushTick } from '../../../../lib/push-dispatcher.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=50;

function safeEqual(a,b){
  const left=Buffer.from(String(a||''),'utf8');
  const right=Buffer.from(String(b||''),'utf8');
  return left.length===right.length&&crypto.timingSafeEqual(left,right);
}

function authorized(request){
  const expected=String(process.env.CRON_SECRET||'');
  if(!expected)return false;
  const auth=String(request.headers.get('authorization')||'');
  return auth.startsWith('Bearer ')&&safeEqual(auth.slice(7),expected);
}

export async function GET(request){
  if(!authorized(request))return NextResponse.json({error:'No autorizado.'},{status:401});
  try{
    await ensureSchema();
    const result=await processPushTick({skipVisible:true});
    if(!result.configured){
      return NextResponse.json({error:'Firebase no está configurado en el servidor.',...result},{status:503});
    }
    return NextResponse.json(result,{headers:{'Cache-Control':'no-store, max-age=0'}});
  }catch(error){
    console.error('push_tick_failed',error);
    return NextResponse.json({error:'No se pudo ejecutar el pulso push.'},{status:500});
  }
}
