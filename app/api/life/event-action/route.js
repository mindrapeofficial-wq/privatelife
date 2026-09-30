import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth.js';
import { ensureSchema, query } from '../../../../lib/db.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function clean(value,max=500){
  return String(value??'').replace(/\u0000/g,'').trim().slice(0,max);
}

export async function POST(request){
  try{
    await ensureSchema();
    const user=await getCurrentUser();
    if(!user)return NextResponse.json({error:'No autorizado.'},{status:401});

    const body=await request.json().catch(()=>({}));
    const eventId=clean(body?.eventId,80);
    const decision=body?.decision==='engage'?'engage':body?.decision==='dismiss'?'dismiss':'';
    if(!/^\d+$/.test(eventId)||!decision)return NextResponse.json({error:'Decisión no válida.'},{status:400});

    const eventResult=await query(
      `SELECT id,event_type,app,title,body,payload,delivered_at
         FROM private_life.life_events
        WHERE id=$1 AND user_id=$2 AND status='delivered'
        LIMIT 1`,
      [eventId,user.id]
    );
    const event=eventResult.rows[0];
    if(!event)return NextResponse.json({error:'Este acontecimiento ya no está disponible.'},{status:404});

    const eventData={
      eventType:event.event_type,app:event.app,title:event.title,body:event.body,
      payload:event.payload||{},decision
    };

    await query(
      `INSERT INTO private_life.life_event_decisions
        (user_id,life_event_id,decision,event_data,created_at,updated_at)
       VALUES($1,$2,$3,$4::jsonb,NOW(),NOW())
       ON CONFLICT(user_id,life_event_id) DO UPDATE SET
        decision=EXCLUDED.decision,event_data=EXCLUDED.event_data,updated_at=NOW()`,
      [user.id,event.id,decision,JSON.stringify(eventData)]
    );

    await query(
      `INSERT INTO private_life.phone_activity
        (user_id,event_type,event_label,event_data)
       VALUES($1,'life_event_decision',$2,$3::jsonb)`,
      [user.id,event.title,JSON.stringify({
        eventId:String(event.id),eventType:event.event_type,decision,payload:event.payload||{}
      })]
    );

    await query(
      `UPDATE private_life.world_director_state
          SET next_run_game_at=NOW(),updated_at=NOW()
        WHERE user_id=$1`,
      [user.id]
    ).catch(()=>{});

    return NextResponse.json({ok:true,decision,event:{id:String(event.id),type:event.event_type,title:event.title,payload:event.payload||{}}});
  }catch(error){
    console.error('life_event_action_failed',error);
    return NextResponse.json({error:'No se pudo registrar la decisión.'},{status:500});
  }
}
