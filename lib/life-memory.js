import { query } from './db.js';

function clamp(n,min,max){return Math.max(min,Math.min(max,Number(n)||0))}
function safe(value,max=600){return String(value??'').replace(/\u0000/g,'').trim().slice(0,max)}
function arr(value){return Array.isArray(value)?value:[]}
function obj(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}
function plusMinutes(date,minutes){return new Date(new Date(date).getTime()+Math.max(0,Number(minutes)||0)*60000)}

export function characterMemoryKey(contact,worldCharacter){
  if(Number(contact?.npcId))return 'ai:'+Number(contact.npcId);
  if(worldCharacter?.id)return 'world:'+String(worldCharacter.id);
  if(contact?.id)return 'contact:'+String(contact.id);
  return 'npc:'+safe(contact?.name||worldCharacter?.name||'unknown',100).toLowerCase().replace(/\s+/g,'-');
}

function memoryType(value){
  const v=safe(value,30).toLowerCase();
  return ['fact','promise','preference','conflict','emotion','event','relationship','date','other'].includes(v)?v:'other';
}
function intentionType(value){
  const v=safe(value,40).toLowerCase();
  return v||'follow_up';
}
function dedupeText(value){return safe(value,500).toLowerCase().replace(/[^a-z0-9áéíóúüñ ]/gi,'').replace(/\s+/g,' ').trim()}

function fallbackMemories(playerText,npcReply,config={}){
  const out=[];
  const p=safe(playerText,1200),n=safe(npcReply,1200),both=(p+' '+n).toLowerCase();
  const importanceBase=clamp(config?.importanceThreshold??45,10,90);
  if(/\b(prometo|te prometo|quedamos|me comprometo|no se me olvida)\b/i.test(both)){
    out.push({type:'promise',summary:safe('Promesa o compromiso reciente: '+(p||n),300),importance:Math.max(70,importanceBase),valence:15});
  }
  if(/\b(me gusta|me encanta|prefiero|odio|no soporto|mi favorito|mi favorita)\b/i.test(p)){
    out.push({type:'preference',summary:safe('Preferencia expresada por el jugador: '+p,300),importance:Math.max(55,importanceBase),valence:5});
  }
  if(/\b(me molest|me enfad|cabrea|decepcion|discut|perd[oó]n|lo siento)\b/i.test(both)){
    out.push({type:'conflict',summary:safe('Tensión o conflicto reciente: '+(p||n),300),importance:Math.max(65,importanceBase),valence:-45});
  }
  if(/\b(mañana|pasado mañana|viernes|sábado|domingo|lunes|martes|miércoles|jueves|cumpleaños|cita)\b/i.test(both)){
    out.push({type:'date',summary:safe('Referencia temporal relevante: '+(p||n),300),importance:Math.max(60,importanceBase),valence:5});
  }
  return out.slice(0,3);
}

function fallbackIntentions(playerText,npcReply){
  const out=[];
  const p=safe(playerText,1200),n=safe(npcReply,1200);
  if(/\b(luego te cuento|después te cuento|te digo luego|mañana te cuento)\b/i.test(p)){
    out.push({type:'follow_up',summary:'Preguntar más adelante por lo que el jugador dijo que contaría.',priority:65,delayMinutes:180,behavior:'ask'});
  }
  if(/\b(te mando|te envío|te paso|luego te digo|te cuento luego)\b/i.test(n)){
    out.push({type:'promise',summary:safe('Cumplir lo prometido en el chat: '+n,240),priority:75,delayMinutes:90,behavior:'follow_up'});
  }
  if(/[?¿]/.test(n)){
    out.push({type:'wait_reply',summary:safe('Esperar la respuesta del jugador a: '+n,240),priority:55,delayMinutes:0,behavior:'wait'});
  }
  return out.slice(0,3);
}

function memoryRules(config={}){
  return {
    workingMemory:clamp(config.workingMemory??70,0,100),
    longTermMemory:clamp(config.longTermMemory??70,0,100),
    importanceThreshold:clamp(config.importanceThreshold??45,0,100),
    forgetfulness:clamp(config.forgetfulness??25,0,100),
    rememberPromises:config.rememberPromises!==false,
    rememberConflicts:config.rememberConflicts!==false,
    rememberPreferences:config.rememberPreferences!==false,
    rememberDates:config.rememberDates!==false
  };
}

