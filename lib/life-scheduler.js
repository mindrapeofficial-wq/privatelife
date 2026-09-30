import { query } from './db.js';

const LOCATION_PRESETS={
  home:{label:'Casa',social:10,privacy:92},
  gym:{label:'Gimnasio',social:66,privacy:28},
  work:{label:'Trabajo',social:48,privacy:42},
  study:{label:'Estudios',social:42,privacy:48},
  street:{label:'Fuera / calle',social:58,privacy:22},
  cafe:{label:'Cafetería',social:60,privacy:30},
  restaurant:{label:'Restaurante',social:64,privacy:26},
  bar:{label:'Bar',social:78,privacy:18},
  club:{label:'Discoteca / club',social:90,privacy:10},
  event:{label:'Evento',social:88,privacy:12},
  beach:{label:'Playa',social:55,privacy:18},
  park:{label:'Parque',social:48,privacy:24},
  shopping:{label:'Compras',social:52,privacy:20},
  travel:{label:'De viaje',social:50,privacy:20},
  other:{label:'Otro lugar',social:45,privacy:35}
};

const ACTIVITY_PRESETS={
  free:{label:'Disponible',availability:'available',social:0},
  rest:{label:'Descansando',availability:'available',social:-8},
  sleep:{label:'Durmiendo',availability:'offline',social:-45},
  cooking:{label:'Cocinando',availability:'limited',social:-12},
  watching:{label:'Viendo algo',availability:'available',social:-8},
  music:{label:'Haciendo música',availability:'limited',social:-12},
  gaming:{label:'Jugando',availability:'limited',social:-8},
  training:{label:'Entrenando',availability:'limited',social:8},
  class:{label:'En una clase',availability:'busy',social:10},
  sauna:{label:'Sauna / descanso',availability:'limited',social:4},
  working:{label:'Trabajando',availability:'busy',social:-10},
  meeting:{label:'En una reunión',availability:'busy',social:-20},
  break:{label:'En un descanso',availability:'available',social:10},
  studying:{label:'Estudiando',availability:'busy',social:-12},
  walking:{label:'Paseando',availability:'available',social:12},
  shopping:{label:'Comprando',availability:'limited',social:8},
  eating:{label:'Comiendo',availability:'limited',social:4},
  drinking:{label:'Tomando algo',availability:'available',social:16},
  partying:{label:'De fiesta',availability:'limited',social:24},
  attending:{label:'En un evento',availability:'limited',social:22},
  sport:{label:'Practicando deporte',availability:'limited',social:12},
  travelling:{label:'Desplazándome',availability:'limited',social:2},
  date:{label:'En una cita',availability:'busy',social:16},
  friends:{label:'Con amigos',availability:'limited',social:18},
  custom:{label:'Otra actividad',availability:'limited',social:0}
};

