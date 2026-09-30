'use client';

import { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY='private-life-contacts';
const relationshipTypes=['Amistad','Familiar','Pareja','Expareja','Conocido/a','Compañero/a','Otro'];
const sourceTypes=['Persona real','Personaje IA','Jugador'];
const blank={id:'',name:'',age:'',city:'',relationshipType:'Amistad',relation:'',affection:50,notes:'',conversation:'',photos:[],profile:'',consent:false,test:[],sourceType:'Persona real'};
const test=[
 ['Cuando está con gente que no conoce suele...',['Hablar enseguida','Observar antes de entrar','Esperar a que le hablen','Depende mucho del ambiente']],
 ['Cuando algo le molesta normalmente...',['Lo dice directamente','Lo deja caer','Se lo guarda un tiempo','Se distancia']],
 ['En conversación suele...',['Preguntar mucho','Contar muchas cosas','Escuchar más que hablar','Alternar bastante']],
 ['Con los planes improvisados...',['Se apunta rápido','Le gustan si hay confianza','Prefiere saberlo antes','Suele evitarlos']],
 ['Cuando tiene confianza su humor es...',['Muy presente','Irónico/sarcástico','Suave','No sabría definirlo']],
 ['Si tarda en responder mensajes suele ser porque...',['Está ocupado/a','No mira mucho el móvil','Piensa qué contestar','No lo sé']],
 ['Con personas cercanas suele ser...',['Muy expresivo/a','Cariñoso/a pero reservado/a','Bastante independiente','Variable']],
 ['Ante una discusión...',['Busca resolverla','Necesita espacio','Se pone a la defensiva','Evita el conflicto']],
 ['Cuando conoce a alguien nuevo...',['Muestra curiosidad','Es prudente','Intenta caer bien','Mantiene distancia']],
 ['¿Qué describe mejor su forma de comunicarse?',['Directa','Detallista','Breve','Emocional','Cambiante según la persona']]
];

function testSummary(values){
 const picks=values.map((v,i)=>test[i]?.[1]?.[v]).filter(Boolean);
 return picks.length?`Perfil orientativo basado en lo que conoce el jugador: ${picks.join('; ')}. Esta descripción es una hipótesis editable, no un diagnóstico ni una verdad objetiva sobre la persona.`:'';
}
function normalized(c){
 return {...blank,...c,relationshipType:c.relationshipType||'Amistad',sourceType:c.sourceType||c.kind||(c.isAI?'Personaje IA':c.isUser?'Jugador':'Persona real'),affection:Number.isFinite(Number(c.affection))?Number(c.affection):50,photos:Array.isArray(c.photos)?c.photos:[]};
}
function Avatar({contact,size='normal'}){
 const photo=contact?.photos?.[0];
 return photo?<img className={'nc-avatar '+size} src={photo} alt=""/>:<div className={'nc-avatar nc-initial '+size}>{(contact?.name||'?').trim().charAt(0).toUpperCase()}</div>;
}

export default function ContactsApp({onClose}){
 const [contacts,setContacts]=useState([]);
 const [mode,setMode]=useState('list');
 const [selected,setSelected]=useState(null);
 const [editing,setEditing]=useState(null);
 const [draft,setDraft]=useState(blank);
 const [query,setQuery]=useState('');
 const [testIndex,setTestIndex]=useState(0);

 useEffect(()=>{try{const stored=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');setContacts(Array.isArray(stored)?stored.map(normalized):[])}catch{}},[]);
 function persist(next){setContacts(next);try{localStorage.setItem(STORAGE_KEY,JSON.stringify(next))}catch{}}
 function newContact(){setEditing(null);setDraft({...blank,id:crypto.randomUUID?.()||String(Date.now())});setTestIndex(0);setMode('edit')}
 function editContact(c){setEditing(c.id);setDraft(normalized(c));setTestIndex(0);setMode('edit')}
 function save(){
   if(!draft.name.trim()||Number(draft.age)<18||!draft.consent)return;
   const item={...draft,name:draft.name.trim(),affection:Math.max(0,Math.min(100,Number(draft.affection)||0)),profile:draft.profile.trim()||testSummary(draft.test),updatedAt:new Date().toISOString()};
   const next=editing?contacts.map(c=>c.id===editing?item:c):[...contacts,item];
   persist(next);setSelected(item);setMode('detail');
 }
 function remove(id){if(!confirm('¿Eliminar este contacto de PRIVATE LIFE?'))return;persist(contacts.filter(c=>c.id!==id));setSelected(null);setMode('list')}
 function photo(file){if(!file)return;const r=new FileReader();r.onload=()=>{const img=new Image();img.onload=()=>{const c=document.createElement('canvas'),max=600,s=Math.min(1,max/Math.max(img.width,img.height));c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);c.getContext('2d').drawImage(img,0,0,c.width,c.height);setDraft(d=>({...d,photos:[...d.photos,c.toDataURL('image/jpeg',.72)].slice(0,5)}))};img.src=r.result};r.readAsDataURL(file)}
 function history(file){if(!file)return;const r=new FileReader();r.onload=()=>setDraft(d=>({...d,conversation:String(r.result).slice(0,60000)}));r.readAsText(file)}
 function answer(n){const a=[...draft.test];a[testIndex]=n;setDraft(d=>({...d,test:a}));if(testIndex<test.length-1)setTestIndex(testIndex+1);else{setDraft(d=>({...d,test:a,profile:d.profile||testSummary(a)}));setMode('edit')}}
 const ready=useMemo(()=>draft.name.trim()&&Number(draft.age)>=18&&draft.consent,[draft]);
 const filtered=useMemo(()=>contacts.filter(c=>!query.trim()||[c.name,c.city,c.relationshipType,c.sourceType].join(' ').toLowerCase().includes(query.trim().toLowerCase())).sort((a,b)=>a.name.localeCompare(b.name,'es')),[contacts,query]);

 if(mode==='test'){
   const q=test[testIndex];
   return <div className="native-contacts">
     <NativeBar left="‹" onLeft={()=>setMode('edit')} title="Test básico"/>
     <div className="nc-scroll nc-test"><div className="nc-step">{testIndex+1} de {test.length}</div><h2>{q[0]}</h2><p>Responde según lo que tú hayas observado. No intenta diagnosticar a la persona.</p><div className="nc-answers">{q[1].map((a,i)=><button key={a} onClick={()=>answer(i)}>{a}</button>)}</div></div>
   </div>;
 }

 if(mode==='edit'){
   return <div className="native-contacts">
     <NativeBar left="Cancelar" onLeft={()=>editing?(setSelected(contacts.find(c=>c.id===editing)||null),setMode('detail')):setMode('list')} title={editing?'Editar':'Nuevo contacto'} right="Guardar" onRight={save} rightDisabled={!ready}/>
     <div className="nc-scroll nc-editor">
       <section className="nc-photo-editor"><Avatar contact={draft} size="hero"/><label className="nc-change-photo">Añadir foto<input type="file" accept="image/*" onChange={e=>photo(e.target.files?.[0])}/></label></section>
       <Group title="Información">
         <Field label="Nombre" value={draft.name} set={v=>setDraft({...draft,name:v})}/>
         <Field label="Edad" type="number" value={draft.age} set={v=>setDraft({...draft,age:v})}/>
         <Field label="Ciudad" value={draft.city} set={v=>setDraft({...draft,city:v})}/>
         <Select label="Tipo" value={draft.sourceType} set={v=>setDraft({...draft,sourceType:v})} options={sourceTypes}/>
       </Group>
       <Group title="Relación">
         <Select label="Relación" value={draft.relationshipType} set={v=>setDraft({...draft,relationshipType:v})} options={relationshipTypes}/>
         <Field label="Detalle" value={draft.relation} set={v=>setDraft({...draft,relation:v})}/>
         <div className="nc-range-row"><div><span>Afecto inicial</span><b>{draft.affection}%</b></div><input type="range" min="0" max="100" value={draft.affection} onChange={e=>setDraft({...draft,affection:Number(e.target.value)})}/></div>
       </Group>
       <Group title="Fotos">
         <div className="nc-photo-grid">{draft.photos.map((p,i)=><div className="nc-photo-thumb" key={i}><img src={p} alt=""/><button onClick={()=>setDraft({...draft,photos:draft.photos.filter((_,x)=>x!==i)})}>×</button></div>)}<label className="nc-add-thumb">+<input type="file" accept="image/*" onChange={e=>photo(e.target.files?.[0])}/></label></div>
       </Group>
       <Group title="Conversación">
         <textarea className="nc-textarea large" value={draft.conversation} onChange={e=>setDraft({...draft,conversation:e.target.value.slice(0,60000)})} placeholder="Pega aquí una conversación exportada..."/>
         <label className="nc-import">Importar TXT / MD<input type="file" accept=".txt,.md,text/plain" onChange={e=>history(e.target.files?.[0])}/></label>
         <small className="nc-count">{draft.conversation.length.toLocaleString()} / 60.000</small>
       </Group>
       <Group title="Ficha del personaje">
         <textarea className="nc-textarea" value={draft.profile} onChange={e=>setDraft({...draft,profile:e.target.value})} placeholder="Personalidad, forma de hablar, gustos, costumbres, límites, relación contigo..."/>
         <button className="nc-action-row" onClick={()=>{setTestIndex(0);setMode('test')}}>Hacer test básico <span>›</span></button>
         <textarea className="nc-textarea small" value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})} placeholder="Notas privadas..."/>
       </Group>
       <label className="nc-consent"><input type="checkbox" checked={draft.consent} onChange={e=>setDraft({...draft,consent:e.target.checked})}/><span>Confirmo que tengo permiso para usar aquí las fotos y conversaciones que estoy aportando.</span></label>
       {Number(draft.age)>0&&Number(draft.age)<18&&<div className="nc-warning">PRIVATE LIFE solo permite personajes adultos de 18 años o más.</div>}
       <div className="nc-bottom-space"/>
     </div>
   </div>;
 }

 if(mode==='detail'&&selected){
   const c=contacts.find(x=>x.id===selected.id)||selected;
   return <div className="native-contacts">
     <NativeBar left="‹ Contactos" onLeft={()=>setMode('list')} title="" right="Editar" onRight={()=>editContact(c)}/>
     <div className="nc-scroll nc-detail">
       <div className="nc-contact-hero"><Avatar contact={c} size="hero"/><h2>{c.name}</h2><p>{[c.city,c.age?c.age+' años':''].filter(Boolean).join(' · ')}</p><span className="nc-source-badge">{c.sourceType||'Persona real'}</span></div>
       <div className="nc-quick-actions"><button><i>✉</i><span>mensaje</span></button><button><i>☎</i><span>llamar</span></button><button><i>☆</i><span>favorito</span></button></div>
       <Group>
         <Info label="Relación" value={c.relationshipType}/>
         {c.relation&&<Info label="Detalle" value={c.relation}/>}
         <Info label="Afecto inicial" value={(Number(c.affection)||0)+'%'}/>
       </Group>
       {c.profile&&<Group title="Ficha"><p className="nc-profile-text">{c.profile}</p></Group>}
       {c.notes&&<Group title="Notas"><p className="nc-profile-text">{c.notes}</p></Group>}
       <button className="nc-delete" onClick={()=>remove(c.id)}>Eliminar contacto</button>
       <div className="nc-bottom-space"/>
     </div>
   </div>;
 }

 return <div className="native-contacts">
   <NativeBar left="‹" onLeft={onClose} title="Contactos" right="+" onRight={newContact}/>
   <div className="nc-scroll nc-list-screen">
     <h1>Contactos</h1>
     <div className="nc-search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar"/></div>
     <div className="nc-owner-card"><div className="nc-owner-avatar">YO</div><div><b>Mi tarjeta</b><span>Tu perfil de Private Life</span></div></div>
     <div className="nc-list-title">CONTACTOS</div>
     {!filtered.length?<div className="nc-empty"><div className="nc-empty-icon">☷</div><b>Tu agenda está vacía</b><span>Pulsa + para crear tu primer contacto.</span></div>:<div className="nc-contact-list">{filtered.map(c=><button key={c.id} className="nc-contact-row" onClick={()=>{setSelected(c);setMode('detail')}}><Avatar contact={c}/><div><b>{c.name}</b><span>{c.sourceType||'Persona real'}{c.relationshipType?' · '+c.relationshipType:''}</span></div><em>›</em></button>)}</div>}
     <div className="nc-bottom-space"/>
   </div>
 </div>;
}

