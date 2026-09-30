import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth.js';
import { ensureSchema, query } from '../../../../lib/db.js';
import { isFcmConfigured } from '../../../../lib/push-fcm.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function clean(value,max=5000){
  return String(value??'').replace(/\u0000/g,'').trim().slice(0,max);
}

export async function POST(request){
  try{
    await ensureSchema();
    const user=await getCurrentUser();
    if(!user)return NextResponse.json({error:'No autorizado.'},{status:401});
    const body=await request.json().catch(()=>({}));
    const token=clean(body?.token,5000);
    const platform=clean(body?.platform||'android',40)||'android';
    const enabled=body?.enabled!==false;
    if(token.length<20)return NextResponse.json({error:'Token push no válido.'},{status:400});

    await query(
      `INSERT INTO private_life.push_devices
        (user_id,token,platform,enabled,last_seen_at,created_at,updated_at)
       VALUES($1,$2,$3,$4,NOW(),NOW(),NOW())
       ON CONFLICT(token) DO UPDATE SET
        user_id=EXCLUDED.user_id,
        platform=EXCLUDED.platform,
        enabled=EXCLUDED.enabled,
        last_seen_at=NOW(),
        updated_at=NOW()`,
      [user.id,token,platform,enabled]
    );

    await query(
      "INSERT INTO private_life.phone_activity (user_id,event_type,event_label,event_data) VALUES($1,'push_device_sync',$2,$3::jsonb)",
      [user.id,enabled?'Push activado':'Push desactivado',JSON.stringify({platform,enabled})]
    );

    return NextResponse.json({ok:true,enabled,configured:isFcmConfigured()});
  }catch(error){
    console.error('push_register_failed',error);
    return NextResponse.json({error:'No se pudo registrar este dispositivo.'},{status:500});
  }
}
