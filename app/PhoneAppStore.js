'use client';

import { useMemo, useState } from 'react';

export const APP_STORE_CATALOG = [
  {
    id:'tinder',
    name:'Tinder',
    developer:'Tinder LLC',
    category:'Citas',
    description:'Conoce gente nueva, descubre perfiles y abre nuevas posibilidades sociales.',
    longDescription:'Añade una vía de descubrimiento social basada en perfiles, matches, mensajes, citas, rechazos y decisiones del jugador.',
    icon:'/phone/tinder.webp',
    available:true,
    featured:true,
    signals:{social_discovery:8,new_contact_openness:6,novelty_seeking:4,dating_channel:10}
  },
  {
    id:'grindr',
    name:'Grindr',
    developer:'Grindr LLC',
    category:'Social',
    description:'Personas cercanas, chats y encuentros dentro del mundo de Private Life.',
    longDescription:'Habilita interacciones de proximidad, nuevos contactos y eventos espontáneos. Instalarla no determina ni infiere la orientación del personaje.',
    icon:'/phone/grindr.webp',
    available:true,
    featured:true,
    signals:{proximity_discovery:9,new_contact_openness:6,spontaneous_social:5,social_channel:10}
  },
  {
    id:'nightlife',
    name:'Nightlife',
    developer:'Private Life Labs',
    category:'Estilo de vida',
    description:'Planes, clubs, fiestas y eventos nocturnos de tu ciudad.',
    longDescription:'Abrirá experiencias de ocio nocturno, invitaciones, encuentros casuales y decisiones sociales.',
    glyph:'N',
    available:false,
    signals:{nightlife_interest:8,event_exposure:6}
  },
  {
    id:'worklink',
    name:'WorkLink',
    developer:'Private Life Labs',
    category:'Trabajo',
    description:'Contactos profesionales, ofertas y oportunidades inesperadas.',
    longDescription:'Añadirá relaciones laborales, reputación profesional, ofertas, entrevistas y conflictos de carrera.',
    glyph:'W',
    available:false,
    signals:{career_networking:8,professional_exposure:6}
  },
  {
    id:'pulse',
    name:'Pulse',
    developer:'Private Life Labs',
    category:'Social',
    description:'Una red social de tendencias, círculos y conversaciones públicas.',
    longDescription:'Añadirá reputación social, publicaciones, reacciones, debates y nuevos círculos de personajes.',
    glyph:'P',
    available:false,
    signals:{public_social_presence:8,trend_exposure:5}
  }
];

export function buildAppNarrativeContext(installed=[]){
  const ids=[...new Set((installed||[]).map(String))];
  const scores={};
  for(const app of APP_STORE_CATALOG){
    if(!ids.includes(app.id))continue;
    for(const [key,value] of Object.entries(app.signals||{}))scores[key]=(scores[key]||0)+Number(value||0);
  }
  return {
    installedApps:ids,
    signals:scores,
    generatedAt:new Date().toISOString(),
    interpretationRule:'Las apps instaladas son decisiones contextuales que habilitan experiencias y señales narrativas. No determinan por sí solas identidad, orientación ni rasgos permanentes.'
  };
}

export function AppStoreGlyph({className=''}) {
  return <div className={'pl-appstore-icon '+className} aria-hidden="true">
    <span className="pl-appstore-a"><i/><i/><i/></span>
  </div>;
}

function CatalogIcon({app}){
  if(app.icon)return <img className="store-app-icon" src={app.icon} alt=""/>;
  return <div className={'store-app-icon generated store-'+app.id}>{app.glyph||app.name.slice(0,1)}</div>;
}

function AppRow({app,installed,pending,onAction,onDetails}){
  return <div className="store-app-row">
    <button className="store-app-main" onClick={()=>onDetails(app)} type="button">
      <CatalogIcon app={app}/>
      <span className="store-app-copy"><b>{app.name}</b><small>{app.description}</small><em>{app.category}</em></span>
    </button>
    <button
      type="button"
      className={'store-get '+(installed?'installed':'')}
      disabled={pending||(!installed&&!app.available)}
      onClick={()=>onAction(app)}
    >
      {pending?'•••':installed?'ABRIR':app.available?'OBTENER':'PRÓX.'}
    </button>
  </div>;
}

