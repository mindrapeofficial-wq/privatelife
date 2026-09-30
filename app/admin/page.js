'use client';

import { useEffect, useMemo, useState } from 'react';
import { buildDefaultRoutine, routineSummary } from '../../lib/life-routines.js';

const TRAITS=['confianza','atraccion','apego','tension','sospecha','celos','curiosidad','resentimiento'];

async function api(url,options={}){
  const response=await fetch(url,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  let data={};try{data=await response.json()}catch{}
  if(!response.ok)throw new Error(data.error||'Error de conexión');
  return data;
}
function uid(){return globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)+Date.now().toString(36)}
function pick(list){return list[Math.floor(Math.random()*list.length)]}
function between(min,max){return Math.floor(min+Math.random()*(max-min+1))}
function bounded(n,min=0,max=100){return Math.max(min,Math.min(max,Math.round(n)))}

const PROCEDURAL_NAMES=[
  'Irene','Lucía','Claudia','Marta','Alba','Sara','Natalia','Elena','Carla','Nerea','Andrea','Paula',
  'Álvaro','Marcos','Adrián','Hugo','Sergio','Diego','Javier','Mario','Rubén','Lucas','Álex','Bruno'
];
const PROCEDURAL_ARCHETYPES=[
  {
    id:'social',
    roles:['amistad potencial','conocido del entorno social','persona que coincide en un plan','nuevo contacto'],
    jobs:['relaciones públicas','camarero/a','dependiente/a','community manager','organizador/a de eventos'],
    personality:'Extrovertido/a, observador/a y con facilidad para entrar en conversación. Busca estímulo social, pero no entrega confianza completa de inmediato.',
    communication:'Mensajes ágiles, tono cercano, humor rápido y cierta tendencia a improvisar. Si percibe frialdad, baja el ritmo antes de insistir.',
    objectives:'Ampliar su círculo, encontrar planes interesantes y comprobar si el jugador encaja de verdad en su vida cotidiana.',
    boundaries:'No tolera control, insistencia repetida ni invasiones de privacidad. Necesita reciprocidad para mantener el interés.',
    secrets:['Está intentando dejar atrás una amistad complicada.','Tiene una oportunidad laboral que podría hacerle cambiar de ciudad.','Oculta que conoce indirectamente a alguien del entorno del jugador.'],
    traitBase:{confianza:48,atraccion:32,apego:25,tension:28,sospecha:30,celos:18,curiosidad:72,resentimiento:8}
  },
  {
    id:'reserved',
    roles:['vecino/a','conocido/a recurrente','amistad lenta','contacto del barrio'],
    jobs:['administrativo/a','bibliotecario/a','técnico/a de laboratorio','diseñador/a','traductor/a'],
    personality:'Reservado/a, sensible al detalle y bastante independiente. Tarda en mostrar interés, pero recuerda pequeños gestos y contradicciones.',
    communication:'Escribe poco pero con intención. Prefiere conversaciones uno a uno y suele pensar antes de responder.',
    objectives:'Mantener estabilidad, conocer a gente sin precipitar vínculos y proteger su espacio personal.',
    boundaries:'Rechaza la presión emocional, las preguntas demasiado íntimas al principio y las situaciones públicas incómodas.',
    secrets:['Guarda una decepción sentimental que casi nadie conoce.','Está preparando un cambio importante sin contárselo aún a su círculo.','Tiene una afición muy absorbente que suele ocultar al conocer gente.'],
    traitBase:{confianza:35,atraccion:24,apego:30,tension:22,sospecha:48,celos:20,curiosidad:55,resentimiento:15}
  },
  {
    id:'creative',
    roles:['contacto creativo','persona del ambiente cultural','colaborador/a potencial','amistad por intereses comunes'],
    jobs:['fotógrafo/a','músico/a','ilustrador/a','productor/a audiovisual','tatuador/a','diseñador/a gráfico/a'],
    personality:'Creativo/a, curioso/a y emocionalmente expresivo/a. Se entusiasma con ideas nuevas y puede alternar periodos de mucha energía con necesidad de desconexión.',
    communication:'Usa referencias, audios, bromas y mensajes espontáneos. Suele hablar de proyectos y experiencias más que de formalidades.',
    objectives:'Encontrar personas estimulantes, impulsar proyectos propios y vivir experiencias que rompan la rutina.',
    boundaries:'Detesta que trivialicen su trabajo, la manipulación emocional y sentirse utilizado/a como contacto o recurso.',
    secrets:['Tiene un proyecto personal que todavía no se atreve a enseñar.','Arrastra una deuda pequeña relacionada con un proyecto fallido.','Ha tenido una relación profesional que terminó muy mal.'],
    traitBase:{confianza:44,atraccion:36,apego:34,tension:34,sospecha:28,celos:24,curiosidad:82,resentimiento:14}
  },
  {
    id:'pragmatic',
    roles:['contacto profesional','compañero/a de trabajo','cliente o colaborador/a','conocido/a útil que puede volverse cercano'],
    jobs:['comercial','gestor/a','enfermero/a','abogado/a','técnico/a informático/a','responsable de tienda'],
    personality:'Pragmático/a, directo/a y bastante estable. Valora que las acciones coincidan con las palabras y evita dramas innecesarios.',
    communication:'Mensajes claros, concretos y educados. Puede parecer frío/a al principio, aunque responde bien a la honestidad y al humor seco.',
    objectives:'Mejorar su situación profesional, conservar autonomía y construir relaciones fiables sin perder tiempo en ambigüedades.',
    boundaries:'No acepta promesas incumplidas, juegos de celos ni demandas constantes de atención.',
    secrets:['Está valorando abandonar su trabajo sin que nadie lo sepa.','Tiene un conflicto familiar que mantiene separado de su vida social.','Una decisión profesional pasada todavía puede volver a complicarle la vida.'],
    traitBase:{confianza:52,atraccion:28,apego:28,tension:20,sospecha:38,celos:14,curiosidad:46,resentimiento:12}
  },
  {
    id:'intense',
    roles:['encuentro inesperado','amistad magnética','persona de carácter fuerte','nuevo contacto imprevisible'],
    jobs:['entrenador/a personal','artista escénico/a','bartender','emprendedor/a','periodista','creador/a de contenido'],
    personality:'Intenso/a, seguro/a en apariencia y muy reactivo/a a la química interpersonal. Le aburren las relaciones planas y busca emociones claras.',
    communication:'Directo/a, expresivo/a y cambiante. Puede contestar con mucha energía y desaparecer unas horas si siente pérdida de interés.',
    objectives:'Vivir experiencias fuertes, evitar la rutina y descubrir hasta dónde puede llegar una conexión interesante.',
    boundaries:'No tolera humillaciones, indiferencia deliberada ni sentirse controlado/a. Puede retirarse bruscamente si interpreta deslealtad.',
    secrets:['Mantiene contacto esporádico con una expareja.','Ha exagerado una parte de su vida para proteger su imagen.','Tiene una rivalidad personal que podría cruzarse con la historia.'],
    traitBase:{confianza:42,atraccion:40,apego:31,tension:48,sospecha:36,celos:38,curiosidad:74,resentimiento:22}
  }
];
const PROCEDURAL_APPEARANCES=[
  'Rostro expresivo, estilo urbano cuidado y apariencia natural. Suele vestir de forma sencilla pero deliberada; transmite seguridad sin buscar llamar demasiado la atención.',
  'Aspecto limpio y contemporáneo, cabello cuidado y lenguaje corporal tranquilo. Su forma de vestir prioriza comodidad con algunos detalles personales reconocibles.',
  'Presencia llamativa sin ser extravagante, mirada muy comunicativa y estilo flexible entre casual y arreglado según el contexto.',
  'Apariencia discreta, gestos contenidos y estética práctica. Resulta más memorable por la expresión y la forma de moverse que por accesorios concretos.',
  'Estética creativa, pequeños detalles personales en ropa o accesorios y una presencia visual que cambia bastante según el ambiente.'
];

