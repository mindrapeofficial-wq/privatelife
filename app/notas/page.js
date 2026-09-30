'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import './notas.css';

const CONTACTS='private-life-contacts';
const EVENTS='private-life-narrative-events-v1';
const WHATSAPP='private-life-whatsapp-v1';
function read(key,fallback){try{const x=JSON.parse(localStorage.getItem(key)||'null');return x??fallback}catch{return fallback}}
function getName(save){return save?.identity?.name||save?.character?.name||save?.profile?.name||save?.name||''}
function snapshot(){
 const contacts=read(CONTACTS,[]), chats=read(WHATSAPP,{}), events=read(EVENTS,[]);
 const safeContacts=(Array.isArray(contacts)?contacts:[]).filter(c=>c?.name&&Number(c?.age)>=18).slice(0,12).map(c=>({
   id:c.id,name:c.name,age:c.age,city:c.city,relationshipType:c.relationshipType,relation:c.relation,affection:c.affection,
   profile:c.profile,notes:c.notes,engineContext:c.engineContext,masterSheet:c.masterSheet,conversation:String(c.conversation||'').slice(0,12000),
   photoCount:Array.isArray(c.photos)?c.photos.length:0
 }));
 const whatsapp=safeContacts.map(c=>({contactName:c.name,messages:Array.isArray(chats?.[c.id]?.messages)?chats[c.id].messages.slice(-18).map(m=>({side:m.side,type:m.type,text:String(m.text||'').slice(0,700),createdAt:m.createdAt})):[]})).filter(x=>x.messages.length);
 return {contacts:safeContacts,narrativeEvents:(Array.isArray(events)?events:[]).slice(0,100),whatsapp};
}
function applyEffects(payload){
 const effects=Array.isArray(payload?.effects)?payload.effects:[];
 const contacts=read(CONTACTS,[]), chats=read(WHATSAPP,{});
 for(const e of effects){
   if(e?.type==='whatsapp_message'&&e.contactName&&e.text){
     const c=(Array.isArray(contacts)?contacts:[]).find(x=>String(x.name||'').toLowerCase()===String(e.contactName).toLowerCase());
     if(c){const chat=chats[c.id]||{messages:[],unread:0};chat.messages=[...(chat.messages||[]),{id:crypto.randomUUID?.()||String(Date.now()),side:'in',type:'text',text:String(e.text).slice(0,1000),createdAt:new Date().toISOString(),central:true}].slice(-350);chat.unread=(chat.unread||0)+1;chats[c.id]=chat}
   }
 }
 try{localStorage.setItem(WHATSAPP,JSON.stringify(chats))}catch{}
 for(const n of Array.isArray(payload?.notifications)?payload.notifications:[]){window.privateLifeNotify?.({app:n.app||'PRIVATE LIFE',title:n.title||n.app||'PRIVATE LIFE',body:n.body||'',priority:n.priority||'normal'})}
}

