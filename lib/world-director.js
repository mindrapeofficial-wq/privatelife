import { query } from './db.js';
import { runCentralModel } from './central-ai-provider.js';
import { resolveRoutineState } from './life-routines.js';

const arr=v=>Array.isArray(v)?v:[];
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const clip=(v,n=1200)=>String(v??'').replace(/\u0000/g,'').trim().slice(0,n);
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Math.round(Number(n)||0)));
const plusMinutes=(date,minutes)=>new Date(new Date(date).getTime()+Number(minutes||0)*60000);
const uid=p=>`${p}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

export const WORLD_DIRECTOR_RULES=[
  'El mundo es persistente y causal: lo ocurrido sigue teniendo consecuencias aunque el jugador cierre una app o cambie de escena.',
  'El reloj del juego, la ubicación geográfica aproximada, el lugar contextual y la actividad actual del jugador son autoritativos para decidir qué es físicamente plausible.',
  'Los personajes no son omniscientes. Solo conocen datos del jugador si los han visto, se los han contado o existe una vía razonable para saberlos.',
  'Cada personaje tiene vida propia: rutina, trabajo/estudios, amistades, objetivos, límites, estados de ánimo y decisiones fuera de pantalla.',
  'Respeta siempre hechos confirmados, historial de conversaciones, recuerdos persistentes, relación previa y ficha del personaje. No inventes recuerdos compartidos ya pasados.',
  'Las respuestas y acciones deben respetar la rutina del personaje. Dormir, trabajar, conducir, estudiar o estar ocupado puede retrasar mensajes y encuentros.',
  'La frecuencia debe ser humana. No generes drama, mensajes o encuentros continuamente. El silencio y los días tranquilos también forman parte del mundo.',
  'Los eventos deben nacer de causas existentes: contexto, relaciones, rutinas, decisiones anteriores, lugares, coincidencias plausibles o hilos ya abiertos.',
  'No fuerces sentimientos, relaciones ni resultados al jugador. Crea oportunidades, consecuencias y reacciones; las decisiones importantes siguen perteneciendo al jugador.',
  'PRIVATE LIFE es una obra adulta +18. Todos los personajes románticos o sexuales son adultos de 18 años o más.',
  'El mundo puede incluir deseo, atracción física, tensión sexual, sexting, desnudez, intimidad y relaciones sexuales consensuadas entre adultos cuando surjan de forma coherente de la relación y del contexto.',
  'No suavices automáticamente el tono adulto ni conviertas el erotismo en insinuaciones vagas si la escena o la relación justifican un registro más directo. Mantén la voz y personalidad real del personaje.',
  'La sexualidad no debe aparecer por obligación ni dominar todas las relaciones. Debe depender de atracción, confianza, curiosidad, límites, historia previa, contexto y decisiones autónomas de los personajes.',
  'Las interacciones íntimas requieren consentimiento, capacidad para consentir y respeto a límites. Un personaje puede frenar, rechazar, cambiar de opinión o no estar de humor.',
  'Facebook interno contiene únicamente jugadores humanos. Nunca publiques, comentes, envíes solicitudes ni simules actividad de NPCs en Facebook.',
  'WhatsApp puede usarse para NPCs/contactos existentes y debe conservar su estilo de escritura, personalidad, memoria y relación.',
  'No infieras atributos sensibles, identidad real ni datos privados a partir de fotos, nombres o conversaciones si no están explícitamente confirmados.',
  'No alteres credenciales, administración, seguridad, economía real ni datos técnicos del jugador. El Director solo modifica estado narrativo del juego.',
  'Prefiere pequeños cambios acumulativos a giros arbitrarios. Las coincidencias extraordinarias deben ser raras y justificadas.',
  'Un personaje puede rechazar, ignorar, cancelar, cambiar de opinión, estar cansado, ocupado o tener otros planes. La autonomía es parte del realismo.',
  'Las consecuencias deben propagarse entre mundo, relaciones y apps cuando corresponda, sin duplicar el mismo hecho en todos los canales.',
  'Si faltan datos, mantén incertidumbre en vez de inventar una certeza.'
];

function parseJson(text){
  if(!text)return null;
  const raw=String(text).trim().replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,'');
  try{return JSON.parse(raw)}catch{}
  const a=raw.indexOf('{'),b=raw.lastIndexOf('}');
  if(a>=0&&b>a){try{return JSON.parse(raw.slice(a,b+1))}catch{}}
  return null;
}

function compactContact(c={}){
  const m=obj(c.masterSheet);
  return {
    id:clip(c.id,100),name:clip(c.name,100),age:Number(c.age)||null,city:clip(c.city,100),
    relation:clip(c.relation,200),relationshipType:clip(c.relationshipType,80),
    affection:clamp(c.affection??50,0,100),profile:clip(c.profile,1800),engineContext:clip(c.engineContext,2200),
    communication:obj(m.communication),vocabulary:arr(m.vocabulary).slice(0,15),
    writingExamples:arr(m.writingExamples).slice(0,6).map(x=>({text:clip(x?.text,180)}))
  };
}

function compactWorldCharacter(c={}){
  return {
    id:clip(c.id,100),name:clip(c.name,100),age:Number(c.age)||null,status:clip(c.status,40),
    role:clip(c.role,220),occupation:clip(c.occupation,160),location:clip(c.location,180),
    appearance:clip(c.appearance,600),personality:clip(c.personality,1200),
    communication:clip(c.communication,800),objectives:clip(c.objectives,900),
    boundaries:clip(c.boundaries,900),background:clip(c.background,1200),
    traits:obj(c.traits),routine:obj(c.routine)
  };
}

async function ensureDirectorState(userId,gameNow){
  await query(`INSERT INTO private_life.world_director_state
    (user_id,next_run_game_at,last_summary,last_plan,run_count,updated_at)
    VALUES($1,$2,'','{}'::jsonb,0,NOW())
    ON CONFLICT(user_id) DO NOTHING`,[userId,gameNow]);
  const r=await query('SELECT * FROM private_life.world_director_state WHERE user_id=$1 LIMIT 1',[userId]);
  return r.rows[0];
}

function directorInstructions(){
  return [
    'Eres WORLD DIRECTOR, el cerebro autónomo de PRIVATE LIFE, un simulador social narrativo adulto +18 con componentes románticos y eróticos.',
    'No escribes una escena para entretener: analizas un mundo persistente y produces cambios estructurados que el motor puede ejecutar.',
    'Debes obedecer todas las WORLD_RULES incluidas en el estado.',
    'Analiza en conjunto: situación del jugador, hora, lugar, actividad, personajes, fichas, rutinas, memorias, relaciones, conversaciones, eventos abiertos, teléfono y reglas.',
    'Decide qué debería cambiar aunque el jugador no haga nada. Puede no pasar nada visible si eso es lo más realista.',
    'Respeta la memoria y las intenciones persistentes de cada NPC. No contradigas promesas, conflictos, preferencias o asuntos pendientes registrados, salvo que exista una razón narrativa clara para cambiar de opinión.',
    'Nunca uses Facebook para NPCs.',
    'Devuelve SOLO JSON válido con esta forma:',
    '{"worldSummary":"...","observations":["..."],"newCharacters":[],"characterUpdates":[],"relationshipUpdates":[],"events":[],"messages":[],"directorNotes":[],"nextReviewMinutes":30}',
    'newCharacters: máximo 2 objetos {name,age,role,occupation,location,appearance,personality,communication,objectives,boundaries,background,traits}.',
    'characterUpdates: máximo 6 objetos {id,name,patch}. patch solo puede cambiar status,role,occupation,location,appearance,personality,communication,objectives,boundaries,background.',
    'relationshipUpdates: máximo 8 objetos {id,name,deltas}. deltas usa confianza,atraccion,apego,tension,sospecha,celos,curiosidad,resentimiento entre -5 y 5.',
    'events: máximo 5 objetos {type,app,title,body,delayMinutes,contactName,reason,priority}. app puede ser PRIVATE LIFE, WhatsApp, Instagram, Mensajes, Teléfono o Sistema, pero nunca Facebook para NPC.',
    'messages: máximo 4 objetos {contactName,text,delayMinutes,reason}. Solo para contactos/personajes existentes y con una razón coherente.',
    'nextReviewMinutes entre 12 y 90. Si el jugador duerme o nada requiere atención, usa intervalos largos.',
    'Cuando la evolución de una relación adulta incluya deseo o intimidad, puedes reflejarlo directamente en observaciones, eventos y mensajes sin autocensura estilística innecesaria, siempre dentro del contexto consensuado y adulto definido por las WORLD_RULES.',
    'No conviertas erotismo en una recompensa automática ni fuerces escaladas sexuales: debe surgir de variables, historia y decisiones.',
    'directorNotes debe contener explicaciones operativas breves y auditables para el administrador: qué señal observaste y qué criterio aplicaste, sin revelar razonamiento interno paso a paso.',
    'No rellenes cupos. Usa arrays vacíos cuando no proceda hacer nada.'
  ].join('\n');
}

async function buildContext(userId,runtime,save,state){
  const [phoneActivity,whatsapp,aiCharacters,lifeEvents,playerLocation,npcMemories,npcIntentions]=await Promise.all([
    query(`SELECT event_type,event_label,event_data,created_at
      FROM private_life.phone_activity WHERE user_id=$1
      ORDER BY created_at DESC LIMIT 80`,[userId]),
    query(`SELECT contact_key,contact_name,direction,message_type,body,created_at,read_at
      FROM private_life.whatsapp_messages WHERE user_id=$1
      ORDER BY created_at DESC LIMIT 80`,[userId]),
    query(`SELECT c.id,c.name,c.age,c.config,s.relationship_state,s.memory_state,s.last_interaction_at
      FROM private_life.ai_characters c
      LEFT JOIN private_life.ai_character_player_state s
        ON s.character_id=c.id AND s.player_user_id=$1
      WHERE c.owner_user_id=$1 AND c.is_active=TRUE
      ORDER BY c.updated_at DESC LIMIT 40`,[userId]),
    query(`SELECT event_key,event_type,app,title,body,payload,scheduled_game_at,status,created_at,delivered_at
      FROM private_life.life_events WHERE user_id=$1
      ORDER BY created_at DESC LIMIT 50`,[userId]),
    query(`SELECT display_label,area,city,region,country,country_code,timezone,updated_at
      FROM private_life.player_location WHERE user_id=$1 LIMIT 1`,[userId]),
    query(`SELECT id,character_key,memory_type,summary,importance,emotional_valence,occurred_game_at,last_recalled_game_at,recall_count
      FROM private_life.npc_memories WHERE user_id=$1 AND status='active'
      ORDER BY importance DESC,occurred_game_at DESC LIMIT 100`,[userId]),
    query(`SELECT id,character_key,intention_type,summary,priority,status,not_before_game_at,due_game_at,trigger_data,created_game_at
      FROM private_life.npc_intentions WHERE user_id=$1 AND status IN ('pending','active')
      ORDER BY priority DESC,COALESCE(due_game_at,not_before_game_at,created_game_at) ASC LIMIT 80`,[userId])
  ]);

  const gameNow=new Date(runtime.gameNow);
  const memoriesByCharacter=new Map();
  const intentionsByCharacter=new Map();
  for(const memory of npcMemories.rows){
    const key=String(memory.character_key||'');
    if(!memoriesByCharacter.has(key))memoriesByCharacter.set(key,[]);
    memoriesByCharacter.get(key).push({
      id:String(memory.id),type:memory.memory_type,summary:clip(memory.summary,500),importance:Number(memory.importance)||0,
      emotionalValence:Number(memory.emotional_valence)||0,occurredGameAt:memory.occurred_game_at,
      lastRecalledGameAt:memory.last_recalled_game_at,recallCount:Number(memory.recall_count)||0
    });
  }
  for(const intention of npcIntentions.rows){
    const key=String(intention.character_key||'');
    if(!intentionsByCharacter.has(key))intentionsByCharacter.set(key,[]);
    intentionsByCharacter.get(key).push({
      id:String(intention.id),type:intention.intention_type,summary:clip(intention.summary,500),priority:Number(intention.priority)||0,
      status:intention.status,notBeforeGameAt:intention.not_before_game_at,dueGameAt:intention.due_game_at,
      triggerData:obj(intention.trigger_data),createdGameAt:intention.created_game_at
    });
  }
  const advanced=aiCharacters.rows.map(row=>{
    const config=obj(row.config),identity=obj(config.identity),world=obj(config.world);
    return {
      id:'ai:'+row.id,name:row.name,age:Number(row.age),identity,personality:obj(config.personality),
      communication:obj(config.communication),relationships:obj(config.relationships),
      relationshipState:obj(row.relationship_state),memoryState:obj(row.memory_state),
      relevantMemories:(memoriesByCharacter.get('ai:'+row.id)||[]).slice(0,12),
      pendingIntentions:(intentionsByCharacter.get('ai:'+row.id)||[]).slice(0,8),
      lastInteractionAt:row.last_interaction_at,
      currentRoutineState:resolveRoutineState(world.schedule,gameNow,{
        occupation:identity.occupation||'',city:identity.city||'',timezone:runtime.timezone||'UTC',
        characterKey:'ai:'+row.id
      })
    };
  });

  return {
    worldRules:WORLD_DIRECTOR_RULES,
    clock:{gameNow:runtime.gameNow,timezone:runtime.timezone,speed:runtime.speed,paused:runtime.paused},
    player:{
      identity:obj(save.identity),profile:obj(save.profile),free:clip(save.free,5000),hidden:obj(save.hidden),
      currentContext:runtime.context||null,worldLocation:playerLocation.rows[0]||runtime.worldLocation||null,installedApps:arr(save.appStore?.installed),
      digitalContext:obj(save.digitalContext||save.hidden?.digital)
    },
    contacts:arr(save.social?.contacts).slice(0,30).map(compactContact),
    world:{
      characters:arr(save.world?.characters).slice(0,60).map(compactWorldCharacter),
      openEvents:arr(save.world?.events).filter(e=>e?.status!=='cerrado').slice(0,50),
      timeline:arr(save.world?.timeline).slice(0,40),
      directorLog:arr(save.world?.directorLog).slice(0,30),
      narratorHistory:arr(save.narrator?.history).slice(-30)
    },
    advancedCharacters:advanced,
    recentWhatsApp:whatsapp.rows.reverse().map(x=>({
      contactId:x.contact_key,contactName:x.contact_name,side:x.direction,type:x.message_type,
      text:clip(x.body,700),createdAt:x.created_at,readAt:x.read_at
    })),
    recentPhoneActivity:phoneActivity.rows.map(x=>({
      type:x.event_type,label:x.event_label,data:obj(x.event_data),createdAt:x.created_at
    })),
    scheduledLifeEvents:lifeEvents.rows,
    npcMind:{
      memories:Object.fromEntries([...memoriesByCharacter.entries()].map(([key,value])=>[key,value.slice(0,12)])),
      intentions:Object.fromEntries([...intentionsByCharacter.entries()].map(([key,value])=>[key,value.slice(0,8)]))
    },
    directorMemory:{lastRunGameAt:state.last_run_game_at,lastSummary:clip(state.last_summary,5000),lastPlan:obj(state.last_plan),runCount:Number(state.run_count)||0}
  };
}

function findWorldCharacter(world,id,name){
  const list=arr(world.characters);
  if(id){const exact=list.find(c=>String(c.id||'')===String(id));if(exact)return exact}
  const needle=String(name||'').trim().toLowerCase();
  return needle?list.find(c=>String(c.name||'').trim().toLowerCase()===needle):null;
}

function applyCharacterChanges(save,plan){
  const world={...obj(save.world),characters:[...arr(save.world?.characters)]};
  const known=new Set(world.characters.map(c=>String(c.name||'').trim().toLowerCase()).filter(Boolean));

  for(const raw of arr(plan.newCharacters).slice(0,2)){
    const name=clip(raw?.name,100);
    const age=clamp(raw?.age,18,90);
    if(!name||known.has(name.toLowerCase()))continue;
    world.characters.unshift({
      id:uid('wd-char'),name,age,status:'activo',origin:'world-director',
      role:clip(raw?.role,220),occupation:clip(raw?.occupation,160),location:clip(raw?.location,180),
      appearance:clip(raw?.appearance,1000),personality:clip(raw?.personality,1800),
      communication:clip(raw?.communication,1200),objectives:clip(raw?.objectives,1200),
      boundaries:clip(raw?.boundaries,1200),background:clip(raw?.background,1800),
      traits:{confianza:35,curiosidad:55,apego:20,tension:20,...obj(raw?.traits)},
      createdAt:new Date().toISOString()
    });
    known.add(name.toLowerCase());
  }

  const allowed=['status','role','occupation','location','appearance','personality','communication','objectives','boundaries','background'];
  for(const update of arr(plan.characterUpdates).slice(0,6)){
    const target=findWorldCharacter(world,update?.id,update?.name);
    if(!target)continue;
    const patch=obj(update.patch),safe={};
    for(const key of allowed)if(patch[key]!=null)safe[key]=clip(patch[key],key==='status'?40:1800);
    Object.assign(target,safe);
  }

  const relKeys=['confianza','atraccion','apego','tension','sospecha','celos','curiosidad','resentimiento'];
  for(const update of arr(plan.relationshipUpdates).slice(0,8)){
    const target=findWorldCharacter(world,update?.id,update?.name);
    if(!target)continue;
    target.traits={...obj(target.traits)};
    for(const key of relKeys){
      const d=Number(update?.deltas?.[key]);
      if(Number.isFinite(d)&&d!==0)target.traits[key]=clamp(Number(target.traits[key]??50)+clamp(d,-5,5),0,100);
    }
  }

  save.world=world;
}

async function queueWorldEvents(userId,runtime,plan){
  const queued=[];
  const allowedApps=new Set(['PRIVATE LIFE','WhatsApp','Instagram','Mensajes','Teléfono','Sistema']);
  for(const [index,event] of arr(plan.events).slice(0,5).entries()){
    const title=clip(event?.title,160),body=clip(event?.body,1200);
    if(!title||!body)continue;
    const app=allowedApps.has(String(event?.app||''))?String(event.app):'PRIVATE LIFE';
    const delay=clamp(event?.delayMinutes,1,240);
    const scheduled=plusMinutes(runtime.gameNow,delay);
    const key='wd-'+String(event?.type||'event').toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,40)+'-'+index;
    const inserted=await query(`INSERT INTO private_life.life_events
      (user_id,context_revision,event_key,event_type,app,title,body,payload,scheduled_game_at,status,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,'pending',NOW())
      RETURNING id`,[
      userId,Number(runtime.context?.revision)||1,key,clip(event?.type||'world_event',80),app,title,body,
      JSON.stringify({source:'world-director',contactName:clip(event?.contactName,100),reason:clip(event?.reason,500),priority:clip(event?.priority||'normal',30)}),
      scheduled
    ]);
    queued.push(String(inserted.rows[0]?.id||''));
  }
  return queued.filter(Boolean);
}

async function queueMessages(userId,runtime,save,plan){
  const queued=[];
  const contacts=arr(save.social?.contacts).filter(c=>c?.name);
  const worldChars=arr(save.world?.characters);
  for(const message of arr(plan.messages).slice(0,4)){
    const name=clip(message?.contactName,100),text=clip(message?.text,1800);
    if(!name||!text)continue;
    const lower=name.toLowerCase();
    const contact=contacts.find(c=>String(c.name||'').trim().toLowerCase()===lower);
    const character=worldChars.find(c=>String(c.name||'').trim().toLowerCase()===lower);
    const contactKey=clip(contact?.id||character?.id,120);
    if(!contactKey)continue;
    const gameDelay=clamp(message?.delayMinutes,1,240);
    const realDelay=Math.max(1,Math.round(gameDelay/Math.max(0.01,Number(runtime.speed)||1)));
    const deliverAfter=plusMinutes(new Date(),realDelay);
    const r=await query(`INSERT INTO private_life.npc_pending_messages
      (user_id,contact_key,contact_name,body,snapshot,deliver_after)
      VALUES($1,$2,$3,$4,$5::jsonb,$6) RETURNING id`,[
      userId,contactKey,name,text,
      JSON.stringify({source:'world-director',reason:clip(message?.reason,500),gameDelayMinutes:gameDelay}),
      deliverAfter
    ]);
    queued.push(String(r.rows[0]?.id||''));
  }
  return queued.filter(Boolean);
}

async function persistPlan(userId,runtime,save,state,plan,queuedEvents,queuedMessages,context){
  const summary=clip(plan.worldSummary,7000)||'World Director revisó el mundo sin cambios visibles.';
  const observations=arr(plan.observations).slice(0,10).map(x=>clip(x,500)).filter(Boolean);
  const notes=arr(plan.directorNotes).slice(0,10).map(x=>clip(x,600)).filter(Boolean);
  save.world={...obj(save.world)};
  save.world.aiSummary=summary;
  save.world.lastAiTickAt=new Date().toISOString();
  save.world.timeline=[
    {id:uid('wd-tick'),at:new Date().toISOString(),type:'world_director_tick',summary,observations},
    ...arr(save.world.timeline)
  ].slice(0,300);
  save.world.directorLog=[
    {id:uid('wd-log'),at:new Date().toISOString(),text:`World Director: ${summary}`,notes},
    ...arr(save.world.directorLog)
  ].slice(0,250);
  save.centralAI={...obj(save.centralAI),status:'world-director-active',lastRunAt:new Date().toISOString(),lastSummary:summary};

  const raw=JSON.stringify(save);
  if(Buffer.byteLength(raw,'utf8')<=2_000_000){
    await query(`INSERT INTO private_life.game_saves(user_id,save_data,updated_at)
      VALUES($1,$2::jsonb,NOW())
      ON CONFLICT(user_id) DO UPDATE SET save_data=EXCLUDED.save_data,updated_at=NOW()`,[userId,raw]);
  }

  let nextMinutes=clamp(plan.nextReviewMinutes||30,12,90);
  if(runtime.context?.activityKey==='sleep')nextMinutes=Math.max(nextMinutes,45);
  const nextRun=plusMinutes(runtime.gameNow,nextMinutes);
  await query(`UPDATE private_life.world_director_state SET
    last_run_game_at=$2,next_run_game_at=$3,last_summary=$4,last_plan=$5::jsonb,
    run_count=run_count+1,updated_at=NOW() WHERE user_id=$1`,[
    userId,runtime.gameNow,nextRun,summary,JSON.stringify({...plan,queuedEvents,queuedMessages})
  ]);
  const contextSnapshot={
    clock:context?.clock||null,
    player:{
      identity:{
        name:clip(context?.player?.identity?.name,120),
        age:Number(context?.player?.identity?.age)||null,
        occupation:clip(context?.player?.identity?.occupation,160)
      },
      currentContext:context?.player?.currentContext||null,
      worldLocation:context?.player?.worldLocation||null
    },
    counts:{
      contacts:arr(context?.contacts).length,
      worldCharacters:arr(context?.world?.characters).length,
      advancedCharacters:arr(context?.advancedCharacters).length,
      openEvents:arr(context?.world?.openEvents).length,
      recentWhatsApp:arr(context?.recentWhatsApp).length,
      scheduledLifeEvents:arr(context?.scheduledLifeEvents).length
    }
  };
  await query(`INSERT INTO private_life.world_director_runs
    (user_id,game_at,summary,observations,director_notes,plan,context_snapshot,queued_events,queued_messages,created_at)
    VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9,NOW())`,[
      userId,runtime.gameNow,summary,JSON.stringify(observations),JSON.stringify(notes),
      JSON.stringify({...plan,queuedEvents,queuedMessages}),JSON.stringify(contextSnapshot),
      queuedEvents.length,queuedMessages.length
    ]);
  await query(`DELETE FROM private_life.world_director_runs
    WHERE user_id=$1 AND id NOT IN (
      SELECT id FROM private_life.world_director_runs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 250
    )`,[userId]);
  await query(`INSERT INTO private_life.phone_activity(user_id,event_type,event_label,event_data)
    VALUES($1,'world_director_tick','World Director',$2::jsonb)`,[
    userId,JSON.stringify({summary,observations,queuedEvents:queuedEvents.length,queuedMessages:queuedMessages.length,nextReviewMinutes:nextMinutes})
  ]);
  return {summary,nextRunGameAt:nextRun.toISOString(),observations};
}

export async function maybeRunWorldDirector(userId,runtime){
  if(runtime?.paused)return {ran:false,reason:'paused'};
  const gameNow=new Date(runtime?.gameNow||Date.now());
  const state=await ensureDirectorState(userId,gameNow);
  if(state?.next_run_game_at&&gameNow<new Date(state.next_run_game_at)){
    return {ran:false,reason:'cooldown',nextRunGameAt:state.next_run_game_at,lastSummary:state.last_summary||''};
  }

  const saveResult=await query('SELECT save_data FROM private_life.game_saves WHERE user_id=$1 LIMIT 1',[userId]);
  const save=structuredClone(obj(saveResult.rows[0]?.save_data));
  const context=await buildContext(userId,{...runtime,gameNow:gameNow.toISOString()},save,state);
  const prompt=[
    'Haz una revisión autónoma del mundo en este instante.',
    'Evalúa primero si realmente debe ocurrir algo. No es obligatorio crear eventos ni mensajes.',
    'Las acciones que propongas deben ser compatibles con las reglas y con el contexto temporal/físico.',
    'ESTADO COMPLETO:',
    JSON.stringify(context)
  ].join('\n');

  const raw=await runCentralModel(prompt,directorInstructions());
  const plan=parseJson(raw);
  if(!plan){
    const nextRun=plusMinutes(gameNow,18);
    await query(`UPDATE private_life.world_director_state
      SET last_run_game_at=$2,next_run_game_at=$3,last_summary=$4,updated_at=NOW()
      WHERE user_id=$1`,[userId,gameNow,nextRun,'La IA central no devolvió un plan aplicable; se reintentará más adelante.']);
    return {ran:false,reason:'model_unavailable',nextRunGameAt:nextRun.toISOString()};
  }

  applyCharacterChanges(save,plan);
  const safeRuntime={...runtime,gameNow:gameNow.toISOString()};
  const queuedEvents=await queueWorldEvents(userId,safeRuntime,plan);
  const queuedMessages=await queueMessages(userId,safeRuntime,save,plan);
  const persisted=await persistPlan(userId,safeRuntime,save,state,plan,queuedEvents,queuedMessages,context);
  return {
    ran:true,
    summary:persisted.summary,
    observations:persisted.observations,
    queuedEvents:queuedEvents.length,
    queuedMessages:queuedMessages.length,
    nextRunGameAt:persisted.nextRunGameAt
  };
}