export default function PhoneAppStore({installed=[],onInstall,onOpenApp,onClose}){
  const [tab,setTab]=useState('today');
  const [query,setQuery]=useState('');
  const [pending,setPending]=useState('');
  const [detail,setDetail]=useState(null);
  const installedSet=useMemo(()=>new Set((installed||[]).map(String)),[installed]);
  const results=useMemo(()=>{
    const q=query.trim().toLowerCase();
    if(!q)return APP_STORE_CATALOG;
    return APP_STORE_CATALOG.filter(a=>[a.name,a.developer,a.category,a.description].join(' ').toLowerCase().includes(q));
  },[query]);

  async function action(app){
    if(installedSet.has(app.id)){
      if(app.id==='tinder')onOpenApp?.('Tinder');
      else if(app.id==='grindr')onOpenApp?.('Grindr');
      return;
    }
    if(!app.available)return;
    setPending(app.id);
    try{
      await new Promise(r=>setTimeout(r,650));
      await onInstall?.(app.id);
    }finally{
      setPending('');
    }
  }

  return <div className="app-window app-app-store native-window store-shell">
    <div className="store-status"><b>9:41</b><span>● ◔ 100%</span></div>
    <header className="store-topbar">
      <button className="store-back pl-unified-back" onClick={onClose} type="button" aria-label="Volver">‹</button>
      <div><small>APP STORE</small><b>{tab==='today'?'Hoy':tab==='apps'?'Apps':'Buscar'}</b></div>
      <span className="store-avatar">P</span>
    </header>

    <div className="store-scroll">
      {tab==='today'&&<>
        <section className="store-feature">
          <span>NUEVAS EXPERIENCIAS</span>
          <h2>Tu teléfono también cambia tu historia.</h2>
          <p>Instala apps que abren nuevas situaciones, personajes y decisiones para la IA narrativa.</p>
          <div className="store-feature-icons">
            <img src="/phone/tinder.webp" alt=""/>
            <img src="/phone/grindr.webp" alt=""/>
            <AppStoreGlyph/>
          </div>
        </section>
        <section className="store-section">
          <div className="store-section-head"><div><small>PARA TI</small><h3>Descubre nuevas posibilidades</h3></div></div>
          {APP_STORE_CATALOG.filter(a=>a.featured).map(app=><AppRow key={app.id} app={app} installed={installedSet.has(app.id)} pending={pending===app.id} onAction={action} onDetails={setDetail}/>)}
        </section>
        <section className="store-section">
          <div className="store-section-head"><div><small>PRÓXIMAMENTE</small><h3>Más capas para Private Life</h3></div></div>
          {APP_STORE_CATALOG.filter(a=>!a.available).map(app=><AppRow key={app.id} app={app} installed={installedSet.has(app.id)} pending={pending===app.id} onAction={action} onDetails={setDetail}/>)}
        </section>
      </>}

      {tab==='apps'&&<section className="store-section full">
        <div className="store-section-head"><div><small>CATÁLOGO</small><h3>Apps para tu vida</h3></div></div>
        {APP_STORE_CATALOG.map(app=><AppRow key={app.id} app={app} installed={installedSet.has(app.id)} pending={pending===app.id} onAction={action} onDetails={setDetail}/>)}
      </section>}

      {tab==='search'&&<section className="store-search-page">
        <label className="store-search"><span>⌕</span><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Juegos, apps y experiencias"/></label>
        <div className="store-section full">
          <div className="store-section-head"><div><small>{query?'RESULTADOS':'DESCUBRIR'}</small><h3>{query?results.length+' resultados':'Busca en Private Life'}</h3></div></div>
          {results.map(app=><AppRow key={app.id} app={app} installed={installedSet.has(app.id)} pending={pending===app.id} onAction={action} onDetails={setDetail}/>)}
          {!results.length&&<div className="store-empty">No hemos encontrado ninguna app.</div>}
        </div>
      </section>}
    </div>

    <nav className="store-tabs">
      <button className={tab==='today'?'active':''} onClick={()=>setTab('today')} type="button"><span>▣</span><small>Hoy</small></button>
      <button className={tab==='apps'?'active':''} onClick={()=>setTab('apps')} type="button"><span>⌘</span><small>Apps</small></button>
      <button className={tab==='search'?'active':''} onClick={()=>setTab('search')} type="button"><span>⌕</span><small>Buscar</small></button>
    </nav>

    {detail&&<div className="store-detail-backdrop" onClick={()=>setDetail(null)}>
      <article className="store-detail" onClick={e=>e.stopPropagation()}>
        <button className="store-detail-close" onClick={()=>setDetail(null)} type="button">×</button>
        <CatalogIcon app={detail}/>
        <h2>{detail.name}</h2>
        <small>{detail.developer}</small>
        <p>{detail.longDescription}</p>
        <div className="store-detail-meta"><span>{detail.category}</span><span>{detail.available?'Disponible':'Próximamente'}</span></div>
        <button className="store-detail-action" disabled={pending===detail.id||(!installedSet.has(detail.id)&&!detail.available)} onClick={()=>action(detail)} type="button">
          {installedSet.has(detail.id)?'ABRIR':detail.available?'OBTENER':'PRÓXIMAMENTE'}
        </button>
      </article>
    </div>}

    <button className="home-gesture-button" aria-label="Volver al inicio" onClick={onClose}><span/></button>
  </div>;
}
