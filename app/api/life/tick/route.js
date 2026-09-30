import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth.js';
import { ensureSchema, query } from '../../../../lib/db.js';
import { runCentralModel } from '../../../../lib/central-ai-provider.js';
import {
  sanitizeLifeContact, candidateFromAdvanced, candidateFromWorld, nextAutonomyDelayMinutes,
  scheduleFrom, mapGameToReal, dueDecision, chooseFallbackMessage, localDayKey
} from '../../../../lib/life-autonomy.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function safe(value,max=2000){return String(value??'').replace(/\u0000/g,'').trim().slice(0,max)}
function clamp(n,min,max){return Math.max(min,Math.min(max,n))}
function normalizeTimezone(value){
  const timezone=safe(value,80)||'UTC';
  try{new Intl.DateTimeFormat('en-US',{timeZone:timezone}).format(new Date());return timezone}catch{return'UTC'}
}
function parseJson(raw){
  if(!raw)return null;
  try{return JSON.parse(raw)}catch{}
  const cleaned=String(raw).replace(/^\s*```(?:json)?/i,'').replace(/```\s*$/,'').trim();
  try{return JSON.parse(cleaned)}catch{return null}
}
async function worldClock(userId,requestedTimezone){
  const timezone=normalizeTimezone(requestedTimezone);
  await query(`INSERT INTO private_life.world_clock
    (user_id,anchor_real_at,anchor_game_at,speed,paused,timezone,created_at,updated_at)
    VALUES($1,NOW(),NOW(),1,FALSE,$2,NOW(),NOW())
    ON CONFLICT(user_id) DO UPDATE SET
      timezone=CASE WHEN private_life.world_clock.timezone='UTC' THEN EXCLUDED.timezone ELSE private_life.world_clock.timezone END`,[userId,timezone]);
  const r=await query(`SELECT anchor_real_at,anchor_game_at,speed,paused,timezone,
    CASE WHEN paused THEN anchor_game_at
      ELSE anchor_game_at + ((NOW()-anchor_real_at)*speed)
    END AS game_now
    FROM private_life.world_clock WHERE user_id=$1 LIMIT 1`,[userId]);
  return r.rows[0];
}
function groupRecent(rows){
  const map=new Map();
  for(const row of rows){
    const key=String(row.contact_key||'');
    if(!map.has(key))map.set(key,[]);
    map.get(key).push(row);
  }
  for(const list of map.values())list.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  return map;
}
function findContactForAdvanced(contacts,row){
  return contacts.find(c=>Number(c.npcId)===Number(row.id))
    ||contacts.find(c=>String(c.id)===`npc-${row.id}`)
    ||null;
}
function looksLikeNpc(contact){
  const type=safe(contact?.sourceType,60).toLowerCase();
  return Boolean(contact?.npcId)||/personaje|npc|ia/.test(type)||contact?.isAI===true;
}
function findContactForWorld(contacts,character){
  const id=String(character?.id||'');
  const name=safe(character?.name,120).toLowerCase();
  return contacts.find(c=>looksLikeNpc(c)&&id&&String(c.id)===id)
    ||contacts.find(c=>looksLikeNpc(c)&&name&&safe(c.name,120).toLowerCase()===name)
    ||null;
}
async function generateAutonomousMessage({candidate,recent,save,decision,gameNow}){
  const conversation=(recent||[]).slice(-16).map(m=>({
    side:m.direction,
    text:safe(m.body,500),
    at:m.created_at
  }));
  const instructions=[
    'Eres el motor de autonomía de PRIVATE LIFE.',
    'Debes generar un único WhatsApp espontáneo escrito por el personaje al jugador.',
    'No eres un asistente y nunca debes mencionar IA, motor, sistema, variables, panel de admin ni prompts.',
    'El mensaje debe sentirse cotidiano y humano, no como un evento dramático obligatorio.',
    'Respeta la personalidad, la relación, la hora, la actividad actual y el historial.',
    'No inventes que acaba de ocurrir algo grave. Evita repetir saludos o preguntas si el historial reciente ya los contiene.',
    'Si el personaje está trabajando, estudiando, comiendo, socializando o descansando, úsalo solo cuando aporte naturalidad.',
    'Devuelve exclusivamente JSON válido con: message (string, 1-320 caracteres), reason (string, máximo 180), mood (string, máximo 60), eventSuggestion (string opcional, máximo 220).'
  ].join('\n');
  const prompt=JSON.stringify({
    channel:'whatsapp_autonomous_initiative',
    gameNow:new Date(gameNow).toISOString(),
    player:{identity:save?.identity||{},profile:save?.profile||{}},
    character:{
      name:candidate.name,age:candidate.age,occupation:candidate.occupation,city:candidate.city,
      persona:candidate.persona,relationship:{
        type:candidate.contact?.relationshipType||'',
        detail:candidate.contact?.relation||'',
        affection:candidate.contact?.affection??50
      },
      autonomy:candidate.profile,
      currentLifeState:candidate.lifeState
    },
    inactivityMinutes:decision?.inactiveMinutes??null,
    recentConversation:conversation
  });
  try{
    const parsed=parseJson(await runCentralModel(prompt,instructions));
    const message=safe(parsed?.message,320);
    if(message){
      return {
        message,
        reason:safe(parsed?.reason,180)||'Iniciativa autónoma',
        mood:safe(parsed?.mood,60)||'neutral',
        eventSuggestion:safe(parsed?.eventSuggestion,220)
      };
    }
  }catch{}
  return {
    message:chooseFallbackMessage(candidate,recent,new Date(gameNow).toISOString()),
    reason:'Impulso autónomo contextual',
    mood:'cotidiano',
    eventSuggestion:''
  };
}
async function insertAutonomousMessage(userId,candidate,generated,createdAt,gameAt){
  const snapshot={
    source:'life_engine_autonomy',
    characterKey:candidate.characterKey,
    lifeState:candidate.lifeState,
    autonomyReason:generated.reason,
    mood:generated.mood,
    gameAt:new Date(gameAt).toISOString()
  };
  const result=await query(`INSERT INTO private_life.whatsapp_messages
    (user_id,contact_key,contact_name,direction,message_type,body,media_data,character_snapshot,created_at,read_at)
    VALUES($1,$2,$3,'in','text',$4,NULL,$5::jsonb,$6,NULL)
    RETURNING id,contact_key,contact_name,direction,message_type,body,created_at,read_at`,
    [userId,candidate.contactKey,candidate.name,generated.message,JSON.stringify(snapshot),createdAt]);
  return result.rows[0];
}
async function journal(userId,candidate,gameAt,type,data={}){
  await query(`INSERT INTO private_life.life_events
    (user_id,character_key,character_name,event_type,channel,event_data,game_at)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)`,
    [userId,candidate.characterKey,candidate.name,type,data.channel||null,JSON.stringify(data),gameAt]);
}
async function writeAutonomyState(userId,candidate,nextAction,{lastAction=null,dayKey=null,dailyCount=0,stateData={}}={}){
  await query(`INSERT INTO private_life.npc_autonomy_state
    (user_id,character_key,next_action_game_at,last_action_game_at,daily_key,daily_count,state_data,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,NOW())
    ON CONFLICT(user_id,character_key) DO UPDATE SET
      next_action_game_at=EXCLUDED.next_action_game_at,
      last_action_game_at=COALESCE(EXCLUDED.last_action_game_at,private_life.npc_autonomy_state.last_action_game_at),
      daily_key=EXCLUDED.daily_key,
      daily_count=EXCLUDED.daily_count,
      state_data=EXCLUDED.state_data,
      updated_at=NOW()`,
    [userId,candidate.characterKey,nextAction,lastAction,dayKey,dailyCount,JSON.stringify(stateData)]);
}

