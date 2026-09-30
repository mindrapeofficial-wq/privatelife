const DAY_KEYS=['sun','mon','tue','wed','thu','fri','sat'];

const ACTIVITY_LABELS={
  sleep:'Durmiendo',
  morning:'Preparándose',
  commute:'Desplazándose',
  work:'Trabajando',
  study:'Estudiando',
  meal:'Comiendo',
  personal:'Asuntos personales',
  social:'Socializando',
  free:'Disponible',
  winding:'Desconectando'
};

const AVAILABILITY_DEFAULTS={
  offline:{min:75,max:180,mode:'offline'},
  busy:{min:25,max:85,mode:'delayed'},
  limited:{min:5,max:25,mode:'delayed'},
  available:{min:0,max:3,mode:'instant'}
};

function clamp(n,min,max){return Math.max(min,Math.min(max,n))}
function cleanText(value,max=120){return String(value??'').trim().slice(0,max)}
function hash(value){let h=2166136261;for(const ch of String(value??'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return Math.abs(h>>>0)}
function stableBetween(min,max,seed){if(max<=min)return min;return min+(hash(seed)%(max-min+1))}
function minutes(value){
  const m=String(value||'').match(/^(\d{1,2}):(\d{2})$/);
  if(!m)return 0;
  const h=clamp(Number(m[1])||0,0,24),mm=clamp(Number(m[2])||0,0,59);
  return h===24?1440:h*60+mm;
}
function time(v){const n=clamp(Number(v)||0,0,1440),h=Math.floor(n/60),m=n%60;return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')}
function validTimezone(value){
  const tz=cleanText(value,80)||'UTC';
  try{new Intl.DateTimeFormat('en-US',{timeZone:tz}).format(new Date());return tz}catch{return 'UTC'}
}
function localParts(date,timeZone){
  const tz=validTimezone(timeZone);
  const parts=new Intl.DateTimeFormat('en-GB',{
    timeZone:tz,weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(date).reduce((o,p)=>{o[p.type]=p.value;return o},{});
  const weekday={Sun:'sun',Mon:'mon',Tue:'tue',Wed:'wed',Thu:'thu',Fri:'fri',Sat:'sat'}[parts.weekday]||'mon';
  return {
    weekday,
    minute:(Number(parts.hour)||0)*60+(Number(parts.minute)||0),
    dateKey:`${parts.year}-${parts.month}-${parts.day}`,
    hour:Number(parts.hour)||0,
    minutePart:Number(parts.minute)||0,
    timezone:tz
  };
}
function b(id,start,end,activity,availability,location,label=''){
  const policy=AVAILABILITY_DEFAULTS[availability]||AVAILABILITY_DEFAULTS.available;
  return {id,start,end,activity,label:label||ACTIVITY_LABELS[activity]||activity,location,availability,minReplyDelay:policy.min,maxReplyDelay:policy.max};
}
function standardDay(city=''){
  const home=city?city+' · casa':'Casa';
  return [
    b('sleep-a','00:00','07:30','sleep','offline',home),
    b('morning','07:30','08:30','morning','limited',home),
    b('commute-a','08:30','09:00','commute','limited',city||'En ruta'),
    b('work-a','09:00','13:30','work','busy',city||'Trabajo'),
    b('meal','13:30','14:30','meal','limited',city||'Cerca del trabajo'),
    b('work-b','14:30','17:30','work','busy',city||'Trabajo'),
    b('commute-b','17:30','18:00','commute','limited',city||'En ruta'),
    b('free-a','18:00','22:30','free','available',city||'Tiempo libre'),
    b('winding','22:30','23:30','winding','limited',home),
    b('sleep-b','23:30','24:00','sleep','offline',home)
  ];
}
function studentDay(city=''){
  const home=city?city+' · casa':'Casa';
  return [
    b('sleep-a','00:00','08:00','sleep','offline',home),
    b('morning','08:00','09:00','morning','limited',home),
    b('study-a','09:00','14:00','study','busy',city||'Centro de estudios'),
    b('meal','14:00','15:00','meal','limited',city||'Cerca del centro'),
    b('study-b','15:00','17:00','study','busy',city||'Biblioteca / estudio'),
    b('free-a','17:00','23:30','free','available',city||'Tiempo libre'),
    b('sleep-b','23:30','24:00','sleep','offline',home)
  ];
}
function hospitalityDay(city=''){
  const home=city?city+' · casa':'Casa';
  return [
    b('sleep-a','00:00','02:00','sleep','offline',home),
    b('sleep-b','02:00','10:00','sleep','offline',home),
    b('free-a','10:00','14:30','free','available',city||'Tiempo libre'),
    b('meal','14:30','15:30','meal','limited',home),
    b('commute','15:30','16:00','commute','limited',city||'En ruta'),
    b('work','16:00','23:30','work','busy',city||'Trabajo'),
    b('commute-b','23:30','24:00','commute','limited',city||'En ruta')
  ];
}
function nightDay(city=''){
  const home=city?city+' · casa':'Casa';
  return [
    b('work-a','00:00','06:00','work','busy',city||'Trabajo'),
    b('sleep','06:00','13:00','sleep','offline',home),
    b('free','13:00','21:00','free','available',city||'Tiempo libre'),
    b('commute','21:00','22:00','commute','limited',city||'En ruta'),
    b('work-b','22:00','24:00','work','busy',city||'Trabajo')
  ];
}
function flexibleDay(city=''){
  const home=city?city+' · casa':'Casa';
  return [
    b('sleep-a','00:00','08:30','sleep','offline',home),
    b('morning','08:30','09:30','morning','limited',home),
    b('project-a','09:30','13:00','work','busy',home,'Concentrado/a'),
    b('meal','13:00','14:30','meal','limited',home),
    b('free-a','14:30','17:00','free','available',city||'Tiempo libre'),
    b('project-b','17:00','19:00','work','limited',home,'Con cosas pendientes'),
    b('free-b','19:00','23:30','free','available',city||'Tiempo libre'),
    b('sleep-b','23:30','24:00','sleep','offline',home)
  ];
}
function weekendDay(city='',late=false){
  const home=city?city+' · casa':'Casa';
  const wake=late?'10:30':'09:30';
  return [
    b('sleep-a','00:00',wake,'sleep','offline',home),
    b('morning',wake,'11:30','morning','limited',home),
    b('free-a','11:30','14:30','free','available',city||'Tiempo libre'),
    b('meal','14:30','16:00','meal','limited',city||'Comida'),
    b('social','16:00','22:30','social','limited',city||'Fuera de casa'),
    b('free-b','22:30','24:00','free','available',city||'Tiempo libre')
  ];
}
function classifyOccupation(occupation=''){
  const o=String(occupation||'').toLowerCase();
  if(/estudian|estudiante|universidad|universitario|universitaria|instituto|opositor|opositora/.test(o))return'student';
  if(/camarer|hosteler|restaur|bar\b|hotel|discoteca|club\b|dj\b|m[uú]sic|artista|concierto|cociner|chef/.test(o))return'hospitality';
  if(/noche|nocturn|vigilante|seguridad nocturna|turno nocturno/.test(o))return'night';
  if(/aut[oó]nom|freelance|creador|creadora|desemplead|paro|sin empleo|emprend/.test(o))return'flexible';
  return'standard';
}

export function buildDefaultRoutine({occupation='',city='',timezone=''}={}){
  const type=classifyOccupation(occupation);
  const make=()=>type==='student'?studentDay(city):type==='hospitality'?hospitalityDay(city):type==='night'?nightDay(city):type==='flexible'?flexibleDay(city):standardDay(city);
  return {
    version:1,
    enabled:true,
    preset:type,
    timezone:cleanText(timezone,80),
    notes:'',
    days:{
      mon:make(),tue:make(),wed:make(),thu:make(),fri:make(),
      sat:weekendDay(city,true),
      sun:weekendDay(city,false)
    }
  };
}

function normalizeBlock(raw,index){
  const availability=['offline','busy','limited','available'].includes(raw?.availability)?raw.availability:'available';
  const policy=AVAILABILITY_DEFAULTS[availability];
  let start=minutes(raw?.start),end=minutes(raw?.end);
  if(end<=start)end=Math.min(1440,start+60);
  return {
    id:cleanText(raw?.id,60)||'block-'+index,
    start:time(start),end:time(end),
    activity:cleanText(raw?.activity,30)||'free',
    label:cleanText(raw?.label,80)||ACTIVITY_LABELS[raw?.activity]||'Disponible',
    location:cleanText(raw?.location,160),
    availability,
    minReplyDelay:clamp(Number(raw?.minReplyDelay??policy.min)||0,0,720),
    maxReplyDelay:clamp(Number(raw?.maxReplyDelay??policy.max)||0,0,1440)
  };
}

export function normalizeRoutine(raw,context={}){
  const fallback=buildDefaultRoutine(context);
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return fallback;
  const days={};
  for(const day of DAY_KEYS){
    const source=Array.isArray(raw?.days?.[day])?raw.days[day]:fallback.days[day];
    days[day]=source.map(normalizeBlock).sort((a,b)=>minutes(a.start)-minutes(b.start));
  }
  return {
    version:1,
    enabled:raw.enabled!==false,
    preset:cleanText(raw.preset,30)||fallback.preset,
    timezone:cleanText(raw.timezone,80),
    notes:cleanText(raw.notes,2000),
    days
  };
}

function findBlock(blocks,minute){
  return (blocks||[]).find(block=>minute>=minutes(block.start)&&minute<minutes(block.end))||null;
}
function nextAvailabilityMinutes(routine,parts){
  let offset=0;
  for(let add=0;add<8;add++){
    const dayIndex=(DAY_KEYS.indexOf(parts.weekday)+add)%7;
    const key=DAY_KEYS[dayIndex];
    const blocks=routine.days[key]||[];
    const startMinute=add===0?parts.minute:0;
    for(const block of blocks){
      const s=minutes(block.start);
      if(s<startMinute)continue;
      if(block.availability==='available')return offset+(s-startMinute);
    }
    offset+=1440-startMinute;
  }
  return 120;
}
function activityStatus(block){
  if(!block)return {activity:'free',label:'Disponible',location:'',availability:'available'};
  return {
    activity:block.activity||'free',
    label:block.label||ACTIVITY_LABELS[block.activity]||'Ocupado/a',
    location:block.location||'',
    availability:block.availability||'available'
  };
}

export function resolveRoutineState(rawRoutine,gameNow,{occupation='',city='',timezone='UTC',characterKey='',seed=''}={}){
  const routine=normalizeRoutine(rawRoutine,{occupation,city,timezone});
  const now=gameNow instanceof Date?gameNow:new Date(gameNow||Date.now());
  const tz=validTimezone(routine.timezone||timezone||'UTC');
  const parts=localParts(now,tz);
  if(!routine.enabled){
    return {
      enabled:false,gameNow:now.toISOString(),timezone:tz,day:parts.weekday,
      activity:'free',label:'Disponible',location:city||'',availability:'available',
      replyMode:'instant',canReplyNow:true,replyDelayMinutes:0,minutesUntilAvailable:0
    };
  }
  const block=findBlock(routine.days[parts.weekday],parts.minute);
  const status=activityStatus(block);
  const policy=AVAILABILITY_DEFAULTS[status.availability]||AVAILABILITY_DEFAULTS.available;
  const min=clamp(Number(block?.minReplyDelay??policy.min)||0,0,720);
  const max=Math.max(min,clamp(Number(block?.maxReplyDelay??policy.max)||0,0,1440));
  const untilAvailable=status.availability==='available'?0:nextAvailabilityMinutes(routine,parts);
  let delay=stableBetween(min,max,`${characterKey}|${parts.dateKey}|${parts.minute}|${block?.id||'free'}|${seed}`);
  if(status.availability==='offline')delay=Math.max(delay,Math.min(untilAvailable||delay,480));
  return {
    enabled:true,
    gameNow:now.toISOString(),
    timezone:tz,
    day:parts.weekday,
    localTime:time(parts.minute),
    blockId:block?.id||null,
    ...status,
    replyMode:policy.mode,
    canReplyNow:policy.mode==='instant',
    replyDelayMinutes:policy.mode==='instant'?0:delay,
    minutesUntilAvailable:untilAvailable,
    nextTransitionInMinutes:block?Math.max(1,minutes(block.end)-parts.minute):null
  };
}

export function routineSummary(rawRoutine,context={}){
  const routine=normalizeRoutine(rawRoutine,context);
  const weekday=routine.days.mon||[];
  const work=weekday.filter(x=>['work','study'].includes(x.activity));
  const sleep=weekday.filter(x=>x.activity==='sleep');
  const first=(arr)=>arr[0]?arr[0].start+'–'+arr[arr.length-1].end:'—';
  return {preset:routine.preset,work:first(work),sleep:first(sleep),enabled:routine.enabled};
}

export const LIFE_ROUTINE_DAY_KEYS=DAY_KEYS;
export const LIFE_ROUTINE_ACTIVITY_LABELS=ACTIVITY_LABELS;
