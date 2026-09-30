import { NextResponse } from 'next/server';
import { isCurrentAdmin } from '../../../../lib/auth.js';
import { ensureSchema, query } from '../../../../lib/db.js';
import { getWorldNow, getPlayerContext, ensurePlayerContext } from '../../../../lib/life-scheduler.js';
import { maybeRunWorldDirector } from '../../../../lib/world-director.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function validUserId(value){return /^\d+$/.test(String(value||''))}
function compactPlan(plan={}){
  return {
    worldSummary:String(plan?.worldSummary||''),
    observations:Array.isArray(plan?.observations)?plan.observations:[],
    directorNotes:Array.isArray(plan?.directorNotes)?plan.directorNotes:[],
    newCharacters:Array.isArray(plan?.newCharacters)?plan.newCharacters:[],
    characterUpdates:Array.isArray(plan?.characterUpdates)?plan.characterUpdates:[],
    relationshipUpdates:Array.isArray(plan?.relationshipUpdates)?plan.relationshipUpdates:[],
    events:Array.isArray(plan?.events)?plan.events:[],
    messages:Array.isArray(plan?.messages)?plan.messages:[],
    queuedEvents:Array.isArray(plan?.queuedEvents)?plan.queuedEvents:[],
    queuedMessages:Array.isArray(plan?.queuedMessages)?plan.queuedMessages:[],
    nextReviewMinutes:Number(plan?.nextReviewMinutes)||null
  };
}

async function loadMind(userId){
  const [stateResult,runsResult,eventsResult,playerResult]=await Promise.all([
    query('SELECT last_run_game_at,next_run_game_at,last_summary,last_plan,run_count,updated_at FROM private_life.world_director_state WHERE user_id=$1 LIMIT 1',[userId]),
    query(`SELECT id,game_at,summary,observations,director_notes,plan,context_snapshot,queued_events,queued_messages,created_at
      FROM private_life.world_director_runs
      WHERE user_id=$1 ORDER BY created_at DESC LIMIT 60`,[userId]),
    query(`SELECT id,event_key,event_type,app,title,body,payload,scheduled_game_at,status,created_at,delivered_at
      FROM private_life.life_events
      WHERE user_id=$1 ORDER BY created_at DESC LIMIT 80`,[userId]),
    query(`SELECT u.username,gs.save_data
      FROM private_life.users u
      LEFT JOIN private_life.game_saves gs ON gs.user_id=u.id
      WHERE u.id=$1 LIMIT 1`,[userId])
  ]);
  if(!playerResult.rows[0])return null;
  const state=stateResult.rows[0]||null;
  const save=playerResult.rows[0]?.save_data||{};
  return {
    user:{id:String(userId),username:playerResult.rows[0].username,name:save?.identity?.name||''},
    state:state?{
      lastRunGameAt:state.last_run_game_at,
      nextRunGameAt:state.next_run_game_at,
      lastSummary:state.last_summary||'',
      lastPlan:compactPlan(state.last_plan||{}),
      runCount:Number(state.run_count)||0,
      updatedAt:state.updated_at
    }:null,
    runs:runsResult.rows.map(row=>({
      id:String(row.id),
      gameAt:row.game_at,
      summary:row.summary||'',
      observations:Array.isArray(row.observations)?row.observations:[],
      directorNotes:Array.isArray(row.director_notes)?row.director_notes:[],
      plan:compactPlan(row.plan||{}),
      context:row.context_snapshot||{},
      queuedEvents:Number(row.queued_events)||0,
      queuedMessages:Number(row.queued_messages)||0,
      createdAt:row.created_at
    })),
    events:eventsResult.rows.map(row=>({
      id:String(row.id),key:row.event_key,type:row.event_type,app:row.app,title:row.title,body:row.body,
      payload:row.payload||{},scheduledGameAt:row.scheduled_game_at,status:row.status,
      createdAt:row.created_at,deliveredAt:row.delivered_at
    }))
  };
}

export async function GET(request){
  try{
    if(!(await isCurrentAdmin()))return NextResponse.json({error:'No autorizado.'},{status:403});
    await ensureSchema();
    const userId=request.nextUrl.searchParams.get('userId');
    if(!validUserId(userId))return NextResponse.json({error:'Jugador no válido.'},{status:400});
    const mind=await loadMind(userId);
    if(!mind)return NextResponse.json({error:'Jugador no encontrado.'},{status:404});
    return NextResponse.json({mind},{headers:{'Cache-Control':'no-store, max-age=0'}});
  }catch(error){
    console.error('admin_ai_mind_read_failed',error);
    return NextResponse.json({error:'No se pudo cargar la actividad de la IA.'},{status:500});
  }
}

export async function POST(request){
  try{
    if(!(await isCurrentAdmin()))return NextResponse.json({error:'No autorizado.'},{status:403});
    await ensureSchema();
    const body=await request.json();
    const userId=String(body?.userId||'');
    if(!validUserId(userId))return NextResponse.json({error:'Jugador no válido.'},{status:400});
    if(body?.action!=='review_now')return NextResponse.json({error:'Acción no válida.'},{status:400});

    const clock=await getWorldNow(userId,body?.timezone||'UTC');
    let context=await getPlayerContext(userId);
    if(!context)context=await ensurePlayerContext(userId,new Date(clock.game_now));
    const loc=await query('SELECT display_label,area,city,region,country,country_code,timezone FROM private_life.player_location WHERE user_id=$1 LIMIT 1',[userId]);
    await query(`INSERT INTO private_life.world_director_state
      (user_id,next_run_game_at,last_summary,last_plan,run_count,updated_at)
      VALUES($1,$2,'','{}'::jsonb,0,NOW())
      ON CONFLICT(user_id) DO UPDATE SET next_run_game_at=EXCLUDED.next_run_game_at,updated_at=NOW()`,[userId,clock.game_now]);

    const review=await maybeRunWorldDirector(userId,{
      gameNow:clock.game_now,
      timezone:clock.timezone,
      speed:Number(clock.speed)||1,
      paused:!!clock.paused,
      context,
      worldLocation:loc.rows[0]||null
    });
    const mind=await loadMind(userId);
    return NextResponse.json({ok:true,review,mind});
  }catch(error){
    console.error('admin_ai_mind_review_failed',error);
    return NextResponse.json({error:error?.message||'No se pudo forzar la revisión de la IA.'},{status:500});
  }
}
