import { query } from './db.js';
import { resolveRoutineState } from './life-routines.js';
import { runCentralModel } from './central-ai-provider.js';
import { loadMindContext, claimDueIntention, resolveIntention, releaseIntention, recallMemories } from './life-memory.js';

function clamp(n,min,max){return Math.max(min,Math.min(max,Number(n)||0))}
function safe(value,max=500){return String(value??'').replace(/\u0000/g,'').trim().slice(0,max)}
function hash(value){let h=2166136261;for(const ch of String(value??'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return Math.abs(h>>>0)}
function between(min,max,seed){if(max<=min)return min;return min+(hash(seed)%(max-min+1))}
function plusMinutes(date,minutes){return new Date(new Date(date).getTime()+Math.max(1,Number(minutes)||1)*60000)}
function dayKey(date,timeZone='UTC'){
  try{return new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date))}
  catch{return new Date(date).toISOString().slice(0,10)}
}
function parseJson(raw){
  if(!raw)return null;
  try{return JSON.parse(raw)}catch{}
  try{return JSON.parse(String(raw).replace(/^\s*```(?:json)?/i,'').replace(/```\s*$/,'').trim())}catch{return null}
}
function normalizeContact(raw={}){
  const id=safe(raw.id,120),name=safe(raw.name,120);
  if(!id||!name||Number(raw.age)<18)return null;
  return {
    id,name,age:clamp(raw.age,18,120),city:safe(raw.city,120),
    relationshipType:safe(raw.relationshipType,80),relation:safe(raw.relation,160),
    affection:clamp(raw.affection??50,0,100),profile:safe(raw.profile,2200),
    sourceType:safe(raw.sourceType,80),isAI:raw.isAI===true,
    npcId:Number(raw.npcId)||null,
    npcConfigSnapshot:raw.npcConfigSnapshot&&typeof raw.npcConfigSnapshot==='object'&&!Array.isArray(raw.npcConfigSnapshot)?raw.npcConfigSnapshot:null
  };
}
function isNpcContact(contact){
  return Boolean(contact?.npcId)||contact?.isAI===true||/personaje|npc|ia/i.test(contact?.sourceType||'');
}
function profileFor(contact,advancedConfig,worldCharacter){
  const autonomy=advancedConfig?.autonomy||{};
  const social=advancedConfig?.social||{};
  const communication=advancedConfig?.communication||{};
  const traits=worldCharacter?.traits||{};
  const initiative=clamp(autonomy.initiative??traits.curiosidad??50,0,100);
  const proactivity=clamp(autonomy.proactivity??traits.apego??45,0,100);
  const autonomyScore=clamp(autonomy.autonomy??65,0,100);
  const spontaneity=clamp(autonomy.spontaneity??45,0,100);
  const maxPerDay=clamp(social.maxNewInteractionsPerDay??2,0,8);
  return {
    initiative,proactivity,autonomy:autonomyScore,spontaneity,maxPerDay,
    affection:clamp(contact?.affection??50,0,100),
    canStart:advancedConfig?autonomy.canStartConversations!==false&&social?.channels?.whatsapp!==false:worldCharacter?.status!=='retirado',
    offlineBehavior:advancedConfig?autonomy.offlineBehavior!==false:true,
    decisionNotes:safe(autonomy.decisionNotes,1000),
    responseSpeed:clamp(communication.responseSpeed??55,0,100)
  };
}
function nextDelay(profile,seed){
  const min=Math.round(clamp(1500-profile.initiative*11-profile.affection*2.5,180,1440));
  const spread=Math.round(clamp(2100-profile.proactivity*14,300,2100));
  return between(min,min+spread,seed);
}
function currentState(routine,gameNow,{occupation='',city='',timezone='UTC',key=''}) {
  return resolveRoutineState(routine,gameNow,{occupation,city,timezone,characterKey:key});
}
function candidateAdvanced(row,contact,clock,gameNow){
  const config=row.config||{},identity=config.identity||{},world=config.world||{};
  return {
    key:'ai:'+row.id,contactId:contact.id,name:row.name,age:Number(row.age)||18,source:'advanced',
    contact,occupation:identity.occupation||'',city:identity.city||contact.city||'',
    persona:{identity,personality:config.personality||{},communication:config.communication||{},emotions:config.emotions||{},relationships:config.relationships||{},world},
    life:currentState(world.schedule,gameNow,{occupation:identity.occupation||'',city:identity.city||contact.city||'',timezone:clock.timezone,key:'ai:'+row.id}),
    profile:profileFor(contact,config,null),
    memoryConfig:config.memory||{}
  };
}
function candidateWorld(character,contact,clock,gameNow,playerCity=''){
  const key='world:'+String(character.id||character.name||'npc');
  return {
    key,contactId:contact.id,name:safe(character.name||contact.name,120),age:Number(character.age)||18,source:'director',
    contact,occupation:character.occupation||'',city:character.location||contact.city||playerCity||'',
    persona:character,
    life:currentState(character.routine,gameNow,{occupation:character.occupation||'',city:character.location||contact.city||playerCity||'',timezone:clock.timezone,key}),
    profile:profileFor(contact,null,character),
    memoryConfig:{}
  };
}
function fallbackMessage(candidate,recent,seed){
  const pools={
    morning:['Buenos días. ¿Cómo va tu mañana?','Me he acordado de ti esta mañana. ¿Qué tal vas?'],
    work:['Tengo un momento entre cosas. ¿Cómo te va el día?','Estoy con algo de lío, pero me he acordado de ti.'],
    study:['Estoy haciendo una pausa. ¿Qué haces?','Necesitaba despejarme un momento. ¿Cómo estás?'],
    meal:['Estoy comiendo y me ha dado por escribirte. ¿Qué tal?','Pausa para comer. ¿Cómo va tu día?'],
    social:['Estoy fuera y me he acordado de ti.','Estoy por ahí. ¿Tú qué plan llevas?'],
    winding:['Antes de desconectar te iba a escribir. ¿Qué tal estás?','Estoy terminando el día. ¿Cómo ha ido el tuyo?'],
    free:['¿Qué haces?','Me he acordado de ti. ¿Cómo estás?','Tengo un rato libre. Cuéntame algo.','Ey, ¿cómo te está yendo el día?']
  };
  const recentOut=[...recent].reverse().find(x=>x.direction==='out'&&safe(x.body));
  const pool=recentOut&&hash(seed+'|recall')%3===0
    ?['Me quedé pensando en lo último que me dijiste.','Por cierto, me acordé de nuestra última conversación.']
    :(pools[candidate.life?.activity]||pools.free);
  return pool[hash(candidate.key+'|'+seed)%pool.length];
}
async function generateMessage(candidate,recent,save,gameNow,inactiveMinutes,mindContext=null,intention=null){
  const instructions=[
    'Eres el motor de autonomía de PRIVATE LIFE.',
    'Escribe un único WhatsApp espontáneo que este personaje enviaría al jugador por iniciativa propia.',
    'Nunca menciones IA, sistema, motor, variables, prompts ni panel de administración.',
    'Debe ser cotidiano y humano. No conviertas cada iniciativa en drama.',
    'Respeta la personalidad, relación, hora, actividad actual, historial reciente, recuerdos y asuntos pendientes.',
    'Si hay una intention activa, intenta cumplirla de forma natural en este mensaje sin sonar mecánico.',
    'No conviertas recuerdos internos en conocimiento imposible: solo usa recuerdos que el personaje realmente tenga.',
    'Evita repetir exactamente preguntas o saludos recientes.',
    'Devuelve solo JSON válido con message, reason, mood, eventSuggestion y recalledMemoryIds. message debe tener entre 1 y 320 caracteres; recalledMemoryIds es un array opcional de IDs de recuerdos realmente usados.'
  ].join('\n');
  const prompt=JSON.stringify({
    gameNow:new Date(gameNow).toISOString(),
    player:{identity:save?.identity||{},profile:save?.profile||{}},
    character:{
      name:candidate.name,age:candidate.age,occupation:candidate.occupation,city:candidate.city,
      persona:candidate.persona,currentLifeState:candidate.life,autonomy:candidate.profile,
      relationship:{type:candidate.contact.relationshipType,detail:candidate.contact.relation,affection:candidate.contact.affection}
    },
    inactiveMinutes,
    activeIntention:intention||null,
    relevantMemories:mindContext?.memories||[],
    pendingIntentions:mindContext?.intentions||[],
    recentConversation:recent.slice(-14).map(x=>({side:x.direction,text:safe(x.body,500),at:x.created_at}))
  });
  try{
    const parsed=parseJson(await runCentralModel(prompt,instructions));
    const message=safe(parsed?.message,320);
    if(message)return {
      message,
      reason:safe(parsed?.reason,180)||'Iniciativa autónoma',
      mood:safe(parsed?.mood,60)||'neutral',
      eventSuggestion:safe(parsed?.eventSuggestion,220),
      recalledMemoryIds:Array.isArray(parsed?.recalledMemoryIds)?parsed.recalledMemoryIds.map(Number).filter(Number.isFinite).slice(0,12):[]
    };
  }catch{}
  const fallback=intention?.summary
    ? ('Quería retomar una cosa: '+safe(intention.summary,220))
    : fallbackMessage(candidate,recent,new Date(gameNow).toISOString());
  return {message:fallback,reason:intention?'Intención pendiente':'Impulso autónomo contextual',mood:'cotidiano',eventSuggestion:'',recalledMemoryIds:[]};
}
function decision(candidate,state,gameNow,recent,timezone){
  const p=candidate.profile;
  if(!p.canStart||p.maxPerDay<=0)return {action:'reschedule',minutes:nextDelay(p,candidate.key+'|disabled')};
  const day=dayKey(gameNow,timezone),count=state?.daily_key===day?Number(state.daily_count)||0:0;
  if(count>=p.maxPerDay)return {action:'reschedule',minutes:between(360,1080,candidate.key+'|cap|'+day),day,count};
  const latest=recent.at(-1),latestAt=latest?.created_at?new Date(latest.created_at).getTime():0;
  const inactive=latestAt?Math.max(0,(Date.now()-latestAt)/60000):99999;
  const quiet=Math.round(clamp(420-p.initiative*2.5-p.affection*.8,90,420));
  if(inactive<quiet)return {action:'reschedule',minutes:quiet-Math.round(inactive)+between(20,120,candidate.key+'|quiet'),day,count};
  if(candidate.life?.availability==='offline')return {action:'postpone',minutes:Math.max(10,Number(candidate.life.minutesUntilContactable)||60)+between(5,35,candidate.key+'|wake'),day,count};
  if(candidate.life?.availability==='busy'&&p.initiative<75)return {action:'postpone',minutes:Math.max(20,Number(candidate.life.nextTransitionInMinutes)||45)+between(5,55,candidate.key+'|busy'),day,count};
  const roll=hash(candidate.key+'|'+day+'|'+Math.floor(new Date(gameNow).getTime()/3600000))%100;
  const threshold=clamp(p.autonomy*.35+p.initiative*.35+p.proactivity*.2+p.spontaneity*.1,10,92);
  if(roll>threshold)return {action:'reschedule',minutes:between(120,480,candidate.key+'|skip|'+day),day,count};
  return {action:'initiate',day,count,inactiveMinutes:Math.round(inactive)};
}
async function upsertState(userId,candidate,next,{lastAction=null,day=null,count=0,data={}}={}){
  await query(`INSERT INTO private_life.npc_autonomy_state
    (user_id,character_key,next_action_game_at,last_action_game_at,daily_key,daily_count,state_data,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,NOW())
    ON CONFLICT(user_id,character_key) DO UPDATE SET
      next_action_game_at=EXCLUDED.next_action_game_at,
      last_action_game_at=COALESCE(EXCLUDED.last_action_game_at,private_life.npc_autonomy_state.last_action_game_at),
      daily_key=EXCLUDED.daily_key,daily_count=EXCLUDED.daily_count,state_data=EXCLUDED.state_data,updated_at=NOW()`,
    [userId,candidate.key,next,lastAction,day,count,JSON.stringify(data)]);
}
async function claim(userId,key,due,gameNow){
  const lease=plusMinutes(gameNow,15);
  const r=await query(`UPDATE private_life.npc_autonomy_state SET next_action_game_at=$1,updated_at=NOW()
    WHERE user_id=$2 AND character_key=$3 AND next_action_game_at=$4 RETURNING *`,[lease,userId,key,due]);
  return r.rows[0]||null;
}
async function queueMessage(userId,candidate,generated,gameAt){
  const snapshot={source:'life_engine_autonomy',characterKey:candidate.key,lifeState:candidate.life,reason:generated.reason,mood:generated.mood,gameAt:new Date(gameAt).toISOString()};
  const r=await query(`INSERT INTO private_life.npc_pending_messages
    (user_id,contact_key,contact_name,body,snapshot,deliver_after)
    VALUES($1,$2,$3,$4,$5::jsonb,NOW())
    RETURNING id,contact_key,contact_name,body,deliver_after,created_at`,
    [userId,candidate.contactId,candidate.name,generated.message,JSON.stringify(snapshot)]);
  return r.rows[0];
}
async function logEvent(userId,candidate,gameAt,type,data){
  await query(`INSERT INTO private_life.npc_autonomy_events
    (user_id,character_key,character_name,event_type,event_data,game_at)
    VALUES($1,$2,$3,$4,$5::jsonb,$6)`,
    [userId,candidate.key,candidate.name,type,JSON.stringify(data||{}),gameAt]);
}
function realTimeForGame(clock,gameAt){
  if(!clock?.anchor_real_at||!clock?.anchor_game_at||clock.paused)return new Date();
  const real0=new Date(clock.anchor_real_at).getTime(),game0=new Date(clock.anchor_game_at).getTime(),target=new Date(gameAt).getTime(),speed=Math.max(.01,Number(clock.speed)||1);
  if(![real0,game0,target].every(Number.isFinite))return new Date();
  return new Date(Math.min(Date.now(),real0+(target-game0)/speed));
}

export async function tickNpcAutonomy(userId,{clock,save={},contacts=[]}={}){
  const normalized=(Array.isArray(contacts)?contacts:[]).map(normalizeContact).filter(Boolean);
  const npcContacts=normalized.filter(isNpcContact);
  if(!npcContacts.length)return {delivered:[],decisions:[],candidateCount:0,offlineGapMinutes:0};

  const gameNow=new Date(clock.game_now);
  const [runtimeResult,advancedResult,stateResult,recentResult]=await Promise.all([
    query('SELECT last_tick_real_at,last_tick_game_at,tick_count FROM private_life.life_runtime WHERE user_id=$1 LIMIT 1',[userId]),
    query('SELECT id,name,age,config FROM private_life.ai_characters WHERE owner_user_id=$1 AND is_active=TRUE ORDER BY id ASC',[userId]),
    query('SELECT * FROM private_life.npc_autonomy_state WHERE user_id=$1',[userId]),
    query('SELECT contact_key,contact_name,direction,body,created_at FROM private_life.whatsapp_messages WHERE user_id=$1 ORDER BY created_at DESC LIMIT 800',[userId])
  ]);
  const stateMap=new Map(stateResult.rows.map(x=>[String(x.character_key),x]));
  const recentMap=new Map();
  for(const row of [...recentResult.rows].reverse()){
    const key=String(row.contact_key);
    if(!recentMap.has(key))recentMap.set(key,[]);
    recentMap.get(key).push(row);
  }
  const candidates=[];
  for(const row of advancedResult.rows){
    const contact=npcContacts.find(c=>Number(c.npcId)===Number(row.id)||String(c.id)===`npc-${row.id}`);
    if(contact)candidates.push(candidateAdvanced(row,contact,clock,gameNow));
  }
  for(const character of Array.isArray(save?.world?.characters)?save.world.characters:[]){
    if(character?.status==='retirado')continue;
    const name=safe(character?.name,120).toLowerCase();
    const contact=npcContacts.find(c=>name&&c.name.toLowerCase()===name);
    if(contact&&!candidates.some(c=>c.contactId===contact.id))candidates.push(candidateWorld(character,contact,clock,gameNow,save?.identity?.city||''));
  }

  const runtime=runtimeResult.rows[0]||null;
  const offlineGap=runtime?.last_tick_real_at?Math.max(0,(Date.now()-new Date(runtime.last_tick_real_at).getTime())/60000):0;
  const delivered=[],decisions=[];
  let generatedCount=0;

  for(const candidate of candidates.slice(0,80)){
    const existing=stateMap.get(candidate.key)||null;
    const recent=recentMap.get(String(candidate.contactId))||[];
    const day=dayKey(gameNow,clock.timezone||'UTC');
    const count=existing?.daily_key===day?Number(existing.daily_count)||0:0;
    const mindContext=await loadMindContext(userId,candidate.key,gameNow);

    if(count<candidate.profile.maxPerDay&&generatedCount<4){
      const intention=await claimDueIntention(userId,candidate.key,gameNow);
      if(intention){
        const latest=recent.at(-1);
        const recentMinutes=latest?.created_at?Math.max(0,(Date.now()-new Date(latest.created_at).getTime())/60000):99999;
        const shouldPostpone=
          (offlineGap>3&&candidate.profile.offlineBehavior===false)
          || candidate.life?.availability==='offline'
          || (candidate.life?.availability==='busy'&&intention.priority<80)
          || recentMinutes<45;
        if(shouldPostpone){
          await releaseIntention(userId,intention.id,gameNow,'Aplazada por contexto, disponibilidad o conversación demasiado reciente.');
          decisions.push({characterKey:candidate.key,name:candidate.name,action:'intention_postponed',intentionId:intention.id});
          continue;
        }else{
          const generated=await generateMessage(candidate,recent,save,gameNow,Math.round(recentMinutes),mindContext,intention);
          const pending=await queueMessage(userId,candidate,generated,gameNow);
          if(generated.recalledMemoryIds?.length)await recallMemories(userId,generated.recalledMemoryIds,gameNow);
          await resolveIntention(userId,intention.id,gameNow,'Convertida en iniciativa de WhatsApp.');
          await logEvent(userId,candidate,gameNow,'npc_intention_executed',{
            intentionId:intention.id,intention:intention.summary,pendingId:String(pending.id),
            message:generated.message,reason:generated.reason,mood:generated.mood,lifeState:candidate.life,
            offlineCatchUp:offlineGap>3
          });
          const next=plusMinutes(gameNow,nextDelay(candidate.profile,candidate.key+'|intent-next|'+day+'|'+pending.id));
          await upsertState(userId,candidate,next,{
            lastAction:gameNow,day,count:count+1,
            data:{...(existing?.state_data||{}),lastDecision:'intention_executed',lastIntentionId:intention.id,lastPendingId:String(pending.id),lifeState:candidate.life}
          });
          decisions.push({characterKey:candidate.key,name:candidate.name,action:'intention_executed',intentionId:intention.id,nextActionGameAt:next.toISOString()});
          generatedCount++;
          continue;
        }
      }
    }

    if(!existing){
      const next=plusMinutes(gameNow,nextDelay(candidate.profile,candidate.key+'|first|'+day));
      await upsertState(userId,candidate,next,{day,count:0,data:{source:candidate.source,initializedAt:gameNow.toISOString()}});
      decisions.push({characterKey:candidate.key,name:candidate.name,action:'scheduled',nextActionGameAt:next.toISOString()});
      continue;
    }
    const dueAt=new Date(existing.next_action_game_at);
    if(!Number.isFinite(dueAt.getTime())||dueAt>gameNow)continue;
    const active=await claim(userId,candidate.key,existing.next_action_game_at,gameNow);
    if(!active)continue;

    if(offlineGap>3&&candidate.profile.offlineBehavior===false){
      const next=plusMinutes(gameNow,nextDelay(candidate.profile,candidate.key+'|online-only|'+day));
      await upsertState(userId,candidate,next,{lastAction:active.last_action_game_at,day,count,data:{...(active.state_data||{}),lastDecision:'offline_skipped'}});
      decisions.push({characterKey:candidate.key,name:candidate.name,action:'offline_skipped',nextActionGameAt:next.toISOString()});
      continue;
    }

    const d=decision(candidate,active,gameNow,recent,clock.timezone||'UTC');
    if(d.action!=='initiate'||generatedCount>=4){
      const minutes=d.action==='initiate'?90+generatedCount*60:Math.max(5,Number(d.minutes)||60);
      const next=plusMinutes(gameNow,minutes);
      await upsertState(userId,candidate,next,{lastAction:active.last_action_game_at,day:d.day||day,count:d.count??count,data:{...(active.state_data||{}),lastDecision:d.action,lifeState:candidate.life}});
      decisions.push({characterKey:candidate.key,name:candidate.name,action:d.action==='initiate'?'capacity_deferred':d.action,nextActionGameAt:next.toISOString()});
      continue;
    }

    const generated=await generateMessage(candidate,recent,save,gameNow,d.inactiveMinutes,mindContext,null);
    if(generated.recalledMemoryIds?.length)await recallMemories(userId,generated.recalledMemoryIds,gameNow);
    const pending=await queueMessage(userId,candidate,generated,dueAt);
    await logEvent(userId,candidate,dueAt,'npc_initiative',{pendingId:String(pending.id),message:generated.message,reason:generated.reason,mood:generated.mood,eventSuggestion:generated.eventSuggestion||null,lifeState:candidate.life,offlineCatchUp:offlineGap>3});
    if(generated.eventSuggestion)await logEvent(userId,candidate,dueAt,'npc_event_seed',{suggestion:generated.eventSuggestion,mood:generated.mood,sourcePendingId:String(pending.id),lifeState:candidate.life});

    const next=plusMinutes(gameNow,nextDelay(candidate.profile,candidate.key+'|next|'+day+'|'+pending.id));
    await upsertState(userId,candidate,next,{lastAction:dueAt,day:d.day||day,count:(d.count??count)+1,data:{...(active.state_data||{}),lastDecision:'initiated',lastReason:generated.reason,lastMood:generated.mood,lastPendingId:String(pending.id),lifeState:candidate.life}});
    decisions.push({characterKey:candidate.key,name:candidate.name,action:'initiated',nextActionGameAt:next.toISOString()});
    generatedCount++;
  }

  await query(`INSERT INTO private_life.life_runtime(user_id,last_tick_game_at,last_tick_real_at,tick_count,updated_at)
    VALUES($1,$2,NOW(),1,NOW()) ON CONFLICT(user_id) DO UPDATE SET
    last_tick_game_at=EXCLUDED.last_tick_game_at,last_tick_real_at=NOW(),tick_count=private_life.life_runtime.tick_count+1,updated_at=NOW()`,[userId,gameNow]);

  return {delivered,decisions,candidateCount:candidates.length,offlineGapMinutes:Math.round(offlineGap)};
}
