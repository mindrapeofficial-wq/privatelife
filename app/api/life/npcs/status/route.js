import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth.js';
import { ensureSchema, query } from '../../../../../lib/db.js';
import { resolveRoutineState } from '../../../../../lib/life-routines.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function safeTimezone(value){
  const tz=String(value||'UTC').trim().slice(0,80)||'UTC';
  try{new Intl.DateTimeFormat('en-US',{timeZone:tz}).format(new Date());return tz}catch{return'UTC'}
}
async function worldClock(userId,requestedTimezone){
  const timezone=safeTimezone(requestedTimezone);
  await query(`INSERT INTO private_life.world_clock
    (user_id,anchor_real_at,anchor_game_at,speed,paused,timezone,created_at,updated_at)
    VALUES($1,NOW(),NOW(),1,FALSE,$2,NOW(),NOW())
    ON CONFLICT(user_id) DO UPDATE SET
      timezone=CASE WHEN private_life.world_clock.timezone='UTC' THEN EXCLUDED.timezone ELSE private_life.world_clock.timezone END`,[userId,timezone]);
  const r=await query(`SELECT
    speed,paused,timezone,
    CASE WHEN paused THEN anchor_game_at
      ELSE anchor_game_at + ((NOW()-anchor_real_at)*speed)
    END AS game_now
    FROM private_life.world_clock WHERE user_id=$1 LIMIT 1`,[userId]);
  return r.rows[0];
}
function publicState(base,state){
  return {
    ...base,
    activity:state.activity,
    label:state.label,
    location:state.location,
    availability:state.availability,
    replyMode:state.replyMode,
    canReplyNow:state.canReplyNow,
    localTime:state.localTime,
    timezone:state.timezone,
    nextTransitionInMinutes:state.nextTransitionInMinutes,
    minutesUntilAvailable:state.minutesUntilAvailable
  };
}

export async function GET(request){
  try{
    await ensureSchema();
    const user=await getCurrentUser();
    if(!user)return NextResponse.json({error:'No autorizado.'},{status:401});
    const clock=await worldClock(user.id,request.nextUrl.searchParams.get('timezone'));

    const [advanced,saveResult]=await Promise.all([
      query(`SELECT id,name,age,config FROM private_life.ai_characters
        WHERE owner_user_id=$1 AND is_active=TRUE ORDER BY updated_at DESC`,[user.id]),
      query('SELECT save_data FROM private_life.game_saves WHERE user_id=$1 LIMIT 1',[user.id])
    ]);
    const save=saveResult.rows[0]?.save_data||{};
    const gameNow=new Date(clock.game_now);
    const states=[];

    for(const row of advanced.rows){
      const config=row.config||{},identity=config.identity||{},world=config.world||{};
      const state=resolveRoutineState(world.schedule,gameNow,{
        occupation:identity.occupation||'',
        city:identity.city||'',
        timezone:clock.timezone,
        characterKey:'ai:'+row.id
      });
      states.push(publicState({
        id:'ai:'+row.id,
        npcId:Number(row.id),
        contactKey:'npc-'+row.id,
        source:'advanced',
        name:row.name,
        age:Number(row.age)
      },state));
    }

    const worldCharacters=Array.isArray(save?.world?.characters)?save.world.characters:[];
    for(const character of worldCharacters){
      if(character?.status==='retirado')continue;
      const state=resolveRoutineState(character?.routine,gameNow,{
        occupation:character?.occupation||'',
        city:character?.location||save?.identity?.city||'',
        timezone:clock.timezone,
        characterKey:'world:'+String(character?.id||character?.name||'npc')
      });
      states.push(publicState({
        id:'world:'+String(character?.id||character?.name||'npc'),
        npcId:null,
        contactKey:String(character?.id||''),
        source:'director',
        name:String(character?.name||'Personaje'),
        age:Number(character?.age)||18
      },state));
    }

    return NextResponse.json({
      gameNow:clock.game_now,
      timezone:clock.timezone,
      speed:Number(clock.speed)||1,
      paused:!!clock.paused,
      characters:states
    },{headers:{'Cache-Control':'no-store, max-age=0'}});
  }catch(error){
    console.error('life_npc_status_failed',error);
    return NextResponse.json({error:'No se pudo calcular el estado de los personajes.'},{status:500});
  }
}
