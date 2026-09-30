'use client';

import { useEffect, useMemo, useState } from 'react';

const CONTACTS_KEY='private-life-contacts';

const DEFAULT_CONFIG={
  identity:{
    gender:'',pronouns:'',city:'',occupation:'',role:'',education:'',languages:'Español',
    relationshipStatus:'',orientation:'',bio:'',backstory:''
  },
  appearance:{
    height:'',bodyType:'',hair:'',eyes:'',style:'',voice:'',distinctiveFeatures:'',
    presence:50,grooming:50,expressiveness:50
  },
  personality:{
    extraversion:50,agreeableness:55,conscientiousness:55,openness:55,empathy:60,
    confidence:50,assertiveness:50,impulsivity:35,patience:55,honesty:65,curiosity:60,
    humor:50,warmth:55,optimism:50,ambition:50,stubbornness:40,jealousy:25,possessiveness:15
  },
  communication:{
    register:'Natural',verbosity:50,directness:55,humorStyle:'Situacional',emojiUse:25,
    slang:30,formality:35,responseSpeed:55,questionFrequency:45,voiceNotes:20,
    catchphrases:'',speechNotes:'',topicsLiked:'',topicsAvoided:''
  },
  emotions:{
    baselineMood:'Estable',volatility:35,sensitivity:45,forgiveness:60,resentment:20,
    emotionalMemory:60,selfControl:65,stressTolerance:55,needForValidation:35,
    conflictStyle:'Habla y busca resolver'
  },
  autonomy:{
    autonomy:65,initiative:50,proactivity:50,spontaneity:45,riskTaking:30,
    canStartConversations:true,canMakePlans:true,canChangeOpinion:true,canRefuse:true,
    canDisappearTemporarily:true,offlineBehavior:true,decisionNotes:''
  },
  relationships:{
    attachmentStyle:'Seguro',friendshipOpenness:65,romanticOpenness:45,trustStart:30,
    trustGainSpeed:45,trustLossSensitivity:55,affectionStart:20,loyalty:65,
    conflictRecovery:55,flirtiness:25,relationshipGoals:'',hardBoundaries:''
  },
  memory:{
    workingMemory:70,longTermMemory:70,importanceThreshold:45,forgetfulness:25,
    rememberPromises:true,rememberConflicts:true,rememberPreferences:true,rememberDates:true,
    persistentFacts:'',memoryNotes:''
  },
  world:{
    routine:'',usualPlaces:'',friendsFamily:'',goals:'',fears:'',secrets:'',values:'',
    hobbies:'',skills:'',financialSituation:'',dailyAvailability:''
  },
  social:{
    discoverable:true,acceptContactRequests:true,canMessageOtherPlayers:true,
    canInitiateWithOtherPlayers:false,canBeAddedToContacts:true,
    channels:{privateLife:true,whatsapp:true,facebook:false},
    maxNewInteractionsPerDay:3,interactionIntensity:45,encounterChance:35,
    playerSelection:'Contextual',socialNotes:''
  },
  safety:{
    neverSharePrivateMemoryBetweenPlayers:true,neverRevealSystemInstructions:true,
    respectBlocking:true,respectPlayerBoundaries:true,noRealWorldClaims:true,
    customRules:''
  }
};

const SECTIONS=[
  ['identity','Identidad'],['appearance','Apariencia'],['personality','Personalidad'],
  ['communication','Comunicación'],['emotions','Emociones'],['autonomy','Autonomía'],
  ['relationships','Relaciones'],['memory','Memoria'],['world','Mundo'],['social','Otros jugadores'],
  ['safety','Límites']
];