function world(save={}){
  return {...save,world:{characters:[],events:[],directorLog:[],...(save.world||{}),
    characters:Array.isArray(save.world?.characters)?save.world.characters:[],
    events:Array.isArray(save.world?.events)?save.world.events:[],
    directorLog:Array.isArray(save.world?.directorLog)?save.world.directorLog:[]}};
}
function fmt(v){if(!v)return '—';try{return new Intl.DateTimeFormat('es-ES',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v))}catch{return String(v)}}
function phoneEventText(ev){const names={phone_home:'Entró al inicio',open_app:'Abrió',close_app:'Cerró',home_page:'Cambió de escritorio',unlock:'Desbloqueó el teléfono',lock:'Bloqueó el teléfono',visibility:'Estado de la app',screen_change:'Cambió de pantalla',logout:'Cerró sesión',whatsapp_exchange:'Conversación WhatsApp',whatsapp_message_sent:'WhatsApp enviado',whatsapp_message_received:'WhatsApp recibido',whatsapp_photo_sent:'Foto por WhatsApp',narrative_event:'Evento narrativo'};const prefix=names[ev?.type]||String(ev?.type||'Actividad').replaceAll('_',' ');return ev?.label?prefix+' · '+ev.label:prefix}
function phoneAppIcon(name){const icons={Instagram:'/phone/instagram.webp',Tinder:'/phone/tinder.webp',Grindr:'/phone/grindr.webp',Contactos:'/phone/contacts.webp',Fotos:'/phone/photos.webp',Calendario:'/phone/calendar.webp',Notas:'/phone/notes.webp',Ajustes:'/phone/settings.webp','Teléfono':'/phone/phone.webp',Mensajes:'/phone/messages.webp'};return icons[name]||''}

