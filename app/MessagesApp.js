'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './MessagesApp.module.css';

const STORAGE='private-life-messages-v1';
const NOTIFICATIONS='private-life-notifications-v1';

const MANUAL_MESSAGES=[
  {id:'manual-welcome',title:'Bienvenido a PRIVATE LIFE',text:'PRIVATE LIFE es una vida paralela que avanza contigo. Tu ubicación, tu actividad, tus relaciones y lo que ocurre en tu teléfono pueden cambiar qué sucede después.'},
  {id:'manual-time',title:'El mundo sigue avanzando',text:'La partida funciona con un reloj vivo. No todo ocurre al pulsar un botón: pueden aparecer mensajes, llamadas, encuentros y acontecimientos según la hora, el contexto y lo que hayas hecho antes.'},
  {id:'manual-now',title:'Usa “Ahora”',text:'En la app Ahora puedes indicar dónde estás y qué estás haciendo. Estar en casa, trabajando, entrenando, saliendo o asistiendo a un evento cambia las posibilidades narrativas del momento.'},
  {id:'manual-phone',title:'Tu teléfono forma parte del juego',text:'WhatsApp, Contactos, Fotos, Instagram, Facebook y otras apps no son menús decorativos. Cada una puede aportar información, relaciones, recuerdos y nuevas situaciones a tu historia.'},
  {id:'manual-people',title:'Las personas evolucionan',text:'Los personajes recuerdan contexto, tienen rasgos propios y cambian con lo que viven contigo y con otras personas. Dos conversaciones parecidas no tienen por qué producir la misma reacción.'},
  {id:'manual-notifications',title:'Mira las notificaciones',text:'Los acontecimientos importantes pueden llegar como en un teléfono real: banners, globos en los iconos y avisos en la pantalla. Abrir una notificación te lleva a la app relacionada.'},
  {id:'manual-messages',title:'Mensajes oficiales',text:'Esta app también recibe comunicaciones oficiales de PRIVATE LIFE, avisos de administración, cambios de servicio, novedades y notas de actualización.'},
  {id:'manual-tip',title:'Consejo',text:'No intentes “ganar” cada escena. Haz cosas, cambia de planes, responde como te apetezca y deja que el mundo reaccione. La gracia está en que la historia no venga completamente escrita.'}
];

function freshStore(){return {admin:[],updates:[]}}
function readStore(){
  try{
    const parsed=JSON.parse(localStorage.getItem(STORAGE)||'{}');
    return {admin:Array.isArray(parsed?.admin)?parsed.admin.slice(-160):[],updates:Array.isArray(parsed?.updates)?parsed.updates.slice(-160):[]};
  }catch{return freshStore()}
}
function saveStore(store){
  try{localStorage.setItem(STORAGE,JSON.stringify({admin:store.admin.slice(-160),updates:store.updates.slice(-160)}))}catch{}
}
function normalize(value=''){return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase()}
function threadFor(input={}){
  const payload=input?.data?.payload||input?.payload||{};
  const haystack=normalize([input?.title,input?.body,input?.text,input?.data?.eventType,payload?.source,payload?.thread].filter(Boolean).join(' '));
  if(haystack.includes('actualiza')||haystack.includes('version')||haystack.includes('novedad')||haystack.includes('mantenimiento')||haystack.includes('patch'))return 'updates';
  return 'admin';
}
function messageFromNotification(input={}){
  const app=normalize(input?.app);
  if(!(app.includes('mensaje')||app==='messages'))return null;
  return {
    id:String(input?.id||('msg-'+Date.now()+'-'+Math.random().toString(36).slice(2))),
    title:String(input?.title||'PRIVATE LIFE').slice(0,160),
    text:String(input?.body||input?.message||'').slice(0,4000),
    createdAt:input?.createdAt||new Date().toISOString(),
    read:false,
    source:String(input?.data?.payload?.source||input?.data?.source||'system'),
    thread:threadFor(input)
  };
}
function mergeMessage(store,message){
  if(!message)return store;
  const key=message.thread==='updates'?'updates':'admin';
  const current=store[key]||[];
  if(current.some(item=>item.id===message.id))return store;
  return {...store,[key]:[...current,message].slice(-160)};
}
function relative(iso){
  if(!iso)return '';
  const time=new Date(iso).getTime();
  if(!Number.isFinite(time))return '';
  const diff=Math.max(0,Date.now()-time);
  if(diff<60000)return 'ahora';
  const minutes=Math.floor(diff/60000);
  if(minutes<60)return minutes+' min';
  const hours=Math.floor(minutes/60);
  if(hours<24)return hours+' h';
  const days=Math.floor(hours/24);
  if(days<7)return days+' d';
  return new Date(iso).toLocaleDateString('es-ES',{day:'numeric',month:'short'});
}
function clock(iso){if(!iso)return '';try{return new Date(iso).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}catch{return ''}}

