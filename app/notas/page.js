'use client';

import { useEffect, useMemo, useState } from 'react';
import './notas.css';

const CHAPTER_LENGTH=5;
const SCENES=[
  {
    title:'Una notificación fuera de hora',
    text:(name,contact)=>`${name||'Tu personaje'} lleva unos minutos mirando el teléfono sin hacer nada concreto. Entonces vibra. ${contact?`El nombre de ${contact} aparece en la pantalla.`:'Hay una notificación nueva de alguien que no esperabas.'} No parece importante, pero hay algo en el momento que hace que no la ignores del todo.`,
    choices:[
      ['Abrirla inmediatamente',{curiosity:2,initiative:1}],
      ['Esperar un poco antes de mirar',{caution:2,selfControl:1}],
      ['Mirar la vista previa sin entrar',{curiosity:1,caution:1}],
      ['Dejar el móvil boca abajo',{independence:2,caution:1}]
    ]
  },
  {
    title:'Lo que dices y lo que dejas sin decir',
    text:(name,contact,last)=>`${last?`La decisión anterior todavía pesa un poco: ${last.toLowerCase()}. `:''}La conversación avanza de una forma que no estaba prevista. ${contact||'La otra persona'} deja una frase suficientemente ambigua como para poder interpretarla de varias maneras. Aquí no existe una respuesta perfecta.`,
    choices:[
      ['Preguntar directamente qué quiere decir',{initiative:2,clarity:2}],
      ['Responder con humor y tantear el terreno',{social:2,curiosity:1}],
      ['Cambiar de tema',{caution:2,distance:1}],
      ['No responder todavía',{selfControl:2,distance:1}]
    ]
  },
  {
    title:'Una puerta entreabierta',
    text:(name,contact)=>`Horas después aparece una posibilidad pequeña, pero real: seguir acercándote a ${contact||'esa persona'}, mantener las cosas como están o dejar que el momento pase. Mientras tú decides, el resto del mundo de PRIVATE LIFE continúa moviéndose fuera de tu pantalla.`,
    choices:[
      ['Dar un paso hacia esa persona',{initiative:3,attachment:1}],
      ['Mantener el tono actual',{stability:2,caution:1}],
      ['Tomar distancia',{independence:2,distance:2}],
      ['Hacer algo inesperado',{novelty:3,curiosity:1}]
    ]
  },
  {
    title:'El efecto de una ausencia',
    text:()=>`Pasa tiempo sin novedades. El silencio también es una acción, aunque nadie lo haya elegido de forma explícita. PRIVATE LIFE no congela a los demás mientras tú esperas: sus vínculos, estados de ánimo y decisiones siguen su curso en segundo plano.`,
    choices:[
      ['Escribir tú primero',{initiative:3,attachment:1}],
      ['Esperar a que la otra persona aparezca',{caution:2,selfControl:2}],
      ['Centrarte en otra persona o actividad',{independence:3,novelty:1}],
      ['Releer lo ocurrido antes de decidir',{analysis:3,caution:1}]
    ]
  },
  {
    title:'Fin de capítulo',
    text:()=>`No todas las consecuencias son visibles todavía. Algunas decisiones han cambiado la forma en que otros personajes pueden interpretarte y otras han alterado relaciones que todavía no has visto. El capítulo termina, pero la simulación no se detiene.`,
    choices:[
      ['Cerrar el capítulo y continuar',{stability:1}],
      ['Cerrar el capítulo pensando en lo ocurrido',{analysis:2}],
      ['Cerrar el capítulo y buscar algo nuevo',{novelty:2}],
      ['Cerrar el capítulo sin mirar atrás',{independence:2}]
    ]
  }
];

function clamp(n){return Math.max(-100,Math.min(100,n||0))}
function getName(save){return save?.identity?.name||save?.character?.name||save?.profile?.name||save?.name||''}
function getContacts(){try{return JSON.parse(localStorage.getItem('private-life-contacts')||'[]')}catch{return []}}