export default function Notes(){
 const [save,setSave]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[mode,setMode]=useState('notes'),[busy,setBusy]=useState(false);
 const started=useRef(false);
 useEffect(()=>{(async()=>{try{const r=await fetch('/api/save',{cache:'no-store'});if(!r.ok)throw new Error('No se pudo cargar la partida.');const x=await r.json();setSave(x.save);if(x.save?.gameplay?.narratorMode)setMode('narrator')}catch(e){setError(e.message)}finally{setLoading(false)}})()},[]);
 const narrator=save?.narrator||{chapter:1,turn:0,history:[],hidden:{},currentScene:null};
 const scene=narrator.currentScene||null;
 const contacts=useMemo(()=>snapshot().contacts,[mode,save?.social?.contactsUpdatedAt]);
 async function write(next){setBusy(true);try{const r=await fetch('/api/save',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({save:next})});const x=await r.json().catch(()=>({}));if(!r.ok)throw new Error(x.error||'No se pudo guardar el modo Narrador.');setSave(next);return next}catch(e){setError(e.message);return null}finally{setBusy(false)}}
 async function generate(action='start',choice=''){
   if(busy)return;setBusy(true);setError('');
   try{
     const r=await fetch('/api/narrator',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,choice,clientContext:snapshot()})});
     const x=await r.json().catch(()=>({}));if(!r.ok)throw new Error(x.error||'No se pudo generar la historia.');
     applyEffects(x);setSave(x.save);return x;
   }catch(e){setError(e.message);return null}finally{setBusy(false)}
 }
 useEffect(()=>{if(mode!=='narrator'||!save||scene||started.current)return;started.current=true;generate('start')},[mode,save,scene]);
 async function activate(){if(!save)return;const next={...save,gameplay:{...(save.gameplay||{}),narratorMode:true,narratorActivatedAt:save.gameplay?.narratorActivatedAt||new Date().toISOString()},narrator:save.narrator||{chapter:1,turn:0,history:[],hidden:{},currentScene:null}};const ok=await write(next);if(ok){setMode('narrator');started.current=true;await generate('start')}}
 async function deactivate(){if(!save)return;const next={...save,gameplay:{...(save.gameplay||{}),narratorMode:false}};await write(next);setMode('notes');started.current=false}
 async function choose(label){if(busy||!scene)return;await generate('continue',label)}
 if(loading)return <main className="notesLoading">Abriendo Notas…</main>;
 if(error&&!save)return <main className="notesLoading"><div>{error}</div><button onClick={()=>location.href='/'}>VOLVER</button></main>;
 if(mode==='narrator')return <main className="narrator"><header className="narratorTop"><button className="pl-unified-back" aria-label="Volver" onClick={()=>location.href='/'}>‹</button><div><small>MODO NARRADOR</small><b>Capítulo {narrator.chapter}</b></div><button className="exit" onClick={deactivate}>SALIR</button></header><div className="narratorBody"><div className="chapterMark">PRIVATE LIFE · CAPÍTULO {narrator.chapter}</div>{!scene?<article className="story"><span>IA CENTRAL</span><h1>{busy?'Construyendo tu historia…':'El mundo está esperando'}</h1><p>{busy?'Reuniendo tu personaje, perfil, contactos, fichas maestras, conversaciones, actividad reciente y estado del mundo para decidir qué ocurre a continuación.':'Pulsa continuar para volver a sincronizar la historia con tu partida.'}</p>{!busy&&<button onClick={()=>generate('start')}>CONTINUAR</button>}</article>:<><article className="story"><span>PARTE {(narrator.turn%5)+1}</span><h1>{scene.title}</h1><p>{scene.text}</p></article><div className="choices">{(scene.choices||[]).map((choice,i)=><button key={`${choice.label}-${i}`} disabled={busy} onClick={()=>choose(choice.label)}><i>{String.fromCharCode(65+i)}</i><span>{choice.label}</span></button>)}</div></>}
 <p className="hiddenHint">La narración comparte el mismo mundo que tus contactos y aplicaciones. Tus decisiones alimentan variables y acontecimientos persistentes, y la actividad del teléfono vuelve a entrar en la siguiente escena.</p>{error&&<div className="notesError">{error}</div>}{narrator.history?.length>0&&<details className="history"><summary>Decisiones anteriores</summary>{narrator.history.slice(-8).reverse().map((h,i)=><div key={`${h.at}-${i}`}><small>Cap. {h.chapter}</small><span>{h.choice}</span></div>)}</details>}</div></main>;
 return <main className="notesApp"><header className="notesTop"><button className="pl-unified-back" aria-label="Volver" onClick={()=>location.href='/'}>‹</button><b>Notas</b><span>•••</span></header><div className="notesTitle"><h1>Notas</h1><button>＋</button></div><section className="noteCard narratorNote"><div className="noteIcon">N</div><div><small>PRIVATE LIFE</small><h2>Modo Narrador</h2><p>Convierte la misma partida en una novela interactiva conectada con tu personaje, contactos, conversaciones y acontecimientos del teléfono.</p></div></section><section className="modePanel"><div className="modeHead"><div><small>MODO DE JUEGO</small><h2>Narración conectada al mundo</h2></div><span className="off">DESACTIVADO</span></div><p>Al activarlo, el motor central reúne el contexto acumulado y genera una historia persistente. Las decisiones no viven en una burbuja: modifican el mismo mundo que usan Contactos, WhatsApp, eventos y el Director.</p><ul><li>Perfil profundo del jugador y variables ocultas</li><li>{contacts.length} contactos disponibles para continuidad narrativa</li><li>Fichas maestras y conversaciones como contexto</li><li>Actividad reciente de apps y decisiones anteriores</li></ul><button disabled={busy||!save} onClick={activate}>{busy?'PREPARANDO…':'ACTIVAR MODO NARRADOR'}</button></section>{error&&<div className="notesError">{error}</div>}</main>;
}
