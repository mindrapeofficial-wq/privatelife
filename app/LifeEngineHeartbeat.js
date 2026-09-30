'use client';

import { useEffect, useRef } from 'react';

const CONTACTS_KEY='private-life-contacts';
const STORY_KEY='private-life-narrative-events-v1';

function readContacts(){
  try{
    const raw=JSON.parse(localStorage.getItem(CONTACTS_KEY)||'[]');
    return (Array.isArray(raw)?raw:[])
      .filter(c=>c?.id&&c?.name&&Number(c?.age)>=18)
      .slice(0,200)
      .map(c=>({
        id:c.id,name:c.name,age:c.age,city:c.city,relationshipType:c.relationshipType,relation:c.relation,
        affection:c.affection,profile:c.profile,sourceType:c.sourceType,isAI:c.isAI===true,
        npcId:c.npcId||null,npcConfigSnapshot:c.npcConfigSnapshot||null
      }));
  }catch{return[]}
}
function rememberStory(message){
  try{
    const current=JSON.parse(localStorage.getItem(STORY_KEY)||'[]');
    const list=Array.isArray(current)?current:[];
    const event={
      id:'life-'+message.id,
      createdAt:message.createdAt||new Date().toISOString(),
      source:'life_engine',
      type:'npc_initiative',
      contactId:message.contactId,
      contactName:message.contactName,
      text:message.text||''
    };
    localStorage.setItem(STORY_KEY,JSON.stringify([event,...list.filter(x=>x?.id!==event.id)].slice(0,250)));
    window.dispatchEvent(new CustomEvent('private-life:narrative-event',{detail:event}));
  }catch{}
}

export default function LifeEngineHeartbeat(){
  const running=useRef(false);
  const active=useRef(true);

  useEffect(()=>{
    active.current=true;
    async function tick(){
      if(running.current||!active.current)return;
      running.current=true;
      try{
        const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
        const response=await fetch('/api/life/tick',{
          method:'POST',
          credentials:'same-origin',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({timezone,contacts:readContacts()})
        });
        if(!response.ok)return;
        const data=await response.json();
        if(!active.current)return;
        for(const message of data.delivered||[]){
          rememberStory(message);
          window.dispatchEvent(new CustomEvent('private-life:notify',{detail:{
            id:'life-wa-'+message.id,
            app:'WhatsApp',
            title:message.contactName||'WhatsApp',
            body:message.text||'Nuevo mensaje',
            createdAt:message.createdAt||new Date().toISOString(),
            data:{contactId:message.contactId,messageId:message.id,source:'life_engine'}
          }}));
        }
        window.dispatchEvent(new CustomEvent('private-life:life-tick',{detail:data}));
      }catch{}finally{running.current=false}
    }

    tick();
    const timer=setInterval(tick,60000);
    const onVisible=()=>{if(document.visibilityState==='visible')tick()};
    const onFocus=()=>tick();
    const onContacts=()=>tick();
    document.addEventListener('visibilitychange',onVisible);
    window.addEventListener('focus',onFocus);
    window.addEventListener('private-life:contacts-changed',onContacts);
    return()=>{
      active.current=false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange',onVisible);
      window.removeEventListener('focus',onFocus);
      window.removeEventListener('private-life:contacts-changed',onContacts);
    };
  },[]);

  return null;
}