export default function Notes(){
  const [save,setSave]=useState(null);const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [mode,setMode]=useState('notes');const [busy,setBusy]=useState(false);
  useEffect(()=>{(async()=>{try{const r=await fetch('/api/save',{cache:'no-store'});if(!r.ok)throw new Error('No se pudo cargar la partida.');const x=await r.json();setSave(x.save);if(x.save?.gameplay?.narratorMode)setMode('narrator')}catch(e){setError(e.message)}finally{setLoading(false)}})()},[]);
  const narrator=save?.narrator||{chapter:1,turn:0,history:[],hidden:{}};
  const contacts=useMemo(()=>getContacts(),[mode]);
  const contact=contacts.length?contacts[(narrator.chapter-1)%contacts.length]?.name:'';
  const scene=SCENES[narrator.turn%CHAPTER_LENGTH];
  const last=narrator.history?.at?.(-1)?.choice||'';
  async function write(next){setBusy(true);try{const r=await fetch('/api/save',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({save:next})});if(!r.ok)throw new Error('No se pudo guardar el modo Narrador.');setSave(next)}catch(e){setError(e.message)}finally{setBusy(false)}}
  async function activate(){if(!save)return;const next={...save,gameplay:{...(save.gameplay||{}),narratorMode:true,narratorActivatedAt:save.gameplay?.narratorActivatedAt||new Date().toISOString()},narrator:save.narrator||{chapter:1,turn:0,history:[],hidden:{}}};await write(next);setMode('narrator')}
  async function deactivate(){if(!save)return;const next={...save,gameplay:{...(save.gameplay||{}),narratorMode:false}};await write(next);setMode('notes')}
  async function choose(choice,effects){if(busy)return;const old=save.narrator||{chapter:1,turn:0,history:[],hidden:{}};const hidden={...(old.hidden||{})};Object.entries(effects||{}).forEach(([k,v])=>hidden[k]=clamp((hidden[k]||0)+v));const isEnd=(old.turn%CHAPTER_LENGTH)===CHAPTER_LENGTH-1;const entry={chapter:old.chapter,turn:old.turn,scene:scene.title,choice,at:new Date().toISOString()};const nextNarrator={chapter:isEnd?old.chapter+1:old.chapter,turn:old.turn+1,history:[...(old.history||[]),entry].slice(-100),hidden};await write({...save,narrator:nextNarrator});}
  if(loading)return <main className="notesLoading">Abriendo Notas…</main>;
  if(error&&!save)return <main className="notesLoading"><div>{error}</div><button onClick={()=>location.href='/'}>VOLVER</button></main>;
  if(mode==='narrator')return <main className="narrator"><header className="narratorTop"><button onClick={()=>location.href='/'}>‹</button><div><small>MODO NARRADOR</small><b>Capítulo {narrator.chapter}</b></div><button className="exit" onClick={deactivate}>SALIR</button></header><div className="narratorBody"><div className="chapterMark">PRIVATE LIFE · CAPÍTULO {narrator.chapter}</div><article className="story"><span>PARTE {(narrator.turn%CHAPTER_LENGTH)+1}</span><h1>{scene.title}</h1><p>{scene.text(getName(save),contact,last)}</p></article><div className="choices">{scene.choices.map(([label,effects],i)=><button key={label} disabled={busy} onClick={()=>choose(label,effects)}><i>{String.fromCharCode(65+i)}</i><span>{label}</span></button>)}</div><p className="hiddenHint">Las decisiones modifican variables, relaciones y posibilidades ocultas. Otros personajes pueden vivir acontecimientos en paralelo aunque no aparezcan en esta escena.</p>{narrator.history?.length>0&&<details className="history"><summary>Decisiones anteriores</summary>{narrator.history.slice(-8).reverse().map((h,i)=><div key={`${h.at}-${i}`}><small>Cap. {h.chapter}</small><span>{h.choice}</span></div>)}</details>}</div></main>;
  return <main className="notesApp"><header className="notesTop"><button onClick={()=>location.href='/'}>‹</button><b>Notas</b><span>•••</span></header><div className="notesTitle"><h1>Notas</h1><button>＋</button></div><section className="noteCard narratorNote"><div className="noteIcon">N</div><div><small>PRIVATE LIFE</small><h2>Modo Narrador</h2><p>Convierte la partida en una novela interactiva. El narrador describe escenas, tú eliges qué hacer y el mundo continúa evolucionando en segundo plano.</p></div></section><section className="modePanel"><div className="modeHead"><div><small>MODO DE JUEGO</small><h2>Narración interactiva</h2></div><span className="off">DESACTIVADO</span></div><p>Al activarlo, las decisiones se presentan como capítulos y opciones A, B, C y D. Las variables psicológicas y sociales siguen ocultas, y las consecuencias pueden ser positivas, negativas o inesperadas.</p><ul><li>Capítulos y escenas narradas</li><li>Decisiones con consecuencias reales</li><li>Relaciones y sucesos paralelos no visibles</li><li>Continuidad con tu personaje, contactos y partida</li></ul><button disabled={busy||!save} onClick={activate}>ACTIVAR MODO NARRADOR</button></section>{error&&<div className="notesError">{error}</div>}</main>;
}
