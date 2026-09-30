'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const STORAGE='private-life-notifications-v1';
const INTRO='private-life-notifications-intro-v1';
const PHONE_SETTINGS='private-life-phone-settings-v1';
const CONTACTS='private-life-contacts';
const STORY='private-life-narrative-events-v1';
const MAX_NOTIFICATIONS=60;

const appGlyphs={
  'whatsapp':'◉','mensajes':'●','instagram':'◎','facebook':'f','tinder':'♥','grindr':'◆',
  'contactos':'●','notas':'▤','galeria':'▧','telefono':'☎','private life':'PL','sistema':'PL'
};

function normalize(value=''){
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
}
function phonePrefs(){try{return {notifications:true,vibration:true,previews:true,...JSON.parse(localStorage.getItem(PHONE_SETTINGS)||'{}')}}catch{return {notifications:true,vibration:true,previews:true}}}
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
function glyph(app){return appGlyphs[normalize(app)]||String(app||'P').trim().slice(0,2).toUpperCase()}

export default function PhoneNotifications(){
  const [target,setTarget]=useState(null);
  const [items,setItems]=useState([]);
  const [banner,setBanner]=useState(null);
  const [shade,setShade]=useState(false);
  const [clock,setClock]=useState(new Date());
  const gesture=useRef(null);
  const bannerGesture=useRef(null);

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
    async function backgroundWhatsAppPoll(){
      try{
        const contacts=JSON.parse(localStorage.getItem(CONTACTS)||'[]');
        const adults=(Array.isArray(contacts)?contacts:[]).filter(c=>c?.id&&c?.name&&Number(c?.age)>=18).slice(0,200).map(c=>({
          id:c.id,name:c.name,age:c.age,city:c.city,relationshipType:c.relationshipType,relation:c.relation,
          affection:c.affection,profile:c.profile,engineContext:c.engineContext,masterSheet:c.masterSheet
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
        const response=await fetch('/api/life/tick?timezone='+encodeURIComponent(timezone),{
          cache:'no-store',
          credentials:'same-origin',
          headers:{Accept:'application/json'}
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
        body:prefs.previews===false?'':String(detail.body||detail.message||''),icon:detail.icon||'',href:detail.href||'',
        createdAt:detail.createdAt||new Date().toISOString(),read:false,priority:detail.priority||'normal',
        data:detail.data&&typeof detail.data==='object'?detail.data:{}
      };
      setItems(current=>[item,...current.filter(n=>n.id!==item.id)].slice(0,MAX_NOTIFICATIONS));
      setBanner(item.id);
      if(prefs.vibration!==false&&detail.vibrate!==false&&navigator.vibrate)navigator.vibrate([45,35,45]);
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

  useEffect(()=>{try{localStorage.setItem(STORAGE,JSON.stringify(items))}catch{}},[items]);
  useEffect(()=>{if(!banner)return;const t=setTimeout(()=>setBanner(null),4800);return()=>clearTimeout(t)},[banner]);

  const unread=useMemo(()=>items.filter(n=>!n.read).length,[items]);
  const currentBanner=items.find(n=>n.id===banner)||null;

  useEffect(()=>{
    if(!target)return;
    const update=()=>{
      const apps=[...target.querySelectorAll('.app')];
      apps.forEach(app=>{
        const icon=app.querySelector('.appicon');if(!icon)return;
        const label=normalize(app.textContent);
        const count=items.filter(n=>!n.read&&label&&(normalize(n.app).includes(label)||label.includes(normalize(n.app)))).length;
        if(count)icon.dataset.badge=count>99?'99+':String(count);else delete icon.dataset.badge;
      });
    };
    update();const observer=new MutationObserver(update);observer.observe(target,{childList:true,subtree:true});return()=>observer.disconnect();
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
    const wanted=normalize(item.app);
    const apps=[...document.querySelectorAll('.phone .app')];
    const app=apps.find(a=>{const label=normalize(a.textContent);return label&&(wanted.includes(label)||label.includes(wanted))});
    if(app)setTimeout(()=>app.click(),80);
  }
  function clearAll(){setItems([]);setBanner(null)}
  function readAll(){setItems(current=>current.map(n=>({...n,read:true})))}
  function bannerDown(e){bannerGesture.current={x:e.clientX,y:e.clientY}}
  function bannerUp(e){if(!bannerGesture.current)return;const dx=e.clientX-bannerGesture.current.x,dy=e.clientY-bannerGesture.current.y;bannerGesture.current=null;if(Math.abs(dx)>55||dy<-35)setBanner(null)}
  function shadeDown(e){if(e.target.closest('.pl-notification-card,button'))return;gesture.current={start:e.clientY,last:e.clientY,shade:true}}
  function shadeMove(e){if(gesture.current?.shade)gesture.current.last=e.clientY}
  function shadeUp(){if(gesture.current?.shade&&gesture.current.last-gesture.current.start<-45)setShade(false);if(gesture.current?.shade)gesture.current=null}

  if(!target)return null;
  const date=clock.toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'});
  const time=clock.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});

  return createPortal(<>
    {currentBanner&&!shade&&<div className="pl-notification-banner" onPointerDown={bannerDown} onPointerUp={bannerUp} onClick={()=>open(currentBanner)} role="button" aria-label={`Notificación de ${currentBanner.app}`}>
      <div className="pl-notification-icon">{currentBanner.icon?<img src={currentBanner.icon} alt=""/>:glyph(currentBanner.app)}</div>
      <div className="pl-notification-copy"><div><b>{currentBanner.app}</b><span>{relativeTime(currentBanner.createdAt)}</span></div><strong>{currentBanner.title}</strong>{currentBanner.body&&<p>{currentBanner.body}</p>}</div>
    </div>}
    {shade&&<div className="pl-notification-shade" onPointerDown={shadeDown} onPointerMove={shadeMove} onPointerUp={shadeUp}>
      <div className="pl-notification-shade-bg"/>
      <div className="pl-notification-shade-content">
        <div className="pl-notification-grabber" onClick={()=>setShade(false)}/>
        <div className="pl-notification-clock"><b>{time}</b><span>{date}</span></div>
        <div className="pl-notification-tools"><span>{unread?`${unread} sin leer`:'Al día'}</span><div>{unread>0&&<button onClick={readAll}>Marcar leídas</button>}{items.length>0&&<button onClick={clearAll}>Borrar</button>}</div></div>
        <div className="pl-notification-list">
          {!items.length?<div className="pl-notification-empty"><b>Sin notificaciones</b><span>Todo tranquilo por ahora.</span></div>:items.map(item=><article key={item.id} className={`pl-notification-card ${item.read?'read':'unread'}`} onClick={()=>open(item)}>
            <div className="pl-notification-icon">{item.icon?<img src={item.icon} alt=""/>:glyph(item.app)}</div>
            <div className="pl-notification-copy"><div><b>{item.app}</b><span>{relativeTime(item.createdAt)}</span></div><strong>{item.title}</strong>{item.body&&<p>{item.body}</p>}</div>
          </article>)}
        </div>
        <div className="pl-notification-homebar" onClick={()=>setShade(false)}/>
      </div>
    </div>}
  </>,target);
}