export default function MessagesApp({onClose}){
  const [store,setStore]=useState(freshStore);
  const [ready,setReady]=useState(false);
  const [thread,setThread]=useState(null);
  const [query,setQuery]=useState('');
  const bottomRef=useRef(null);

  useEffect(()=>{
    let next=readStore();
    try{
      const notifications=JSON.parse(localStorage.getItem(NOTIFICATIONS)||'[]');
      if(Array.isArray(notifications)){
        for(const item of notifications){
          const msg=messageFromNotification(item);
          if(msg)next=mergeMessage(next,msg);
        }
      }
    }catch{}
    setStore(next);saveStore(next);setReady(true);
  },[]);

  useEffect(()=>{if(ready)saveStore(store)},[store,ready]);

  useEffect(()=>{
    const receive=e=>{const msg=messageFromNotification(e?.detail||{});if(msg)setStore(current=>mergeMessage(current,msg))};
    const storageSync=()=>setStore(readStore());
    window.addEventListener('private-life:notification-received',receive);
    window.addEventListener('private-life:messages-store',storageSync);
    return()=>{window.removeEventListener('private-life:notification-received',receive);window.removeEventListener('private-life:messages-store',storageSync)};
  },[]);

  useEffect(()=>{if(thread)requestAnimationFrame(()=>bottomRef.current?.scrollIntoView({block:'end'}))},[thread,store]);

  function openThread(id){
    setThread(id);
    if(id==='manual')return;
    const ids=(store[id]||[]).map(item=>item.id);
    setStore(current=>({...current,[id]:(current[id]||[]).map(item=>({...item,read:true}))}));
    window.dispatchEvent(new CustomEvent('private-life:messages-read',{detail:{ids}}));
  }

  const latestAdmin=store.admin.at(-1);
  const latestUpdate=store.updates.at(-1);
  const threads=useMemo(()=>[
    {id:'manual',name:'Manual de PRIVATE LIFE',preview:'Cómo funciona tu vida, el teléfono, los personajes y los eventos.',time:'',unread:0,avatar:'PL',kind:'manual'},
    {id:'admin',name:'Administración',preview:latestAdmin?.text||'Avisos y comunicaciones oficiales.',time:latestAdmin?.createdAt||'',unread:store.admin.filter(item=>!item.read).length,avatar:'AD',kind:'admin'},
    {id:'updates',name:'Actualizaciones',preview:latestUpdate?.text||'Novedades, cambios y mantenimiento de PRIVATE LIFE.',time:latestUpdate?.createdAt||'',unread:store.updates.filter(item=>!item.read).length,avatar:'PL',kind:'updates'}
  ],[store,latestAdmin,latestUpdate]);

  const filtered=threads.filter(item=>{const needle=normalize(query);return !needle||normalize(item.name+' '+item.preview).includes(needle)});

  if(thread){
    const meta=threads.find(item=>item.id===thread)||threads[0];
    const manual=thread==='manual';
    const messages=manual?MANUAL_MESSAGES:(store[thread]||[]);
    return <div className={styles.shell}>
      <header className={styles.chatHeader}>
        <button className={styles.back} onClick={()=>setThread(null)} aria-label="Volver a mensajes"><span>‹</span><em>Mensajes</em></button>
        <div className={styles.headerIdentity}>
          <div className={styles.avatar+' '+(styles['avatar_'+meta.kind]||'')}>{meta.avatar}</div>
          <b>{meta.name}</b>
        </div>
        <span className={styles.headerSpacer}/>
      </header>
      <main className={styles.chat}>
        <div className={styles.threadIntro}>
          <div className={styles.bigAvatar+' '+(styles['avatar_'+meta.kind]||'')}>{meta.avatar}</div>
          <strong>{meta.name}</strong><span>{manual?'Guía oficial de PRIVATE LIFE':'Canal oficial de PRIVATE LIFE'}</span>
        </div>
        {manual ? messages.map(item=><section className={styles.manualBlock} key={item.id}>
          <div className={styles.manualLabel}>{item.title}</div><div className={styles.incomingBubble}>{item.text}</div>
        </section>) : messages.length ? messages.map((item,index)=><div className={styles.messageGroup} key={item.id}>
          {(index===0||new Date(item.createdAt).toDateString()!==new Date(messages[index-1]?.createdAt).toDateString())&&<div className={styles.dayLabel}>{new Date(item.createdAt).toLocaleDateString('es-ES',{weekday:'short',day:'numeric',month:'short'})}</div>}
          <div className={styles.incomingBubble}>{item.title&&item.title!==meta.name?<b className={styles.bubbleTitle}>{item.title}</b>:null}{item.text||'Nuevo aviso.'}</div>
          <span className={styles.bubbleTime}>{clock(item.createdAt)}</span>
        </div>) : <div className={styles.emptyThread}>
          <div className={styles.bigAvatar+' '+(styles['avatar_'+meta.kind]||'')}>{meta.avatar}</div>
          <b>Aún no hay mensajes</b>
          <p>{thread==='updates'?'Las notas de versión, cambios importantes y mantenimientos aparecerán aquí.':'Los avisos directos de administración aparecerán aquí.'}</p>
        </div>}
        <div ref={bottomRef}/>
      </main>
      <footer className={styles.readOnlyBar}><span>Canal informativo</span><div className={styles.fakeComposer}>Mensaje de solo lectura</div></footer>
    </div>;
  }

  return <div className={styles.shell}>
    <header className={styles.listHeader}>
      <div className={styles.listTop}><button className={styles.homeBack} onClick={onClose} aria-label="Volver al inicio">‹</button><button className={styles.editButton} type="button">Editar</button></div>
      <h1>Mensajes</h1>
      <label className={styles.search}><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar" aria-label="Buscar mensajes"/></label>
    </header>
    <main className={styles.threadList}>
      {filtered.map(item=><button className={styles.threadRow} key={item.id} onClick={()=>openThread(item.id)}>
        <div className={styles.avatar+' '+(styles['avatar_'+item.kind]||'')}>{item.avatar}</div>
        <div className={styles.threadCopy}><div className={styles.threadTitle}><strong>{item.name}</strong><span>{relative(item.time)} ›</span></div><p>{item.preview}</p></div>
        {item.unread>0?<span className={styles.unreadDot}>{item.unread>99?'99+':item.unread}</span>:null}
      </button>)}
      {!filtered.length?<div className={styles.noResults}>No se encontraron conversaciones.</div>:null}
    </main>
    <div className={styles.homeIndicator}/>
  </div>;
}