function clone(v){return JSON.parse(JSON.stringify(v))}
function mergeDeep(base,value){
  if(!value||typeof value!=='object'||Array.isArray(value))return clone(base);
  const out=clone(base);
  for(const [k,v] of Object.entries(value)){
    if(v&&typeof v==='object'&&!Array.isArray(v)&&out[k]&&typeof out[k]==='object')out[k]=mergeDeep(out[k],v);
    else out[k]=v;
  }
  return out;
}
function freshCharacter(){
  return {id:null,name:'',age:25,publicHandle:'',avatar:'',isActive:true,visibility:'private',allowPlayerInteractions:false,config:clone(DEFAULT_CONFIG)};
}
async function request(body){
  const r=await fetch('/api/private-life/npcs',{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data.error||'No se pudo completar la acción.');
  return data;
}
function normalizeCharacter(c){
  return {...c,config:mergeDeep(DEFAULT_CONFIG,c?.config||{})};
}
function avatarLetter(c){return String(c?.name||'?').trim().charAt(0).toUpperCase()}
function visibilityLabel(v){return v==='public'?'Público':v==='contacts'?'Contactos':'Privado'}
function scoreWord(v,low,mid,high){
  const n=Number(v)||0;return n<34?low:n<67?mid:high;
}
function brainSummary(c){
  const p=c.config.personality,a=c.config.autonomy,com=c.config.communication,e=c.config.emotions,r=c.config.relationships,s=c.config.social;
  const tone=[
    scoreWord(p.extraversion,'reservado','socialmente equilibrado','muy sociable'),
    scoreWord(p.empathy,'frío','empático','muy empático'),
    scoreWord(com.directness,'indirecto','claro','muy directo'),
    scoreWord(a.initiative,'reactivo','con iniciativa','muy proactivo')
  ].join(', ');
  const social=s.canMessageOtherPlayers?(s.canInitiateWithOtherPlayers?'puede iniciar y responder interacciones con otros jugadores':'puede responder a otros jugadores, pero normalmente no inicia'):'no interactúa directamente con otros jugadores';
  const emotional=scoreWord(e.volatility,'emocionalmente estable','emocionalmente variable','muy reactivo emocionalmente');
  const relation=scoreWord(r.trustGainSpeed,'tarda en confiar','gana confianza de forma gradual','confía con relativa rapidez');
  return `${c.name||'Este personaje'} será ${tone}. Es ${emotional}, ${relation} y ${social}.`;
}
function contradictions(c){
  const p=c.config.personality,a=c.config.autonomy,s=c.config.social,r=c.config.relationships;
  const x=[];
  if(p.extraversion<25&&a.initiative>80)x.push('Muy introvertido pero con iniciativa extremadamente alta.');
  if(a.autonomy<25&&a.canMakePlans)x.push('Autonomía muy baja pero permiso para crear planes por sí mismo.');
  if(!s.canMessageOtherPlayers&&s.canInitiateWithOtherPlayers)x.push('No puede mensajear a jugadores pero tiene activada la iniciativa hacia ellos.');
  if(r.trustStart>80&&r.trustGainSpeed<20)x.push('Empieza confiando mucho aunque su configuración indica que le cuesta ganar confianza.');
  if(p.honesty>85&&c.config.world.secrets.trim())x.push('Honestidad extrema combinada con secretos importantes: define cuándo los protege.');
  return x;
}

export default function PrivateLifeApp({onClose}){
  const [characters,setCharacters]=useState([]);
  const [selected,setSelected]=useState(null);
  const [section,setSection]=useState('identity');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [toast,setToast]=useState('');
  const [confirmDelete,setConfirmDelete]=useState(false);

  async function load(){
    try{
      setLoading(true);
      const data=await request();
      const list=(data.characters||[]).map(normalizeCharacter);
      setCharacters(list);
      if(selected?.id){
        const updated=list.find(x=>x.id===selected.id);
        if(updated)setSelected(updated);
      }
    }catch(e){setToast(e.message)}
    finally{setLoading(false)}
  }
  useEffect(()=>{load()},[]);
  useEffect(()=>{if(!toast)return;const id=setTimeout(()=>setToast(''),2600);return()=>clearTimeout(id)},[toast]);

  function patch(path,value){
    setSelected(prev=>{
      const next=clone(prev||freshCharacter());
      let ref=next;
      for(let i=0;i<path.length-1;i++)ref=ref[path[i]];
      ref[path[path.length-1]]=value;
      return next;
    });
  }
  function startNew(){setSelected(freshCharacter());setSection('identity');setConfirmDelete(false)}
  async function save(){
    if(!selected?.name?.trim()){setToast('Ponle un nombre al personaje.');return}
    setSaving(true);
    try{
      const payload={
        action:selected.id?'update':'create',id:selected.id,name:selected.name,age:selected.age,
        publicHandle:selected.publicHandle,avatar:selected.avatar,isActive:selected.isActive,
        visibility:selected.visibility,allowPlayerInteractions:selected.allowPlayerInteractions,
        config:selected.config
      };
      const data=await request(payload);
      const saved=normalizeCharacter(data.character);
      setSelected(saved);
      setCharacters(list=>{
        const exists=list.some(x=>x.id===saved.id);
        return exists?list.map(x=>x.id===saved.id?saved:x):[saved,...list];
      });
      setToast('Personaje guardado.');
    }catch(e){setToast(e.message)}
    finally{setSaving(false)}
  }
  async function duplicate(){
    if(!selected?.id)return;
    setSaving(true);
    try{
      const data=await request({action:'duplicate',id:selected.id});
      const copy=normalizeCharacter(data.character);
      setCharacters(x=>[copy,...x]);setSelected(copy);setToast('Copia creada.');
    }catch(e){setToast(e.message)}
    finally{setSaving(false)}
  }
  async function remove(){
    if(!selected?.id){setSelected(null);return}
    setSaving(true);
    try{
      await request({action:'delete',id:selected.id});
      setCharacters(x=>x.filter(y=>y.id!==selected.id));setSelected(null);setConfirmDelete(false);setToast('Personaje eliminado.');
    }catch(e){setToast(e.message)}
    finally{setSaving(false)}
  }
  function addToContacts(){
    if(!selected?.id){setToast('Guarda primero el personaje.');return}
    try{
      const raw=JSON.parse(localStorage.getItem(CONTACTS_KEY)||'[]');
      const list=Array.isArray(raw)?raw:[];
      const key='npc-'+selected.id;
      const index=list.findIndex(c=>String(c.npcId||'')===String(selected.id));
      const item={
        ...(index>=0?list[index]:{}),
        id:index>=0?list[index].id:key,npcId:selected.id,name:selected.name,age:selected.age,
        city:selected.config.identity.city||'',relationshipType:'Conocido',relation:selected.config.identity.role||'Personaje del mundo',
        affection:index>=0?(list[index].affection??35):35,notes:index>=0?(list[index].notes||''):'',
        conversation:index>=0?(list[index].conversation||''):'',photos:selected.avatar?[selected.avatar]:[],
        profile:selected.config.identity.occupation||'',consent:true,hideSourceType:true,
        npcConfigSnapshot:selected.config,updatedAt:new Date().toISOString()
      };
      const next=index>=0?list.map((c,i)=>i===index?item:c):[...list,item];
      localStorage.setItem(CONTACTS_KEY,JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('private-life:contacts-changed',{detail:{npcId:selected.id}}));
      setToast(index>=0?'Contacto actualizado.':'Añadido a Contactos.');
    }catch{setToast('No se pudo añadir a Contactos.')}
  }

  return <div className="plai-app">
    <header className="plai-header">
      <button className="plai-back" onClick={onClose}>‹</button>
      <div><b>Private Life</b><span>Personajes IA</span></div>
      <button className="plai-add" onClick={startNew}>＋</button>
    </header>

    {!selected?<CharacterList loading={loading} characters={characters} onOpen={setSelected} onNew={startNew}/>:<>
      <div className="plai-editor-head">
        <button className="plai-mini-back" onClick={()=>setSelected(null)}>‹ Personajes</button>
        <div className="plai-editor-actions">
          {selected.id&&<button onClick={duplicate} disabled={saving}>Duplicar</button>}
          <button className="primary" onClick={save} disabled={saving}>{saving?'Guardando…':'Guardar'}</button>
        </div>
      </div>

      <div className="plai-character-hero">
        <div className="plai-avatar">
          {selected.avatar?<img src={selected.avatar} alt=""/>:<span>{avatarLetter(selected)}</span>}
        </div>
        <div className="plai-hero-copy">
          <input className="plai-name-input" value={selected.name} maxLength={80} onChange={e=>patch(['name'],e.target.value)} placeholder="Nombre del personaje"/>
          <div className="plai-meta-row">
            <label>Edad <input type="number" min="18" max="120" value={selected.age} onChange={e=>patch(['age'],Math.max(18,Number(e.target.value)||18))}/></label>
            <span className={'plai-status '+(selected.isActive?'on':'off')}>{selected.isActive?'Activo':'Pausado'}</span>
          </div>
        </div>
      </div>

      <div className="plai-quick-controls">
        <label><span>Visibilidad</span><select value={selected.visibility} onChange={e=>patch(['visibility'],e.target.value)}><option value="private">Privado</option><option value="contacts">Contactos</option><option value="public">Público</option></select></label>
        <label className="plai-switch-line"><span>Interactuar con otros jugadores</span><input type="checkbox" checked={selected.allowPlayerInteractions} onChange={e=>patch(['allowPlayerInteractions'],e.target.checked)}/></label>
      </div>

      <nav className="plai-section-tabs">
        {SECTIONS.map(([id,label])=><button key={id} className={section===id?'active':''} onClick={()=>setSection(id)}>{label}</button>)}
      </nav>

      <div className="plai-editor-scroll">
        {section==='identity'&&<IdentitySection c={selected} patch={patch}/>}
        {section==='appearance'&&<AppearanceSection c={selected} patch={patch}/>}
        {section==='personality'&&<PersonalitySection c={selected} patch={patch}/>}
        {section==='communication'&&<CommunicationSection c={selected} patch={patch}/>}
        {section==='emotions'&&<EmotionsSection c={selected} patch={patch}/>}
        {section==='autonomy'&&<AutonomySection c={selected} patch={patch}/>}
        {section==='relationships'&&<RelationshipsSection c={selected} patch={patch}/>}
        {section==='memory'&&<MemorySection c={selected} patch={patch}/>}
        {section==='world'&&<WorldSection c={selected} patch={patch}/>}
        {section==='social'&&<SocialSection c={selected} patch={patch}/>}
        {section==='safety'&&<SafetySection c={selected} patch={patch}/>}

        <BrainCard character={selected}/>

        <div className="plai-bottom-actions">
          <button onClick={addToContacts}>Añadir a Contactos</button>
          {selected.id&&<button className="danger" onClick={()=>setConfirmDelete(true)}>Eliminar personaje</button>}
        </div>
      </div>

      {confirmDelete&&<div className="plai-modal"><div><h3>Eliminar a {selected.name}</h3><p>Se borrará su ficha y el estado relacional almacenado en el servidor.</p><div><button onClick={()=>setConfirmDelete(false)}>Cancelar</button><button className="danger" onClick={remove}>Eliminar</button></div></div></div>}
    </>}

    {toast&&<div className="plai-toast">{toast}</div>}
  </div>;
}

function CharacterList({loading,characters,onOpen,onNew}){
  if(loading)return <div className="plai-loading"><i/><span>Cargando personajes…</span></div>;
  return <main className="plai-list">
    <div className="plai-list-intro"><h1>Tus personajes</h1><p>Crea IAs persistentes que formen parte del mundo y evolucionen con cada relación.</p><button onClick={onNew}>＋ Crear personaje</button></div>
    {characters.length?<div className="plai-cards">{characters.map(c=><button className="plai-character-card" key={c.id} onClick={()=>onOpen(c)}>
      <div className="plai-card-avatar">{c.avatar?<img src={c.avatar} alt=""/>:<span>{avatarLetter(c)}</span>}</div>
      <div><b>{c.name}</b><span>{c.age} años · {visibilityLabel(c.visibility)}</span><small>{c.allowPlayerInteractions?'Puede interactuar con jugadores':'Interacción con jugadores desactivada'}</small></div>
      <i className={c.isActive?'on':''}/>
    </button>)}</div>:<div className="plai-empty"><b>Aún no has creado personajes</b><span>Empieza con uno y afina su comportamiento hasta que tenga voz propia.</span></div>}
  </main>;
}

function Group({title,description,children}){
  return <section className="plai-group"><div className="plai-group-title"><h3>{title}</h3>{description&&<p>{description}</p>}</div>{children}</section>;
}
function Field({label,value,onChange,placeholder='',type='text',wide=false}){
  return <label className={'plai-field '+(wide?'wide':'')}><span>{label}</span><input type={type} value={value??''} placeholder={placeholder} onChange={e=>onChange(type==='number'?Number(e.target.value):e.target.value)}/></label>;
}
function TextArea({label,value,onChange,placeholder='',rows=3}){
  return <label className="plai-field wide"><span>{label}</span><textarea rows={rows} value={value??''} placeholder={placeholder} onChange={e=>onChange(e.target.value)}/></label>;
}
function Select({label,value,onChange,options}){
  return <label className="plai-field"><span>{label}</span><select value={value??''} onChange={e=>onChange(e.target.value)}>{options.map(x=><option key={x} value={x}>{x||'Sin definir'}</option>)}</select></label>;
}
function Slider({label,value,onChange,left='Bajo',right='Alto'}){
  return <label className="plai-slider"><div><span>{label}</span><b>{value}</b></div><input type="range" min="0" max="100" value={value} onChange={e=>onChange(Number(e.target.value))}/><small><span>{left}</span><span>{right}</span></small></label>;
}
function Toggle({label,checked,onChange,description=''}){
  return <label className="plai-toggle"><div><b>{label}</b>{description&&<span>{description}</span>}</div><input type="checkbox" checked={!!checked} onChange={e=>onChange(e.target.checked)}/></label>;
}

function IdentitySection({c,patch}){const x=c.config.identity;return <>
  <Group title="Identidad pública" description="Quién es el personaje dentro del mundo.">
    <div className="plai-form-grid">
      <Field label="Usuario público" value={c.publicHandle} onChange={v=>patch(['publicHandle'],v)} placeholder="@nombre"/>
      <Field label="Foto / URL de avatar" value={c.avatar} onChange={v=>patch(['avatar'],v)} placeholder="https://…"/>
      <Field label="Género" value={x.gender} onChange={v=>patch(['config','identity','gender'],v)}/>
      <Field label="Pronombres" value={x.pronouns} onChange={v=>patch(['config','identity','pronouns'],v)}/>
      <Field label="Ciudad" value={x.city} onChange={v=>patch(['config','identity','city'],v)}/>
      <Field label="Ocupación" value={x.occupation} onChange={v=>patch(['config','identity','occupation'],v)}/>
      <Field label="Rol en el mundo" value={x.role} onChange={v=>patch(['config','identity','role'],v)} placeholder="Vecina, camarero, DJ…"/>
      <Field label="Estudios" value={x.education} onChange={v=>patch(['config','identity','education'],v)}/>
      <Field label="Idiomas" value={x.languages} onChange={v=>patch(['config','identity','languages'],v)}/>
      <Field label="Estado sentimental" value={x.relationshipStatus} onChange={v=>patch(['config','identity','relationshipStatus'],v)}/>
      <Field label="Orientación" value={x.orientation} onChange={v=>patch(['config','identity','orientation'],v)}/>
    </div>
  </Group>
  <Group title="Biografía">
    <TextArea label="Presentación breve" value={x.bio} onChange={v=>patch(['config','identity','bio'],v)} placeholder="Cómo se describiría a sí mismo…"/>
    <TextArea label="Historia personal" rows={6} value={x.backstory} onChange={v=>patch(['config','identity','backstory'],v)} placeholder="Familia, infancia, experiencias, cambios importantes…"/>
  </Group>
</>}

function AppearanceSection({c,patch}){const x=c.config.appearance;return <>
  <Group title="Apariencia física">
    <div className="plai-form-grid">
      <Field label="Altura" value={x.height} onChange={v=>patch(['config','appearance','height'],v)} placeholder="175 cm"/>
      <Field label="Constitución" value={x.bodyType} onChange={v=>patch(['config','appearance','bodyType'],v)}/>
      <Field label="Pelo" value={x.hair} onChange={v=>patch(['config','appearance','hair'],v)}/>
      <Field label="Ojos" value={x.eyes} onChange={v=>patch(['config','appearance','eyes'],v)}/>
      <Field label="Estilo de vestir" value={x.style} onChange={v=>patch(['config','appearance','style'],v)}/>
      <Field label="Voz" value={x.voice} onChange={v=>patch(['config','appearance','voice'],v)}/>
    </div>
    <TextArea label="Rasgos distintivos" value={x.distinctiveFeatures} onChange={v=>patch(['config','appearance','distinctiveFeatures'],v)} placeholder="Tatuajes, cicatrices, gestos, forma de caminar…"/>
  </Group>
  <Group title="Presencia">
    <Slider label="Presencia social" value={x.presence} onChange={v=>patch(['config','appearance','presence'],v)} left="Pasa desapercibido" right="Llena la habitación"/>
    <Slider label="Cuidado personal" value={x.grooming} onChange={v=>patch(['config','appearance','grooming'],v)} left="Descuidado" right="Muy cuidado"/>
    <Slider label="Expresividad corporal" value={x.expressiveness} onChange={v=>patch(['config','appearance','expressiveness'],v)} left="Contenido" right="Muy expresivo"/>
  </Group>
</>}

function PersonalitySection({c,patch}){const x=c.config.personality;const labels=[
 ['extraversion','Extraversión','Introvertido','Extrovertido'],['agreeableness','Amabilidad','Duro','Afable'],['conscientiousness','Responsabilidad','Improvisa','Metódico'],
 ['openness','Apertura','Convencional','Explorador'],['empathy','Empatía','Distante','Muy empático'],['confidence','Seguridad','Inseguro','Muy seguro'],
 ['assertiveness','Asertividad','Cede','Se posiciona'],['impulsivity','Impulsividad','Reflexivo','Impulsivo'],['patience','Paciencia','Impaciente','Paciente'],
 ['honesty','Honestidad','Oculta mucho','Muy transparente'],['curiosity','Curiosidad','Poco curioso','Muy curioso'],['humor','Humor','Serio','Bromista'],
 ['warmth','Calidez','Frío','Cálido'],['optimism','Optimismo','Pesimista','Optimista'],['ambition','Ambición','Conformista','Ambicioso'],
 ['stubbornness','Terquedad','Flexible','Muy terco'],['jealousy','Celos','Nada celoso','Muy celoso'],['possessiveness','Posesividad','Nada posesivo','Muy posesivo']
];return <Group title="Matriz de personalidad" description="Estos rasgos deben afectar decisiones, interpretación y conversación.">{labels.map(([k,l,a,b])=><Slider key={k} label={l} value={x[k]} onChange={v=>patch(['config','personality',k],v)} left={a} right={b}/>)}</Group>}

function CommunicationSection({c,patch}){const x=c.config.communication;return <>
  <Group title="Voz del personaje">
    <div className="plai-form-grid">
      <Select label="Registro" value={x.register} onChange={v=>patch(['config','communication','register'],v)} options={['Natural','Coloquial','Formal','Muy informal','Poético','Seco','Elegante']}/>
      <Select label="Humor" value={x.humorStyle} onChange={v=>patch(['config','communication','humorStyle'],v)} options={['Situacional','Irónico','Negro','Absurdo','Seco','Tierno','Casi nunca']}/>
    </div>
    <Slider label="Cantidad de texto" value={x.verbosity} onChange={v=>patch(['config','communication','verbosity'],v)} left="Muy breve" right="Muy detallado"/>
    <Slider label="Directo al hablar" value={x.directness} onChange={v=>patch(['config','communication','directness'],v)} left="Insinúa" right="Va al grano"/>
    <Slider label="Uso de emojis" value={x.emojiUse} onChange={v=>patch(['config','communication','emojiUse'],v)} left="Nunca" right="Muchísimos"/>
    <Slider label="Jerga / slang" value={x.slang} onChange={v=>patch(['config','communication','slang'],v)} left="Neutro" right="Muy callejero"/>
    <Slider label="Formalidad" value={x.formality} onChange={v=>patch(['config','communication','formality'],v)} left="Casual" right="Formal"/>
    <Slider label="Velocidad de respuesta" value={x.responseSpeed} onChange={v=>patch(['config','communication','responseSpeed'],v)} left="Tarda" right="Contesta rápido"/>
    <Slider label="Hace preguntas" value={x.questionFrequency} onChange={v=>patch(['config','communication','questionFrequency'],v)} left="Pocas" right="Muchas"/>
    <Slider label="Preferencia por notas de voz" value={x.voiceNotes} onChange={v=>patch(['config','communication','voiceNotes'],v)} left="Texto" right="Audios"/>
    <TextArea label="Muletillas / expresiones propias" value={x.catchphrases} onChange={v=>patch(['config','communication','catchphrases'],v)}/>
    <TextArea label="Indicaciones de habla" value={x.speechNotes} onChange={v=>patch(['config','communication','speechNotes'],v)} placeholder="Acento, ritmo, palabras que evita, errores habituales…"/>
    <TextArea label="Temas que disfruta" value={x.topicsLiked} onChange={v=>patch(['config','communication','topicsLiked'],v)}/>
    <TextArea label="Temas que evita" value={x.topicsAvoided} onChange={v=>patch(['config','communication','topicsAvoided'],v)}/>
  </Group>
</>}

function EmotionsSection({c,patch}){const x=c.config.emotions;return <Group title="Motor emocional">
  <Select label="Estado de ánimo base" value={x.baselineMood} onChange={v=>patch(['config','emotions','baselineMood'],v)} options={['Estable','Alegre','Melancólico','Ansioso','Irritable','Entusiasta','Sereno']}/>
  <Select label="Estilo ante conflicto" value={x.conflictStyle} onChange={v=>patch(['config','emotions','conflictStyle'],v)} options={['Habla y busca resolver','Evita el conflicto','Confronta directamente','Necesita tiempo','Ironiza','Se cierra']}/>
  <Slider label="Volatilidad" value={x.volatility} onChange={v=>patch(['config','emotions','volatility'],v)} left="Muy estable" right="Muy cambiante"/>
  <Slider label="Sensibilidad" value={x.sensitivity} onChange={v=>patch(['config','emotions','sensitivity'],v)} left="Piel dura" right="Muy sensible"/>
  <Slider label="Capacidad de perdonar" value={x.forgiveness} onChange={v=>patch(['config','emotions','forgiveness'],v)}/>
  <Slider label="Rencor" value={x.resentment} onChange={v=>patch(['config','emotions','resentment'],v)}/>
  <Slider label="Memoria emocional" value={x.emotionalMemory} onChange={v=>patch(['config','emotions','emotionalMemory'],v)}/>
  <Slider label="Autocontrol" value={x.selfControl} onChange={v=>patch(['config','emotions','selfControl'],v)}/>
  <Slider label="Tolerancia al estrés" value={x.stressTolerance} onChange={v=>patch(['config','emotions','stressTolerance'],v)}/>
  <Slider label="Necesidad de validación" value={x.needForValidation} onChange={v=>patch(['config','emotions','needForValidation'],v)}/>
</Group>}

function AutonomySection({c,patch}){const x=c.config.autonomy;return <Group title="Autonomía real" description="Cuánto puede actuar sin que el jugador o el creador le dicten cada movimiento.">
  <Slider label="Autonomía" value={x.autonomy} onChange={v=>patch(['config','autonomy','autonomy'],v)} left="Muy guiado" right="Muy autónomo"/>
  <Slider label="Iniciativa" value={x.initiative} onChange={v=>patch(['config','autonomy','initiative'],v)}/>
  <Slider label="Proactividad" value={x.proactivity} onChange={v=>patch(['config','autonomy','proactivity'],v)}/>
  <Slider label="Espontaneidad" value={x.spontaneity} onChange={v=>patch(['config','autonomy','spontaneity'],v)}/>
  <Slider label="Asunción de riesgos" value={x.riskTaking} onChange={v=>patch(['config','autonomy','riskTaking'],v)}/>
  <Toggle label="Puede iniciar conversaciones" checked={x.canStartConversations} onChange={v=>patch(['config','autonomy','canStartConversations'],v)}/>
  <Toggle label="Puede proponer planes" checked={x.canMakePlans} onChange={v=>patch(['config','autonomy','canMakePlans'],v)}/>
  <Toggle label="Puede cambiar de opinión" checked={x.canChangeOpinion} onChange={v=>patch(['config','autonomy','canChangeOpinion'],v)}/>
  <Toggle label="Puede negarse" checked={x.canRefuse} onChange={v=>patch(['config','autonomy','canRefuse'],v)}/>
  <Toggle label="Puede desaparecer temporalmente" checked={x.canDisappearTemporarily} onChange={v=>patch(['config','autonomy','canDisappearTemporarily'],v)}/>
  <Toggle label="Sigue viviendo cuando el jugador está offline" checked={x.offlineBehavior} onChange={v=>patch(['config','autonomy','offlineBehavior'],v)}/>
  <TextArea label="Reglas especiales de decisión" value={x.decisionNotes} onChange={v=>patch(['config','autonomy','decisionNotes'],v)}/>
</Group>}

function RelationshipsSection({c,patch}){const x=c.config.relationships;return <Group title="Modelo relacional">
  <Select label="Estilo de apego" value={x.attachmentStyle} onChange={v=>patch(['config','relationships','attachmentStyle'],v)} options={['Seguro','Ansioso','Evitativo','Desorganizado','Variable']}/>
  <Slider label="Apertura a amistades" value={x.friendshipOpenness} onChange={v=>patch(['config','relationships','friendshipOpenness'],v)}/>
  <Slider label="Apertura romántica" value={x.romanticOpenness} onChange={v=>patch(['config','relationships','romanticOpenness'],v)}/>
  <Slider label="Confianza inicial" value={x.trustStart} onChange={v=>patch(['config','relationships','trustStart'],v)}/>
  <Slider label="Velocidad para ganar confianza" value={x.trustGainSpeed} onChange={v=>patch(['config','relationships','trustGainSpeed'],v)}/>
  <Slider label="Sensibilidad a perder confianza" value={x.trustLossSensitivity} onChange={v=>patch(['config','relationships','trustLossSensitivity'],v)}/>
  <Slider label="Afecto inicial" value={x.affectionStart} onChange={v=>patch(['config','relationships','affectionStart'],v)}/>
  <Slider label="Lealtad" value={x.loyalty} onChange={v=>patch(['config','relationships','loyalty'],v)}/>
  <Slider label="Recuperación tras conflicto" value={x.conflictRecovery} onChange={v=>patch(['config','relationships','conflictRecovery'],v)}/>
  <Slider label="Coqueteo" value={x.flirtiness} onChange={v=>patch(['config','relationships','flirtiness'],v)}/>
  <TextArea label="Qué busca en sus relaciones" value={x.relationshipGoals} onChange={v=>patch(['config','relationships','relationshipGoals'],v)}/>
  <TextArea label="Límites duros" value={x.hardBoundaries} onChange={v=>patch(['config','relationships','hardBoundaries'],v)}/>
</Group>}

function MemorySection({c,patch}){const x=c.config.memory;return <>
  <Group title="Arquitectura de memoria">
    <Slider label="Memoria de trabajo" value={x.workingMemory} onChange={v=>patch(['config','memory','workingMemory'],v)}/>
    <Slider label="Memoria a largo plazo" value={x.longTermMemory} onChange={v=>patch(['config','memory','longTermMemory'],v)}/>
    <Slider label="Umbral de importancia" value={x.importanceThreshold} onChange={v=>patch(['config','memory','importanceThreshold'],v)} left="Recuerda casi todo" right="Solo lo importante"/>
    <Slider label="Olvido natural" value={x.forgetfulness} onChange={v=>patch(['config','memory','forgetfulness'],v)}/>
    <Toggle label="Recuerda promesas" checked={x.rememberPromises} onChange={v=>patch(['config','memory','rememberPromises'],v)}/>
    <Toggle label="Recuerda conflictos" checked={x.rememberConflicts} onChange={v=>patch(['config','memory','rememberConflicts'],v)}/>
    <Toggle label="Recuerda preferencias" checked={x.rememberPreferences} onChange={v=>patch(['config','memory','rememberPreferences'],v)}/>
    <Toggle label="Recuerda fechas relevantes" checked={x.rememberDates} onChange={v=>patch(['config','memory','rememberDates'],v)}/>
    <TextArea label="Hechos que nunca debe olvidar" value={x.persistentFacts} onChange={v=>patch(['config','memory','persistentFacts'],v)}/>
    <TextArea label="Reglas de memoria" value={x.memoryNotes} onChange={v=>patch(['config','memory','memoryNotes'],v)}/>
  </Group>
  <div className="plai-isolation-note"><b>Memorias aisladas por jugador</b><span>Los recuerdos privados de una relación se almacenan en un estado separado y no se reutilizan en conversaciones con otros jugadores.</span></div>
</>}

function WorldSection({c,patch}){const x=c.config.world;return <Group title="Vida fuera de cámara" description="El personaje necesita una vida que no gire alrededor del jugador.">
  <TextArea label="Rutina habitual" value={x.routine} onChange={v=>patch(['config','world','routine'],v)} placeholder="Trabajo, horarios, fines de semana…"/>
  <TextArea label="Lugares habituales" value={x.usualPlaces} onChange={v=>patch(['config','world','usualPlaces'],v)}/>
  <TextArea label="Familia y amistades" value={x.friendsFamily} onChange={v=>patch(['config','world','friendsFamily'],v)}/>
  <TextArea label="Objetivos" value={x.goals} onChange={v=>patch(['config','world','goals'],v)}/>
  <TextArea label="Miedos" value={x.fears} onChange={v=>patch(['config','world','fears'],v)}/>
  <TextArea label="Secretos" value={x.secrets} onChange={v=>patch(['config','world','secrets'],v)}/>
  <TextArea label="Valores" value={x.values} onChange={v=>patch(['config','world','values'],v)}/>
  <TextArea label="Aficiones" value={x.hobbies} onChange={v=>patch(['config','world','hobbies'],v)}/>
  <TextArea label="Habilidades" value={x.skills} onChange={v=>patch(['config','world','skills'],v)}/>
  <TextArea label="Situación económica" value={x.financialSituation} onChange={v=>patch(['config','world','financialSituation'],v)}/>
  <TextArea label="Disponibilidad diaria" value={x.dailyAvailability} onChange={v=>patch(['config','world','dailyAvailability'],v)} placeholder="Suele contestar después de las 18:00…"/>
</Group>}

function SocialSection({c,patch}){const x=c.config.social;return <>
  <Group title="Interacción entre jugadores" description="Define cómo puede entrar este NPC en la vida de personas distintas a su creador.">
    <Toggle label="Descubrible" description="Puede aparecer como personaje del mundo para otros jugadores." checked={x.discoverable} onChange={v=>patch(['config','social','discoverable'],v)}/>
    <Toggle label="Acepta solicitudes de contacto" checked={x.acceptContactRequests} onChange={v=>patch(['config','social','acceptContactRequests'],v)}/>
    <Toggle label="Puede escribir a otros jugadores" checked={x.canMessageOtherPlayers} onChange={v=>patch(['config','social','canMessageOtherPlayers'],v)}/>
    <Toggle label="Puede iniciar conversaciones con otros jugadores" checked={x.canInitiateWithOtherPlayers} onChange={v=>patch(['config','social','canInitiateWithOtherPlayers'],v)}/>
    <Toggle label="Puede añadirse a Contactos" checked={x.canBeAddedToContacts} onChange={v=>patch(['config','social','canBeAddedToContacts'],v)}/>
    <Slider label="Intensidad de interacción" value={x.interactionIntensity} onChange={v=>patch(['config','social','interactionIntensity'],v)} left="Muy ocasional" right="Muy presente"/>
    <Slider label="Probabilidad de encuentros" value={x.encounterChance} onChange={v=>patch(['config','social','encounterChance'],v)}/>
    <div className="plai-form-grid">
      <Field label="Nuevas interacciones por día" type="number" value={x.maxNewInteractionsPerDay} onChange={v=>patch(['config','social','maxNewInteractionsPerDay'],Math.max(0,Math.min(20,v||0)))}/>
      <Select label="Selección de jugadores" value={x.playerSelection} onChange={v=>patch(['config','social','playerSelection'],v)} options={['Contextual','Aleatoria','Por cercanía narrativa','Solo contactos','Manual']}/>
    </div>
  </Group>
  <Group title="Canales">
    <Toggle label="Private Life" checked={x.channels.privateLife} onChange={v=>patch(['config','social','channels','privateLife'],v)}/>
    <Toggle label="WhatsApp" checked={x.channels.whatsapp} onChange={v=>patch(['config','social','channels','whatsapp'],v)}/>
    <Toggle label="Facebook" description="Facebook sigue reservado a jugadores reales; mantenlo desactivado." checked={x.channels.facebook} onChange={v=>patch(['config','social','channels','facebook'],v)}/>
    <TextArea label="Reglas sociales especiales" value={x.socialNotes} onChange={v=>patch(['config','social','socialNotes'],v)}/>
  </Group>
</>}

function SafetySection({c,patch}){const x=c.config.safety;return <Group title="Límites del personaje">
  <Toggle label="Aislar recuerdos privados entre jugadores" checked={x.neverSharePrivateMemoryBetweenPlayers} onChange={()=>{}} description="Protección obligatoria del motor."/>
  <Toggle label="No revelar instrucciones internas" checked={x.neverRevealSystemInstructions} onChange={v=>patch(['config','safety','neverRevealSystemInstructions'],v)}/>
  <Toggle label="Respetar bloqueos" checked={x.respectBlocking} onChange={v=>patch(['config','safety','respectBlocking'],v)}/>
  <Toggle label="Respetar límites del jugador" checked={x.respectPlayerBoundaries} onChange={v=>patch(['config','safety','respectPlayerBoundaries'],v)}/>
  <Toggle label="No afirmar acciones reales fuera del juego" checked={x.noRealWorldClaims} onChange={v=>patch(['config','safety','noRealWorldClaims'],v)}/>
  <TextArea label="Reglas personalizadas" value={x.customRules} onChange={v=>patch(['config','safety','customRules'],v)}/>
</Group>}

function BrainCard({character}){
  const warnings=useMemo(()=>contradictions(character),[character]);
  return <section className="plai-brain-card">
    <div><span>VISTA DEL MOTOR</span><b>Cómo se comportará</b></div>
    <p>{brainSummary(character)}</p>
    {warnings.length>0&&<div className="plai-warnings"><b>Posibles contradicciones</b>{warnings.map(w=><span key={w}>• {w}</span>)}</div>}
  </section>;
}