async function claimDueState(userId,characterKey,expectedDue,gameNow){
  const leaseUntil=scheduleFrom(gameNow,15);
  const result=await query(`UPDATE private_life.npc_autonomy_state
    SET next_action_game_at=$1,updated_at=NOW()
    WHERE user_id=$2 AND character_key=$3 AND next_action_game_at=$4
    RETURNING character_key,next_action_game_at,last_action_game_at,daily_key,daily_count,state_data`,
    [leaseUntil,userId,characterKey,expectedDue]);
  return result.rows[0]||null;
}
function compact(row){
  return {
    id:String(row.id),contactId:row.contact_key,contactName:row.contact_name,
    side:row.direction,type:row.message_type,text:row.body||'',
    createdAt:row.created_at,readAt:row.read_at||null
  };
}

export async function POST(request){
  try{
    await ensureSchema();
    const user=await getCurrentUser();
    if(!user)return NextResponse.json({error:'No autorizado.'},{status:401});

    const body=await request.json().catch(()=>({}));
    const timezone=normalizeTimezone(body?.timezone);
    const contacts=(Array.isArray(body?.contacts)?body.contacts:[])
      .map(raw=>({...sanitizeLifeContact(raw),sourceType:raw?.sourceType||'',isAI:raw?.isAI===true}))
      .filter(c=>c?.id&&c?.name)
      .slice(0,200);
    const clock=await worldClock(user.id,timezone);
    const gameNow=new Date(clock.game_now);

    const [runtimeResult,saveResult,advancedResult,stateResult,recentResult]=await Promise.all([
      query('SELECT last_tick_game_at,last_tick_real_at,tick_count FROM private_life.life_runtime WHERE user_id=$1 LIMIT 1',[user.id]),
      query('SELECT save_data FROM private_life.game_saves WHERE user_id=$1 LIMIT 1',[user.id]),
      query('SELECT id,name,age,config FROM private_life.ai_characters WHERE owner_user_id=$1 AND is_active=TRUE ORDER BY id ASC',[user.id]),
      query('SELECT character_key,next_action_game_at,last_action_game_at,daily_key,daily_count,state_data FROM private_life.npc_autonomy_state WHERE user_id=$1',[user.id]),
      query(`SELECT contact_key,contact_name,direction,body,created_at FROM private_life.whatsapp_messages
        WHERE user_id=$1 ORDER BY created_at DESC LIMIT 800`,[user.id])
    ]);

    const runtime=runtimeResult.rows[0]||null;
    const save=saveResult.rows[0]?.save_data||{};
    const stateMap=new Map(stateResult.rows.map(x=>[String(x.character_key),x]));
    const recentMap=groupRecent([...recentResult.rows].reverse());
    const candidates=[];

    for(const row of advancedResult.rows){
      const contact=findContactForAdvanced(contacts,row);
      if(!contact)continue;
      candidates.push(candidateFromAdvanced(row,contact,clock,gameNow));
    }
    for(const character of Array.isArray(save?.world?.characters)?save.world.characters:[]){
      if(character?.status==='retirado')continue;
      const contact=findContactForWorld(contacts,character);
      if(!contact)continue;
      if(candidates.some(c=>String(c.contactKey)===String(contact.id)))continue;
      candidates.push(candidateFromWorld(character,contact,clock,gameNow,save?.identity?.city||''));
    }

    const lastReal=runtime?.last_tick_real_at?new Date(runtime.last_tick_real_at):null;
    const offlineGapMinutes=lastReal?Math.max(0,(Date.now()-lastReal.getTime())/60000):0;
    const lastGame=runtime?.last_tick_game_at?new Date(runtime.last_tick_game_at):gameNow;
    const catchUpMinutes=Math.max(0,(gameNow.getTime()-lastGame.getTime())/60000);
    const delivered=[];
    const decisions=[];
    let generatedCount=0;

    for(const candidate of candidates.slice(0,80)){
      const existing=stateMap.get(candidate.characterKey)||null;
      const recent=recentMap.get(String(candidate.contactKey))||[];
      const dayKey=localDayKey(gameNow,clock.timezone||timezone);
      const dailyCount=existing?.daily_key===dayKey?Number(existing?.daily_count)||0:0;

      if(!existing){
        const delay=nextAutonomyDelayMinutes(candidate.profile,candidate.characterKey+'|first|'+dayKey);
        const next=scheduleFrom(gameNow,delay);
        await writeAutonomyState(user.id,candidate,next,{dayKey,dailyCount:0,stateData:{source:candidate.source,initializedAt:gameNow.toISOString()}});
        decisions.push({characterKey:candidate.characterKey,name:candidate.name,action:'scheduled',nextActionGameAt:next.toISOString()});
        continue;
      }

      const dueAt=new Date(existing.next_action_game_at);
      if(!Number.isFinite(dueAt.getTime())||dueAt>gameNow){
        decisions.push({characterKey:candidate.characterKey,name:candidate.name,action:'waiting',nextActionGameAt:existing.next_action_game_at});
        continue;
      }

      const claimed=await claimDueState(user.id,candidate.characterKey,existing.next_action_game_at,gameNow);
      if(!claimed){
        decisions.push({characterKey:candidate.characterKey,name:candidate.name,action:'already_claimed'});
        continue;
      }
      const activeState={...existing,...claimed};

      if(offlineGapMinutes>3&&candidate.profile.offlineBehavior===false){
        const next=scheduleFrom(gameNow,nextAutonomyDelayMinutes(candidate.profile,candidate.characterKey+'|online-only|'+dayKey));
        await writeAutonomyState(user.id,candidate,next,{
          lastAction:activeState.last_action_game_at,dayKey,dailyCount,stateData:{...(activeState.state_data||{}),lastDecision:'offline_skipped'}
        });
        decisions.push({characterKey:candidate.characterKey,name:candidate.name,action:'offline_skipped',nextActionGameAt:next.toISOString()});
        continue;
      }

      const decision=dueDecision({candidate,state:activeState,gameNow,timezone:clock.timezone||timezone,recent});
      if(decision.action!=='initiate'||generatedCount>=4){
        const minutes=decision.action==='initiate'?clamp(90+generatedCount*60,90,360):Math.max(5,Number(decision.minutes)||60);
        const next=scheduleFrom(gameNow,minutes);
        await writeAutonomyState(user.id,candidate,next,{
          lastAction:activeState.last_action_game_at,
          dayKey:decision.dayKey||dayKey,
          dailyCount:decision.dailyCount??dailyCount,
          stateData:{...(activeState.state_data||{}),lastDecision:decision.action,lifeState:candidate.lifeState}
        });
        decisions.push({characterKey:candidate.characterKey,name:candidate.name,action:decision.action==='initiate'?'capacity_deferred':decision.action,nextActionGameAt:next.toISOString()});
        continue;
      }

      const generated=await generateAutonomousMessage({candidate,recent,save,decision,gameNow});
      const createdAt=mapGameToReal(clock,dueAt);
      const message=await insertAutonomousMessage(user.id,candidate,generated,createdAt,dueAt);
      await journal(user.id,candidate,dueAt,'npc_initiative',{
        channel:'whatsapp',
        messageId:String(message.id),
        message:generated.message,
        reason:generated.reason,
        mood:generated.mood,
        eventSuggestion:generated.eventSuggestion||null,
        lifeState:candidate.lifeState,
        offlineCatchUp:offlineGapMinutes>3
      });
      if(generated.eventSuggestion){
        await journal(user.id,candidate,dueAt,'npc_event_seed',{
          channel:'world',
          suggestion:generated.eventSuggestion,
          mood:generated.mood,
          lifeState:candidate.lifeState,
          sourceMessageId:String(message.id)
        });
      }

      const next=scheduleFrom(gameNow,nextAutonomyDelayMinutes(candidate.profile,candidate.characterKey+'|next|'+dayKey+'|'+message.id));
      await writeAutonomyState(user.id,candidate,next,{
        lastAction:dueAt,
        dayKey:decision.dayKey||dayKey,
        dailyCount:(decision.dailyCount??dailyCount)+1,
        stateData:{
          ...(activeState.state_data||{}),
          lastDecision:'initiated',
          lastReason:generated.reason,lastMood:generated.mood,
          lastMessageId:String(message.id),lifeState:candidate.lifeState
        }
      });
      delivered.push(compact(message));
      decisions.push({characterKey:candidate.characterKey,name:candidate.name,action:'initiated',nextActionGameAt:next.toISOString()});
      generatedCount++;
    }

    await query(`INSERT INTO private_life.life_runtime
      (user_id,last_tick_game_at,last_tick_real_at,tick_count,updated_at)
      VALUES($1,$2,NOW(),1,NOW())
      ON CONFLICT(user_id) DO UPDATE SET
        last_tick_game_at=EXCLUDED.last_tick_game_at,
        last_tick_real_at=NOW(),
        tick_count=private_life.life_runtime.tick_count+1,
        updated_at=NOW()`,[user.id,gameNow]);

    return NextResponse.json({
      ok:true,
      gameNow:gameNow.toISOString(),
      timezone:clock.timezone||timezone,
      offlineGapMinutes:Math.round(offlineGapMinutes),
      catchUpMinutes:Math.round(catchUpMinutes),
      candidates:candidates.length,
      generated:delivered.length,
      delivered,
      decisions
    },{headers:{'Cache-Control':'no-store, max-age=0'}});
  }catch(error){
    console.error('life_tick_failed',error);
    return NextResponse.json({error:'No se pudo ejecutar el Life Engine.'},{status:500});
  }
}