export default function AdminPage(){
  const [ready,setReady]=useState(false),[users,setUsers]=useState([]),[selectedId,setSelectedId]=useState('');
  const [player,setPlayer]=useState(null),[tab,setTab]=useState('overview'),[charId,setCharId]=useState('');
  const [eventDraft,setEventDraft]=useState(''),[chatDraft,setChatDraft]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[aiHealth,setAiHealth]=useState(null),[aiHealthBusy,setAiHealthBusy]=useState(false);
  const [aiMind,setAiMind]=useState(null),[aiMindBusy,setAiMindBusy]=useState(false),[aiMindSelectedRun,setAiMindSelectedRun]=useState('');
  const [consoleFilter,setConsoleFilter]=useState('all'),[consoleQuery,setConsoleQuery]=useState('');
  const [chat,setChat]=useState([{role:'ai',text:'Director IA central conectado. Puedo analizar la partida y usar las herramientas narrativas del panel cuando me lo pidas.'}]);

  async function loadUsers(preferred){
    const data=await api('/api/admin/users',{cache:'no-store'});
    setUsers(data.users||[]);
    const next=preferred||selectedId||data.users?.[0]?.id||'';
    if(next)setSelectedId(String(next));
  }
  async function loadPlayer(id){
    if(!id){setPlayer(null);return}
    setBusy(true);
    try{
      const data=await api('/api/admin/player?userId='+encodeURIComponent(id),{cache:'no-store'});
      const loaded={...data.player,save:world(data.player.save)};
      setPlayer(loaded);setCharId(loaded.save.world.characters[0]?.id||'');
    }catch(e){setNotice(e.message)}finally{setBusy(false)}
  }
  async function testCentralAI(){
    setAiHealthBusy(true);
    try{
      const data=await api('/api/admin/ai-health',{cache:'no-store'});
      setAiHealth(data);
    }catch(e){
      setAiHealth({ok:false,configured:false,reachable:false,status:'request_failed',message:e.message});
    }finally{
      setAiHealthBusy(false);
    }
  }

  async function refreshPhone(id){
    if(!id)return;
    try{
      const data=await api('/api/admin/player?userId='+encodeURIComponent(id),{cache:'no-store'});
      const loaded={...data.player,save:world(data.player.save)};
      setPlayer(cur=>cur&&String(cur.id)===String(id)?{...cur,...loaded}:loaded);
    }catch(e){setNotice(e.message)}
  }

  async function loadAiMind(id,{quiet=false}={}){
    if(!id)return;
    if(!quiet)setAiMindBusy(true);
    try{
      const data=await api('/api/admin/ai-mind?userId='+encodeURIComponent(id),{cache:'no-store'});
      setAiMind(data.mind||null);
      setAiMindSelectedRun(current=>{
        const runs=data.mind?.runs||[];
        return current&&runs.some(r=>String(r.id)===String(current))?current:String(runs[0]?.id||'');
      });
    }catch(e){
      if(!quiet)setNotice(e.message);
    }finally{
      if(!quiet)setAiMindBusy(false);
    }
  }

  async function reviewAiMind(){
    if(!player||aiMindBusy)return;
    setAiMindBusy(true);
    try{
      const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
      const data=await api('/api/admin/ai-mind',{
        method:'POST',
        body:JSON.stringify({userId:player.id,action:'review_now',timezone})
      });
      setAiMind(data.mind||null);
      setAiMindSelectedRun(String(data.mind?.runs?.[0]?.id||''));
      await refreshPhone(player.id);
      setNotice(data.review?.ran?'La IA central ha revisado el mundo ahora.':'Revisión solicitada.');
      setTimeout(()=>setNotice(''),1700);
    }catch(e){
      setNotice(e.message);
    }finally{
      setAiMindBusy(false);
    }
  }
  useEffect(()=>{let cancelled=false;(async()=>{try{
    const me=await api('/api/auth/me',{cache:'no-store'});
    if(me.user?.role!=='admin'){window.location.replace('/');return}
    if(!cancelled)await loadUsers();
  }catch{window.location.replace('/')}finally{if(!cancelled)setReady(true)}})();return()=>{cancelled=true}},[]);
  useEffect(()=>{if(selectedId)loadPlayer(selectedId)},[selectedId]);
  useEffect(()=>{if(tab!=='phone'||!selectedId)return;refreshPhone(selectedId);const id=setInterval(()=>refreshPhone(selectedId),2000);return()=>clearInterval(id)},[tab,selectedId]);
  useEffect(()=>{if(tab!=='mind'||!selectedId)return;loadAiMind(selectedId);const id=setInterval(()=>loadAiMind(selectedId,{quiet:true}),5000);return()=>clearInterval(id)},[tab,selectedId]);
  useEffect(()=>{if(tab!=='console'||!selectedId)return;const tick=()=>{refreshPhone(selectedId);loadAiMind(selectedId,{quiet:true})};tick();const id=setInterval(tick,2000);return()=>clearInterval(id)},[tab,selectedId]);

  const save=player?.save?world(player.save):world({});
  const chars=save.world.characters,events=save.world.events;
  const character=useMemo(()=>chars.find(x=>x.id===charId)||chars[0]||null,[chars,charId]);
  const phone=player?.phone||{state:{},activity:[],whatsapp:[],updatedAt:null},phoneState=phone.state||{},phoneActivity=Array.isArray(phone.activity)?phone.activity:[],phoneWhatsapp=Array.isArray(phone.whatsapp)?phone.whatsapp:[];
  const life=player?.life||{characters:[],events:[],autonomy:[],autonomyEvents:[],memories:[],intentions:[],context:null,worldLocation:null,timezone:'UTC',speed:1,paused:false},lifeCharacters=Array.isArray(life.characters)?life.characters:[],lifeEvents=Array.isArray(life.events)?life.events:[],lifeAutonomy=Array.isArray(life.autonomy)?life.autonomy:[],lifeAutonomyEvents=Array.isArray(life.autonomyEvents)?life.autonomyEvents:[],lifeMemories=Array.isArray(life.memories)?life.memories:[],lifeIntentions=Array.isArray(life.intentions)?life.intentions:[],playerContext=life.context||null,worldLocation=life.worldLocation||null;
  const phoneFresh=phone.updatedAt&&Date.now()-new Date(phone.updatedAt).getTime()<12000&&phoneState.visibility!=='offline';
  const installedPhoneApps=['Instagram','WhatsApp','Facebook',...(save.datingApps?.tinder?['Tinder']:[]),...(save.datingApps?.grindr?['Grindr']:[]),'Contactos','Fotos','Calendario','App Store','Ahora','Notas','Ajustes','Teléfono','Mensajes','Safari','Música'];
  const aiRuns=Array.isArray(aiMind?.runs)?aiMind.runs:[];
  const aiRun=aiRuns.find(r=>String(r.id)===String(aiMindSelectedRun))||aiRuns[0]||null;
  const aiPlan=aiRun?.plan||aiMind?.state?.lastPlan||{};
  const aiActionCount=(aiPlan.newCharacters?.length||0)+(aiPlan.characterUpdates?.length||0)+(aiPlan.relationshipUpdates?.length||0)+(aiPlan.events?.length||0)+(aiPlan.messages?.length||0);
  const consoleEntries=useMemo(()=>{
    const out=[];
    const push=(entry)=>{if(entry?.at)out.push({...entry,at:entry.at})};
    const playerName=save.identity?.name||'El jugador';

    phoneActivity.forEach(ev=>push({
      id:'phone:'+ev.id,kind:'player',source:'TELÉFONO',at:ev.createdAt,
      title:phoneEventText(ev),
      text:ev?.data?.app?playerName+' está usando '+ev.data.app+'.':ev?.label?playerName+' realizó esta acción en el teléfono.':'Actividad registrada en el teléfono del jugador.'
    }));

    phoneWhatsapp.forEach(m=>push({
      id:'wa:'+m.id,kind:'message',source:'WHATSAPP',at:m.createdAt,
      title:m.side==='out'?playerName+' escribió a '+(m.contactName||'un contacto'):(m.contactName||'Un contacto')+' escribió al jugador',
      text:m.type==='image'?'Envió una foto.':String(m.text||'Mensaje sin texto'),
      meta:m.side==='out'?'JUGADOR → CONTACTO':'CONTACTO → JUGADOR'
    }));

    lifeEvents.forEach(ev=>push({
      id:'life-event:'+ev.id,kind:'world',source:'MUNDO',at:ev.deliveredAt||ev.createdAt||ev.scheduledGameAt,
      title:ev.status==='delivered'?'Ocurrió un evento del mundo':'Evento del mundo · '+String(ev.status||'pendiente'),
      text:[ev.title,ev.body].filter(Boolean).join(' · ')||String(ev.type||'Evento narrativo'),
      meta:ev.app?String(ev.app).toUpperCase():'LIFE ENGINE'
    }));

    lifeAutonomyEvents.forEach(ev=>push({
      id:'autonomy:'+ev.id,kind:'world',source:'NPC',at:ev.createdAt||ev.gameAt,
      title:(ev.characterName||'Un personaje')+' actuó por iniciativa propia',
      text:String(ev.data?.summary||ev.data?.text||ev.data?.reason||ev.type||'Acción autónoma del personaje.'),
      meta:'AUTONOMÍA NPC'
    }));

    lifeMemories.forEach(m=>push({
      id:'memory:'+m.id,kind:'ai',source:'MEMORIA NPC',at:m.lastRecalledGameAt||m.occurredGameAt,
      title:'Un personaje conserva un recuerdo',
      text:String(m.summary||'Recuerdo persistente sin descripción.'),
      meta:String(m.characterKey||'NPC')+' · importancia '+String(m.importance??'—')+' · '+String(m.status||'active')
    }));

    lifeIntentions.forEach(intent=>push({
      id:'intention:'+intent.id,kind:'ai',source:'INTENCIÓN NPC',at:intent.createdGameAt||intent.notBeforeGameAt,
      title:'Un personaje mantiene una intención '+String(intent.status||'pending'),
      text:String(intent.summary||'Intención narrativa sin descripción.'),
      meta:String(intent.characterKey||'NPC')+' · prioridad '+String(intent.priority??'—')
    }));

    if(playerContext?.updated_at)push({
      id:'context:'+String(playerContext.revision||playerContext.updated_at),kind:'player',source:'CONTEXTO',at:playerContext.updated_at,
      title:'El jugador cambió su situación actual',
      text:[playerContext.location_label,playerContext.activity_label,playerContext.availability].filter(Boolean).join(' · ')||'Contexto del jugador actualizado.'
    });

    if(worldLocation?.updated_at)push({
      id:'location:'+String(worldLocation.updated_at),kind:'player',source:'UBICACIÓN',at:worldLocation.updated_at,
      title:'Se actualizó la zona geográfica del jugador',
      text:String(worldLocation.display_label||worldLocation.city||'Ubicación actualizada.')
    });

    events.forEach(ev=>push({
      id:'world-save:'+ev.id,kind:'world',source:'EVENTO',at:ev.createdAt,
      title:'Evento narrativo '+String(ev.status||'pendiente'),
      text:String(ev.description||'Evento sin descripción'),
      meta:String(ev.trigger||'manual').toUpperCase()
    }));

    (save.world?.directorLog||[]).forEach(log=>push({
      id:'director:'+log.id,kind:'system',source:'ADMIN',at:log.at,
      title:'Intervención del Director',
      text:String(log.text||'Cambio realizado desde el panel de administración.')
    }));

    aiRuns.forEach(run=>{
      push({
        id:'ai-run:'+run.id,kind:'ai',source:'IA CENTRAL',at:run.createdAt||run.gameAt,
        title:'La IA central revisó el mundo',
        text:String(run.summary||'Revisión completada sin resumen.'),
        meta:(run.queuedEvents||0)+' eventos · '+(run.queuedMessages||0)+' mensajes'
      });
      (run.observations||[]).forEach((x,i)=>push({
        id:'ai-ob:'+run.id+':'+i,kind:'ai',source:'IA · OBSERVACIÓN',at:run.createdAt||run.gameAt,
        title:'La IA detectó algo relevante',
        text:String(x)
      }));
      (run.directorNotes||[]).forEach((x,i)=>push({
        id:'ai-note:'+run.id+':'+i,kind:'ai',source:'IA · CRITERIO',at:run.createdAt||run.gameAt,
        title:'Criterio operativo de la IA',
        text:String(x)
      }));
      const plan=run.plan||{};
      (plan.newCharacters||[]).forEach((x,i)=>push({
        id:'ai-char:'+run.id+':'+i,kind:'ai',source:'IA · ACCIÓN',at:run.createdAt||run.gameAt,
        title:'La IA decidió introducir a '+(x.name||'un nuevo personaje'),
        text:String(x.role||x.occupation||'Nuevo personaje generado para el mundo.')
      }));
      (plan.characterUpdates||[]).forEach((x,i)=>push({
        id:'ai-cupdate:'+run.id+':'+i,kind:'ai',source:'IA · ACCIÓN',at:run.createdAt||run.gameAt,
        title:'La IA actualizó a '+(x.name||x.id||'un personaje'),
        text:Object.keys(x.patch||{}).length?'Cambió: '+Object.keys(x.patch||{}).join(', '):'Actualizó su estado narrativo.'
      }));
      (plan.relationshipUpdates||[]).forEach((x,i)=>push({
        id:'ai-rel:'+run.id+':'+i,kind:'ai',source:'IA · RELACIÓN',at:run.createdAt||run.gameAt,
        title:'La IA reajustó una relación',
        text:(x.name||x.id||'Personaje')+' · '+(Object.entries(x.deltas||{}).map(([k,v])=>k+' '+(Number(v)>=0?'+':'')+v).join(' · ')||'sin variaciones numéricas')
      }));
      (plan.events||[]).forEach((x,i)=>push({
        id:'ai-event:'+run.id+':'+i,kind:'ai',source:'IA · PLAN',at:run.createdAt||run.gameAt,
        title:'La IA programó un evento',
        text:[x.title||x.type,x.reason||x.body,x.delayMinutes!=null?'dentro de '+x.delayMinutes+' min':null].filter(Boolean).join(' · ')
      }));
      (plan.messages||[]).forEach((x,i)=>push({
        id:'ai-msg:'+run.id+':'+i,kind:'ai',source:'IA · PLAN',at:run.createdAt||run.gameAt,
        title:'La IA programó un mensaje de '+(x.contactName||'un contacto'),
        text:[x.reason||x.text,x.delayMinutes!=null?'dentro de '+x.delayMinutes+' min':null].filter(Boolean).join(' · ')
      }));
    });

    return out.sort((a,b)=>new Date(b.at).getTime()-new Date(a.at).getTime()).slice(0,900);
  },[phoneActivity,phoneWhatsapp,lifeEvents,lifeAutonomyEvents,lifeMemories,lifeIntentions,playerContext,worldLocation,events,save.world?.directorLog,save.identity?.name,aiRuns]);
  const visibleConsoleEntries=useMemo(()=>{
    const q=consoleQuery.trim().toLowerCase();
    return consoleEntries.filter(x=>(consoleFilter==='all'||x.kind===consoleFilter)&&(!q||[x.source,x.title,x.text,x.meta].some(v=>String(v||'').toLowerCase().includes(q))));
  },[consoleEntries,consoleFilter,consoleQuery]);
  const aiOperationalState=aiMindBusy?'ANALIZANDO AHORA':aiMind?.state?'OBSERVANDO / EN ESPERA':'SIN CICLO TODAVÍA';

  function localEdit(fn){
    if(!player)return;
    const next=structuredClone(save);fn(next);
    setPlayer(cur=>({...cur,save:next}));
  }
  async function persist(nextSave=save,logText=''){
    if(!player)return;
    const next=world(nextSave);
    if(logText)next.world.directorLog=[{id:uid(),at:new Date().toISOString(),text:logText},...next.world.directorLog].slice(0,200);
    setBusy(true);
    try{
      const data=await api('/api/admin/player',{method:'PUT',body:JSON.stringify({userId:player.id,save:next})});
      setPlayer(cur=>({...cur,save:world(data.save),updatedAt:new Date().toISOString()}));
      setNotice('Cambios guardados.');await loadUsers(player.id);setTimeout(()=>setNotice(''),1500);
    }catch(e){setNotice(e.message)}finally{setBusy(false)}
  }
  function proceduralCharacter(forcedName=''){
    const archetype=pick(PROCEDURAL_ARCHETYPES);
    const playerAge=Math.max(18,Number(save.identity?.age)||30);
    const age=bounded(playerAge+between(-9,9),18,70);
    const city=String(save.identity?.city||'').trim();
    const location=city?pick([
      city+' · zona centro',
      city+' · barrio residencial',
      city+' · entorno laboral',
      city+' · cafetería habitual',
      city+' · gimnasio / actividad',
      city+' · evento o espacio social'
    ]):pick(['zona centro','entorno laboral','cafetería habitual','gimnasio / actividad','evento o espacio social']);
    const jitter=()=>between(-13,13);
    const traits=Object.fromEntries(TRAITS.map(t=>[t,bounded((archetype.traitBase[t]??50)+jitter(),3,96)]));
    const name=String(forcedName||'').trim()||pick(PROCEDURAL_NAMES);
    const secret=pick(archetype.secrets);
    const occupation=pick(archetype.jobs);
    return {
      id:uid(),
      name,
      age,
      status:'activo',
      origin:'procedural',
      role:pick(archetype.roles),
      occupation,
      location,
      routine:buildDefaultRoutine({occupation,city:city||location}),
      appearance:pick(PROCEDURAL_APPEARANCES),
      personality:archetype.personality,
      communication:archetype.communication,
      objectives:archetype.objectives,
      boundaries:archetype.boundaries,
      secrets:secret,
      notes:'Generado proceduralmente por Director AI. Arquetipo interno: '+archetype.id+'. La ficha puede evolucionar según las decisiones del jugador; ningún parámetro inicial es un destino fijo.',
      traits,
      procedural:{
        archetype:archetype.id,
        generatedAt:new Date().toISOString(),
        playerContext:{city:city||null,age:playerAge}
      },
      createdAt:new Date().toISOString()
    };
  }
  function addCharacter(name=''){
    const c=proceduralCharacter(name);
    const next=structuredClone(save);
    next.world.characters.unshift(c);
    setPlayer(cur=>({...cur,save:next}));
    setCharId(c.id);
    return next;
  }
  function patchCharacter(patch){if(!character)return;localEdit(next=>{next.world.characters=next.world.characters.map(c=>c.id===character.id?{...c,...patch}:c)})}
  function isCharacterIncomplete(c){
    if(!c)return false;
    return !String(c.role||'').trim()
      || !String(c.occupation||'').trim()
      || !String(c.location||'').trim()
      || !String(c.appearance||'').trim()
      || !String(c.personality||'').trim()
      || !String(c.communication||'').trim()
      || !String(c.objectives||'').trim()
      || !String(c.boundaries||'').trim()
      || !String(c.secrets||'').trim()
      || !c.routine;
  }
  async function completeCharacterProcedurally(){
    if(!character||!player)return;
    const generated=proceduralCharacter(character.name||'');
    const completed={
      ...generated,
      id:character.id,
      name:character.name||generated.name,
      createdAt:character.createdAt||generated.createdAt,
      status:character.status||generated.status,
      notes:[
        generated.notes,
        character.notes&&String(character.notes).trim()?'Notas anteriores: '+String(character.notes).trim():''
      ].filter(Boolean).join('\n\n')
    };
    const next=structuredClone(save);
    next.world.characters=next.world.characters.map(x=>x.id===character.id?completed:x);
    setPlayer(cur=>({...cur,save:next}));
    setCharId(completed.id);
    await persist(next,'Ficha procedural completada: '+completed.name);
  }
  function patchTrait(trait,value){if(!character)return;localEdit(next=>{next.world.characters=next.world.characters.map(c=>c.id===character.id?{...c,traits:{...(c.traits||{}),[trait]:Number(value)}}:c)})}
  async function addEvent(text=eventDraft){
    text=String(text||'').trim();if(!text||!player)return;
    const next=structuredClone(save);next.world.events.unshift({id:uid(),description:text,status:'pendiente',trigger:'manual',condition:'',createdAt:new Date().toISOString()});
    setEventDraft('');await persist(next,'Evento creado: '+text);
  }
  async function sendDirector(e){
    e.preventDefault();
    const prompt=chatDraft.trim();
    if(!prompt||!player||busy)return;
    const previous=chat.slice(-10);
    setChatDraft('');
    setChat(v=>[...v,{role:'admin',text:prompt}]);
    setBusy(true);
    try{
      const data=await api('/api/admin/director',{
        method:'POST',
        body:JSON.stringify({userId:player.id,prompt,history:previous})
      });
      const actions=Array.isArray(data.executed)?data.executed:[];
      const actionText=actions.length?'\n\nACCIONES EJECUTADAS\n'+actions.map(x=>'• '+(x.detail||x.type)).join('\n'):'';
      setChat(v=>[...v,{role:'ai',text:(data.reply||'He revisado la partida.')+actionText}]);
      if(data.save)setPlayer(cur=>cur?{...cur,save:world(data.save),updatedAt:new Date().toISOString()}:cur);
      await refreshPhone(player.id);
      await loadUsers(player.id);
      setNotice(actions.length?'Director IA ejecutó '+actions.length+' acción'+(actions.length===1?'':'es')+'.':'Director IA ha analizado la partida.');
      setTimeout(()=>setNotice(''),1800);
    }catch(error){
      setChat(v=>[...v,{role:'ai',text:'No he podido completar esa intervención: '+error.message}]);
    }finally{
      setBusy(false);
    }
  }
  async function logout(){try{await api('/api/auth/logout',{method:'POST',body:'{}'})}catch{}window.location.replace('/')}

  if(!ready)return <main className="admin-loading">DIRECTOR AI · conectando…</main>;
  return <main className="admin-shell">
    <aside className="admin-sidebar">
      <div className="admin-brand"><span>PRIVATE LIFE</span><b>DIRECTOR AI</b></div>
      <div className="admin-player-label">PARTIDAS</div>
      <div className="admin-player-list">
        {!users.length&&<div className="admin-empty">Todavía no hay jugadores registrados.</div>}
        {users.map(u=><button key={u.id} className={'admin-player '+(String(u.id)===String(selectedId)?'active':'')} onClick={()=>setSelectedId(String(u.id))}>
          <span className="admin-avatar">{(u.identity?.name||u.username||'?').slice(0,1).toUpperCase()}</span>
          <span><b>{u.identity?.name||'@'+u.username}</b><small>@{u.username} · {u.characterCount} NPC · {u.eventCount} eventos</small></span>
        </button>)}
      </div>
      <button className="admin-logout" onClick={logout}>Cerrar sesión</button>
    </aside>
    <section className="admin-main">
      <header className="admin-header"><div><small>CONSOLA DEL DIRECTOR</small><h1>{player?(save.identity?.name||'@'+player.username):'Selecciona una partida'}</h1></div><div className="admin-status"><i/> ADMIN ACTIVO</div></header>
      {notice&&<div className="admin-notice">{notice}</div>}
      {!player?<div className="admin-empty large">Selecciona un jugador para empezar.</div>:<>
        <nav className="admin-tabs">{[['overview','Resumen'],['console','Consola viva'],['phone','Teléfono'],['mind','Mente IA'],['characters','Personajes'],['events','Eventos'],['director','Director IA']].map(([k,l])=><button key={k} className={tab===k?'active':''} onClick={()=>setTab(k)}>{l}</button>)}</nav>

        {tab==='overview'&&<div className="admin-grid">
          <section className="admin-card admin-wide"><div className="admin-card-head"><span>ESTADO DE PARTIDA</span><button onClick={()=>loadPlayer(player.id)}>Actualizar</button></div><div className="admin-kpis"><div><b>{chars.length}</b><span>Personajes</span></div><div><b>{events.filter(x=>x.status!=='cerrado').length}</b><span>Eventos abiertos</span></div><div><b>{Object.keys(save.profile||{}).length}</b><span>Variables</span></div></div></section>
          <section className="admin-card"><div className="admin-card-head"><span>JUGADOR</span></div><dl className="admin-dl"><div><dt>Usuario</dt><dd>@{player.username}</dd></div><div><dt>Nombre</dt><dd>{save.identity?.name||'—'}</dd></div><div><dt>Edad</dt><dd>{save.identity?.age||'—'}</dd></div><div><dt>Ciudad</dt><dd>{save.identity?.city||'—'}</dd></div><div><dt>Ocupación</dt><dd>{save.identity?.occupation||'—'}</dd></div></dl></section>
          <section className="admin-card"><div className="admin-card-head"><span>ACTIVIDAD</span></div><dl className="admin-dl"><div><dt>Último acceso</dt><dd>{fmt(player.lastLoginAt)}</dd></div><div><dt>Último guardado</dt><dd>{fmt(player.updatedAt)}</dd></div><div><dt>Alta</dt><dd>{fmt(player.createdAt)}</dd></div></dl></section>
          <section className="admin-card"><div className="admin-card-head"><span>CONTEXTO VIVO</span></div><dl className="admin-dl"><div><dt>Zona geográfica</dt><dd>{worldLocation?.display_label||'—'}</dd></div><div><dt>Lugar actual</dt><dd>{playerContext?.location_label||'—'}</dd></div><div><dt>Actividad</dt><dd>{playerContext?.activity_label||'—'}</dd></div><div><dt>Disponibilidad</dt><dd>{playerContext?.availability||'—'}</dd></div><div><dt>Eventos Scheduler</dt><dd>{lifeEvents.filter(e=>e.status==='pending').length} pendientes</dd></div></dl></section>
          <section className="admin-card admin-wide"><div className="admin-card-head"><span>VARIABLES OCULTAS DEL JUGADOR</span><button disabled={busy} onClick={()=>persist(save,'Variables del jugador ajustadas')}>Guardar</button></div><div className="admin-traits">{Object.entries(save.profile||{}).sort((a,b)=>a[0].localeCompare(b[0])).map(([k,v])=><label key={k}><span>{k.replaceAll('_',' ')}</span><input type="range" min="0" max="100" value={Number(v)||0} onChange={e=>localEdit(next=>{next.profile={...(next.profile||{}),[k]:Number(e.target.value)}})}/><b>{Number(v)||0}</b></label>)}{!Object.keys(save.profile||{}).length&&<div className="admin-empty">El jugador todavía no ha completado su perfil.</div>}</div></section>
        </div>}

        {tab==='console'&&<div className="admin-console-live">
          <section className="admin-card admin-console-hero">
            <div className="admin-card-head"><span>CONSOLA VIVA · @{player.username}</span><div className="admin-live-pill live"><i/>ACTUALIZACIÓN · 2 S</div></div>
            <div className="admin-console-state">
              <div className="admin-console-brain"><small>IA CENTRAL AHORA</small><b>{aiOperationalState}</b><p>{aiMindBusy?'Está leyendo el estado del mundo y preparando una decisión estructurada.':aiMind?.state?.lastSummary||'La IA está a la espera de su primer ciclo autónomo.'}</p></div>
              <div><small>PRÓXIMA REVISIÓN</small><b>{fmt(aiMind?.state?.nextRunGameAt)}</b></div>
              <div><small>ENTRADAS CARGADAS</small><b>{consoleEntries.length}</b></div>
              <div><small>JUGADOR</small><b>{playerContext?.activity_label||phoneState.currentApp||'Sin actividad declarada'}</b></div>
            </div>
            <div className="admin-console-explainer">La consola traduce a lenguaje humano las señales registradas por el juego: acciones del jugador, mensajes, eventos, autonomía de NPC, intervenciones del admin y decisiones resumidas de la IA central.</div>
          </section>

          <section className="admin-card admin-console-stream-card">
            <div className="admin-console-toolbar">
              <div className="admin-console-filters">
                {[['all','Todo'],['player','Jugador'],['message','Mensajes'],['world','Mundo'],['ai','IA'],['system','Sistema']].map(([k,l])=><button key={k} className={consoleFilter===k?'active':''} onClick={()=>setConsoleFilter(k)}>{l}</button>)}
              </div>
              <input value={consoleQuery} onChange={e=>setConsoleQuery(e.target.value)} placeholder="Buscar persona, mensaje, evento, app, criterio…"/>
            </div>
            <div className="admin-console-stream">
              {visibleConsoleEntries.map(entry=><article className={'admin-console-entry '+entry.kind} key={entry.id}>
                <div className="admin-console-rail"><i/><span/></div>
                <div className="admin-console-copy">
                  <header><span>{entry.source}</span><time>{fmt(entry.at)}</time></header>
                  <b>{entry.title}</b>
                  <p>{entry.text}</p>
                  {entry.meta&&<small>{entry.meta}</small>}
                </div>
              </article>)}
              {!visibleConsoleEntries.length&&<div className="admin-empty large">No hay entradas que coincidan con este filtro. En cuanto ocurra algo, aparecerá aquí automáticamente.</div>}
            </div>
          </section>

          <div className="admin-ai-disclaimer">“Qué analiza la IA” se representa mediante observaciones, criterios, planes y resúmenes auditables. No se muestra razonamiento interno privado paso a paso.</div>
        </div>}

        {tab==='phone'&&<div className="admin-phone-layout">
          <section className="admin-card admin-phone-view"><div className="admin-card-head"><span>TELÉFONO DEL JUGADOR</span><div className={'admin-live-pill '+(phoneFresh?'live':'idle')}><i/>{phoneFresh?'EN DIRECTO':'SIN SEÑAL'}</div></div>
            <div className="admin-phone-meta"><span>@{player.username}</span><span>Sincronización automática · 2 s</span></div>
            <div className="director-phone">
              <div className="director-phone-notch"/>
              <div className="director-phone-status"><b>{new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</b><span>● ◔ 100%</span></div>
              {phoneState.locked?<div className="director-phone-lock"><small>PANTALLA BLOQUEADA</small><b>{save.identity?.name||player.username}</b><span>Última señal {fmt(phone.updatedAt)}</span></div>:
              <div className="director-phone-home">
                <div className="director-phone-user"><span>@{player.username}</span><small>{phoneState.currentApp?'APP ABIERTA':'INICIO · PÁGINA '+((Number(phoneState.homePage)||0)+1)}</small></div>
                {phoneState.currentApp?<div className="director-app-open"><div className="director-app-icon">{phoneAppIcon(phoneState.currentApp)?<img src={phoneAppIcon(phoneState.currentApp)} alt=""/>:<span>{String(phoneState.currentApp).slice(0,1)}</span>}</div><h3>{phoneState.currentApp}</h3><p>El jugador está dentro de esta aplicación.</p><div className="director-app-data"><span>Ruta</span><b>{phoneState.route||'/'}</b><span>Estado</span><b>{phoneState.visibility==='hidden'?'Segundo plano':'Visible'}</b></div></div>:
                <div className="director-app-grid">{installedPhoneApps.map(name=><div className="director-app-tile" key={name}>{phoneAppIcon(name)?<img src={phoneAppIcon(name)} alt=""/>:<span>{name.slice(0,1)}</span>}<small>{name}</small></div>)}</div>}
              </div>}
              <div className="director-phone-gesture"/>
            </div>
          </section>
          <section className="admin-card admin-phone-feed"><div className="admin-card-head"><span>ACTIVIDAD EN VIVO</span><button onClick={()=>refreshPhone(player.id)}>Actualizar</button></div>
            <dl className="admin-dl admin-phone-facts"><div><dt>Estado</dt><dd>{phoneFresh?'Conectado':'Desconectado / inactivo'}</dd></div><div><dt>Pantalla</dt><dd>{phoneState.locked?'Bloqueo':phoneState.currentApp||phoneState.stage||'—'}</dd></div><div><dt>Zona</dt><dd>{worldLocation?.display_label||'—'}</dd></div><div><dt>Lugar actual</dt><dd>{playerContext?.location_label||'—'}</dd></div><div><dt>Actividad actual</dt><dd>{playerContext?.activity_label||'—'}</dd></div><div><dt>Visibilidad</dt><dd>{phoneState.visibility||'—'}</dd></div><div><dt>Última señal</dt><dd>{fmt(phone.updatedAt)}</dd></div></dl>
            <div className="admin-card-head sub"><span>CRONOLOGÍA</span></div>
            <div className="admin-phone-activity">{phoneActivity.map(ev=><div className="admin-phone-event" key={ev.id}><i/><div><b>{phoneEventText(ev)}</b><small>{fmt(ev.createdAt)}</small></div></div>)}{!phoneActivity.length&&<div className="admin-empty">Aún no hay actividad registrada. Aparecerá en cuanto el jugador use el teléfono.</div>}</div>
            <div className="admin-card-head sub"><span>WHATSAPP · CONVERSACIONES</span></div>
            <div className="admin-wa-stream">{phoneWhatsapp.slice(0,40).map(m=><div className={'admin-wa-line '+m.side} key={m.id}><div><b>{m.contactName}</b><small>{m.side==='out'?'JUGADOR → CONTACTO':'CONTACTO → JUGADOR'} · {fmt(m.createdAt)}</small></div><p>{m.type==='image'?'[FOTO]':m.text||'—'}</p></div>)}{!phoneWhatsapp.length&&<div className="admin-empty">Todavía no hay conversaciones de WhatsApp sincronizadas.</div>}</div>
          </section>
        </div>}

        {tab==='characters'&&<div className="admin-character-layout">
          <section className="admin-card admin-character-list"><div className="admin-card-head"><span>PERSONAJES</span><button disabled={busy} onClick={async()=>{const next=addCharacter();const created=next.world.characters[0];await persist(next,'Personaje procedural creado: '+created.name)}}>✦ Generar</button></div>
            {chars.map(c=>{const live=lifeCharacters.find(x=>String(x.id)===String(c.id));return <button key={c.id} className={'admin-character-row '+(character?.id===c.id?'active':'')} onClick={()=>setCharId(c.id)}><span className="admin-avatar">{(c.name||'?').slice(0,1).toUpperCase()}</span><span><b>{c.name||'Sin nombre'}</b><small>{live?.label||c.status||'activo'} · {c.origin||'procedural'}</small></span></button>})}
            {!chars.length&&<div className="admin-empty">No hay NPC todavía. Pulsa “Generar” para crear una ficha procedural completa o pídeselo a Director IA.</div>}
          </section>
          <section className="admin-card admin-character-sheet">{!character?<div className="admin-empty large">Selecciona o crea un personaje.</div>:<>
            <div className="admin-card-head"><span>FICHA MAESTRA</span><div className="admin-sheet-actions">{isCharacterIncomplete(character)&&<button className="admin-procedural-fill" disabled={busy} onClick={completeCharacterProcedurally}>✦ Completar proceduralmente</button>}<button disabled={busy} onClick={()=>persist(save,'Ficha de '+character.name+' modificada')}>Guardar ficha</button></div></div>{isCharacterIncomplete(character)&&<div className="admin-incomplete-banner"><b>Ficha incompleta</b><span>Este personaje fue creado con el sistema anterior o tiene campos esenciales vacíos. Puedes completarlo automáticamente conservando su nombre.</span></div>}
            <div className="admin-form-grid">
              <label>Nombre<input value={character.name||''} onChange={e=>patchCharacter({name:e.target.value})}/></label>
              <label>Edad<input type="number" min="18" value={character.age||18} onChange={e=>patchCharacter({age:Math.max(18,Number(e.target.value)||18)})}/></label>
              <label>Estado<select value={character.status||'activo'} onChange={e=>patchCharacter({status:e.target.value})}><option value="activo">Activo</option><option value="oculto">Oculto</option><option value="retirado">Retirado</option></select></label>
              <label>Origen<select value={character.origin||'procedural'} onChange={e=>patchCharacter({origin:e.target.value})}><option value="procedural">Procedural</option><option value="director">Director</option><option value="importado">Importado</option></select></label>
              <label>Rol narrativo<input value={character.role||''} onChange={e=>patchCharacter({role:e.target.value})}/></label>
              <label>Profesión<input value={character.occupation||''} onChange={e=>patchCharacter({occupation:e.target.value})}/></label>
              <label>Ubicación<input value={character.location||''} onChange={e=>patchCharacter({location:e.target.value})}/></label>
            </div>
            <div className="admin-routine-card">
              <div><b>LIFE ENGINE · RUTINA + AUTONOMÍA</b><span>{(()=>{const live=lifeCharacters.find(x=>String(x.id)===String(character.id));return live?'Ahora: '+live.label+(live.location?' · '+live.location:''):'Estado pendiente de sincronización'})()}</span><span>Laboral: {routineSummary(character.routine,{occupation:character.occupation,city:character.location}).work} · Sueño: {routineSummary(character.routine,{occupation:character.occupation,city:character.location}).sleep}</span><span>{(()=>{const a=lifeAutonomy.find(x=>String(x.characterKey)===('world:'+String(character.id)));return a?.nextActionGameAt?'Próxima iniciativa: '+fmt(a.nextActionGameAt):'Iniciativa: pendiente de inicializar'})()}</span></div>
              <button type="button" onClick={()=>patchCharacter({routine:buildDefaultRoutine({occupation:character.occupation,city:character.location})})}>✦ Regenerar rutina</button>
            </div>
            <div className="admin-card-head sub"><span>MEMORIA VIVA + INTENCIONES</span></div>
            <div className="admin-grid">
              <div className="admin-card">
                <div className="admin-card-head"><span>RECUERDOS ACTIVOS</span></div>
                <div className="admin-event-list">{lifeMemories.filter(x=>x.characterKey===('world:'+String(character.id))&&x.status==='active').slice(0,8).map(m=><div className="admin-event" key={'mem-'+m.id}><div><b>{m.type} · importancia {m.importance}</b><p>{m.summary}</p><small>{fmt(m.occurredGameAt)} · recordado {m.recallCount||0} veces</small></div></div>)}{!lifeMemories.some(x=>x.characterKey===('world:'+String(character.id))&&x.status==='active')&&<div className="admin-empty">Aún no hay recuerdos persistentes para este personaje.</div>}</div>
              </div>
              <div className="admin-card">
                <div className="admin-card-head"><span>ASUNTOS PENDIENTES</span></div>
                <div className="admin-event-list">{lifeIntentions.filter(x=>x.characterKey===('world:'+String(character.id))&&['pending','active'].includes(x.status)).slice(0,8).map(i=><div className="admin-event" key={'intent-'+i.id}><div><b>{i.type} · prioridad {i.priority}</b><p>{i.summary}</p><small>{i.status}{i.notBeforeGameAt?' · desde '+fmt(i.notBeforeGameAt):''}</small></div></div>)}{!lifeIntentions.some(x=>x.characterKey===('world:'+String(character.id))&&['pending','active'].includes(x.status))&&<div className="admin-empty">No hay intenciones pendientes.</div>}</div>
              </div>
            </div>
            {[['appearance','Apariencia real / referencia visual'],['personality','Personalidad'],['communication','Forma de comunicarse'],['objectives','Objetivos'],['boundaries','Límites'],['secrets','Secretos'],['notes','Notas privadas del Director']].map(([k,l])=><label className="admin-textarea" key={k}>{l}<textarea value={character[k]||''} onChange={e=>patchCharacter({[k]:e.target.value})}/></label>)}
            <div className="admin-card-head sub"><span>PARÁMETROS</span></div><div className="admin-traits">{TRAITS.map(t=><label key={t}><span>{t}</span><input type="range" min="0" max="100" value={character.traits?.[t]??50} onChange={e=>patchTrait(t,e.target.value)}/><b>{character.traits?.[t]??50}</b></label>)}</div>
          </>}</section>
        </div>}

        {tab==='events'&&<div className="admin-grid">
          <section className="admin-card admin-wide"><div className="admin-card-head"><span>NUEVO EVENTO</span></div><textarea className="admin-event-input" value={eventDraft} onChange={e=>setEventDraft(e.target.value)} placeholder="Ej.: Si pasan tres días sin hablar, Claudia toma la iniciativa."/><button className="admin-primary" disabled={!eventDraft.trim()||busy} onClick={()=>addEvent()}>Programar evento</button></section>
          <section className="admin-card admin-wide"><div className="admin-card-head"><span>COLA NARRATIVA</span></div><div className="admin-event-list">{events.map(ev=><div key={ev.id} className="admin-event"><div><b>{ev.description}</b><small>{fmt(ev.createdAt)} · {ev.trigger||'manual'}</small></div><select value={ev.status||'pendiente'} onChange={e=>localEdit(next=>{next.world.events=next.world.events.map(x=>x.id===ev.id?{...x,status:e.target.value}:x)})}><option value="pendiente">Pendiente</option><option value="activo">Activo</option><option value="cerrado">Cerrado</option></select></div>)}{!events.length&&<div className="admin-empty">No hay eventos programados.</div>}</div><button className="admin-primary secondary" disabled={busy} onClick={()=>persist(save,'Estados de eventos actualizados')}>Guardar estados</button></section>
        </div>}

        {tab==='mind'&&<div className="admin-ai-mind">
          <section className="admin-card admin-ai-mind-hero">
            <div className="admin-card-head"><span>IA CENTRAL · WORLD DIRECTOR</span><button disabled={aiMindBusy} onClick={reviewAiMind}>{aiMindBusy?'REVISANDO…':'REVISAR MUNDO AHORA'}</button></div>
            <div className="admin-ai-mind-status">
              <div><span>ESTADO</span><b>{aiMind?.state?'AUTÓNOMA / ACTIVA':'SIN CICLO TODAVÍA'}</b></div>
              <div><span>CICLOS</span><b>{aiMind?.state?.runCount||0}</b></div>
              <div><span>ÚLTIMA REVISIÓN</span><b>{fmt(aiMind?.state?.lastRunGameAt)}</b></div>
              <div><span>PRÓXIMA REVISIÓN</span><b>{fmt(aiMind?.state?.nextRunGameAt)}</b></div>
            </div>
            <div className="admin-ai-summary">
              <small>CRITERIO RESUMIDO ACTUAL</small>
              <p>{aiRun?.summary||aiMind?.state?.lastSummary||'La IA todavía no ha realizado una revisión autónoma de esta partida.'}</p>
            </div>
          </section>

          <section className="admin-ai-mind-grid">
            <div className="admin-card">
              <div className="admin-card-head"><span>QUÉ ESTÁ VIENDO</span></div>
              <dl className="admin-dl">
                <div><dt>Zona</dt><dd>{aiRun?.context?.player?.worldLocation?.display_label||worldLocation?.display_label||'—'}</dd></div>
                <div><dt>Lugar</dt><dd>{aiRun?.context?.player?.currentContext?.locationLabel||playerContext?.location_label||'—'}</dd></div>
                <div><dt>Actividad</dt><dd>{aiRun?.context?.player?.currentContext?.activityLabel||playerContext?.activity_label||'—'}</dd></div>
                <div><dt>Contactos</dt><dd>{aiRun?.context?.counts?.contacts??'—'}</dd></div>
                <div><dt>Personajes mundo</dt><dd>{aiRun?.context?.counts?.worldCharacters??chars.length}</dd></div>
                <div><dt>Eventos abiertos</dt><dd>{aiRun?.context?.counts?.openEvents??events.filter(x=>x.status!=='cerrado').length}</dd></div>
              </dl>
            </div>

            <div className="admin-card">
              <div className="admin-card-head"><span>LECTURA DE LA IA</span></div>
              <div className="admin-ai-observations">
                {(aiRun?.observations||aiMind?.state?.lastPlan?.observations||[]).map((x,i)=><div key={i}><i>{i+1}</i><p>{String(x)}</p></div>)}
                {!((aiRun?.observations||aiMind?.state?.lastPlan?.observations||[]).length)&&<div className="admin-empty">Sin observaciones registradas.</div>}
              </div>
            </div>

            <div className="admin-card">
              <div className="admin-card-head"><span>CRITERIOS / MOTIVOS</span></div>
              <div className="admin-ai-observations notes">
                {(aiRun?.directorNotes||aiMind?.state?.lastPlan?.directorNotes||[]).map((x,i)=><div key={i}><i>•</i><p>{String(x)}</p></div>)}
                {!((aiRun?.directorNotes||aiMind?.state?.lastPlan?.directorNotes||[]).length)&&<div className="admin-empty">Sin notas operativas en este ciclo.</div>}
              </div>
            </div>

            <div className="admin-card">
              <div className="admin-card-head"><span>RESULTADO DEL CICLO</span></div>
              <div className="admin-ai-action-kpis">
                <div><b>{aiPlan.newCharacters?.length||0}</b><span>Nuevos personajes</span></div>
                <div><b>{aiPlan.events?.length||0}</b><span>Eventos</span></div>
                <div><b>{aiPlan.messages?.length||0}</b><span>Mensajes</span></div>
                <div><b>{aiActionCount}</b><span>Acciones totales</span></div>
              </div>
            </div>
          </section>

          <section className="admin-card admin-ai-actions">
            <div className="admin-card-head"><span>ACCIONES DECIDIDAS / EJECUTADAS</span><small>{aiRun?fmt(aiRun.gameAt):'—'}</small></div>
            <div className="admin-ai-action-list">
              {(aiPlan.newCharacters||[]).map((x,i)=><article key={'nc'+i}><span className="kind">PERSONAJE</span><div><b>{x.name||'Nuevo personaje'}</b><p>{x.role||x.occupation||'Creación procedural por World Director'}</p></div></article>)}
              {(aiPlan.characterUpdates||[]).map((x,i)=><article key={'cu'+i}><span className="kind">CAMBIO</span><div><b>{x.name||x.id||'Personaje'}</b><p>{Object.keys(x.patch||{}).join(', ')||'Actualización de ficha'}</p></div></article>)}
              {(aiPlan.relationshipUpdates||[]).map((x,i)=><article key={'ru'+i}><span className="kind">RELACIÓN</span><div><b>{x.name||x.id||'Personaje'}</b><p>{Object.entries(x.deltas||{}).map(([k,v])=>k+' '+(Number(v)>=0?'+':'')+v).join(' · ')||'Sin cambios'}</p></div></article>)}
              {(aiPlan.events||[]).map((x,i)=><article key={'ev'+i}><span className="kind">EVENTO</span><div><b>{x.title||x.type||'Evento'}</b><p>{x.reason||x.body||''}{x.delayMinutes!=null?' · en '+x.delayMinutes+' min':''}</p></div></article>)}
              {(aiPlan.messages||[]).map((x,i)=><article key={'msg'+i}><span className="kind">MENSAJE</span><div><b>{x.contactName||'Contacto'}</b><p>{x.reason||x.text||''}{x.delayMinutes!=null?' · en '+x.delayMinutes+' min':''}</p></div></article>)}
              {!aiActionCount&&<div className="admin-empty">La IA decidió no ejecutar ninguna acción en este ciclo. El silencio también es una decisión del motor.</div>}
            </div>
          </section>

          <section className="admin-card admin-ai-history">
            <div className="admin-card-head"><span>HISTORIAL DE CICLOS</span><button onClick={()=>loadAiMind(player.id)} disabled={aiMindBusy}>Actualizar</button></div>
            <div className="admin-ai-run-list">
              {aiRuns.map(run=><button key={run.id} className={String(aiRun?.id)===String(run.id)?'active':''} onClick={()=>setAiMindSelectedRun(String(run.id))}><span><b>{fmt(run.gameAt)}</b><small>{run.queuedEvents} eventos · {run.queuedMessages} mensajes</small></span><p>{run.summary||'Sin resumen'}</p></button>)}
              {!aiRuns.length&&<div className="admin-empty">Todavía no hay ciclos autónomos guardados.</div>}
            </div>
          </section>

          <div className="admin-ai-disclaimer">Este panel muestra resúmenes auditables, observaciones y decisiones estructuradas del World Director. No expone razonamiento interno paso a paso del modelo.</div>
        </div>}

        {tab==='director'&&<section className="admin-card admin-director"><div className="admin-card-head"><span>DIRECTOR IA · @{player.username}</span><button onClick={testCentralAI} disabled={aiHealthBusy}>{aiHealthBusy?'Probando…':'Probar IA central'}</button></div>{aiHealth&&<div className={'admin-ai-health '+(aiHealth.ok?'ok':'bad')}><b>{aiHealth.ok?'IA CENTRAL CONECTADA':'IA CENTRAL CON PROBLEMAS'}</b><span>Proveedor: {aiHealth.provider?aiHealth.provider.toUpperCase():'—'} · Clave: {aiHealth.configured?'detectada':'no detectada'} · Red: {aiHealth.reachable?'OK':'fallo'} · Modelo: {aiHealth.model||'—'}{aiHealth.latencyMs!=null?' · '+aiHealth.latencyMs+' ms':''}</span>{aiHealth.message&&<p>{aiHealth.message}</p>}</div>}<div className="admin-chat">{chat.map((m,i)=><div key={i} className={'admin-message '+m.role}><b>{m.role==='ai'?'DIRECTOR AI':'ADMIN'}</b><p>{m.text}</p></div>)}</div><form className="admin-chat-form" onSubmit={sendDirector}><input value={chatDraft} onChange={e=>setChatDraft(e.target.value)} placeholder="Habla con el Director: resume la partida, crea o modifica personajes, ajusta variables, programa eventos o WhatsApps, analiza el teléfono..."/><button disabled={!chatDraft.trim()||busy}>Enviar</button></form></section>}
      </>}
    </section>
  </main>
}
