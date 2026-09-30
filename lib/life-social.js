import { query } from './db.js';
import { resolveRoutineState } from './life-routines.js';
import { storeMemory } from './life-memory.js';

function clamp(n,min,max){return Math.max(min,Math.min(max,Math.round(Number(n)||0)))}
function safe(value,max=500){return String(value??'').replace(/\u0000/g,'').trim().slice(0,max)}
function obj(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}
function arr(v){return Array.isArray(v)?v:[]}
function hash(value){let h=2166136261;for(const ch of String(value??'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return Math.abs(h>>>0)}
function roll(seed){return (hash(seed)%10000)/10000}
function between(min,max,seed){if(max<=min)return min;return min+(hash(seed)%(max-min+1))}
function plusMinutes(date,minutes){return new Date(new Date(date).getTime()+Math.max(0,Number(minutes)||0)*60000)}
function pairKeys(a,b){const x=String(a),y=String(b);return x<y?[x,y]:[y,x]}
function cleanLocation(v){return safe(v,160).toLowerCase().replace(/[^a-z0-9áéíóúüñ ]/gi,' ').replace(/\s+/g,' ').trim()}
function labelFor(edge){
  if(Number(edge.tension)>=72)return 'relación tensa';
  if(Number(edge.affinity)>=78&&Number(edge.trust)>=68&&Number(edge.familiarity)>=65)return 'amistad cercana';
  if(Number(edge.affinity)>=64&&Number(edge.trust)>=52&&Number(edge.familiarity)>=45)return 'amistad';
  if(Number(edge.familiarity)>=28)return 'conocidos';
  return 'contacto reciente';
}
function summarizeEdge(row){
  return {
    aKey:row.character_a_key,bKey:row.character_b_key,relationLabel:row.relation_label,
    familiarity:Number(row.familiarity)||0,affinity:Number(row.affinity)||0,trust:Number(row.trust)||0,
    tension:Number(row.tension)||0,attraction:Number(row.attraction)||0,loyalty:Number(row.loyalty)||0,
    influence:Number(row.influence)||0,interactionCount:Number(row.interaction_count)||0,
    lastInteractionGameAt:row.last_interaction_game_at,metadata:row.metadata||{}
  };
}
function worldNode(character,clock,playerCity=''){
  const key='world:'+String(character.id||character.name||'npc');
  const city=safe(character.location||playerCity,140);
  return {
    key,name:safe(character.name,120)||'Personaje',source:'world',age:Number(character.age)||18,
    city,location:safe(character.location,180),occupation:safe(character.occupation,160),
    personality:safe(character.personality,1200),traits:obj(character.traits),
    life:resolveRoutineState(character.routine,new Date(clock.game_now),{
      occupation:character.occupation||'',city,timezone:clock.timezone||'UTC',characterKey:key
    })
  };
}
function advancedNode(row,clock){
  const config=obj(row.config),identity=obj(config.identity),world=obj(config.world);
  const key='ai:'+row.id,city=safe(identity.city,140);
  return {
    key,name:safe(row.name,120)||'Personaje',source:'advanced',age:Number(row.age)||18,
    city,location:city,occupation:safe(identity.occupation,160),
    personality:JSON.stringify({personality:obj(config.personality),relationships:obj(config.relationships)}).slice(0,1800),
    traits:{},
    life:resolveRoutineState(world.schedule,new Date(clock.game_now),{
      occupation:identity.occupation||'',city,timezone:clock.timezone||'UTC',characterKey:key
    })
  };
}
function contactOpportunity(a,b,edge,seed){
  if(a.life?.availability==='offline'||b.life?.availability==='offline')return 0;
  const aLoc=cleanLocation(a.location||a.city),bLoc=cleanLocation(b.location||b.city);
  const samePlace=aLoc&&bLoc&&aLoc===bLoc;
  const sameCity=cleanLocation(a.city)&&cleanLocation(a.city)===cleanLocation(b.city);
  const known=Boolean(edge);
  let score=known?0.13:0.015;
  if(samePlace)score+=0.28;
  else if(sameCity)score+=known?0.12:0.045;
  if(edge){
    score+=(Number(edge.familiarity)||0)/550;
    score+=(Number(edge.affinity)||0)/900;
    if(Number(edge.tension)>70)score+=0.02;
  }
  if(a.life?.availability==='busy')score-=0.06;
  if(b.life?.availability==='busy')score-=0.06;
  return Math.max(0.003,Math.min(0.5,score+(roll(seed+'|jitter')-.5)*.03));
}
function interactionFor(a,b,edge,seed){
  const familiarity=Number(edge?.familiarity)||0,affinity=Number(edge?.affinity??50),trust=Number(edge?.trust??30),tension=Number(edge?.tension??10);
  const r=roll(seed+'|type');
  if(tension>=65&&r<0.46)return {type:'disagreement',summary:`${a.name} y ${b.name} tuvieron un roce durante una conversación.`,deltas:{familiarity:1,affinity:-3,trust:-2,tension:6},importance:58};
  if(trust>=62&&affinity>=66&&r<0.34)return {type:'support',summary:`${a.name} y ${b.name} tuvieron una conversación de apoyo que reforzó su vínculo.`,deltas:{familiarity:2,affinity:3,trust:4,tension:-2,loyalty:2},importance:62};
  if(familiarity>=45&&affinity>=58&&r<0.48)return {type:'plan',summary:`${a.name} y ${b.name} hablaron de hacer algo juntos próximamente.`,deltas:{familiarity:2,affinity:2,trust:1},importance:55};
  if(familiarity<25)return {type:'smalltalk',summary:`${a.name} y ${b.name} coincidieron y charlaron un rato.`,deltas:{familiarity:4,affinity:1,trust:1},importance:32};
  return {type:'conversation',summary:`${a.name} y ${b.name} mantuvieron una conversación cotidiana.`,deltas:{familiarity:2,affinity:r>.82?-1:1,trust:1},importance:38};
}
async function loadEdge(userId,aKey,bKey){
  const [a,b]=pairKeys(aKey,bKey);
  const r=await query(`SELECT * FROM private_life.npc_social_edges
    WHERE user_id=$1 AND character_a_key=$2 AND character_b_key=$3 LIMIT 1`,[userId,a,b]);
  return r.rows[0]||null;
}
export async function applySocialDeltas(userId,aKey,bKey,deltas,gameNow,{metadata={},countInteraction=true}={}){
  if(!aKey||!bKey||aKey===bKey)return null;
  const [a,b]=pairKeys(aKey,bKey);
  const d=obj(deltas);
  const current=await loadEdge(userId,a,b);
  const base=current||{familiarity:8,affinity:50,trust:28,tension:10,attraction:10,loyalty:18,influence:20,interaction_count:0,metadata:{}};
  const next={
    familiarity:clamp(Number(base.familiarity)+clamp(d.familiarity??0,-12,12),0,100),
    affinity:clamp(Number(base.affinity)+clamp(d.affinity??0,-12,12),0,100),
    trust:clamp(Number(base.trust)+clamp(d.trust??0,-12,12),0,100),
    tension:clamp(Number(base.tension)+clamp(d.tension??0,-12,12),0,100),
    attraction:clamp(Number(base.attraction)+clamp(d.attraction??0,-12,12),0,100),
    loyalty:clamp(Number(base.loyalty)+clamp(d.loyalty??0,-12,12),0,100),
    influence:clamp(Number(base.influence)+clamp(d.influence??0,-12,12),0,100)
  };
  next.relationLabel=labelFor(next);
  const r=await query(`INSERT INTO private_life.npc_social_edges
    (user_id,character_a_key,character_b_key,relation_label,familiarity,affinity,trust,tension,attraction,loyalty,influence,interaction_count,last_interaction_game_at,metadata,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,NOW())
    ON CONFLICT(user_id,character_a_key,character_b_key) DO UPDATE SET
      relation_label=EXCLUDED.relation_label,familiarity=EXCLUDED.familiarity,affinity=EXCLUDED.affinity,
      trust=EXCLUDED.trust,tension=EXCLUDED.tension,attraction=EXCLUDED.attraction,loyalty=EXCLUDED.loyalty,
      influence=EXCLUDED.influence,interaction_count=EXCLUDED.interaction_count,
      last_interaction_game_at=EXCLUDED.last_interaction_game_at,
      metadata=private_life.npc_social_edges.metadata||EXCLUDED.metadata,updated_at=NOW()
    RETURNING *`,[
      userId,a,b,next.relationLabel,next.familiarity,next.affinity,next.trust,next.tension,next.attraction,next.loyalty,next.influence,
      Number(base.interaction_count||0)+(countInteraction?1:0),countInteraction?gameNow:(base.last_interaction_game_at||null),
      JSON.stringify(metadata||{})
    ]);
  return summarizeEdge(r.rows[0]);
}
export async function recordSocialEvent(userId,{actorKey,targetKey,type='conversation',summary,visibility='private',deltas={},payload={},gameAt}){
  const actor=safe(actorKey,140),target=safe(targetKey,140),text=safe(summary,900);
  if(!actor||!target||actor===target||!text)return null;
  const vis=['private','observable','player_relevant'].includes(visibility)?visibility:'private';
  const r=await query(`INSERT INTO private_life.npc_social_events
    (user_id,actor_key,target_key,event_type,summary,visibility,deltas,payload,game_at)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9) RETURNING id`,
    [userId,actor,target,safe(type,60),text,vis,JSON.stringify(deltas||{}),JSON.stringify(payload||{}),gameAt]);
  return String(r.rows[0]?.id||'');
}
export async function createInformation(userId,{
  infoKey,subjectKey=null,content,truthStatus='unknown',sensitivity=30,importance=50,
  originCharacterKey=null,sourceType='world',gameAt,metadata={}
}){
  const key=safe(infoKey,140)||('info-'+hash(content+'|'+new Date(gameAt).toISOString()));
  const text=safe(content,900);if(!text)return null;
  const truth=['unknown','true','false','mixed'].includes(truthStatus)?truthStatus:'unknown';
  const r=await query(`INSERT INTO private_life.npc_information
    (user_id,info_key,subject_key,content,truth_status,sensitivity,importance,origin_character_key,source_type,created_game_at,metadata)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
    ON CONFLICT(user_id,info_key) DO UPDATE SET
      content=EXCLUDED.content,truth_status=EXCLUDED.truth_status,sensitivity=EXCLUDED.sensitivity,
      importance=EXCLUDED.importance,metadata=private_life.npc_information.metadata||EXCLUDED.metadata
    RETURNING id,info_key`,[
      userId,key,safe(subjectKey,140)||null,text,truth,clamp(sensitivity,0,100),clamp(importance,0,100),
      safe(originCharacterKey,140)||null,safe(sourceType,60)||'world',gameAt,JSON.stringify(metadata||{})
    ]);
  const info=r.rows[0];
  if(originCharacterKey&&info?.id){
    await query(`INSERT INTO private_life.npc_information_holders
      (user_id,information_id,character_key,confidence,stance,source_character_key,heard_game_at,metadata)
      VALUES($1,$2,$3,90,'believes',NULL,$4,$5::jsonb)
      ON CONFLICT(user_id,information_id,character_key) DO NOTHING`,
      [userId,info.id,originCharacterKey,gameAt,JSON.stringify({origin:true})]);
  }
  return info?{id:String(info.id),infoKey:info.info_key}:null;
}
export async function shareInformation(userId,{informationId=null,infoKey=null,fromKey,toKey,gameAt,confidence=null}){
  if(!fromKey||!toKey||fromKey===toKey)return null;
  const infoResult=informationId
    ?await query('SELECT * FROM private_life.npc_information WHERE user_id=$1 AND id=$2 LIMIT 1',[userId,Number(informationId)])
    :await query('SELECT * FROM private_life.npc_information WHERE user_id=$1 AND info_key=$2 LIMIT 1',[userId,safe(infoKey,140)]);
  const info=infoResult.rows[0];if(!info)return null;
  const source=await query(`SELECT * FROM private_life.npc_information_holders
    WHERE user_id=$1 AND information_id=$2 AND character_key=$3 LIMIT 1`,[userId,info.id,fromKey]);
  if(!source.rows[0])return null;
  const baseConfidence=confidence==null?Number(source.rows[0].confidence)||60:clamp(confidence,0,100);
  const targetConfidence=clamp(baseConfidence-between(2,14,fromKey+'|'+toKey+'|'+info.info_key),10,100);
  await query(`INSERT INTO private_life.npc_information_holders
    (user_id,information_id,character_key,confidence,stance,source_character_key,heard_game_at,metadata,updated_at)
    VALUES($1,$2,$3,$4,'believes',$5,$6,$7::jsonb,NOW())
    ON CONFLICT(user_id,information_id,character_key) DO UPDATE SET
      confidence=GREATEST(private_life.npc_information_holders.confidence,EXCLUDED.confidence),
      source_character_key=COALESCE(private_life.npc_information_holders.source_character_key,EXCLUDED.source_character_key),
      updated_at=NOW()`,[userId,info.id,toKey,targetConfidence,fromKey,gameAt,JSON.stringify({via:'social'})]);
  await query(`UPDATE private_life.npc_information_holders SET share_count=share_count+1,updated_at=NOW()
    WHERE user_id=$1 AND information_id=$2 AND character_key=$3`,[userId,info.id,fromKey]);
  return {informationId:String(info.id),infoKey:info.info_key,content:info.content,importance:Number(info.importance)||0,sensitivity:Number(info.sensitivity)||0,confidence:targetConfidence};
}
async function maybeShareKnownInformation(userId,a,b,edge,gameNow,seed){
  const directions=roll(seed+'|direction')<.5?[[a,b],[b,a]]:[[b,a],[a,b]];
  for(const [from,to] of directions){
    const r=await query(`SELECT i.*,h.confidence
      FROM private_life.npc_information_holders h
      JOIN private_life.npc_information i ON i.id=h.information_id AND i.user_id=h.user_id
      WHERE h.user_id=$1 AND h.character_key=$2
        AND (i.expires_game_at IS NULL OR i.expires_game_at>$3)
        AND NOT EXISTS (
          SELECT 1 FROM private_life.npc_information_holders h2
          WHERE h2.user_id=h.user_id AND h2.information_id=h.information_id AND h2.character_key=$4
        )
      ORDER BY i.importance DESC,i.created_game_at DESC LIMIT 8`,[userId,from.key,gameNow,to.key]);
    for(const info of r.rows){
      const willingness=(Number(edge.trust)||30)*.55+(Number(edge.affinity)||50)*.25+(Number(edge.familiarity)||10)*.2;
      if(willingness<(Number(info.sensitivity)||30)+15)continue;
      if(roll(seed+'|share|'+info.info_key)>.22)continue;
      const shared=await shareInformation(userId,{informationId:info.id,fromKey:from.key,toKey:to.key,gameAt:gameNow});
      if(!shared)continue;
      const summary=`${from.name} compartió con ${to.name} una información: ${safe(info.content,320)}`;
      await recordSocialEvent(userId,{actorKey:from.key,targetKey:to.key,type:'information_share',summary,visibility:'private',deltas:{trust:1},payload:{informationId:String(info.id),infoKey:info.info_key,subjectKey:info.subject_key},gameAt:gameNow});
      await storeMemory(userId,to.key,{
        type:'event',summary:`${from.name} le contó: ${safe(info.content,360)}`,
        importance:clamp(info.importance,0,100),emotionalValence:0
      },gameNow,{source:'social_graph',sourceRef:'info:'+info.id,metadata:{informationId:String(info.id),sourceCharacterKey:from.key}});
      return shared;
    }
  }
  return null;
}
async function performInteraction(userId,a,b,edge,gameNow,seed){
  const interaction=interactionFor(a,b,edge,seed);
  const updated=await applySocialDeltas(userId,a.key,b.key,interaction.deltas,gameNow,{metadata:{lastType:interaction.type},countInteraction:true});
  await recordSocialEvent(userId,{actorKey:a.key,targetKey:b.key,type:interaction.type,summary:interaction.summary,visibility:'private',deltas:interaction.deltas,payload:{actorName:a.name,targetName:b.name},gameAt:gameNow});
  if(interaction.importance>=55){
    await Promise.all([
      storeMemory(userId,a.key,{type:'relationship',summary:interaction.summary,importance:interaction.importance,emotionalValence:interaction.type==='disagreement'?-35:20},gameNow,{source:'social_graph',metadata:{otherCharacterKey:b.key}}),
      storeMemory(userId,b.key,{type:'relationship',summary:interaction.summary,importance:interaction.importance,emotionalValence:interaction.type==='disagreement'?-35:20},gameNow,{source:'social_graph',metadata:{otherCharacterKey:a.key}})
    ]);
  }
  const shared=updated?await maybeShareKnownInformation(userId,a,b,updated,gameNow,seed):null;
  return {actorKey:a.key,targetKey:b.key,type:interaction.type,summary:interaction.summary,edge:updated,informationShared:shared};
}
export async function buildSocialRoster(userId,clock,save={}){
  const advanced=await query('SELECT id,name,age,config FROM private_life.ai_characters WHERE owner_user_id=$1 AND is_active=TRUE ORDER BY id ASC',[userId]);
  const nodes=[];
  for(const row of advanced.rows)nodes.push(advancedNode(row,clock));
  for(const character of arr(save?.world?.characters)){
    if(character?.status==='retirado')continue;
    const node=worldNode(character,clock,save?.identity?.city||'');
    if(!nodes.some(x=>x.key===node.key))nodes.push(node);
  }
  return nodes.slice(0,80);
}
export async function tickNpcSocialWorld(userId,{clock,save={}}={}){
  const gameNow=new Date(clock.game_now);
  await query(`INSERT INTO private_life.npc_social_runtime(user_id,next_tick_game_at,tick_count,updated_at)
    VALUES($1,$2,0,NOW()) ON CONFLICT(user_id) DO NOTHING`,[userId,gameNow]);
  const runtime=(await query('SELECT * FROM private_life.npc_social_runtime WHERE user_id=$1 LIMIT 1',[userId])).rows[0];
  if(clock.paused||runtime?.next_tick_game_at&&gameNow<new Date(runtime.next_tick_game_at)){
    return {ran:false,interactions:[],nextTickGameAt:runtime?.next_tick_game_at||null};
  }
  const nodes=await buildSocialRoster(userId,clock,save);
  if(nodes.length<2){
    const next=plusMinutes(gameNow,60);
    await query('UPDATE private_life.npc_social_runtime SET last_tick_game_at=$2,next_tick_game_at=$3,tick_count=tick_count+1,updated_at=NOW() WHERE user_id=$1',[userId,gameNow,next]);
    return {ran:true,interactions:[],nextTickGameAt:next.toISOString(),nodes:nodes.length};
  }
  const slot=Math.floor(gameNow.getTime()/(30*60000));
  const possible=[];
  for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
    const a=nodes[i],b=nodes[j];
    const edge=await loadEdge(userId,a.key,b.key);
    const seed=userId+'|social|'+slot+'|'+a.key+'|'+b.key;
    const chance=contactOpportunity(a,b,edge,seed);
    if(roll(seed)<chance)possible.push({a,b,edge,seed,rank:roll(seed+'|rank')+chance});
  }
  possible.sort((x,y)=>y.rank-x.rank);
  const interactions=[];
  const used=new Set();
  for(const item of possible){
    if(interactions.length>=2)break;
    if(used.has(item.a.key)||used.has(item.b.key))continue;
    interactions.push(await performInteraction(userId,item.a,item.b,item.edge,gameNow,item.seed));
    used.add(item.a.key);used.add(item.b.key);
  }
  const next=plusMinutes(gameNow,between(28,75,userId+'|social-next|'+slot));
  await query('UPDATE private_life.npc_social_runtime SET last_tick_game_at=$2,next_tick_game_at=$3,tick_count=tick_count+1,updated_at=NOW() WHERE user_id=$1',[userId,gameNow,next]);
  return {ran:true,nodes:nodes.length,interactions,nextTickGameAt:next.toISOString()};
}
export async function loadSocialAnalysis(userId,{limitEvents=40}={}){
  const [edges,events,information]=await Promise.all([
    query(`SELECT * FROM private_life.npc_social_edges WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 250`,[userId]),
    query(`SELECT id,actor_key,target_key,event_type,summary,visibility,deltas,payload,game_at,created_at
      FROM private_life.npc_social_events WHERE user_id=$1 ORDER BY game_at DESC,id DESC LIMIT $2`,[userId,clamp(limitEvents,1,120)]),
    query(`SELECT i.id,i.info_key,i.subject_key,i.content,i.truth_status,i.sensitivity,i.importance,i.origin_character_key,i.created_game_at,
      COUNT(h.character_key)::int AS holder_count,
      COALESCE(json_agg(json_build_object('characterKey',h.character_key,'confidence',h.confidence,'stance',h.stance,'sourceCharacterKey',h.source_character_key,'heardGameAt',h.heard_game_at)) FILTER (WHERE h.character_key IS NOT NULL),'[]'::json) AS holders
      FROM private_life.npc_information i
      LEFT JOIN private_life.npc_information_holders h ON h.user_id=i.user_id AND h.information_id=i.id
      WHERE i.user_id=$1 AND (i.expires_game_at IS NULL OR i.expires_game_at>NOW())
      GROUP BY i.id ORDER BY i.importance DESC,i.created_game_at DESC LIMIT 80`,[userId])
  ]);
  const edgeList=edges.rows.map(summarizeEdge);
  const degree=new Map();
  for(const e of edgeList){
    for(const k of [e.aKey,e.bKey])degree.set(k,(degree.get(k)||0)+1);
  }
  const strongest=[...edgeList].sort((a,b)=>(b.affinity+b.trust+b.familiarity-b.tension)-(a.affinity+a.trust+a.familiarity-a.tension)).slice(0,8);
  const tensions=[...edgeList].sort((a,b)=>b.tension-a.tension).filter(x=>x.tension>=45).slice(0,8);
  const hubs=[...degree.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([characterKey,connections])=>({characterKey,connections}));
  const info=information.rows.map(x=>({
    id:String(x.id),infoKey:x.info_key,subjectKey:x.subject_key,content:x.content,truthStatus:x.truth_status,
    sensitivity:Number(x.sensitivity)||0,importance:Number(x.importance)||0,originCharacterKey:x.origin_character_key,
    createdGameAt:x.created_game_at,holderCount:Number(x.holder_count)||0,holders:Array.isArray(x.holders)?x.holders:[]
  }));
  return {
    edges:edgeList,
    recentEvents:events.rows.map(x=>({id:String(x.id),actorKey:x.actor_key,targetKey:x.target_key,type:x.event_type,summary:x.summary,visibility:x.visibility,deltas:x.deltas||{},payload:x.payload||{},gameAt:x.game_at,createdAt:x.created_at})),
    information:info,
    analytics:{
      strongestBonds:strongest,
      activeTensions:tensions,
      socialHubs:hubs,
      spreadingInformation:info.filter(x=>x.holderCount>=2).sort((a,b)=>b.holderCount-a.holderCount).slice(0,10),
      playerRelatedInformation:info.filter(x=>String(x.subjectKey||'').startsWith('player')).slice(0,12)
    }
  };
}
export async function applyDirectorSocialPlan(userId,{gameNow,save={},socialActions=[],informationActions=[]}={}){
  const clock={game_now:gameNow,timezone:'UTC',paused:false};
  const roster=await buildSocialRoster(userId,clock,save);
  const valid=new Map(roster.map(x=>[x.key,x]));
  const appliedSocial=[],appliedInformation=[];
  for(const action of arr(socialActions).slice(0,6)){
    const actor=valid.get(String(action?.actorKey||'')),target=valid.get(String(action?.targetKey||''));
    if(!actor||!target||actor.key===target.key)continue;
    const deltas={};
    for(const key of ['familiarity','affinity','trust','tension','attraction','loyalty','influence']){
      const n=Number(action?.deltas?.[key]);if(Number.isFinite(n)&&n!==0)deltas[key]=clamp(n,-8,8);
    }
    const summary=safe(action?.summary,800)||`${actor.name} y ${target.name} tuvieron una interacción social.`;
    const edge=await applySocialDeltas(userId,actor.key,target.key,deltas,gameNow,{metadata:{source:'world-director',type:safe(action?.type,60)},countInteraction:true});
    const eventId=await recordSocialEvent(userId,{actorKey:actor.key,targetKey:target.key,type:safe(action?.type,60)||'director_social',summary,visibility:action?.playerRelevant?'player_relevant':'private',deltas,payload:{source:'world-director'},gameAt:gameNow});
    appliedSocial.push({eventId,actorKey:actor.key,targetKey:target.key,edge});
  }
  for(const action of arr(informationActions).slice(0,6)){
    const kind=safe(action?.action,20).toLowerCase();
    if(kind==='create'){
      const originKey=safe(action?.originKey,140);
      if(originKey&&!valid.has(originKey))continue;
      const created=await createInformation(userId,{
        infoKey:safe(action?.infoKey,140),subjectKey:safe(action?.subjectKey,140),content:safe(action?.content,900),
        truthStatus:safe(action?.truthStatus,20),sensitivity:action?.sensitivity,importance:action?.importance,
        originCharacterKey:originKey||null,sourceType:'world-director',gameAt,metadata:{reason:safe(action?.reason,400)}
      });
      if(created)appliedInformation.push({action:'create',...created});
    }else if(kind==='share'){
      const fromKey=safe(action?.fromKey,140),toKey=safe(action?.toKey,140);
      if(!valid.has(fromKey)||!valid.has(toKey))continue;
      const shared=await shareInformation(userId,{infoKey:safe(action?.infoKey,140),fromKey,toKey,gameAt,confidence:action?.confidence});
      if(shared){
        await recordSocialEvent(userId,{actorKey:fromKey,targetKey:toKey,type:'information_share',summary:safe(action?.summary,800)||'Se compartió información entre personajes.',visibility:action?.playerRelevant?'player_relevant':'private',deltas:{trust:1},payload:{infoKey:shared.infoKey,source:'world-director'},gameAt});
        appliedInformation.push({action:'share',...shared,fromKey,toKey});
      }
    }
  }
  return {socialActions:appliedSocial,informationActions:appliedInformation};
}
