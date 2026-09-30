'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const STORAGE='private-life-notifications-v1';
const INTRO='private-life-notifications-intro-v1';
const PHONE_SETTINGS='private-life-phone-settings-v1';
const CONTACTS='private-life-contacts';
const STORY='private-life-narrative-events-v1';
const MESSAGE_INBOX='private-life-messages-v1';
const FORCE_LUISA_TEST='private-life-force-luisa-test-v1';
const MAX_NOTIFICATIONS=60;

const appGlyphs={
  'whatsapp':'◉','mensajes':'●','instagram':'◎','facebook':'f','tinder':'♥','grindr':'◆',
  'contactos':'●','notas':'▤','fotos':'▧','galeria':'▧','telefono':'☎','private life':'PL','sistema':'PL',
  'calendario':'31','ahora':'⌖','ajustes':'⚙','app store':'A','safari':'◈','musica':'♪'
};

const appIcons={
  'instagram':'/phone/instagram.webp',
  'facebook':'/phone/facebook.webp',
  'tinder':'/phone/tinder.webp',
  'grindr':'/phone/grindr.webp',
  'contactos':'/phone/contacts.webp',
  'fotos':'/phone/photos.webp',
  'galeria':'/phone/photos.webp',
  'calendario':'/phone/calendar.webp',
  'notas':'/phone/notes.webp',
  'ajustes':'/phone/settings.webp',
  'telefono':'/phone/phone.webp',
  'mensajes':'/phone/messages.webp'
};

function normalize(value=''){
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
}
function phonePrefs(){try{return {notifications:true,badges:true,vibration:true,previews:true,...JSON.parse(localStorage.getItem(PHONE_SETTINGS)||'{}')}}catch{return {notifications:true,badges:true,vibration:true,previews:true}}}
function load(){
  try{const value=JSON.parse(localStorage.getItem(STORAGE)||'[]');return Array.isArray(value)?value.slice(0,MAX_NOTIFICATIONS):[]}catch{return []}
}
function relativeTime(iso){
  const diff=Math.max(0,Date.now()-new Date(iso).getTime());
  if(diff<45000)return 'ahora';
  const min=Math.floor(diff/60000);if(min<60)return `${min} min`;
  const h=Math.floor(min/60);if(h<24)return `${h} h`;
  const d=Math.floor(h/24);return `${d} d`;
}
function appKey(value=''){
  const key=normalize(value);
  if(key.includes('whatsapp'))return 'whatsapp';
  if(key.includes('mensaje')||key==='messages')return 'mensajes';
  if(key.includes('instagram'))return 'instagram';
  if(key.includes('facebook'))return 'facebook';
  if(key.includes('tinder'))return 'tinder';
  if(key.includes('grindr'))return 'grindr';
  if(key.includes('contact'))return 'contactos';
  if(key.includes('foto')||key.includes('galeria')||key.includes('photo'))return 'fotos';
  if(key.includes('calendar'))return 'calendario';
  if(key.includes('nota'))return 'notas';
  if(key.includes('ajuste')||key.includes('setting'))return 'ajustes';
  if(key.includes('telefono')||key==='phone')return 'telefono';
  if(key.includes('private life')||key.includes('sistema'))return 'private life';
  if(key.includes('app store'))return 'app store';
  if(key.includes('safari'))return 'safari';
  if(key.includes('musica')||key.includes('music'))return 'musica';
  if(key.includes('ahora'))return 'ahora';
  return key;
}
function glyph(app){return appGlyphs[appKey(app)]||String(app||'P').trim().slice(0,2).toUpperCase()}
function domIconFor(app){
  if(typeof document==='undefined')return '';
  const key=appKey(app);
  const buttons=[...document.querySelectorAll('.phone .ios-app')];
  const button=buttons.find(node=>appKey(node.dataset.appName||node.dataset.appId||node.textContent)===key);
  const image=button?.querySelector('img.ios-appicon');
  return image?.src||'';
}
function iconFor(app){return domIconFor(app)||appIcons[appKey(app)]||''}
function persistOfficialMessage(item){
  if(typeof localStorage==='undefined'||appKey(item?.app)!=='mensajes')return;
  try{
    const existing=JSON.parse(localStorage.getItem(MESSAGE_INBOX)||'{}');
    const store={admin:Array.isArray(existing?.admin)?existing.admin:[],updates:Array.isArray(existing?.updates)?existing.updates:[]};
    const payload=item?.data?.payload||{};
    const haystack=normalize([item?.title,item?.body,item?.data?.eventType,payload?.source,payload?.thread].filter(Boolean).join(' '));
    const thread=(haystack.includes('actualiza')||haystack.includes('version')||haystack.includes('novedad')||haystack.includes('mantenimiento')||haystack.includes('patch'))?'updates':'admin';
    const message={id:String(item.id),title:String(item.title||'PRIVATE LIFE').slice(0,160),text:String(item.body||'').slice(0,4000),createdAt:item.createdAt||new Date().toISOString(),read:false,source:String(payload?.source||item?.data?.source||'system'),thread};
    if(!store[thread].some(entry=>entry?.id===message.id))store[thread]=[...store[thread],message].slice(-160);
    localStorage.setItem(MESSAGE_INBOX,JSON.stringify(store));
    window.dispatchEvent(new CustomEvent('private-life:messages-store',{detail:message}));
  }catch{}
}

