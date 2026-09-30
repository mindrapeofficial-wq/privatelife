'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const CONTACTS_KEY='private-life-contacts';
const STORY_KEY='private-life-narrative-events-v1';
const OPEN_INTENT_KEY='private-life-open-intent-v1';

function uid(){return crypto.randomUUID?.()||Math.random().toString(36).slice(2)+Date.now().toString(36)}
function readJson(key,fallback){try{const v=JSON.parse(localStorage.getItem(key)||'null');return v??fallback}catch{return fallback}}
function writeJson(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
function clock(ts){try{return new Intl.DateTimeFormat('es',{hour:'2-digit',minute:'2-digit'}).format(new Date(ts))}catch{return''}}
function todayLabel(ts){const d=new Date(ts||Date.now()),n=new Date(),a=new Date(n.getFullYear(),n.getMonth(),n.getDate()),b=new Date(d.getFullYear(),d.getMonth(),d.getDate()),diff=Math.floor((a-b)/86400000);if(diff===0)return'Hoy';if(diff===1)return'Ayer';return new Intl.DateTimeFormat('es',{day:'numeric',month:'short'}).format(d)}
function contactsFromStorage(){const list=readJson(CONTACTS_KEY,[]);return Array.isArray(list)?list.filter(c=>c?.id&&c?.name&&Number(c?.age)>=18):[]}
function Avatar({contact,size='md'}){const photo=contact?.photos?.[0];return photo?<img className={'wa-avatar '+size} src={photo} alt=""/>:<span className={'wa-avatar wa-avatar-fallback '+size}>{String(contact?.name||'?').trim().charAt(0).toUpperCase()}</span>}
function canonicalName(value=''){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ')}
function groupMessages(contacts,messages,previous={}){
 const out={};
 const byName=new Map();
 contacts.forEach(c=>{
   out[c.id]={messages:[],unread:0};
   const key=canonicalName(c.name);
   if(key&&!byName.has(key))byName.set(key,c.id);
 });
 messages.forEach(m=>{
   const matchedId=out[m.contactId]?m.contactId:(byName.get(canonicalName(m.contactName))||m.contactId);
   if(!out[matchedId])out[matchedId]={messages:[],unread:0};
   const normalized=matchedId===m.contactId?m:{...m,contactId:matchedId};
   out[matchedId].messages.push(normalized);
   if(normalized.side==='in'&&!normalized.readAt)out[matchedId].unread+=1;
 });
 return out;
}
function contactPayload(c){return {id:c.id,name:c.name,age:c.age,city:c.city,relationshipType:c.relationshipType,relation:c.relation,affection:c.affection,profile:c.profile,engineContext:c.engineContext,masterSheet:c.masterSheet,npcId:c.npcId||null,npcConfigSnapshot:c.npcConfigSnapshot||null}}
async function api(url,options={}){
 const response=await fetch(url,{...options,headers:{'content-type':'application/json',...(options.headers||{})}});
 let data={};try{data=await response.json()}catch{}
 if(!response.ok)throw new Error(data.error||'Error de conexión');
 return data;
}
async function imageData(file){
 return await new Promise((resolve,reject)=>{
   const reader=new FileReader();reader.onerror=reject;
   reader.onload=()=>{const img=new Image();img.onerror=reject;img.onload=()=>{
     const max=700,s=Math.min(1,max/Math.max(img.width,img.height)),canvas=document.createElement('canvas');
     canvas.width=Math.max(1,Math.round(img.width*s));canvas.height=Math.max(1,Math.round(img.height*s));
     canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
     resolve(canvas.toDataURL('image/jpeg',.66));
   };img.src=reader.result};reader.readAsDataURL(file);
 });
}

export default function WhatsAppApp({onClose}){
 const [contacts,setContacts]=useState([]);
 const [chats,setChats]=useState({});
 const [activeId,setActiveId]=useState(null);
 const [draft,setDraft]=useState('');
 const [search,setSearch]=useState('');
 const [typing,setTyping]=useState(false);
 const [ready,setReady]=useState(false);
 const [online,setOnline]=useState(true);
 const [lifeStates,setLifeStates]=useState({});
 const endRef=useRef(null),fileRef=useRef(null),mounted=useRef(true);

 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);

 async function refreshMessages(nextContacts){
   try{
     const data=await api('/api/whatsapp',{cache:'no-store'});
     if(!mounted.current)return [];
     const messages=data.messages||[];
     setChats(prev=>groupMessages(nextContacts||contacts,messages,prev));
     setOnline(true);
     return messages;
   }catch{
     if(mounted.current)setOnline(false);
     return [];
   }
 }

 async function pollDirector(nextContacts){
   const list=nextContacts||contacts;
   if(!list.length)return;
   try{
     const data=await api('/api/whatsapp',{method:'POST',body:JSON.stringify({action:'poll',contacts:list.map(contactPayload)})});
     if(data.delivered?.length)await refreshMessages(list);
   }catch{}
 }

 async function refreshLifeStates(){
   try{
     const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
     const data=await api('/api/life/npcs/status?timezone='+encodeURIComponent(timezone),{cache:'no-store'});
     if(!mounted.current)return;
     const map={};
     for(const state of data.characters||[]){
       if(state.contactKey)map[String(state.contactKey)]=state;
       if(state.name)map['name:'+String(state.name).trim().toLowerCase()]=state;
     }
     setLifeStates(map);
   }catch{}
 }

 async function openNotificationIntent(raw,nextContacts){
   const intent=raw&&typeof raw==='object'?raw:{};
   const data=intent?.data&&typeof intent.data==='object'?intent.data:{};
   const payload=data?.payload&&typeof data.payload==='object'?data.payload:{};
   const list=Array.isArray(nextContacts)&&nextContacts.length?nextContacts:contactsFromStorage();
   const contactId=String(intent.contactId||data.contactId||payload.contactId||'');
   const contactName=String(intent.contactName||intent.title||'');
   const messageId=String(intent.messageId||data.messageId||payload.messageId||(String(data.eventType||'')==='whatsapp_message'?data.eventId||'':'')||'');
   const contact=list.find(c=>contactId&&String(c.id)===contactId)
     ||list.find(c=>contactName&&canonicalName(c.name)===canonicalName(contactName));
   if(!contact)return false;

   await refreshMessages(list);
   if(!mounted.current)return false;
   setActiveId(contact.id);
   setChats(prev=>({...prev,[contact.id]:{...(prev[contact.id]||{messages:[]}),unread:0}}));
   try{
     await api('/api/whatsapp',{method:'POST',body:JSON.stringify({action:'read',contact:contactPayload(contact)})});
   }catch{}
   try{
     const pending=readJson(OPEN_INTENT_KEY,null);
     const same=!pending||(!messageId||String(pending.messageId||'')===messageId);
     if(same)localStorage.removeItem(OPEN_INTENT_KEY);
   }catch{}
   window.dispatchEvent(new CustomEvent('private-life:whatsapp-message-opened',{detail:{
     contactId:contact.id,contactName:contact.name,messageId
   }}));
   return true;
 }

 useEffect(()=>{
   const c=contactsFromStorage();setContacts(c);setChats(groupMessages(c,[]));setReady(true);
   refreshMessages(c);pollDirector(c);refreshLifeStates();

   const pending=readJson(OPEN_INTENT_KEY,null);
   if(pending?.app==='whatsapp')setTimeout(()=>openNotificationIntent(pending,c),0);

   const sync=()=>{const next=contactsFromStorage();setContacts(next);refreshMessages(next);pollDirector(next);refreshLifeStates()};
   const onNotificationOpen=e=>{
     const detail=e?.detail||{};
     if(String(detail?.app||'').toLowerCase().includes('whatsapp')){
       openNotificationIntent(detail,contactsFromStorage());
     }
   };
   window.addEventListener('storage',sync);
   window.addEventListener('private-life:contacts-changed',sync);
   window.addEventListener('private-life:notification-open',onNotificationOpen);
   return()=>{
     window.removeEventListener('storage',sync);
     window.removeEventListener('private-life:contacts-changed',sync);
     window.removeEventListener('private-life:notification-open',onNotificationOpen);
   };
 },[]);

 useEffect(()=>{
   if(!ready)return;
   const id=setInterval(async()=>{await pollDirector();await refreshMessages()},5000);
   const lifeId=setInterval(()=>refreshLifeStates(),15000);
   return()=>{clearInterval(id);clearInterval(lifeId)};
 },[ready,contacts]);

 useEffect(()=>{endRef.current?.scrollIntoView({behavior:'smooth'})},[chats,typing,activeId]);

 const active=contacts.find(c=>c.id===activeId)||null;
 const visible=useMemo(()=>{
   const q=search.trim().toLowerCase();
   return contacts.filter(c=>!q||String(c.name).toLowerCase().includes(q)).sort((a,b)=>{
     const at=chats[a.id]?.messages?.at(-1)?.createdAt||'',bt=chats[b.id]?.messages?.at(-1)?.createdAt||'';
     return bt.localeCompare(at)||String(a.name).localeCompare(String(b.name),'es');
   });
 },[contacts,chats,search]);

 function storyEvent(contact,type,payload={}){
   const event={id:uid(),createdAt:new Date().toISOString(),source:'whatsapp',contactId:contact.id,contactName:contact.name,type,...payload};
   const current=readJson(STORY_KEY,[]);writeJson(STORY_KEY,[event,...current].slice(0,250));
   window.dispatchEvent(new CustomEvent('private-life:narrative-event',{detail:event}));
 }

 async function sendMessage(type,text,image=null){
   if(!active)return;
   const optimistic={id:'tmp-'+uid(),contactId:active.id,contactName:active.name,side:'out',type,text:text||'',image:image||null,createdAt:new Date().toISOString()};
   setChats(prev=>{const chat=prev[active.id]||{messages:[],unread:0};return {...prev,[active.id]:{...chat,messages:[...(chat.messages||[]),optimistic]}}});
   setTyping(true);
   try{
     const data=await api('/api/whatsapp',{method:'POST',body:JSON.stringify({action:'send',contact:contactPayload(active),type,text,image})});
     storyEvent(active,type==='image'?'photo_sent':'message_sent',text?{text}:{});
     if(data.reply?.text)storyEvent(active,'message_received',{text:data.reply.text});
     if(data.queued)storyEvent(active,'reply_delayed',{deliverAfter:data.deliverAfter||null,lifeState:data.lifeState||null});
     if(data.lifeState)setLifeStates(prev=>({...prev,[String(active.id)]:data.lifeState}));
     await api('/api/whatsapp',{method:'POST',body:JSON.stringify({action:'read',contact:contactPayload(active)})}).catch(()=>{});
     await refreshMessages();
   }catch{
     setOnline(false);
   }finally{
     if(mounted.current)setTyping(false);
   }
 }

 async function sendText(){
   const text=draft.trim();if(!active||!text)return;
   setDraft('');await sendMessage('text',text,null);
 }

 async function sendPhoto(file){
   if(!active||!file)return;
   try{const image=await imageData(file);await sendMessage('image','',image)}catch{}
   if(fileRef.current)fileRef.current.value='';
 }

 async function openChat(contactId){
   setActiveId(contactId);
   const contact=contacts.find(c=>c.id===contactId);
   setChats(prev=>({...prev,[contactId]:{...(prev[contactId]||{messages:[]}),unread:0}}));
   if(contact){try{await api('/api/whatsapp',{method:'POST',body:JSON.stringify({action:'read',contact:contactPayload(contact)})})}catch{}}
 }

 if(!ready)return <div className="whatsapp-app"><div className="wa-loading"><span/>Abriendo WhatsApp…</div></div>;

 if(active){
   const messages=chats[active.id]?.messages||[];
   const life=lifeStates[String(active.id)]||lifeStates['name:'+String(active.name||'').trim().toLowerCase()]||null;
   const presence=life?.label?String(life.label).charAt(0).toLowerCase()+String(life.label).slice(1):(online?'en línea':'conectando…');
   return <div className="whatsapp-app wa-thread">
     <header className="wa-chat-head">
       <button className="wa-back" onClick={()=>setActiveId(null)} aria-label="Volver">‹</button>
       <button className="wa-person">
         <Avatar contact={active} size="sm"/>
         <span><b>{active.name}</b><small>{typing?'escribiendo…':presence}</small></span>
       </button>
       <button className="wa-head-icon" aria-label="Videollamada">⌁</button>
       <button className="wa-head-icon" aria-label="Llamar">⌕</button>
     </header>
     <main className="wa-wall">
       <div className="wa-date-pill">{todayLabel(messages.at(-1)?.createdAt)}</div>
       {!messages.length&&<div className="wa-encryption">Esta conversación forma parte de tu partida de PRIVATE LIFE.</div>}
       {messages.map(m=><div key={m.id} className={'wa-message-row '+(m.side==='out'?'out':'in')}>
         <div className={'wa-bubble '+(m.type==='image'?'image-bubble':'')}>
           {m.image&&<img className="wa-photo" src={m.image} alt="Imagen enviada"/>}
           {m.text&&<span className="wa-text">{m.text}</span>}
           <small className="wa-time">{clock(m.createdAt)} {m.side==='out'&&<em>✓✓</em>}</small>
         </div>
       </div>)}
       {typing&&<div className="wa-message-row in"><div className="wa-bubble wa-typing"><i/><i/><i/></div></div>}
       <div ref={endRef}/>
     </main>
     <footer className="wa-compose">
       <button className="wa-plus" onClick={()=>fileRef.current?.click()} aria-label="Adjuntar">＋</button>
       <input ref={fileRef} type="file" accept="image/*" hidden onChange={e=>sendPhoto(e.target.files?.[0])}/>
       <div className="wa-input-wrap">
         <input value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendText()}}} placeholder="Mensaje"/>
         <button className="wa-camera" onClick={()=>fileRef.current?.click()} aria-label="Foto">◉</button>
       </div>
       <button className={'wa-send '+(draft.trim()?'ready':'')} onClick={draft.trim()?sendText:undefined} aria-label={draft.trim()?'Enviar':'Audio'}>{draft.trim()?'➤':'●'}</button>
     </footer>
   </div>;
 }

 return <div className="whatsapp-app">
   <header className="wa-main-head"><button onClick={onClose} aria-label="Cerrar">‹</button><span/><button aria-label="Nuevo chat">⌑</button></header>
   <section className="wa-chats">
     <h1>Chats</h1>
     {!online&&<div className="wa-offline">Sincronizando con Director…</div>}
     <div className="wa-search"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar"/></div>
     <div className="wa-filter-row"><button className="active">Todos</button><button>No leídos</button><button>Favoritos</button></div>
     {!contacts.length?<div className="wa-empty"><div>☏</div><b>No tienes contactos todavía</b><span>Añade personas desde Contactos y aparecerán aquí automáticamente.</span></div>:
     <div className="wa-chat-list">{visible.map(c=>{const chat=chats[c.id]||{},last=chat.messages?.at(-1);return <button className="wa-chat-row" key={c.id} onClick={()=>openChat(c.id)}>
       <Avatar contact={c} size="lg"/><span className="wa-chat-copy"><b>{c.name}</b><small>{last?(last.side==='out'?'✓✓ ':'')+(last.type==='image'?'📷 Foto':last.text):c.relationshipType||'Contacto'}</small></span><span className="wa-chat-meta"><time>{last?clock(last.createdAt):''}</time>{chat.unread>0&&<i>{chat.unread>99?'99+':chat.unread}</i>}</span>
     </button>})}</div>}
   </section>
   <nav className="wa-bottom"><button><span>◉</span><b>Novedades</b></button><button className="selected"><span>◌</span><b>Chats</b></button><button><span>◎</span><b>Comunidades</b></button><button><span>☎</span><b>Llamadas</b></button></nav>
 </div>;
}