function shouldKeep(memory,rules){
  if(memory.type==='promise'&&!rules.rememberPromises)return false;
  if(memory.type==='conflict'&&!rules.rememberConflicts)return false;
  if(memory.type==='preference'&&!rules.rememberPreferences)return false;
  if(memory.type==='date'&&!rules.rememberDates)return false;
  return Number(memory.importance)>=rules.importanceThreshold;
}

export async function storeMemory(userId,characterKey,memory,gameNow,{source='conversation',sourceRef=null,metadata={}}={}){
  const summary=safe(memory?.summary,500);
  if(!summary)return null;
  const type=memoryType(memory?.type);
  const importance=clamp(memory?.importance??50,0,100);
  const valence=clamp(memory?.emotionalValence??memory?.valence??0,-100,100);
  const fingerprint=dedupeText(summary);
  if(fingerprint){
    const existing=await query(`SELECT id,importance,emotional_valence FROM private_life.npc_memories
      WHERE user_id=$1 AND character_key=$2 AND status='active'
      AND lower(regexp_replace(summary,'[^a-zA-Z0-9áéíóúÁÉÍÓÚüÜñÑ ]','','g'))=$3
      ORDER BY id DESC LIMIT 1`,[userId,characterKey,fingerprint]);
    if(existing.rows[0]){
      const row=existing.rows[0];
      await query(`UPDATE private_life.npc_memories
        SET importance=GREATEST(importance,$1),emotional_valence=$2,last_recalled_game_at=$3,recall_count=recall_count+1,
        metadata=metadata||$4::jsonb WHERE id=$5`,
        [importance,valence,gameNow,JSON.stringify(metadata||{}),row.id]);
      return Number(row.id);
    }
  }
  const r=await query(`INSERT INTO private_life.npc_memories
    (user_id,character_key,memory_type,summary,importance,emotional_valence,source,source_ref,occurred_game_at,metadata)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) RETURNING id`,
    [userId,characterKey,type,summary,importance,valence,safe(source,60),safe(sourceRef,120)||null,gameNow,JSON.stringify(metadata||{})]);
  return Number(r.rows[0]?.id)||null;
}

export async function createIntention(userId,characterKey,intention,gameNow,{sourceMemoryId=null,metadata={}}={}){
  const summary=safe(intention?.summary,500);
  if(!summary)return null;
  const type=intentionType(intention?.type);
  const priority=clamp(intention?.priority??50,0,100);
  const behavior=safe(intention?.behavior||intention?.triggerData?.behavior||'follow_up',40)||'follow_up';
  const delay=clamp(intention?.delayMinutes??0,0,10080);
  const dueDelay=intention?.dueMinutes==null?null:clamp(intention.dueMinutes,0,43200);
  const notBefore=plusMinutes(gameNow,delay);
  const dueAt=dueDelay==null?null:plusMinutes(gameNow,dueDelay);
  const duplicate=await query(`SELECT id FROM private_life.npc_intentions
    WHERE user_id=$1 AND character_key=$2 AND status IN ('pending','active')
      AND lower(summary)=lower($3) LIMIT 1`,[userId,characterKey,summary]);
  if(duplicate.rows[0])return Number(duplicate.rows[0].id);
  const triggerData={...obj(intention?.triggerData),behavior};
  const r=await query(`INSERT INTO private_life.npc_intentions
    (user_id,character_key,intention_type,summary,priority,status,not_before_game_at,due_game_at,trigger_data,source_memory_id,created_game_at,metadata)
    VALUES($1,$2,$3,$4,$5,'pending',$6,$7,$8::jsonb,$9,$10,$11::jsonb) RETURNING id`,
    [userId,characterKey,type,summary,priority,notBefore,dueAt,JSON.stringify(triggerData),sourceMemoryId,gameNow,JSON.stringify(metadata||{})]);
  return Number(r.rows[0]?.id)||null;
}

