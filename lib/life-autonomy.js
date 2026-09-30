import { resolveRoutineState } from './life-routines.js';

function clamp(n,min,max){return Math.max(min,Math.min(max,n))}
function safe(value,max=400){return String(value??'').replace(/\u0000/g,'').trim().slice(0,max)}
function hash(value){let h=2166136261;for(const ch of String(value??'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return Math.abs(h>>>0)}
function between(min,max,seed){if(max<=min)return min;return min+(hash(seed)%(max-min+1))}
function isoDateKey(date,timeZone='UTC'){
  try{
    return new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
  }catch{return date.toISOString().slice(0,10)}
}
export function sanitizeLifeContact(raw={}){
  const id=safe(raw.id||raw.contactKey,120),name=safe(raw.name,120);
  if(!id||!name)return null;
  return {
    id,name,age:clamp(Number(raw.age)||18,18,120),city:safe(raw.city,120),
    affection:clamp(Number(raw.affection)||50,0,100),
    relationshipType:safe(raw.relationshipType,80),relation:safe(raw.relation,160),
    profile:safe(raw.profile,2500),npcId:Number(raw.npcId)||null,
    npcConfigSnapshot:raw.npcConfigSnapshot&&typeof raw.npcConfigSnapshot==='object'&&!Array.isArray(raw.npcConfigSnapshot)?raw.npcConfigSnapshot:null
  };
}
export function autonomyProfile({contact,advancedConfig,worldCharacter}={}){
  const a=advancedConfig?.autonomy||{};
  const social=advancedConfig?.social||{};
  const communication=advancedConfig?.communication||{};
  const traits=worldCharacter?.traits||{};
  const initiative=clamp(Number(a.initiative ?? traits.curiosidad ?? 50)||50,0,100);
  const proactivity=clamp(Number(a.proactivity ?? traits.apego ?? 45)||45,0,100);
  const autonomy=clamp(Number(a.autonomy ?? 65)||65,0,100);
  const spontaneity=clamp(Number(a.spontaneity ?? 45)||45,0,100);
  const responseSpeed=clamp(Number(communication.responseSpeed ?? 55)||55,0,100);
  const maxPerDay=clamp(Number(social.maxNewInteractionsPerDay ?? 2)||2,0,8);
  const canStart=advancedConfig
    ? a.canStartConversations!==false && social?.channels?.whatsapp!==false
    : worldCharacter?.status!=='retirado';
  const offlineBehavior=advancedConfig ? a.offlineBehavior!==false : true;
  return {
    initiative,proactivity,autonomy,spontaneity,responseSpeed,maxPerDay,canStart,offlineBehavior,
    affection:clamp(Number(contact?.affection)||50,0,100),
    decisionNotes:safe(a.decisionNotes,1200)
  };
}
export function nextAutonomyDelayMinutes(profile={},seed=''){
  const initiative=clamp(Number(profile.initiative)||50,0,100);
  const proactivity=clamp(Number(profile.proactivity)||50,0,100);
  const affection=clamp(Number(profile.affection)||50,0,100);
  const min=Math.round(clamp(1500-initiative*11-affection*2.5,180,1440));
  const spread=Math.round(clamp(2100-proactivity*14,300,2100));
  return between(min,min+spread,seed);
}
export function scheduleFrom(baseDate,minutes){
  return new Date(new Date(baseDate).getTime()+Math.max(1,Number(minutes)||1)*60000);
}
export function mapGameToReal(clock,gameDate){
  const gameMs=new Date(gameDate).getTime();
  if(!Number.isFinite(gameMs)||clock?.paused)return new Date();
  const anchorGame=new Date(clock?.anchor_game_at).getTime();
  const anchorReal=new Date(clock?.anchor_real_at).getTime();
  const speed=Math.max(.01,Number(clock?.speed)||1);
  if(!Number.isFinite(anchorGame)||!Number.isFinite(anchorReal))return new Date();
  const mapped=anchorReal+(gameMs-anchorGame)/speed;
  return new Date(Math.min(Date.now(),mapped));
}
export function candidateFromAdvanced(row,contact,clock,gameNow){
  const config=row?.config||{},identity=config.identity||{},world=config.world||{};
  const lifeState=resolveRoutineState(world.schedule,gameNow,{
    occupation:identity.occupation||'',city:identity.city||contact?.city||'',
    timezone:clock?.timezone||'UTC',characterKey:'ai:'+row.id
  });
  return {
    characterKey:'ai:'+row.id,contactKey:contact.id,name:row.name,age:Number(row.age)||18,
    source:'advanced',occupation:identity.occupation||'',city:identity.city||contact?.city||'',
    persona:{identity,personality:config.personality||{},communication:config.communication||{},emotions:config.emotions||{},relationships:config.relationships||{},world},
    routine:world.schedule||null,lifeState,profile:autonomyProfile({contact,advancedConfig:config}),contact
  };
}
export function candidateFromWorld(character,contact,clock,gameNow,playerCity=''){
  const lifeState=resolveRoutineState(character?.routine,gameNow,{
    occupation:character?.occupation||'',city:character?.location||contact?.city||playerCity||'',
    timezone:clock?.timezone||'UTC',characterKey:'world:'+String(character?.id||character?.name||'npc')
  });
  return {
    characterKey:'world:'+String(character?.id||character?.name||'npc'),
    contactKey:contact.id,name:safe(character?.name||contact?.name,120),age:Number(character?.age)||18,
    source:'director',occupation:character?.occupation||'',city:character?.location||contact?.city||playerCity||'',
    persona:character||{},routine:character?.routine||null,lifeState,
    profile:autonomyProfile({contact,worldCharacter:character}),contact
  };
}
export function localDayKey(gameNow,timeZone){return isoDateKey(new Date(gameNow),timeZone)}
export function chooseFallbackMessage(candidate,recent=[],seed=''){
  const life=candidate.lifeState||{},contact=candidate.contact||{};
  const recentOut=[...recent].reverse().find(m=>m.direction==='out'&&safe(m.body,500));
  const recentIn=[...recent].reverse().find(m=>m.direction==='in'&&safe(m.body,500));
  const pools={
    morning:['Buenos días. Me he acordado de ti ahora mismo.','¿Cómo va tu mañana?','Hoy he empezado el día pensando en una cosa que me dijiste.'],
    work:['Tengo un momento entre cosas. ¿Cómo te va el día?','Estoy con lío, pero me he acordado de ti.','Mini descanso. ¿Qué tal vas?'],
    study:['Estoy haciendo una pausa y necesitaba distraerme un poco. ¿Qué haces?','Llevo un rato estudiando y mi cerebro ha decidido pensar en cualquier otra cosa. ¿Cómo estás?'],
    meal:['Estoy comiendo y me ha dado por escribirte. ¿Qué tal?','Pausa para comer. ¿Cómo va tu día?'],
    social:['Estoy fuera y me he acordado de ti.','Estoy por ahí y me ha surgido una pregunta para ti.','Hoy hay ambiente. ¿Tú qué plan llevas?'],
    free:['¿Qué haces?','Me he acordado de ti. ¿Cómo estás?','Tengo un rato libre. Cuéntame algo.','Ey, ¿cómo te está yendo el día?'],
    winding:['Antes de desconectar te iba a escribir. ¿Qué tal estás?','Estoy terminando el día. ¿Cómo ha ido el tuyo?']
  };
  let pool=pools[life.activity]||pools.free;
  if(recentOut&&Date.now()%3===0)pool=[
    'Me quedé pensando en lo último que me dijiste.',
    'Por cierto, me acordé de nuestra última conversación.',
    'Se me ha venido a la cabeza lo que hablamos el otro día.'
  ];
  const line=pool[hash(candidate.characterKey+'|'+seed)%pool.length];
  if(contact.affection>70&&candidate.profile.initiative>65&&hash(seed)%4===0)return line.replace(/[.]?$/,'')+' 🙂';
  if(recentIn&&hash(seed)%5===0)return 'Por cierto, te iba a decir una cosa desde antes. ¿Tienes un minuto?';
  return line;
}
export function dueDecision({candidate,state,gameNow,timezone,recent=[]}){
  const profile=candidate.profile;
  if(!profile.canStart||!profile.offlineBehavior||profile.maxPerDay<=0)return {action:'reschedule',minutes:nextAutonomyDelayMinutes(profile,candidate.characterKey+'|disabled')};
  const dayKey=localDayKey(gameNow,timezone);
  const count=state?.daily_key===dayKey?Number(state?.daily_count)||0:0;
  if(count>=profile.maxPerDay)return {action:'reschedule',minutes:between(360,1080,candidate.characterKey+'|daily|'+dayKey),dayKey,dailyCount:count};

  const latest=recent.at(-1);
  const latestAt=latest?.created_at?new Date(latest.created_at).getTime():0;
  const inactiveMinutes=latestAt?Math.max(0,(Date.now()-latestAt)/60000):99999;
  const quietFloor=Math.round(clamp(420-profile.initiative*2.5-profile.affection*.8,90,420));
  if(inactiveMinutes<quietFloor)return {action:'reschedule',minutes:quietFloor-Math.round(inactiveMinutes)+between(20,120,candidate.characterKey+'|quiet'),dayKey,dailyCount:count};

  if(candidate.lifeState?.availability==='offline'){
    return {action:'postpone',minutes:Math.max(10,Number(candidate.lifeState.minutesUntilContactable)||60)+between(5,35,candidate.characterKey+'|wake'),dayKey,dailyCount:count};
  }
  if(candidate.lifeState?.availability==='busy'&&profile.initiative<75){
    return {action:'postpone',minutes:Math.max(20,Number(candidate.lifeState.nextTransitionInMinutes)||45)+between(5,55,candidate.characterKey+'|busy'),dayKey,dailyCount:count};
  }
  const roll=hash(candidate.characterKey+'|'+dayKey+'|'+Math.floor(new Date(gameNow).getTime()/3600000))%100;
  const threshold=clamp(Math.round(profile.autonomy*.35+profile.initiative*.35+profile.proactivity*.2+profile.spontaneity*.1),10,92);
  if(roll>threshold)return {action:'reschedule',minutes:between(120,480,candidate.characterKey+'|skip|'+dayKey),dayKey,dailyCount:count};
  return {action:'initiate',dayKey,dailyCount:count,inactiveMinutes:Math.round(inactiveMinutes)};
}