function NativeBar({left,onLeft,title,right,onRight,rightDisabled=false}){
 const backOnly=left==='‹',addOnly=right==='+';
 return <div className="nc-nav">
   <button className={'nc-nav-left '+(backOnly?'nc-nav-icon nc-nav-back':'nc-nav-text')} aria-label={backOnly?'Volver':left||'Volver'} onClick={onLeft}>{backOnly?<span aria-hidden="true">‹</span>:left}</button>
   <b>{title}</b>
   <button className={'nc-nav-right '+(addOnly?'nc-nav-icon nc-nav-add':'nc-nav-text')} aria-label={addOnly?'Añadir contacto':right||''} disabled={rightDisabled} onClick={onRight}>{addOnly?<span aria-hidden="true">+</span>:right}</button>
 </div>
}
function Group({title,children}){return <section className="nc-group-wrap">{title&&<div className="nc-group-title">{title}</div>}<div className="nc-group">{children}</div></section>}
function Field({label,value,set,type='text'}){return <label className="nc-field"><span>{label}</span><input type={type} value={value} onChange={e=>set(e.target.value)}/></label>}
function Select({label,value,set,options}){return <label className="nc-field"><span>{label}</span><select value={value} onChange={e=>set(e.target.value)}>{options.map(x=><option key={x}>{x}</option>)}</select></label>}
function Info({label,value}){return <div className="nc-info"><span>{label}</span><b>{value}</b></div>}