export async function syncAdvancedMemoryState(userId,characterKey,gameNow){
  const match=String(characterKey||'').match(/^ai:(\d+)$/);
  if(!match)return;
  const characterId=Number(match[1]);
  const [memories,intentions]=await Promise.all([
    query(`SELECT id,memory_type,summary,importance,emotional_valence,occurred_game_at
      FROM private_life.npc_memories WHERE user_id=$1 AND character_key=$2 AND status='active'
      ORDER BY importance DESC,occurred_game_at DESC LIMIT 12`,[userId,characterKey]),
    query(`SELECT id,intention_type,summary,priority,status,not_before_game_at,due_game_at
      FROM private_life.npc_intentions WHERE user_id=$1 AND character_key=$2 AND status IN ('pending','active')
      ORDER BY priority DESC,COALESCE(due_game_at,not_before_game_at,created_game_at) ASC LIMIT 8`,[userId,characterKey])
  ]);
  const snapshot={
    version:2,
    syncedAt:new Date(gameNow).toISOString(),
    activeMemories:memories.rows.map(x=>({
      id:String(x.id),type:x.memory_type,summary:x.summary,importance:Number(x.importance)||0,
      emotionalValence:Number(x.emotional_valence)||0,occurredGameAt:x.occurred_game_at
    })),
    pendingIntentions:intentions.rows.map(x=>({
      id:String(x.id),type:x.intention_type,summary:x.summary,priority:Number(x.priority)||0,status:x.status,
      notBeforeGameAt:x.not_before_game_at,dueGameAt:x.due_game_at
    }))
  };
  await query(`INSERT INTO private_life.ai_character_player_state
    (character_id,player_user_id,memory_state,last_interaction_at,updated_at)
    VALUES($1,$2,$3::jsonb,NOW(),NOW())
    ON CONFLICT(character_id,player_user_id) DO UPDATE SET
      memory_state=EXCLUDED.memory_state,last_interaction_at=NOW(),updated_at=NOW()`,
    [characterId,userId,JSON.stringify(snapshot)]);
}

export async function persistExchangeMind({
  userId,characterKey,gameNow,playerText,npcReply,modelResult,memoryConfig={},sourceRef=null
}){
  if(!characterKey)return {memories:[],intentions:[]};
  const rules=memoryRules(memoryConfig);
  const modelMemories=arr(modelResult?.memories).map(x=>({
    type:memoryType(x?.type),summary:safe(x?.summary,500),importance:clamp(x?.importance??50,0,100),
    emotionalValence:clamp(x?.emotionalValence??0,-100,100),metadata:obj(x?.metadata)
  })).filter(x=>x.summary);
  const extractedMemories=modelMemories.length?modelMemories:fallbackMemories(playerText,npcReply,rules);
  const storedMemories=[];
  for(const memory of extractedMemories.slice(0,5)){
    if(!shouldKeep(memory,rules))continue;
    const id=await storeMemory(userId,characterKey,memory,gameNow,{source:'whatsapp',sourceRef,metadata:memory.metadata});
    if(id)storedMemories.push({id,...memory});
  }

  const modelIntentions=arr(modelResult?.intentions).map(x=>({
    type:intentionType(x?.type),summary:safe(x?.summary,500),priority:clamp(x?.priority??50,0,100),
    delayMinutes:clamp(x?.delayMinutes??0,0,10080),dueMinutes:x?.dueMinutes==null?null:clamp(x.dueMinutes,0,43200),
    behavior:safe(x?.behavior||'follow_up',40),triggerData:obj(x?.triggerData)
  })).filter(x=>x.summary);
  const extractedIntentions=modelIntentions.length?modelIntentions:fallbackIntentions(playerText,npcReply);
  const storedIntentions=[];
  for(const intention of extractedIntentions.slice(0,4)){
    const sourceMemoryId=storedMemories[0]?.id||null;
    const id=await createIntention(userId,characterKey,intention,gameNow,{sourceMemoryId,metadata:{source:'whatsapp'}});
    if(id)storedIntentions.push({id,...intention});
  }

  await syncAdvancedMemoryState(userId,characterKey,gameNow);
  return {memories:storedMemories,intentions:storedIntentions};
}

