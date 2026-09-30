'use client';

import { useEffect, useMemo, useState } from 'react';
import LocationSetup from './LocationSetup';

const LOCATIONS=[
  ['home','Casa','⌂'],['gym','Gimnasio','G'],['work','Trabajo','W'],['study','Estudios','E'],
  ['street','Fuera','↗'],['cafe','Café','C'],['restaurant','Restaurante','R'],['bar','Bar','B'],
  ['club','Discoteca','D'],['event','Evento','★'],['beach','Playa','≈'],['park','Parque','P'],
  ['shopping','Compras','S'],['travel','Viaje','✈'],['other','Otro','+']
];
const ACTIVITIES={
  home:[['free','Disponible'],['rest','Descansando'],['cooking','Cocinando'],['watching','Viendo algo'],['music','Haciendo música'],['gaming','Jugando'],['sleep','Durmiendo'],['friends','Con amigos'],['date','Con alguien']],
  gym:[['training','Entrenando'],['class','En una clase'],['sauna','Sauna / descanso'],['friends','Con amigos']],
  work:[['working','Trabajando'],['meeting','En una reunión'],['break','En un descanso'],['eating','Comiendo']],
  study:[['studying','Estudiando'],['class','En una clase'],['break','En un descanso'],['eating','Comiendo']],
  street:[['walking','Paseando'],['shopping','Comprando'],['friends','Con amigos'],['travelling','Desplazándome']],
  cafe:[['drinking','Tomando algo'],['working','Trabajando'],['studying','Estudiando'],['friends','Con amigos'],['date','En una cita']],
  restaurant:[['eating','Comiendo'],['friends','Con amigos'],['date','En una cita']],
  bar:[['drinking','Tomando algo'],['friends','Con amigos'],['date','En una cita'],['partying','De fiesta']],
  club:[['partying','De fiesta'],['friends','Con amigos'],['date','En una cita']],
  event:[['attending','En un evento'],['friends','Con amigos'],['working','Trabajando'],['date','En una cita']],
  beach:[['rest','Descansando'],['walking','Paseando'],['sport','Practicando deporte'],['friends','Con amigos']],
  park:[['walking','Paseando'],['sport','Practicando deporte'],['rest','Descansando'],['friends','Con amigos']],
  shopping:[['shopping','Comprando'],['walking','Paseando'],['friends','Con amigos']],
  travel:[['travelling','Desplazándome'],['waiting','Esperando'],['rest','Descansando']],
  other:[['custom','Otra actividad'],['free','Disponible'],['friends','Con amigos']]
};
const DURATIONS=[[0,'Sin hora'],[30,'30 min'],[60,'1 h'],[120,'2 h'],[240,'4 h']];
const OPEN_INTENT_KEY='private-life-open-intent-v1';

function timezone(){try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}catch{return'UTC'}}

