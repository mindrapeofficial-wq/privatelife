'use client';

import { useState } from 'react';

function tz(){try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}catch{return'UTC'}}

export default function LocationSetup({initialCity='',onComplete,onCancel=null}){
  const [mode,setMode]=useState('ask');
  const [manual,setManual]=useState(initialCity||'');
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState('');
  const [resolved,setResolved]=useState(null);

  async function save(payload){
    const response=await fetch('/api/life/location',{
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({...payload,timezone:tz()})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'No se pudo guardar la ubicación.');
    setResolved(data.location||null);
    setStatus('Ubicación preparada.');
    setTimeout(()=>onComplete?.(data.location||null),350);
  }

  function useDeviceLocation(){
    setStatus('');
    if(!navigator.geolocation){
      setMode('manual');
      setStatus('Este dispositivo no permite obtener la ubicación. Escríbela manualmente.');
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(async position=>{
      try{
        setStatus('Situando tu mundo…');
        await save({
          source:'device',
          latitude:position.coords.latitude,
          longitude:position.coords.longitude,
          accuracy:position.coords.accuracy
        });
      }catch(error){
        setStatus(error.message||'No se pudo guardar la ubicación.');
        setMode('manual');
      }finally{setBusy(false)}
    },error=>{
      setBusy(false);
      setMode('manual');
      setStatus(error?.code===1
        ?'No has dado permiso de ubicación. Puedes escribir tu ciudad o zona manualmente.'
        :'No hemos podido obtener tu ubicación. Escríbela manualmente.');
    },{
      enableHighAccuracy:false,
      timeout:12000,
      maximumAge:5*60*1000
    });
  }

  async function saveManual(){
    const value=manual.trim();
    if(value.length<2){setStatus('Escribe al menos tu ciudad o localidad.');return}
    setBusy(true);setStatus('');
    try{await save({source:'manual',label:value})}
    catch(error){setStatus(error.message||'No se pudo guardar la ubicación.')}
    finally{setBusy(false)}
  }

  return <main className="location-setup">{onCancel&&<button className="location-back" onClick={onCancel} aria-label="Volver">‹</button>}
    <div className="location-orbit"><i/><span>⌖</span></div>
    <div className="eyebrow">TU MUNDO</div>
    <h1>¿Dónde estás?</h1>
    <p className="location-lead">PRIVATE LIFE usa tu zona para situar las historias: lugares, horarios, distancias, planes, encuentros y el tipo de vida que puede ocurrir a tu alrededor.</p>

    <section className="location-permission-card">
      <div className="location-card-icon">⌖</div>
      <div><b>Ubicación aproximada</b><p>La usaremos como contexto del motor. Los personajes no conocerán automáticamente dónde estás.</p></div>
    </section>

    {mode==='ask'?<>
      <button className="location-primary" disabled={busy} onClick={useDeviceLocation}>{busy?'LOCALIZANDO…':'USAR MI UBICACIÓN'}</button>
      <button className="location-secondary" disabled={busy} onClick={()=>setMode('manual')}>ESCRIBIR UBICACIÓN</button>
    </>:<>
      <label className="location-manual">
        <span>CIUDAD, LOCALIDAD O ZONA</span>
        <input autoFocus value={manual} onChange={e=>setManual(e.target.value)} placeholder="Ej.: Vélez-Málaga, Málaga, España" onKeyDown={e=>{if(e.key==='Enter')saveManual()}}/>
      </label>
      <button className="location-primary" disabled={busy} onClick={saveManual}>{busy?'GUARDANDO…':'SITUAR MI PARTIDA AQUÍ'}</button>
      <button className="location-secondary" disabled={busy} onClick={()=>{setMode('ask');setStatus('')}}>USAR GPS</button>
    </>}

    {resolved&&<div className="location-resolved"><b>{resolved.displayLabel}</b><span>{resolved.region||resolved.country||''}</span></div>}
    {status&&<div className="location-status">{status}</div>}

    <p className="location-privacy">El motor utiliza una posición redondeada, no una coordenada de precisión quirúrgica. Podrás cambiar tu zona más adelante.</p>
  </main>
}
