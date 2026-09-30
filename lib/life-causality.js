import { query } from './db.js';
import { storeMemory, createIntention } from './life-memory.js';
import { applySocialDeltas, createInformation, shareInformation } from './life-social.js';

function clamp(n,min,max){return Math.max(min,Math.min(max,Math.round(Number(n)||0)))}
function safe(value,max=700){return String(value??'').replace(/\u0000/g,'').trim().slice(0,max)}
function obj(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}
function arr(v){return Array.isArray(v)?v:[]}
function hash(value){let h=2166136261;for(const ch of String(value??'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return Math.abs(h>>>0)}
function roll(seed){return (hash(seed)%10000)/10000}
function plusMinutes(date,minutes){return new Date(new Date(date).getTime()+Math.max(0,Number(minutes)||0)*60000)}
function enumValue(value,allowed,fallback){const v=safe(value,80);return allowed.includes(v)?v:fallback}
function matchesValue(actual,expected){
  if(expected==null||expected==='')return true;
  if(Array.isArray(expected))return expected.map(String).includes(String(actual??''));
  return String(actual??'')===String(expected);
}
function nodeKey(prefix,parts=[]){return safe(prefix,60)+'-'+parts.map(x=>safe(x,90).replace(/[^a-zA-Z0-9:_-]/g,'-')).join('-')}

export async function recordCausalNode(userId,{
  nodeKey:key,nodeType='world_event',sourceType='world',sourceRef=null,summary,
  actorKey=null,targetKey=null,importance=50,visibility='private',gameAt,metadata={}
}={}){
  const text=safe(summary,1000);if(!text)return null;
  const finalKey=safe(key,180)||nodeKey(sourceType,[sourceRef||Date.now(),hash(text)]);
  const vis=enumValue(visibility,['private','observable','player_relevant'],'private');
  const r=await query(`INSERT INTO private_life.causal_nodes
    (user_id,node_key,node_type,source_type,source_ref,summary,actor_key,target_key,importance,visibility,occurred_game_at,metadata)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
    ON CONFLICT(user_id,node_key) DO UPDATE SET
      summary=EXCLUDED.summary,importance=GREATEST(private_life.causal_nodes.importance,EXCLUDED.importance),
      visibility=CASE
        WHEN private_life.causal_nodes.visibility='player_relevant' THEN private_life.causal_nodes.visibility
        WHEN EXCLUDED.visibility='player_relevant' THEN EXCLUDED.visibility
        WHEN private_life.causal_nodes.visibility='observable' THEN private_life.causal_nodes.visibility
        ELSE EXCLUDED.visibility END,
      metadata=private_life.causal_nodes.metadata||EXCLUDED.metadata
    RETURNING *`,[
      userId,finalKey,safe(nodeType,80)||'world_event',safe(sourceType,80)||'world',safe(sourceRef,180)||null,text,
      safe(actorKey,140)||null,safe(targetKey,140)||null,clamp(importance,0,100),vis,gameAt||new Date(),JSON.stringify(metadata||{})
    ]);
  const x=r.rows[0];
  return x?{
    id:String(x.id),nodeKey:x.node_key,nodeType:x.node_type,sourceType:x.source_type,sourceRef:x.source_ref,
    summary:x.summary,actorKey:x.actor_key,targetKey:x.target_key,importance:Number(x.importance)||0,
    visibility:x.visibility,occurredGameAt:x.occurred_game_at,metadata:x.metadata||{}
  }:null;
}

export async function linkCausalNodes(userId,parentNodeId,childNodeId,{relationType='consequence',weight=70,metadata={}}={}){
  const parent=Number(parentNodeId),child=Number(childNodeId);
  if(!Number.isFinite(parent)||!Number.isFinite(child)||parent===child)return null;
  const relation=enumValue(relationType,['cause','consequence','enables','blocks','reveals','amplifies','resolves'],'consequence');
  const r=await query(`INSERT INTO private_life.causal_edges
    (user_id,parent_node_id,child_node_id,relation_type,weight,metadata)
    VALUES($1,$2,$3,$4,$5,$6::jsonb)
    ON CONFLICT(user_id,parent_node_id,child_node_id,relation_type) DO UPDATE SET
      weight=GREATEST(private_life.causal_edges.weight,EXCLUDED.weight),
      metadata=private_life.causal_edges.metadata||EXCLUDED.metadata
    RETURNING id`,[userId,parent,child,relation,clamp(weight,0,100),JSON.stringify(metadata||{})]);
  return r.rows[0]?String(r.rows[0].id):null;
}

export async function scheduleConsequence(userId,{
  sourceNodeId,parentConsequenceId=null,type='world_event',summary,priority=50,probability=100,
  delayMinutes=0,dueGameAt=null,expiresMinutes=null,effectData={},conditionData={},gameAt,metadata={}
}={}){
  const source=Number(sourceNodeId),text=safe(summary,1000);
  if(!Number.isFinite(source)||!text)return null;
  const now=new Date(gameAt||Date.now());
  const due=dueGameAt?new Date(dueGameAt):plusMinutes(now,clamp(delayMinutes,0,525600));
  const expiry=expiresMinutes==null?null:plusMinutes(due,clamp(expiresMinutes,1,525600));
  const r=await query(`INSERT INTO private_life.consequence_queue
    (user_id,source_node_id,parent_consequence_id,consequence_type,summary,priority,probability,effect_data,condition_data,not_before_game_at,due_game_at,expires_game_at,status,created_game_at,metadata)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$10,$11,'pending',$12,$13::jsonb)
    RETURNING *`,[
      userId,source,Number(parentConsequenceId)||null,safe(type,80)||'world_event',text,clamp(priority,0,100),
      clamp(probability,0,100),JSON.stringify(effectData||{}),JSON.stringify(conditionData||{}),due,expiry,now,JSON.stringify(metadata||{})
    ]);
  const x=r.rows[0];
  return x?{id:String(x.id),sourceNodeId:String(x.source_node_id),type:x.consequence_type,summary:x.summary,status:x.status,dueGameAt:x.due_game_at}:null;
}

async function loadPlayerContext(userId){
  const r=await query(`SELECT location_key,activity_key,availability,social_exposure,privacy,revision
    FROM private_life.player_context WHERE user_id=$1 LIMIT 1`,[userId]);
  return r.rows[0]||null;
}
async function loadSocialEdge(userId,aKey,bKey){
  if(!aKey||!bKey||aKey===bKey)return null;
  const [a,b]=String(aKey)<String(bKey)?[String(aKey),String(bKey)]:[String(bKey),String(aKey)];
  const r=await query(`SELECT familiarity,affinity,trust,tension,attraction,loyalty,influence
    FROM private_life.npc_social_edges WHERE user_id=$1 AND character_a_key=$2 AND character_b_key=$3 LIMIT 1`,[userId,a,b]);
  return r.rows[0]||null;
}
async function conditionsPass(userId,conditionData){
  const c=obj(conditionData);
  if(!Object.keys(c).length)return {ok:true,reasons:[]};
  const reasons=[];
  if(c.player){
    const p=await loadPlayerContext(userId),expected=obj(c.player);
    if(!p)return {ok:false,reasons:['player_context_missing']};
    for(const [field,column] of [['locationKey','location_key'],['activityKey','activity_key'],['availability','availability']]){
      if(expected[field]!=null&&!matchesValue(p[column],expected[field]))reasons.push('player_'+field+'_mismatch');
    }
    if(expected.minSocialExposure!=null&&Number(p.social_exposure)<Number(expected.minSocialExposure))reasons.push('player_social_exposure_low');
    if(expected.maxPrivacy!=null&&Number(p.privacy)>Number(expected.maxPrivacy))reasons.push('player_privacy_high');
  }
  if(c.social){
    const expected=obj(c.social);
    const edge=await loadSocialEdge(userId,expected.aKey,expected.bKey);
    if(!edge)return {ok:false,reasons:[...reasons,'social_edge_missing']};
    const checks=[['minTrust','trust','min'],['minAffinity','affinity','min'],['minFamiliarity','familiarity','min'],['maxTension','tension','max'],['minTension','tension','min']];
    for(const [rule,key,mode] of checks){
      if(expected[rule]==null)continue;
      const actual=Number(edge[key])||0,target=Number(expected[rule])||0;
      if(mode==='min'&&actual<target)reasons.push(rule+'_not_met');
      if(mode==='max'&&actual>target)reasons.push(rule+'_not_met');
    }
  }
  if(c.information){
    const expected=obj(c.information);
    const r=await query(`SELECT 1 FROM private_life.npc_information_holders h
      JOIN private_life.npc_information i ON i.id=h.information_id AND i.user_id=h.user_id
      WHERE h.user_id=$1 AND i.info_key=$2 AND h.character_key=$3 LIMIT 1`,
      [userId,safe(expected.infoKey,140),safe(expected.characterKey,140)]);
    if(Boolean(r.rows[0])!==Boolean(expected.known!==false))reasons.push('information_condition_not_met');
  }
  if(c.intention){
    const expected=obj(c.intention);
    const r=await query(`SELECT status FROM private_life.npc_intentions
      WHERE user_id=$1 AND id=$2 LIMIT 1`,[userId,Number(expected.id)]);
    if(!r.rows[0]||expected.status&&!matchesValue(r.rows[0].status,expected.status))reasons.push('intention_condition_not_met');
  }
  return {ok:reasons.length===0,reasons};
}

async function queueWhatsapp(userId,effect,gameNow){
  const contactKey=safe(effect.contactKey,140),contactName=safe(effect.contactName,120),body=safe(effect.body,1800);
  if(!contactKey||!contactName||!body)return {ok:false,reason:'missing_whatsapp_target'};
  const delay=Math.max(0,Number(effect.realDelayMinutes)||0);
  const deliverAfter=plusMinutes(new Date(),delay);
  const r=await query(`INSERT INTO private_life.npc_pending_messages
    (user_id,contact_key,contact_name,body,snapshot,deliver_after)
    VALUES($1,$2,$3,$4,$5::jsonb,$6) RETURNING id`,[
      userId,contactKey,contactName,body,JSON.stringify({source:'causal-engine',causeNodeId:effect.causeNodeId||null,gameAt:new Date(gameNow).toISOString()}),deliverAfter
    ]);
  return {ok:true,ref:'npc_pending:'+String(r.rows[0]?.id||'')};
}
async function queueLifeEvent(userId,effect,gameNow){
  const title=safe(effect.title,160),body=safe(effect.body,1200);
  if(!title||!body)return {ok:false,reason:'missing_life_event'};
  const context=await loadPlayerContext(userId);
  const delay=clamp(effect.delayMinutes??1,0,10080);
  const scheduled=plusMinutes(gameNow,delay);
  const key=safe(effect.eventKey,120)||nodeKey('cause-event',[Date.now(),hash(title+body)]);
  const r=await query(`INSERT INTO private_life.life_events
    (user_id,context_revision,event_key,event_type,app,title,body,payload,scheduled_game_at,status,created_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,'pending',NOW()) RETURNING id`,[
      userId,Number(context?.revision)||1,key,safe(effect.eventType,80)||'consequence',
      safe(effect.app,40)||'PRIVATE LIFE',title,body,JSON.stringify({...obj(effect.payload),source:'causal-engine'}),scheduled
    ]);
  return {ok:true,ref:'life_event:'+String(r.rows[0]?.id||'')};
}

async function applyEffect(userId,row,gameNow){
  const effect=obj(row.effect_data),type=safe(row.consequence_type,80);
  if(type==='social_delta'){
    const edge=await applySocialDeltas(userId,safe(effect.aKey,140),safe(effect.bKey,140),obj(effect.deltas),gameNow,{metadata:{source:'causal-engine',consequenceId:String(row.id)},countInteraction:false});
    return edge?{ok:true,ref:'social_edge',data:edge}:{ok:false,reason:'social_delta_failed'};
  }
  if(type==='memory'){
    const id=await storeMemory(userId,safe(effect.characterKey,140),{
      type:safe(effect.memoryType,30)||'event',summary:safe(effect.summary||row.summary,500),
      importance:clamp(effect.importance??row.priority,0,100),emotionalValence:clamp(effect.emotionalValence??0,-100,100)
    },gameNow,{source:'causal_engine',sourceRef:'consequence:'+row.id,metadata:{sourceNodeId:String(row.source_node_id)}});
    return id?{ok:true,ref:'memory:'+id}:{ok:false,reason:'memory_failed'};
  }
  if(type==='intention'){
    const id=await createIntention(userId,safe(effect.characterKey,140),{
      type:safe(effect.intentionType,40)||'follow_up',summary:safe(effect.summary||row.summary,500),
      priority:clamp(effect.priority??row.priority,0,100),delayMinutes:clamp(effect.delayMinutes??0,0,10080),
      dueMinutes:effect.dueMinutes==null?null:clamp(effect.dueMinutes,0,43200),behavior:safe(effect.behavior,40)||'follow_up'
    },gameNow,{metadata:{source:'causal-engine',sourceNodeId:String(row.source_node_id)}});
    return id?{ok:true,ref:'intention:'+id}:{ok:false,reason:'intention_failed'};
  }
  if(type==='information_create'){
    const created=await createInformation(userId,{
      infoKey:safe(effect.infoKey,140),subjectKey:safe(effect.subjectKey,140),content:safe(effect.content||row.summary,900),
      truthStatus:safe(effect.truthStatus,20)||'unknown',sensitivity:effect.sensitivity,importance:effect.importance,
      originCharacterKey:safe(effect.originKey,140)||null,sourceType:'causal-engine',gameAt:gameNow,
      metadata:{sourceNodeId:String(row.source_node_id),consequenceId:String(row.id)}
    });
    return created?{ok:true,ref:'information:'+created.id,data:created}:{ok:false,reason:'information_create_failed'};
  }
  if(type==='information_share'){
    const shared=await shareInformation(userId,{
      infoKey:safe(effect.infoKey,140),fromKey:safe(effect.fromKey,140),toKey:safe(effect.toKey,140),gameAt:gameNow,confidence:effect.confidence
    });
    return shared?{ok:true,ref:'information_share:'+shared.informationId,data:shared}:{ok:false,reason:'information_share_failed'};
  }
  if(type==='whatsapp_message')return queueWhatsapp(userId,{...effect,causeNodeId:String(row.source_node_id)},gameNow);
  if(type==='life_event')return queueLifeEvent(userId,effect,gameNow);
  if(type==='none'||type==='world_note')return {ok:true,ref:'none'};
  return {ok:false,reason:'unsupported_effect_type'};
}

async function claimDueConsequence(userId,gameNow){
  const r=await query(`UPDATE private_life.consequence_queue q SET
    status='claimed',claimed_game_at=$2,attempts=attempts+1,updated_at=NOW()
    WHERE q.id=(
      SELECT id FROM private_life.consequence_queue
      WHERE user_id=$1 AND status='pending'
        AND COALESCE(not_before_game_at,due_game_at)<=$2 AND due_game_at<=$2
      ORDER BY priority DESC,due_game_at ASC,id ASC
      LIMIT 1 FOR UPDATE SKIP LOCKED
    )
    RETURNING *`,[userId,gameNow]);
  return r.rows[0]||null;
}

async function finishConsequence(userId,row,gameNow,result,executedNodeId=null){
  await query(`UPDATE private_life.consequence_queue SET
    status=$3,executed_game_at=CASE WHEN $3='executed' THEN $2 ELSE executed_game_at END,
    executed_node_id=$4,resolution=$5,updated_at=NOW()
    WHERE user_id=$1 AND id=$6`,[
      userId,gameNow,result.ok?'executed':'blocked',executedNodeId?Number(executedNodeId):null,
      safe(result.ok?(result.ref||'executed'):(result.reason||'blocked'),700),row.id
    ]);
}

async function spawnChildConsequences(userId,row,executedNode,gameNow){
  const children=arr(row.effect_data?.nextConsequences).slice(0,5);
  const created=[];
  for(const child of children){
    const scheduled=await scheduleConsequence(userId,{
      sourceNodeId:executedNode.id,parentConsequenceId:row.id,type:safe(child?.type,80)||'world_event',
      summary:safe(child?.summary,1000),priority:child?.priority,probability:child?.probability,
      delayMinutes:child?.delayMinutes,dueGameAt:child?.dueGameAt,expiresMinutes:child?.expiresMinutes,
      effectData:obj(child?.effectData),conditionData:obj(child?.conditionData),gameAt,
      metadata:{source:'causal-chain',parentNodeId:String(row.source_node_id),parentConsequenceId:String(row.id)}
    });
    if(scheduled)created.push(scheduled);
  }
  return created;
}

export async function ingestCausalSources(userId,gameNow=new Date()){
  const since=plusMinutes(gameNow,-2880);
  const [lifeEvents,socialEvents,autonomyEvents,whatsapp]=await Promise.all([
    query(`SELECT id,event_type,app,title,body,payload,scheduled_game_at,delivered_at
      FROM private_life.life_events
      WHERE user_id=$1 AND status='delivered' AND COALESCE(delivered_at,scheduled_game_at)>=$2
      ORDER BY id DESC LIMIT 120`,[userId,since]),
    query(`SELECT id,actor_key,target_key,event_type,summary,visibility,deltas,payload,game_at
      FROM private_life.npc_social_events WHERE user_id=$1 AND game_at>=$2
      ORDER BY id DESC LIMIT 120`,[userId,since]),
    query(`SELECT id,character_key,character_name,event_type,event_data,game_at
      FROM private_life.npc_autonomy_events WHERE user_id=$1 AND game_at>=$2
      ORDER BY id DESC LIMIT 120`,[userId,since]),
    query(`SELECT id,contact_key,contact_name,direction,message_type,body,created_at
      FROM private_life.whatsapp_messages WHERE user_id=$1 AND created_at>=$2
      ORDER BY id DESC LIMIT 160`,[userId,since])
  ]);
  const nodes=[];
  for(const e of lifeEvents.rows){
    const node=await recordCausalNode(userId,{
      nodeKey:'life-event:'+e.id,nodeType:safe(e.event_type,80)||'life_event',sourceType:'life_event',sourceRef:String(e.id),
      summary:safe([e.title,e.body].filter(Boolean).join(' · '),1000),importance:e.payload?.priority==='high'?78:55,
      visibility:'player_relevant',gameAt:e.delivered_at||e.scheduled_game_at,
      metadata:{app:e.app,payload:e.payload||{}}
    });if(node)nodes.push(node);
  }
  for(const e of socialEvents.rows){
    const importance=e.event_type==='disagreement'?68:e.event_type==='information_share'?62:e.event_type==='support'?58:42;
    const node=await recordCausalNode(userId,{
      nodeKey:'social-event:'+e.id,nodeType:'social_'+safe(e.event_type,60),sourceType:'npc_social_event',sourceRef:String(e.id),
      summary:e.summary,actorKey:e.actor_key,targetKey:e.target_key,importance,
      visibility:e.visibility||'private',gameAt:e.game_at,metadata:{deltas:e.deltas||{},payload:e.payload||{}}
    });if(node)nodes.push(node);
  }
  for(const e of autonomyEvents.rows){
    const data=obj(e.event_data),isVisible=['npc_initiative','npc_intention_executed'].includes(String(e.event_type));
    const node=await recordCausalNode(userId,{
      nodeKey:'autonomy-event:'+e.id,nodeType:'autonomy_'+safe(e.event_type,60),sourceType:'npc_autonomy_event',sourceRef:String(e.id),
      summary:safe(data.summary||data.reason||data.message||(`${e.character_name} actuó por iniciativa propia.`),1000),
      actorKey:e.character_key,importance:isVisible?58:42,visibility:isVisible?'player_relevant':'private',
      gameAt:e.game_at,metadata:data
    });if(node)nodes.push(node);
  }
  for(const m of whatsapp.rows){
    const side=String(m.direction)==='out'?'player_to_npc':'npc_to_player';
    const node=await recordCausalNode(userId,{
      nodeKey:'whatsapp:'+m.id,nodeType:'whatsapp_message',sourceType:'whatsapp',sourceRef:String(m.id),
      summary:safe((m.direction==='out'?'Jugador → ':'')+(m.direction==='in'?m.contact_name+' → jugador: ':'')+(m.body||'['+m.message_type+']'),1000),
      actorKey:m.direction==='out'?'player':m.contact_key,targetKey:m.direction==='out'?m.contact_key:'player',
      importance:40,visibility:'player_relevant',gameAt:m.created_at,
      metadata:{contactName:m.contact_name,direction:m.direction,messageType:m.message_type}
    });if(node)nodes.push(node);
  }
  return {ingested:nodes.length};
}

export async function tickConsequences(userId,{gameNow=new Date(),maxExecutions=6}={}){
  const now=new Date(gameNow);
  await ingestCausalSources(userId,now);
  await query(`UPDATE private_life.consequence_queue SET status='expired',resolution='Caducó antes de poder ejecutarse.',updated_at=NOW()
    WHERE user_id=$1 AND status IN ('pending','claimed') AND expires_game_at IS NOT NULL AND expires_game_at<$2`,[userId,now]);
  const executed=[],blocked=[];
  for(let i=0;i<clamp(maxExecutions,1,12);i++){
    const row=await claimDueConsequence(userId,now);
    if(!row)break;
    const probability=clamp(row.probability,0,100);
    if(roll(userId+'|consequence|'+row.id+'|'+new Date(row.due_game_at).toISOString())>probability/100){
      await query(`UPDATE private_life.consequence_queue SET status='cancelled',resolution='No se activó por probabilidad.',updated_at=NOW()
        WHERE user_id=$1 AND id=$2`,[userId,row.id]);
      blocked.push({id:String(row.id),status:'cancelled',reason:'probability'});
      continue;
    }
    const condition=await conditionsPass(userId,row.condition_data);
    if(!condition.ok){
      const canRetry=Number(row.attempts)<3 && (!row.expires_game_at||plusMinutes(now,60)<new Date(row.expires_game_at));
      if(canRetry){
        await query(`UPDATE private_life.consequence_queue SET status='pending',claimed_game_at=NULL,
          due_game_at=$3,resolution=$4,updated_at=NOW() WHERE user_id=$1 AND id=$2`,
          [userId,row.id,plusMinutes(now,60),safe('Condiciones no cumplidas: '+condition.reasons.join(', '),700)]);
        blocked.push({id:String(row.id),status:'postponed',reason:condition.reasons});
      }else{
        await query(`UPDATE private_life.consequence_queue SET status='blocked',resolution=$3,updated_at=NOW()
          WHERE user_id=$1 AND id=$2`,[userId,row.id,safe('Condiciones no cumplidas: '+condition.reasons.join(', '),700)]);
        blocked.push({id:String(row.id),status:'blocked',reason:condition.reasons});
      }
      continue;
    }
    const result=await applyEffect(userId,row,now);
    if(!result.ok){
      await finishConsequence(userId,row,now,result,null);
      blocked.push({id:String(row.id),status:'blocked',reason:result.reason});
      continue;
    }
    const executedNode=await recordCausalNode(userId,{
      nodeKey:nodeKey('consequence',[row.id]),nodeType:'consequence',
      sourceType:'consequence_queue',sourceRef:String(row.id),summary:row.summary,
      importance:clamp(row.priority,0,100),visibility:row.metadata?.visibility||'private',
      gameAt:now,metadata:{consequenceType:row.consequence_type,effectRef:result.ref||null,sourceNodeId:String(row.source_node_id)}
    });
    if(executedNode){
      await linkCausalNodes(userId,row.source_node_id,executedNode.id,{relationType:'consequence',weight:clamp(row.priority,20,100),metadata:{consequenceId:String(row.id)}});
    }
    await finishConsequence(userId,row,now,result,executedNode?.id||null);
    const children=executedNode?await spawnChildConsequences(userId,row,executedNode,now):[];
    executed.push({
      id:String(row.id),type:row.consequence_type,summary:row.summary,effectRef:result.ref||null,
      sourceNodeId:String(row.source_node_id),executedNodeId:executedNode?.id||null,children
    });
  }
  return {executed,blocked};
}

function makeChain(nodeId,nodeMap,childrenMap,depth=0,visited=new Set()){
  const key=String(nodeId);if(depth>6||visited.has(key))return null;
  const node=nodeMap.get(key);if(!node)return null;
  const nextVisited=new Set(visited);nextVisited.add(key);
  return {
    ...node,
    children:(childrenMap.get(key)||[]).map(x=>makeChain(x.childId,nodeMap,childrenMap,depth+1,nextVisited)).filter(Boolean)
  };
}

export async function loadCausalAnalysis(userId,{nodeLimit=140,consequenceLimit=120}={}){
  const [nodes,edges,consequences]=await Promise.all([
    query(`SELECT id,node_key,node_type,source_type,source_ref,summary,actor_key,target_key,importance,visibility,occurred_game_at,metadata
      FROM private_life.causal_nodes WHERE user_id=$1 ORDER BY occurred_game_at DESC,id DESC LIMIT $2`,
      [userId,clamp(nodeLimit,20,300)]),
    query(`SELECT e.id,e.parent_node_id,e.child_node_id,e.relation_type,e.weight,e.metadata
      FROM private_life.causal_edges e
      JOIN private_life.causal_nodes p ON p.id=e.parent_node_id
      WHERE e.user_id=$1 ORDER BY e.id DESC LIMIT 500`,[userId]),
    query(`SELECT id,source_node_id,parent_consequence_id,consequence_type,summary,priority,probability,effect_data,condition_data,
      due_game_at,expires_game_at,status,attempts,executed_node_id,resolution,created_game_at,executed_game_at,metadata
      FROM private_life.consequence_queue WHERE user_id=$1
      ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END,due_game_at ASC,id DESC LIMIT $2`,
      [userId,clamp(consequenceLimit,20,250)])
  ]);
  const nodeList=nodes.rows.map(x=>({
    id:String(x.id),nodeKey:x.node_key,nodeType:x.node_type,sourceType:x.source_type,sourceRef:x.source_ref,
    summary:x.summary,actorKey:x.actor_key,targetKey:x.target_key,importance:Number(x.importance)||0,
    visibility:x.visibility,occurredGameAt:x.occurred_game_at,metadata:x.metadata||{}
  }));
  const edgeList=edges.rows.map(x=>({
    id:String(x.id),parentId:String(x.parent_node_id),childId:String(x.child_node_id),
    relationType:x.relation_type,weight:Number(x.weight)||0,metadata:x.metadata||{}
  }));
  const consequenceList=consequences.rows.map(x=>({
    id:String(x.id),sourceNodeId:String(x.source_node_id),parentConsequenceId:x.parent_consequence_id?String(x.parent_consequence_id):null,
    type:x.consequence_type,summary:x.summary,priority:Number(x.priority)||0,probability:Number(x.probability)||0,
    effectData:x.effect_data||{},conditionData:x.condition_data||{},dueGameAt:x.due_game_at,expiresGameAt:x.expires_game_at,
    status:x.status,attempts:Number(x.attempts)||0,executedNodeId:x.executed_node_id?String(x.executed_node_id):null,
    resolution:x.resolution||'',createdGameAt:x.created_game_at,executedGameAt:x.executed_game_at,metadata:x.metadata||{}
  }));
  const nodeMap=new Map(nodeList.map(n=>[n.id,n])),childrenMap=new Map(),hasParent=new Set(),degree=new Map();
  for(const e of edgeList){
    if(!childrenMap.has(e.parentId))childrenMap.set(e.parentId,[]);
    childrenMap.get(e.parentId).push(e);hasParent.add(e.childId);
    degree.set(e.parentId,(degree.get(e.parentId)||0)+1);
    degree.set(e.childId,(degree.get(e.childId)||0)+1);
  }
  const roots=nodeList.filter(n=>!hasParent.has(n.id)&&childrenMap.has(n.id)).slice(0,20);
  const chains=roots.map(n=>makeChain(n.id,nodeMap,childrenMap)).filter(Boolean).slice(0,12);
  const pending=consequenceList.filter(x=>x.status==='pending');
  const highLeverage=[...degree.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10).map(([nodeId,connections])=>({nodeId,connections,node:nodeMap.get(nodeId)||null}));
  const playerRelevant=nodeList.filter(n=>n.visibility==='player_relevant').slice(0,20);
  const activeRootIds=new Set(pending.map(x=>x.sourceNodeId));
  const openRoots=[...activeRootIds].map(id=>nodeMap.get(id)).filter(Boolean).slice(0,20);
  return {
    nodes:nodeList,edges:edgeList,consequences:consequenceList,
    analytics:{
      pendingConsequences:pending.slice(0,30),
      openRoots,
      recentChains:chains,
      highLeverageNodes:highLeverage,
      playerRelevantNodes:playerRelevant
    }
  };
}

export async function applyDirectorCausalPlan(userId,{gameNow,causalActions=[]}={}){
  const created=[];
  for(const action of arr(causalActions).slice(0,8)){
    const kind=safe(action?.action,30).toLowerCase();
    if(kind==='register_cause'){
      const node=await recordCausalNode(userId,{
        nodeKey:safe(action?.nodeKey,180),nodeType:safe(action?.nodeType,80)||'director_cause',
        sourceType:'world-director',sourceRef:safe(action?.sourceRef,180),summary:safe(action?.summary,1000),
        actorKey:safe(action?.actorKey,140),targetKey:safe(action?.targetKey,140),importance:action?.importance,
        visibility:action?.playerRelevant?'player_relevant':'private',gameAt:gameNow,metadata:{reason:safe(action?.reason,500)}
      });
      if(node)created.push({action:'register_cause',node});
      continue;
    }
    if(kind==='schedule_consequence'){
      let sourceId=Number(action?.sourceNodeId);
      if(!Number.isFinite(sourceId)&&action?.sourceNodeKey){
        const r=await query('SELECT id FROM private_life.causal_nodes WHERE user_id=$1 AND node_key=$2 LIMIT 1',[userId,safe(action.sourceNodeKey,180)]);
        sourceId=Number(r.rows[0]?.id);
      }
      if(!Number.isFinite(sourceId))continue;
      const c=await scheduleConsequence(userId,{
        sourceNodeId:sourceId,parentConsequenceId:action?.parentConsequenceId,type:safe(action?.type,80)||'world_event',
        summary:safe(action?.summary,1000),priority:action?.priority,probability:action?.probability,
        delayMinutes:action?.delayMinutes,dueGameAt:action?.dueGameAt,expiresMinutes:action?.expiresMinutes,
        effectData:obj(action?.effectData),conditionData:obj(action?.conditionData),gameAt:gameNow,
        metadata:{source:'world-director',visibility:action?.playerRelevant?'player_relevant':'private',reason:safe(action?.reason,500)}
      });
      if(c)created.push({action:'schedule_consequence',consequence:c});
      continue;
    }
    if(kind==='link'){
      const linked=await linkCausalNodes(userId,action?.parentNodeId,action?.childNodeId,{
        relationType:safe(action?.relationType,40)||'cause',weight:action?.weight,metadata:{source:'world-director'}
      });
      if(linked)created.push({action:'link',edgeId:linked});
      continue;
    }
    if(kind==='cancel_consequence'){
      const id=Number(action?.consequenceId);if(!Number.isFinite(id))continue;
      const r=await query(`UPDATE private_life.consequence_queue SET status='cancelled',resolution=$3,updated_at=NOW()
        WHERE user_id=$1 AND id=$2 AND status='pending' RETURNING id`,[userId,id,safe(action?.reason,700)||'Cancelada por World Director']);
      if(r.rows[0])created.push({action:'cancel_consequence',consequenceId:String(id)});
    }
  }
  return created;
}