function clamp(n,min,max){return Math.max(min,Math.min(max,Math.round(Number(n)||0)))}
function clean(value,max=160){return String(value??'').replace(/\u0000/g,'').trim().slice(0,max)}
function hash(value){let h=2166136261;for(const ch of String(value??'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return Math.abs(h>>>0)}
function between(min,max,seed){if(max<=min)return min;return min+(hash(seed)%(max-min+1))}
function roll(seed){return (hash(seed)%10000)/10000}
function plusMinutes(date,minutes){return new Date(new Date(date).getTime()+Math.max(0,Number(minutes)||0)*60000)}
function safeTimezone(value){const tz=clean(value,80)||'UTC';try{new Intl.DateTimeFormat('en-US',{timeZone:tz}).format(new Date());return tz}catch{return'UTC'}}
function localParts(date,timeZone){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:safeTimezone(timeZone),weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).reduce((o,p)=>{o[p.type]=p.value;return o},{});
  return {weekday:parts.weekday||'Mon',hour:Number(parts.hour)||0,minute:Number(parts.minute)||0};
}
function mapContext(row){
  if(!row)return null;
  return {
    locationKey:row.location_key,
    locationLabel:row.location_label,
    activityKey:row.activity_key,
    activityLabel:row.activity_label,
    availability:row.availability,
    socialExposure:Number(row.social_exposure)||0,
    privacy:Number(row.privacy)||0,
    startedGameAt:row.started_game_at,
    expectedUntilGameAt:row.expected_until_game_at,
    revision:Number(row.revision)||1,
    nextEvaluationGameAt:row.next_evaluation_game_at,
    metadata:row.metadata||{},
    updatedAt:row.updated_at
  };
}

export async function getWorldNow(userId,requestedTimezone='UTC'){
  const timezone=safeTimezone(requestedTimezone);
  await query("INSERT INTO private_life.world_clock (user_id,anchor_real_at,anchor_game_at,speed,paused,timezone,created_at,updated_at) VALUES($1,NOW(),NOW(),1,FALSE,$2,NOW(),NOW()) ON CONFLICT(user_id) DO UPDATE SET timezone=CASE WHEN private_life.world_clock.timezone='UTC' THEN EXCLUDED.timezone ELSE private_life.world_clock.timezone END",[userId,timezone]);
  const result=await query("SELECT speed,paused,timezone,CASE WHEN paused THEN anchor_game_at ELSE anchor_game_at+((NOW()-anchor_real_at)*speed) END AS game_now FROM private_life.world_clock WHERE user_id=$1 LIMIT 1",[userId]);
  return result.rows[0];
}

export async function getPlayerContext(userId){
  const result=await query("SELECT * FROM private_life.player_context WHERE user_id=$1 LIMIT 1",[userId]);
  return mapContext(result.rows[0]);
}

export async function ensurePlayerContext(userId,gameNow){
  let current=await getPlayerContext(userId);
  if(current)return current;
  const firstEval=plusMinutes(gameNow,between(10,24,'initial|'+userId+'|'+new Date(gameNow).toISOString().slice(0,13)));
  const result=await query("INSERT INTO private_life.player_context (user_id,location_key,location_label,activity_key,activity_label,availability,social_exposure,privacy,started_game_at,revision,next_evaluation_game_at,metadata,updated_at) VALUES($1,'home','Casa','free','Disponible','available',10,92,$2,1,$3,$4::jsonb,NOW()) ON CONFLICT(user_id) DO UPDATE SET updated_at=private_life.player_context.updated_at RETURNING *",[userId,gameNow,firstEval,JSON.stringify({knowledgePolicy:'private-by-default'})]);
  return mapContext(result.rows[0]);
}

export async function setPlayerContext(userId,input,gameNow){
  const locationKey=LOCATION_PRESETS[input?.locationKey]?input.locationKey:'other';
  const activityKey=ACTIVITY_PRESETS[input?.activityKey]?input.activityKey:'custom';
  const loc=LOCATION_PRESETS[locationKey],act=ACTIVITY_PRESETS[activityKey];
  const locationLabel=clean(input?.locationLabel,120)||loc.label;
  const activityLabel=clean(input?.activityLabel,120)||act.label;
  const socialExposure=clamp(loc.social+act.social,0,100);
  const privacy=clamp(loc.privacy,0,100);
  const duration=Math.max(0,Math.min(720,Number(input?.durationMinutes)||0));
  const expectedUntil=duration?plusMinutes(gameNow,duration):null;
  const firstEval=plusMinutes(gameNow,between(7,22,userId+'|'+locationKey+'|'+activityKey+'|'+new Date(gameNow).toISOString()));
  const metadata={knowledgePolicy:'private-by-default',customLocation:locationKey==='other',customActivity:activityKey==='custom'};
  const result=await query("INSERT INTO private_life.player_context (user_id,location_key,location_label,activity_key,activity_label,availability,social_exposure,privacy,started_game_at,expected_until_game_at,revision,last_evaluated_game_at,next_evaluation_game_at,metadata,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1,NULL,$11,$12::jsonb,NOW()) ON CONFLICT(user_id) DO UPDATE SET location_key=EXCLUDED.location_key,location_label=EXCLUDED.location_label,activity_key=EXCLUDED.activity_key,activity_label=EXCLUDED.activity_label,availability=EXCLUDED.availability,social_exposure=EXCLUDED.social_exposure,privacy=EXCLUDED.privacy,started_game_at=EXCLUDED.started_game_at,expected_until_game_at=EXCLUDED.expected_until_game_at,revision=private_life.player_context.revision+1,last_evaluated_game_at=NULL,next_evaluation_game_at=EXCLUDED.next_evaluation_game_at,metadata=EXCLUDED.metadata,updated_at=NOW() RETURNING *",[userId,locationKey,locationLabel,activityKey,activityLabel,act.availability,socialExposure,privacy,gameNow,expectedUntil,firstEval,JSON.stringify(metadata)]);
  const context=mapContext(result.rows[0]);
  await query("UPDATE private_life.life_events SET status='cancelled' WHERE user_id=$1 AND status='pending' AND context_revision<>$2",[userId,context.revision]);
  await query("INSERT INTO private_life.phone_activity (user_id,event_type,event_label,event_data) VALUES($1,'life_context_changed',$2,$3::jsonb)",[userId,locationLabel+' · '+activityLabel,JSON.stringify({context})]);
  return context;
}

function chanceFor(context,gameNow,timezone){
  if(context.activityKey==='sleep')return 0.01;
  let chance=0.08+(context.socialExposure/100)*0.14;
  if(['gym','bar','club','event'].includes(context.locationKey))chance+=0.08;
  if(['partying','attending','friends','drinking'].includes(context.activityKey))chance+=0.06;
  if(['working','meeting','studying'].includes(context.activityKey))chance-=0.05;
  const parts=localParts(gameNow,timezone);
  if(parts.hour>=19&&parts.hour<=23)chance+=0.04;
  if(['Fri','Sat'].includes(parts.weekday))chance+=0.04;
  return Math.max(0.01,Math.min(0.42,chance));
}

function eventTemplates(context,save){
  const contacts=Array.isArray(save?.social?.contacts)?save.social.contacts.filter(c=>c?.name):[];
  const contact=contacts.length?contacts[hash(context.locationKey+'|'+context.activityKey+'|'+context.revision)%contacts.length]:null;
  const common=[];
  if(contact&&context.activityKey!=='sleep')common.push({key:'contact-window',type:'social_window',app:'WhatsApp',title:contact.name,body:'Su nombre vuelve a aparecer en un momento que podría acabar en conversación.',payload:{contactId:contact.id||'',contactName:contact.name}});
  if(context.locationKey==='gym')common.push({key:'gym-encounter',type:'encounter',app:'PRIVATE LIFE',title:'Coincidencia en el gimnasio',body:'Una cara empieza a resultarte familiar entre las máquinas. No sabes todavía si es casualidad.',payload:{hook:'encounter'}});
  if(context.locationKey==='work')common.push({key:'work-window',type:'social_window',app:'PRIVATE LIFE',title:'Un hueco en el ritmo',body:'El trabajo afloja por unos minutos y se abre una ventana para que ocurra algo fuera de la rutina.',payload:{hook:'work_break'}});
  if(['bar','club','event'].includes(context.locationKey))common.push({key:'night-encounter',type:'encounter',app:'PRIVATE LIFE',title:'Una mirada se repite',body:'En medio del ambiente vuelves a cruzarte con la misma persona. Esta vez parece menos casual.',payload:{hook:'social_encounter'}});
  if(['street','shopping','park','beach','cafe','restaurant'].includes(context.locationKey))common.push({key:'public-crossing',type:'encounter',app:'PRIVATE LIFE',title:'Cruce casual',body:'Te cruzas dos veces con la misma persona en poco tiempo. Puede no significar nada.',payload:{hook:'public_crossing'}});
  if(context.locationKey==='travel')common.push({key:'travel-shift',type:'ambient',app:'PRIVATE LIFE',title:'El trayecto cambia de ritmo',body:'Un pequeño cambio en el viaje altera tus tiempos y abre una posibilidad que antes no estaba ahí.',payload:{hook:'travel_shift'}});
  if(context.locationKey==='home')common.push({key:'home-plan',type:'social_window',app:'PRIVATE LIFE',title:'Plan improvisado',body:'La tarde está lo bastante abierta como para que una conversación termine cambiando tus planes.',payload:{hook:'home_plan'}});
  if(!common.length)common.push({key:'ambient-window',type:'ambient',app:'PRIVATE LIFE',title:'Algo puede moverse',body:'Tu situación actual deja una pequeña ventana para un encuentro, mensaje o cambio de planes.',payload:{hook:'ambient'}});
  return common;
}

async function maybeQueue(userId,context,clock,save){
  const gameNow=new Date(clock.game_now);
  const next=context.nextEvaluationGameAt?new Date(context.nextEvaluationGameAt):gameNow;
  if(clock.paused||gameNow<next)return null;
  const slot=Math.floor(gameNow.getTime()/(15*60000));
  const seed=userId+'|'+context.revision+'|'+slot+'|'+context.locationKey+'|'+context.activityKey;
  let queued=null;
  const pending=await query("SELECT COUNT(*)::int AS n FROM private_life.life_events WHERE user_id=$1 AND context_revision=$2 AND status='pending'",[userId,context.revision]);
  if((pending.rows[0]?.n||0)<2&&roll(seed)<chanceFor(context,gameNow,clock.timezone)){
    const templates=eventTemplates(context,save);
    const event=templates[hash(seed+'|template')%templates.length];
    const cooldown=await query("SELECT 1 FROM private_life.life_events WHERE user_id=$1 AND event_key=$2 AND status IN ('delivered','pending') AND scheduled_game_at>$3 LIMIT 1",[userId,event.key,plusMinutes(gameNow,-180)]);
    if(!cooldown.rows[0]){
      const delay=between(3,16,seed+'|delay');
      const scheduled=plusMinutes(gameNow,delay);
      const inserted=await query("INSERT INTO private_life.life_events (user_id,context_revision,event_key,event_type,app,title,body,payload,scheduled_game_at,status,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,'pending',NOW()) RETURNING *",[userId,context.revision,event.key,event.type,event.app,event.title,event.body,JSON.stringify({...event.payload,context:{locationKey:context.locationKey,locationLabel:context.locationLabel,activityKey:context.activityKey,activityLabel:context.activityLabel}}),scheduled]);
      queued=inserted.rows[0];
    }
  }
  const wait=between(20,48,seed+'|next');
  await query("UPDATE private_life.player_context SET last_evaluated_game_at=$2,next_evaluation_game_at=$3,updated_at=NOW() WHERE user_id=$1",[userId,gameNow,plusMinutes(gameNow,wait)]);
  return queued;
}

async function deliverDue(userId,gameNow){
  const due=await query("SELECT * FROM private_life.life_events WHERE user_id=$1 AND status='pending' AND scheduled_game_at<=$2 ORDER BY scheduled_game_at ASC LIMIT 12",[userId,gameNow]);
  const delivered=[];
  for(const event of due.rows){
    const updated=await query("UPDATE private_life.life_events SET status='delivered',delivered_at=NOW() WHERE id=$1 AND user_id=$2 AND status='pending' RETURNING *",[event.id,userId]);
    const row=updated.rows[0];
    if(!row)continue;
    await query("INSERT INTO private_life.phone_activity (user_id,event_type,event_label,event_data) VALUES($1,'life_event',$2,$3::jsonb)",[userId,row.title,JSON.stringify({eventId:String(row.id),eventType:row.event_type,app:row.app,title:row.title,body:row.body,payload:row.payload||{},scheduledGameAt:row.scheduled_game_at})]);
    delivered.push({
      id:String(row.id),eventKey:row.event_key,type:row.event_type,app:row.app,title:row.title,body:row.body,
      payload:row.payload||{},scheduledGameAt:row.scheduled_game_at,deliveredAt:row.delivered_at||new Date().toISOString()
    });
  }
  return delivered;
}

export async function tickLifeEngine(userId,requestedTimezone='UTC'){
  const clock=await getWorldNow(userId,requestedTimezone);
  const context=await ensurePlayerContext(userId,new Date(clock.game_now));
  const saveResult=await query("SELECT save_data FROM private_life.game_saves WHERE user_id=$1 LIMIT 1",[userId]);
  await maybeQueue(userId,context,clock,saveResult.rows[0]?.save_data||{});
  const delivered=await deliverDue(userId,new Date(clock.game_now));
  const fresh=await getPlayerContext(userId);
  return {gameNow:clock.game_now,timezone:clock.timezone,speed:Number(clock.speed)||1,paused:!!clock.paused,context:fresh,delivered};
}

export const LIFE_LOCATION_PRESETS=LOCATION_PRESETS;
export const LIFE_ACTIVITY_PRESETS=ACTIVITY_PRESETS;