export async function loadMindContext(userId,characterKey,gameNow,{memoryLimit=12,intentionLimit=8}={}){
  if(!characterKey)return {memories:[],intentions:[]};
  const [memories,intentions]=await Promise.all([
    query(`SELECT id,memory_type,summary,importance,emotional_valence,occurred_game_at,last_recalled_game_at,recall_count,metadata
      FROM private_life.npc_memories
      WHERE user_id=$1 AND character_key=$2 AND status='active'
        AND (expires_game_at IS NULL OR expires_game_at>$3)
      ORDER BY importance DESC,occurred_game_at DESC LIMIT $4`,
      [userId,characterKey,gameNow,clamp(memoryLimit,1,30)]),
    query(`SELECT id,intention_type,summary,priority,status,not_before_game_at,due_game_at,trigger_data,created_game_at,metadata
      FROM private_life.npc_intentions
      WHERE user_id=$1 AND character_key=$2 AND status IN ('pending','active')
      ORDER BY priority DESC,COALESCE(due_game_at,not_before_game_at,created_game_at) ASC LIMIT $3`,
      [userId,characterKey,clamp(intentionLimit,1,20)])
  ]);
  return {
    memories:memories.rows.map(x=>({
      id:String(x.id),type:x.memory_type,summary:x.summary,importance:Number(x.importance),emotionalValence:Number(x.emotional_valence),
      occurredGameAt:x.occurred_game_at,lastRecalledGameAt:x.last_recalled_game_at,recallCount:Number(x.recall_count)||0,metadata:x.metadata||{}
    })),
    intentions:intentions.rows.map(x=>({
      id:String(x.id),type:x.intention_type,summary:x.summary,priority:Number(x.priority),status:x.status,
      notBeforeGameAt:x.not_before_game_at,dueGameAt:x.due_game_at,triggerData:x.trigger_data||{},createdGameAt:x.created_game_at,metadata:x.metadata||{}
    }))
  };
}

export async function recallMemories(userId,memoryIds,gameNow){
  const ids=arr(memoryIds).map(Number).filter(Number.isFinite).slice(0,20);
  if(!ids.length)return;
  await query(`UPDATE private_life.npc_memories SET last_recalled_game_at=$2,recall_count=recall_count+1
    WHERE user_id=$1 AND id=ANY($3::bigint[])`,[userId,gameNow,ids]);
}

export async function claimDueIntention(userId,characterKey,gameNow){
  const r=await query(`UPDATE private_life.npc_intentions i SET status='active',activated_game_at=COALESCE(activated_game_at,$3),updated_at=NOW()
    WHERE i.id=(
      SELECT id FROM private_life.npc_intentions
      WHERE user_id=$1 AND character_key=$2 AND status='pending'
        AND COALESCE(not_before_game_at,created_game_at)<=$3
        AND COALESCE(trigger_data->>'behavior','follow_up')<>'wait'
      ORDER BY priority DESC,COALESCE(due_game_at,not_before_game_at,created_game_at) ASC
      LIMIT 1 FOR UPDATE SKIP LOCKED
    )
    RETURNING id,intention_type,summary,priority,status,not_before_game_at,due_game_at,trigger_data,created_game_at,metadata`,
    [userId,characterKey,gameNow]);
  const x=r.rows[0];
  return x?{
    id:String(x.id),type:x.intention_type,summary:x.summary,priority:Number(x.priority),status:x.status,
    notBeforeGameAt:x.not_before_game_at,dueGameAt:x.due_game_at,triggerData:x.trigger_data||{},createdGameAt:x.created_game_at,metadata:x.metadata||{}
  }:null;
}

export async function resolveIntention(userId,intentionId,gameNow,note=''){
  await query(`UPDATE private_life.npc_intentions SET status='fulfilled',resolved_game_at=$3,resolution_note=$4,updated_at=NOW()
    WHERE user_id=$1 AND id=$2 AND status IN ('pending','active')`,[userId,Number(intentionId),gameNow,safe(note,500)]);
}

export async function releaseIntention(userId,intentionId,gameNow,note=''){
  await query(`UPDATE private_life.npc_intentions SET status='pending',activated_game_at=NULL,
    not_before_game_at=$3,resolution_note=$4,updated_at=NOW()
    WHERE user_id=$1 AND id=$2 AND status='active'`,[userId,Number(intentionId),plusMinutes(gameNow,60),safe(note,500)]);
}

export async function forgetLowValueMemories(userId,characterKey,gameNow,memoryConfig={}){
  const rules=memoryRules(memoryConfig);
  const forgetThreshold=Math.round(clamp(rules.importanceThreshold-(rules.forgetfulness*.25),5,80));
  const ageDays=Math.round(clamp(21-(rules.longTermMemory*.15)+(rules.forgetfulness*.12),3,30));
  const r=await query(`UPDATE private_life.npc_memories SET status='forgotten'
    WHERE user_id=$1 AND character_key=$2 AND status='active'
      AND importance<$3 AND occurred_game_at<($4::timestamptz-($5||' days')::interval)
    RETURNING id`,[userId,characterKey,forgetThreshold,gameNow,String(ageDays)]);
  return r.rowCount||0;
}
