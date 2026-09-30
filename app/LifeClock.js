'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

function getBrowserTimezone(){
  try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}catch{return 'UTC'}
}

export function useLifeClock(){
  const anchorRef=useRef({clientMs:Date.now(),gameMs:Date.now(),speed:1,paused:false});
  const [now,setNow]=useState(()=>new Date());
  const [meta,setMeta]=useState({synced:false,speed:1,paused:false,timezone:getBrowserTimezone(),error:''});

  const tick=useCallback(()=>{
    const anchor=anchorRef.current;
    const elapsed=Math.max(0,Date.now()-anchor.clientMs);
    const gameMs=anchor.gameMs+(anchor.paused?0:elapsed*anchor.speed);
    setNow(new Date(gameMs));
  },[]);

  const sync=useCallback(async()=>{
    const timezone=getBrowserTimezone();
    const sentAt=Date.now();
    try{
      const response=await fetch('/api/life/clock?timezone='+encodeURIComponent(timezone),{
        cache:'no-store',
        credentials:'same-origin',
        headers:{Accept:'application/json'}
      });
      if(!response.ok)throw new Error('clock_sync_'+response.status);
      const data=await response.json();
      const receivedAt=Date.now();
      const gameMs=Date.parse(data.gameNow);
      if(!Number.isFinite(gameMs))throw new Error('clock_invalid_time');
      const speed=Number(data.speed)||1;
      const paused=Boolean(data.paused);
      anchorRef.current={
        clientMs:Math.round((sentAt+receivedAt)/2),
        gameMs,
        speed,
        paused
      };
      setMeta({synced:true,speed,paused,timezone:data.timezone||timezone,error:''});
      tick();
    }catch(error){
      setMeta(current=>({...current,error:String(error?.message||error)}));
    }
  },[tick]);

  useEffect(()=>{
    let active=true;
    const safeSync=()=>{if(active)sync()};
    safeSync();
    const ticker=setInterval(()=>{if(active)tick()},1000);
    const resync=setInterval(safeSync,60000);
    const onVisibility=()=>{if(document.visibilityState==='visible')safeSync()};
    document.addEventListener('visibilitychange',onVisibility);
    return()=>{
      active=false;
      clearInterval(ticker);
      clearInterval(resync);
      document.removeEventListener('visibilitychange',onVisibility);
    };
  },[sync,tick]);

  return {now,...meta,resync:sync};
}