export default function NowApp({onClose,onOpenApp}){
  const [context,setContext]=useState(null);
  const [worldLocation,setWorldLocation]=useState(null);
  const [editingWorldLocation,setEditingWorldLocation]=useState(false);
  const [locationKey,setLocationKey]=useState('home');
  const [locationLabel,setLocationLabel]=useState('');
  const [activityKey,setActivityKey]=useState('free');
  const [activityLabel,setActivityLabel]=useState('');
  const [durationMinutes,setDurationMinutes]=useState(0);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [lifeEvent,setLifeEvent]=useState(null);
  const [eventBusy,setEventBusy]=useState(false);
  const [eventResult,setEventResult]=useState('');
  const activities=useMemo(()=>ACTIVITIES[locationKey]||ACTIVITIES.other,[locationKey]);

  function readLifeIntent(input=null){
    let intent=input;
    try{if(!intent)intent=JSON.parse(localStorage.getItem(OPEN_INTENT_KEY)||'null')}catch{intent=null}
    if(!intent||String(intent.app||'').toLowerCase()!=='ahora'||!intent.eventId)return;
    setLifeEvent({
      eventId:String(intent.eventId),
      eventType:String(intent.eventType||'life_event'),
      title:String(intent.title||'Algo está pasando'),
      body:String(intent.body||''),
      payload:intent.payload&&typeof intent.payload==='object'?intent.payload:{}
    });
    setEventResult('');
  }

  useEffect(()=>{
    readLifeIntent();
    const handler=e=>{
      const detail=e?.detail||{};
      const data=detail?.data&&typeof detail.data==='object'?detail.data:{};
      const payload=data?.payload&&typeof data.payload==='object'?data.payload:{};
      if(String(detail?.app||'').toLowerCase().includes('private life')&&data.eventId){
        readLifeIntent({
          app:'ahora',
          eventId:data.eventId,
          eventType:data.eventType||'life_event',
          title:detail.title,
          body:detail.body,
          payload
        });
      }
    };
    window.addEventListener('private-life:notification-open',handler);
    return()=>window.removeEventListener('private-life:notification-open',handler);
  },[]);

  async function decideLifeEvent(decision){
    if(!lifeEvent||eventBusy)return;
    try{
      setEventBusy(true);setError('');
      const r=await fetch('/api/life/event-action',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({eventId:lifeEvent.eventId,decision})
      });
      const data=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(data.error||'No se pudo registrar la decisión.');
      setEventResult(decision==='engage'?'Has decidido intervenir. El mundo continuará desde esta decisión.':'Lo has dejado pasar. El mundo también recordará esa decisión.');
      try{localStorage.removeItem(OPEN_INTENT_KEY)}catch{}
      window.dispatchEvent(new CustomEvent('private-life:narrative-event',{detail:{
        id:'life-decision-'+lifeEvent.eventId,
        createdAt:new Date().toISOString(),
        source:'player',
        type:'life_event_decision',
        title:lifeEvent.title,
        text:decision==='engage'?'El jugador decidió intervenir.':'El jugador decidió dejarlo pasar.',
        payload:{eventId:lifeEvent.eventId,eventType:lifeEvent.eventType,decision,...lifeEvent.payload}
      }}));
      if(decision==='engage'&&lifeEvent.payload?.contactId){
        try{
          localStorage.setItem(OPEN_INTENT_KEY,JSON.stringify({
            app:'whatsapp',
            contactId:String(lifeEvent.payload.contactId),
            contactName:String(lifeEvent.payload.contactName||lifeEvent.title||''),
            createdAt:new Date().toISOString()
          }));
        }catch{}
        setTimeout(()=>onOpenApp?.('WhatsApp'),420);
      }
    }catch(e){setError(e.message||'No se pudo registrar la decisión.')}
    finally{setEventBusy(false)}
  }

  function eventLabels(){
    const type=String(lifeEvent?.eventType||'');
    if(type==='encounter')return ['Acercarme','Dejarlo pasar'];
    if(type==='social_window')return ['Seguir la conversación','Ahora no'];
    if(type==='ambient')return ['Seguir','Ignorar'];
    return ['Interactuar','Dejar pasar'];
  }

  async function load(){
    try{
      setError('');
      const [r,lr]=await Promise.all([
        fetch('/api/life/context?timezone='+encodeURIComponent(timezone()),{cache:'no-store'}),
        fetch('/api/life/location',{cache:'no-store'})
      ]);
      const data=await r.json();
      const locationData=await lr.json().catch(()=>({}));
      if(!r.ok)throw new Error(data.error||'No se pudo cargar.');
      const c=data.context||{};
      setWorldLocation(locationData.location||null);
      setContext(c);setLocationKey(c.locationKey||'home');setLocationLabel(c.locationLabel||'');
      setActivityKey(c.activityKey||'free');setActivityLabel(c.activityLabel||'');
    }catch(e){setError(e.message||'No se pudo cargar.')}finally{setLoading(false)}
  }
  useEffect(()=>{load()},[]);

  function chooseLocation(key){
    setLocationKey(key);
    const first=(ACTIVITIES[key]||ACTIVITIES.other)[0];
    setActivityKey(first[0]);
    setActivityLabel(first[1]);
    const preset=LOCATIONS.find(x=>x[0]===key);
    setLocationLabel(preset?.[1]||'');
  }
  function chooseActivity(key,label){setActivityKey(key);setActivityLabel(label)}
  async function save(){
    try{
      setSaving(true);setError('');
      const r=await fetch('/api/life/context',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({timezone:timezone(),locationKey,locationLabel,activityKey,activityLabel,durationMinutes})});
      const data=await r.json();
      if(!r.ok)throw new Error(data.error||'No se pudo actualizar.');
      setContext(data.context);
      window.dispatchEvent(new CustomEvent('private-life:context-changed',{detail:data.context}));
      try{navigator.vibrate?.(20)}catch{}
    }catch(e){setError(e.message||'No se pudo actualizar.')}finally{setSaving(false)}
  }

  if(editingWorldLocation)return <LocationSetup initialCity={worldLocation?.displayLabel||''} onCancel={()=>setEditingWorldLocation(false)} onComplete={loc=>{setWorldLocation(loc);setEditingWorldLocation(false)}}/>;

  return <div className="now-app">
    <header className="now-head"><button onClick={onClose} aria-label="Volver">‹</button><div><b>Ahora</b><span>Tu contexto cambia el mundo</span></div><i/></header>
    <main className="now-scroll">
      {lifeEvent&&<section className="now-life-event">
        <span>AHORA MISMO</span>
        <h2>{lifeEvent.title}</h2>
        {lifeEvent.body&&<p>{lifeEvent.body}</p>}
        {!eventResult?<div className="now-life-actions">
          <button className="primary" disabled={eventBusy} onClick={()=>decideLifeEvent('engage')}>{eventLabels()[0]}</button>
          <button disabled={eventBusy} onClick={()=>decideLifeEvent('dismiss')}>{eventLabels()[1]}</button>
        </div>:<div className="now-life-result">{eventResult}</div>}
      </section>}
      <section className="now-current">
        <span>ESTADO ACTUAL</span>
        <b>{context?.locationLabel||'Casa'}</b>
        <strong>{context?.activityLabel||'Disponible'}</strong>
        <small>{context?.availability==='busy'?'Ocupado':context?.availability==='offline'?'No disponible':context?.availability==='limited'?'Disponibilidad limitada':'Disponible'}</small>
        {worldLocation?.displayLabel&&<em>{worldLocation.displayLabel}</em>}
      </section>
      {loading?<div className="now-loading">Sincronizando tu vida…</div>:<>
        <section className="now-section now-world-location"><h3>Zona geográfica</h3><button onClick={()=>setEditingWorldLocation(true)}><div><b>{worldLocation?.displayLabel||'Sin configurar'}</b><span>{worldLocation?.region||worldLocation?.country||'Sitúa aquí el mundo de tu partida'}</span></div><i>›</i></button></section>
        <section className="now-section"><h3>¿Dónde estás?</h3><div className="now-location-grid">{LOCATIONS.map(([key,label,glyph])=><button key={key} className={locationKey===key?'selected':''} onClick={()=>chooseLocation(key)}><i>{glyph}</i><span>{label}</span></button>)}</div>{locationKey==='other'&&<input className="now-input" value={locationLabel} onChange={e=>setLocationLabel(e.target.value)} placeholder="Escribe el lugar"/>}</section>
        <section className="now-section"><h3>¿Qué estás haciendo?</h3><div className="now-activity-list">{activities.map(([key,label])=><button key={key} className={activityKey===key?'selected':''} onClick={()=>chooseActivity(key,label)}><span>{label}</span><i>{activityKey===key?'✓':''}</i></button>)}</div>{activityKey==='custom'&&<input className="now-input" value={activityLabel} onChange={e=>setActivityLabel(e.target.value)} placeholder="Describe tu actividad"/>}</section>
        <section className="now-section"><h3>¿Durante cuánto tiempo?</h3><div className="now-duration">{DURATIONS.map(([minutes,label])=><button key={minutes} className={durationMinutes===minutes?'selected':''} onClick={()=>setDurationMinutes(minutes)}>{label}</button>)}</div></section>
        <div className="now-note">PRIVATE LIFE usa este contexto para decidir qué encuentros, mensajes, llamadas y situaciones son plausibles. Los personajes no conocen automáticamente dónde estás.</div>
        {error&&<div className="now-error">{error}</div>}
        <button className="now-save" disabled={saving} onClick={save}>{saving?'ACTUALIZANDO…':'ACTUALIZAR MI ESTADO'}</button>
      </>}
    </main>
    <button className="home-gesture-button" aria-label="Volver al inicio" onClick={onClose}><span/></button>
  </div>
}