export default function PhoneNotifications(){
  const [target,setTarget]=useState(null);
  const [items,setItems]=useState([]);
  const [banner,setBanner]=useState(null);
  const [shade,setShade]=useState(false);
  const [clock,setClock]=useState(new Date());
  const gesture=useRef(null);
  const bannerGesture=useRef(null);
  const cardGesture=useRef(null);
  const [cardDrag,setCardDrag]=useState({id:null,dx:0});

  useEffect(()=>{
    setItems(load());
    const locate=()=>setTarget(document.querySelector('.phone'));
    locate();
    const observer=new MutationObserver(locate);observer.observe(document.body,{childList:true,subtree:true});
    return()=>observer.disconnect();
  },[]);

  useEffect(()=>{const timer=setInterval(()=>setClock(new Date()),30000);return()=>clearInterval(timer)},[]);

  useEffect(()=>{
    let cancelled=false;
    async function forceLuisaOnce(){
      try{
        if(localStorage.getItem(FORCE_LUISA_TEST))return;
        const raw=JSON.parse(localStorage.getItem(CONTACTS)||'[]');
        const contacts=Array.isArray(raw)?raw:[];
        const luisa=contacts.find(c=>{
          const name=normalize(c?.name||'');
          return name==='luisa'||name.startsWith('luisa ');
        });
        if(!luisa||Number(luisa.age)<18)return;
        const contact={
          id:luisa.id,name:luisa.name,age:luisa.age,city:luisa.city,
          relationshipType:luisa.relationshipType,relation:luisa.relation,affection:luisa.affection,
          profile:luisa.profile,engineContext:luisa.engineContext,masterSheet:luisa.masterSheet,
          sourceType:luisa.sourceType,isAI:luisa.isAI===true,npcId:luisa.npcId||null,
          npcConfigSnapshot:luisa.npcConfigSnapshot||null
        };
        const response=await fetch('/api/whatsapp',{
          method:'POST',credentials:'same-origin',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({action:'force',contact})
        });
        if(!response.ok)return;
        const data=await response.json();
        if(cancelled||!data?.message)return;
        localStorage.setItem(FORCE_LUISA_TEST,new Date().toISOString());
        window.dispatchEvent(new CustomEvent('private-life:notify',{detail:{
          id:'wa-force-'+data.message.id,
          app:'WhatsApp',
          title:data.message.contactName||luisa.name||'WhatsApp',
          body:data.message.text||'Nuevo mensaje',
          createdAt:data.message.createdAt||new Date().toISOString(),
          priority:'high',
          data:{contactId:data.message.contactId,messageId:data.message.id,forcedTest:true}
        }}));
        window.dispatchEvent(new CustomEvent('private-life:narrative-event',{detail:{
          id:'forced-test-'+data.message.id,
          createdAt:data.message.createdAt||new Date().toISOString(),
          source:'life-engine',
          type:'npc_forced_test',
          contactId:data.message.contactId,
          contactName:data.message.contactName,
          text:data.message.text||''
        }}));
      }catch{}
    }
    const timer=setTimeout(forceLuisaOnce,1800);
    return()=>{cancelled=true;clearTimeout(timer)};
  },[]);


  useEffect(()=>{
    let cancelled=false;
    async function backgroundWhatsAppPoll(){
      try{
        const contacts=JSON.parse(localStorage.getItem(CONTACTS)||'[]');
        const adults=(Array.isArray(contacts)?contacts:[]).filter(c=>c?.id&&c?.name&&Number(c?.age)>=18).slice(0,200).map(c=>({
          id:c.id,name:c.name,age:c.age,city:c.city,relationshipType:c.relationshipType,relation:c.relation,
          affection:c.affection,profile:c.profile,engineContext:c.engineContext,masterSheet:c.masterSheet,
          sourceType:c.sourceType,isAI:c.isAI===true,npcId:c.npcId||null,npcConfigSnapshot:c.npcConfigSnapshot||null
        }));
        if(!adults.length)return;
        const response=await fetch('/api/whatsapp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'poll',contacts:adults})});
        if(!response.ok)return;
        const data=await response.json();
        if(cancelled)return;
        for(const message of data.delivered||[]){
          window.dispatchEvent(new CustomEvent('private-life:notify',{detail:{
            id:'wa-server-'+message.id,
            app:'WhatsApp',
            title:message.contactName||'WhatsApp',
            body:message.type==='image'?'Foto':message.text||'Nuevo mensaje',
            createdAt:message.createdAt||new Date().toISOString(),
            data:{contactId:message.contactId,messageId:message.id}
          }}));
        }
      }catch{}
    }
    backgroundWhatsAppPoll();
    const timer=setInterval(backgroundWhatsAppPoll,7000);
    const onFocus=()=>backgroundWhatsAppPoll();
    window.addEventListener('focus',onFocus);
    return()=>{cancelled=true;clearInterval(timer);window.removeEventListener('focus',onFocus)};
  },[]);

  useEffect(()=>{
    let cancelled=false;
    async function backgroundLifePoll(){
      try{
        const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
        const rawContacts=JSON.parse(localStorage.getItem(CONTACTS)||'[]');
        const contacts=(Array.isArray(rawContacts)?rawContacts:[]).filter(c=>c?.id&&c?.name&&Number(c?.age)>=18).slice(0,200).map(c=>({
          id:c.id,name:c.name,age:c.age,city:c.city,relationshipType:c.relationshipType,relation:c.relation,
          affection:c.affection,profile:c.profile,sourceType:c.sourceType,isAI:c.isAI===true,
          npcId:c.npcId||null,npcConfigSnapshot:c.npcConfigSnapshot||null
        }));
        const response=await fetch('/api/life/tick?timezone='+encodeURIComponent(timezone),{
          method:'POST',
          cache:'no-store',
          credentials:'same-origin',
          headers:{Accept:'application/json','content-type':'application/json'},
          body:JSON.stringify({contacts})
        });
        if(!response.ok)return;
        const data=await response.json();
        if(cancelled)return;
        for(const event of data.delivered||[]){
          const createdAt=event.deliveredAt||new Date().toISOString();
          const detail={
            id:'life-server-'+event.id,
            app:event.app||'PRIVATE LIFE',
            title:event.title||'PRIVATE LIFE',
            body:event.body||'',
            createdAt,
            priority:'normal',
            data:{eventType:event.type||'life_event',payload:event.payload||{}}
          };
          window.dispatchEvent(new CustomEvent('private-life:notify',{detail}));
          try{
            const current=JSON.parse(localStorage.getItem(STORY)||'[]');
            const storyEvent={
              id:'life-'+event.id,
              createdAt,
              source:'life-engine',
              type:event.type||'life_event',
              title:event.title||'',
              text:event.body||'',
              payload:event.payload||{}
            };
            const list=Array.isArray(current)?current:[];
            localStorage.setItem(STORY,JSON.stringify([storyEvent,...list.filter(x=>x?.id!==storyEvent.id)].slice(0,250)));
            window.dispatchEvent(new CustomEvent('private-life:narrative-event',{detail:storyEvent}));
          }catch{}
        }
      }catch{}
    }
    backgroundLifePoll();
    const timer=setInterval(backgroundLifePoll,12000);
    const onFocus=()=>backgroundLifePoll();
    window.addEventListener('focus',onFocus);
    return()=>{cancelled=true;clearInterval(timer);window.removeEventListener('focus',onFocus)};
  },[]);

  useEffect(()=>{
    const notify=(input={})=>{
      const detail=input?.detail||input||{};
      const prefs=phonePrefs();
      if(prefs.notifications===false)return;
      const item={
        id:detail.id||crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`,
        app:String(detail.app||'PRIVATE LIFE'),title:String(detail.title||detail.app||'PRIVATE LIFE'),
        body:prefs.previews===false?'':String(detail.body||detail.message||''),icon:detail.icon||domIconFor(detail.app)||'',href:detail.href||'',
        createdAt:detail.createdAt||new Date().toISOString(),read:false,priority:detail.priority||'normal',
        data:detail.data&&typeof detail.data==='object'?detail.data:{}
      };
      setItems(current=>[item,...current.filter(n=>n.id!==item.id)].slice(0,MAX_NOTIFICATIONS));
      setBanner(item.id);
      const targetKey=appKey(item.app);
      requestAnimationFrame(()=>{
        const buttons=[...document.querySelectorAll('.phone .ios-app')];
        const hit=buttons.find(button=>appKey(button.dataset.appName||button.dataset.appId||'')===targetKey);
        if(hit){
          hit.classList.remove('pl-notification-hit');
          void hit.offsetWidth;
          hit.classList.add('pl-notification-hit');
          setTimeout(()=>hit.classList.remove('pl-notification-hit'),760);
        }
      });
      if(prefs.vibration!==false&&detail.vibrate!==false&&navigator.vibrate)navigator.vibrate([42,28,42]);
      persistOfficialMessage(item);
      window.dispatchEvent(new CustomEvent('private-life:notification-received',{detail:item}));
    };
    window.privateLifeNotify=notify;
    const handler=e=>notify(e);
    window.addEventListener('private-life:notify',handler);
    if(!localStorage.getItem(INTRO)){
      localStorage.setItem(INTRO,'1');
      const t=setTimeout(()=>notify({app:'PRIVATE LIFE',title:'Notificaciones activadas',body:'Los mensajes, llamadas y acontecimientos de tu historia aparecerán aquí.',vibrate:false}),1400);
      return()=>{clearTimeout(t);window.removeEventListener('private-life:notify',handler);delete window.privateLifeNotify};
    }
    return()=>{window.removeEventListener('private-life:notify',handler);delete window.privateLifeNotify};
  },[]);

  useEffect(()=>{
    const handler=e=>{
      const ids=new Set(Array.isArray(e?.detail?.ids)?e.detail.ids.map(String):[]);
      setItems(current=>current.map(item=>{
        if(appKey(item.app)!=='mensajes')return item;
        if(ids.size&&!ids.has(String(item.id)))return item;
        return item.read?item:{...item,read:true};
      }));
    };
    window.addEventListener('private-life:messages-read',handler);
    return()=>window.removeEventListener('private-life:messages-read',handler);
  },[]);

  useEffect(()=>{try{localStorage.setItem(STORAGE,JSON.stringify(items))}catch{}},[items]);
  useEffect(()=>{if(!banner)return;const t=setTimeout(()=>setBanner(null),4800);return()=>clearTimeout(t)},[banner]);

  const unread=useMemo(()=>items.filter(n=>!n.read).length,[items]);
  const currentBanner=items.find(n=>n.id===banner)||null;

  useEffect(()=>{
    if(!target)return;
    const update=()=>{
      const prefs=phonePrefs();
      const apps=[...target.querySelectorAll('.ios-app')];
      apps.forEach(app=>{
        const key=appKey(app.dataset.appName||app.dataset.appId||app.textContent);
        const count=prefs.badges===false?0:items.filter(n=>!n.read&&key&&appKey(n.app)===key).length;
        if(count)app.dataset.badge=count>99?'99+':String(count);else delete app.dataset.badge;
      });
    };
    update();
    const observer=new MutationObserver(update);observer.observe(target,{childList:true,subtree:true});
    const settings=()=>update();window.addEventListener('private-life:settings-changed',settings);
    return()=>{observer.disconnect();window.removeEventListener('private-life:settings-changed',settings)};
  },[target,items]);

  useEffect(()=>{
    if(!target)return;
    const down=e=>{const r=target.getBoundingClientRect(),y=e.clientY-r.top;if(y<=58&&!e.target.closest('button,input,textarea'))gesture.current={start:e.clientY,last:e.clientY}};
    const move=e=>{if(gesture.current)gesture.current.last=e.clientY};
    const up=()=>{if(!gesture.current)return;const delta=gesture.current.last-gesture.current.start;if(delta>42)setShade(true);gesture.current=null};
    target.addEventListener('pointerdown',down);window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
    return()=>{target.removeEventListener('pointerdown',down);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up)};
  },[target]);

  function markRead(id){setItems(current=>current.map(n=>n.id===id?{...n,read:true}:n))}
  function open(item){
    markRead(item.id);setBanner(null);setShade(false);
    window.dispatchEvent(new CustomEvent('private-life:notification-open',{detail:item}));
    if(item.href){if(item.href.startsWith('/'))location.href=item.href;return}
    const wanted=appKey(item.app);
    const apps=[...document.querySelectorAll('.phone .ios-app')];
    const app=apps.find(a=>appKey(a.dataset.appName||a.dataset.appId||a.textContent)===wanted);
    if(app)setTimeout(()=>app.click(),80);
  }
  function clearAll(){setItems([]);setBanner(null)}
  function readAll(){setItems(current=>current.map(n=>({...n,read:true})))}
  function dismiss(id){setItems(current=>current.filter(n=>n.id!==id));if(banner===id)setBanner(null)}
  function bannerDown(e){bannerGesture.current={x:e.clientX,y:e.clientY}}
  function bannerUp(e){if(!bannerGesture.current)return;const dx=e.clientX-bannerGesture.current.x,dy=e.clientY-bannerGesture.current.y;bannerGesture.current=null;if(Math.abs(dx)>55||dy<-35)setBanner(null)}
  function cardDown(e,id){cardGesture.current={id,x:e.clientX,moved:false};e.currentTarget.setPointerCapture?.(e.pointerId)}
  function cardMove(e,id){const g=cardGesture.current;if(!g||g.id!==id)return;const dx=e.clientX-g.x;if(Math.abs(dx)>5)g.moved=true;setCardDrag({id,dx:Math.max(-130,Math.min(130,dx))})}
  function cardUp(e,item){const g=cardGesture.current;cardGesture.current=null;const dx=cardDrag.id===item.id?cardDrag.dx:0;setCardDrag({id:null,dx:0});if(g?.moved&&Math.abs(dx)>76){dismiss(item.id);return}if(!g?.moved)open(item)}
  function shadeDown(e){if(e.target.closest('.pl-notification-card,button'))return;gesture.current={start:e.clientY,last:e.clientY,shade:true}}
  function shadeMove(e){if(gesture.current?.shade)gesture.current.last=e.clientY}
  function shadeUp(){if(gesture.current?.shade&&gesture.current.last-gesture.current.start<-45)setShade(false);if(gesture.current?.shade)gesture.current=null}

  if(!target)return null;
  const date=clock.toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'});
  const time=clock.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});

  return createPortal(<>
    {currentBanner&&!shade&&<div className="pl-notification-banner" onPointerDown={bannerDown} onPointerUp={bannerUp} onClick={()=>open(currentBanner)} role="button" aria-label={`Notificación de ${currentBanner.app}`}>
      <div className="pl-notification-icon">{(currentBanner.icon||iconFor(currentBanner.app))?<img src={currentBanner.icon||iconFor(currentBanner.app)} alt=""/>:glyph(currentBanner.app)}</div>
      <div className="pl-notification-copy"><div><b>{currentBanner.app}</b><span>{relativeTime(currentBanner.createdAt)}</span></div><strong>{currentBanner.title}</strong>{currentBanner.body&&<p>{currentBanner.body}</p>}</div>
    </div>}
    {shade&&<div className="pl-notification-shade" onPointerDown={shadeDown} onPointerMove={shadeMove} onPointerUp={shadeUp}>
      <div className="pl-notification-shade-bg"/>
      <div className="pl-notification-shade-content">
        <div className="pl-notification-grabber" onClick={()=>setShade(false)}/>
        <div className="pl-notification-clock"><b>{time}</b><span>{date}</span></div>
        <div className="pl-notification-tools"><span>{unread?`${unread} sin leer`:'Al día'}</span><div>{unread>0&&<button onClick={readAll}>Marcar leídas</button>}{items.length>0&&<button onClick={clearAll}>Borrar</button>}</div></div>
        <div className="pl-notification-list">
          {!items.length?<div className="pl-notification-empty"><b>Sin notificaciones</b><span>Todo tranquilo por ahora.</span></div>:items.map(item=><article
            key={item.id}
            className={`pl-notification-card ${item.read?'read':'unread'}`}
            onPointerDown={e=>cardDown(e,item.id)}
            onPointerMove={e=>cardMove(e,item.id)}
            onPointerUp={e=>cardUp(e,item)}
            onPointerCancel={()=>{cardGesture.current=null;setCardDrag({id:null,dx:0})}}
            style={cardDrag.id===item.id?{transform:`translateX(${cardDrag.dx}px)`,opacity:String(Math.max(.35,1-Math.abs(cardDrag.dx)/210))}:undefined}
          >
            <div className="pl-notification-icon">{(item.icon||iconFor(item.app))?<img src={item.icon||iconFor(item.app)} alt=""/>:glyph(item.app)}</div>
            <div className="pl-notification-copy"><div><b>{item.app}</b><span>{relativeTime(item.createdAt)}</span></div><strong>{item.title}</strong>{item.body&&<p>{item.body}</p>}</div>
            <span className="pl-notification-swipe-hint">‹</span>
          </article>)}
        </div>
        <div className="pl-notification-homebar" onClick={()=>setShade(false)}/>
      </div>
    </div>}
  </>,target);
}
