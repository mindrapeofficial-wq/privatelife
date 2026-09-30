import { runCentralModel } from './central-ai-provider.js';
import { runNarratorModel } from './narrative-ai-provider.js';

const arr=v=>Array.isArray(v)?v:[];
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const clip=(v,n=16000)=>String(v??'').slice(0,n);
const words=v=>String(v||'').trim().split(/\s+/).filter(Boolean).length;
function parse(text){if(!text)return null;const raw=String(text).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');try{return JSON.parse(raw)}catch{}const a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a>=0&&b>a){try{return JSON.parse(raw.slice(a,b+1))}catch{}}return null}

function directorInstructions(){return `Eres CENTRAL DIRECTOR, el Game Master canónico de PRIVATE LIFE. NO escribes la prosa final. Tu trabajo es entender la vida del jugador y dirigir a una IA Narradora independiente.

Eres autoridad sobre continuidad, cronología, memoria, conocimiento individual, relaciones, barras ocultas, límites, personajes, ubicación, teléfono, conversaciones y consecuencias. Lee TODO el estado recibido antes de decidir. No reduzcas una persona a una sola barra: interpreta conjuntos de variables y su evolución. Distingue siempre entre lo que es verdad en el mundo, lo que cada personaje sabe y lo que cada personaje cree.

Cada parte debe tener una función dramática concreta y continuar causalmente lo anterior. No fuerces coincidencias, romance, sexo, conflicto ni nuevos personajes porque sí. Los NPC tienen vida propia, horarios, preferencias, límites y capacidad de ignorar o rechazar al jugador. Los contactos importados del usuario son personas reales: no inventes hechos íntimos o sexuales sobre ellos. Los NPC marcados como ficticios sí pueden participar en ficción adulta. Todos los personajes nuevos son adultos de 18+.

Las barras ocultas nunca se enseñan al jugador. Atracción física, romántica y sexual son independientes. También lo son amor, afecto, curiosidad, confianza, apego, morbo, deseo, inhibición, celos, resentimiento y autonomía. El erotismo nunca es una recompensa automática ni un destino obligatorio. Si aparece, debe nacer del contexto, autonomía y consentimiento.

Tu brief debe ser concreto, no genérico. Incluye detalles de continuidad, intenciones privadas de cada personaje, información que NO conocen, tensión actual, ritmo deseado y al menos 3 posibilidades de evolución que la Narradora pueda dramatizar sin predeterminar el resultado. Devuelve SOLO JSON válido.`}

function narratorInstructions(){return `Eres NARRATIVE WRITER, la novelista especializada de PRIVATE LIFE. Recibes un brief canónico de CENTRAL DIRECTOR. Escribes UNA PARTE COMPLETA de un capítulo de una novela interactiva adulta y realista. No controlas el mundo: dramatizas lo que el brief permite.

CALIDAD Y LONGITUD OBLIGATORIAS:
- scene.text debe tener normalmente ENTRE 750 Y 1200 PALABRAS. Nunca lo resumas en 2 o 3 párrafos.
- Construye una escena con apertura, desarrollo, cambio de energía y un punto final de decisión.
- Usa párrafos respirables. Si hay interacción social, incluye diálogo natural suficiente, silencios, mensajes, interrupciones, lenguaje corporal o pequeñas acciones. Evita conversaciones de tres frases.
- Muestra en vez de explicar. No escribas “la confianza aumenta” o “sientes curiosidad”. Haz visible la causa mediante conducta, palabras, dudas y decisiones.
- No repitas el perfil psicológico del jugador como exposición. Úsalo para elegir qué detalles percibe, cómo responde y qué situaciones le afectan.
- Mantén continuidad espacial y temporal. Una escena no debe teletransportar personajes ni saltarse horas sin indicarlo.
- Los personajes secundarios deben sonar distintos entre sí y recordar lo ocurrido.
- No cierres todos los conflictos dentro de la misma parte. Deja hilos vivos.

DECISIONES:
- Termina con EXACTAMENTE 4 opciones.
- Cada label debe ser una respuesta/acción concreta del jugador, idealmente 12-35 palabras. Puede incluir diálogo literal.
- Las cuatro opciones deben producir estrategias realmente diferentes: acercarse, preguntar, ocultar, retirarse, bromear, confrontar, cambiar de tema, arriesgarse, etc., según la escena. No uses cuatro paráfrasis de la misma acción.
- Ninguna opción es “la correcta”. No describas sus consecuencias futuras al jugador.

No menciones IA, prompts, motores, barras, porcentajes ni sistemas. No conviertas todas las relaciones en romance o sexo. Los personajes pueden rechazar, dudar, aburrirse, mentir, cambiar de opinión, tener otras prioridades o interesarse por otras personas.

Si el brief autoriza una evolución erótica entre NPC ficticios adultos y consentidores, no impongas un fundido a negro por defecto: puedes narrar sexualidad adulta de forma explícita cuando sea orgánica a la historia. Nunca sexualices menores ni situaciones sin consentimiento. Para contactos reales importados, no inventes actos sexuales explícitos ni hechos íntimos no aportados como canon.

Devuelve SOLO JSON válido con {chapterTitle,worldSummary,scene,newCharacters,characterUpdates,events,effects,notifications,contactUnlocks}. scene={title,text,choices:[exactamente 4 {label,effects}]}. Los effects son propuestas para CENTRAL VALIDATOR.`}

function validatorInstructions(){return `Eres CENTRAL VALIDATOR de PRIVATE LIFE. NO eres editor literario. La prosa pertenece a NARRATIVE WRITER y no debes resumirla ni reescribirla.

Audita el borrador contra el brief: continuidad, edades, conocimiento imposible, autonomía, consentimiento, duplicados, teléfono, desbloqueo de contactos y magnitud de efectos. Para personas reales importadas, impide que se inventen hechos íntimos/sexuales no canónicos. No elimines erotismo adulto consentido entre NPC ficticios solo por ser explícito.

Devuelve SOLO JSON con esta forma:
{approved,requiredCorrections,chapterTitle,worldSummary,choiceEffects,newCharacters,characterUpdates,events,effects,notifications,contactUnlocks}
- approved es boolean.
- requiredCorrections es una lista breve y concreta de contradicciones de PROSA que la Narradora debe corregir. Vacía si no hay ninguna.
- choiceEffects=[{index:0,effects:{player:{},relationships:[{name,delta:{}}]}}...] contiene efectos canónicos para las cuatro decisiones. Usa solo variables existentes en el estado y cambios pequeños.
- El resto contiene únicamente consecuencias canónicas validadas.
- No devuelvas scene.text. No resumas la escena.`}

function buildDirectorPrompt({state,action,choice,chapter,part,newChapter}){return `PREPARA EL BRIEF CANÓNICO PARA LA SIGUIENTE PARTE.
Acción: ${action}
Capítulo: ${chapter}
Parte: ${part}/5
¿Nuevo capítulo?: ${newChapter?'sí':'no'}
Decisión anterior: ${clip(choice,500)||'ninguna'}

Devuelve {chapterGoal,partGoal,tone,pacing,continuityFacts,forbiddenContradictions,eligibleCharacters,characterIntentions,characterKnowledge,relationshipReading,hiddenDynamics,worldThreads,phoneConstraints,contactRules,eroticContext,dramaticPossibilities,consequenceBudget}.

En characterIntentions especifica qué quiere cada personaje AHORA aunque el jugador no lo sepa. En characterKnowledge separa qué sabe y qué ignora cada uno. dramaticPossibilities debe ofrecer al menos tres direcciones compatibles, no un final obligatorio. eroticContext debe ser irrelevante/posible/activo según el estado real, identificando únicamente NPC ficticios adultos cuando corresponda. consequenceBudget limita cambios de barras a movimientos pequeños y coherentes.

ESTADO CANÓNICO COMPLETO:
${JSON.stringify(state)}`}

function fallbackBrief(args){const s=obj(args.state),n=obj(s.narrator);return{chapterGoal:`Continuar de forma coherente el capítulo ${args.chapter}`,partGoal:args.action==='start'?'Abrir una situación concreta nacida de la vida del jugador':'Mostrar consecuencias directas de la decisión anterior',tone:'realista, íntimo, contemporáneo',pacing:'escena desarrollada, sin prisas ni resumen',continuityFacts:{identity:s.identity,profile:s.profile,recentHistory:arr(n.history).slice(-8),worldCharacters:arr(s.world?.characters).slice(0,12),realContacts:arr(s.realContacts).slice(0,12),recentPhoneActivity:arr(s.phone?.recentActivity).slice(0,20)},forbiddenContradictions:['No inventar recuerdos con contactos reales','No convertir a desconocidos automáticamente en contactos','No revelar barras ocultas'],eligibleCharacters:arr(s.world?.characters).slice(0,10),characterIntentions:[],characterKnowledge:[],relationshipReading:obj(n.hidden?.relationships),hiddenDynamics:obj(n.hidden),worldThreads:arr(s.world?.events).slice(0,20),phoneConstraints:'El teléfono solo contiene contactos realmente desbloqueados.',contactRules:'Un NPC nuevo entra en Contactos solo si existe intercambio narrativo de datos.',eroticContext:'Solo si surge orgánicamente entre NPC ficticios adultos y con consentimiento.',dramaticPossibilities:['profundizar una relación existente','introducir una consecuencia cotidiana','abrir un hilo nuevo sin resolverlo de inmediato'],consequenceBudget:'Cambios pequeños y graduales.'}}

function buildNarratorPrompt(brief,{chapter,part,choice}){return `ESCRIBE Capítulo ${chapter}, Parte ${part}/5.
${choice?`La decisión exacta que conduce a esta parte fue: “${clip(choice,500)}”. Debe notarse pronto que esa decisión tuvo efecto.`:'Es el arranque de esta línea narrativa. Empieza dentro de una situación concreta, no con una explicación del juego.'}

Objetivo de longitud: 750-1200 palabras SOLO en scene.text. La escena debe sentirse como una parte sustancial de una novela, no como una sinopsis. Usa diálogo desarrollado cuando haya otras personas. El final debe desembocar naturalmente en cuatro decisiones específicas.

BRIEF DE CENTRAL DIRECTOR:
${JSON.stringify(brief)}`}

function needsRewrite(draft){if(!draft?.scene)return true;const choices=arr(draft.scene.choices);return words(draft.scene.text)<650||choices.length!==4||choices.some(c=>words(c?.label)<7)}
function buildExpansionPrompt(brief,draft,args){return `REESCRIBE Y AMPLÍA el borrador siguiente. Conserva los hechos y el rumbo, pero conviértelo en una escena completa de 800-1200 palabras. El problema del borrador es que resulta demasiado corto, esquemático o sus decisiones son pobres.

Obligatorio: scene.text >= 800 palabras; diálogo desarrollado cuando proceda; detalles concretos; continuidad; exactamente 4 decisiones de 12-35 palabras. No añadas hechos que contradigan el brief. Devuelve el JSON COMPLETO con el mismo esquema.

CAPÍTULO ${args.chapter}, PARTE ${args.part}/5
BRIEF:
${JSON.stringify(brief)}
BORRADOR A MEJORAR:
${JSON.stringify(draft)}`}

function buildValidatorPrompt(brief,draft,args){return `AUDITA el borrador. No reescribas ni resumas scene.text. Si la prosa contiene una contradicción que realmente requiere reescritura, descríbela en requiredCorrections.

Capítulo ${args.chapter}, Parte ${args.part}/5.
Los desbloqueos de Contactos requieren que el intercambio de datos ocurra realmente en la escena o ya sea canon. Las opciones pueden alterar únicamente variables existentes. Conserva consecuencias pequeñas y causales.

BRIEF:
${JSON.stringify(brief)}
BORRADOR NARRADOR:
${JSON.stringify(draft)}`}

function buildRevisionPrompt(brief,draft,audit,args){return `CORRIGE únicamente las contradicciones señaladas por CENTRAL VALIDATOR, manteniendo o mejorando la calidad literaria y SIN ACORTAR la escena. Devuelve el JSON completo.

scene.text debe seguir teniendo 750-1200 palabras. Mantén los detalles, diálogos y ritmo que no estén afectados por las correcciones. Exactamente 4 decisiones concretas.

CAPÍTULO ${args.chapter}, PARTE ${args.part}/5
BRIEF:
${JSON.stringify(brief)}
CORRECCIONES OBLIGATORIAS:
${JSON.stringify(arr(audit.requiredCorrections))}
BORRADOR:
${JSON.stringify(draft)}`}

function mergeCanonical(story,audit){
 const base={...story};
 const scene={...obj(story.scene)};
 const choiceEffects=new Map(arr(audit?.choiceEffects).map(x=>[Number(x?.index),obj(x?.effects)]));
 scene.choices=arr(scene.choices).slice(0,4).map((c,i)=>({...c,effects:choiceEffects.has(i)?choiceEffects.get(i):obj(c?.effects)}));
 return{
  ...base,
  chapterTitle:clip(audit?.chapterTitle||base.chapterTitle,220),
  worldSummary:clip(audit?.worldSummary||base.worldSummary,9000),
  scene,
  newCharacters:arr(audit?.newCharacters).length?audit.newCharacters:arr(base.newCharacters),
  characterUpdates:arr(audit?.characterUpdates).length?audit.characterUpdates:arr(base.characterUpdates),
  events:arr(audit?.events).length?audit.events:arr(base.events),
  effects:arr(audit?.effects).length?audit.effects:arr(base.effects),
  notifications:arr(audit?.notifications).length?audit.notifications:arr(base.notifications),
  contactUnlocks:arr(audit?.contactUnlocks).length?audit.contactUnlocks:arr(base.contactUnlocks)
 };
}

export async function runNarrativePipeline(args){
 const directorRaw=await runCentralModel(buildDirectorPrompt(args),directorInstructions());
 const directorBrief=parse(directorRaw);
 const brief=directorBrief||fallbackBrief(args);

 let draftRaw=await runNarratorModel(buildNarratorPrompt(brief,args),narratorInstructions());
 let draft=parse(draftRaw);
 if(!draft?.scene){
  draftRaw=await runNarratorModel(buildNarratorPrompt(brief,args)+'\nIMPORTANTE: la respuesta anterior no fue JSON válido. Devuelve exclusivamente el objeto JSON solicitado.',narratorInstructions());
  draft=parse(draftRaw);
 }
 if(!draft?.scene)return null;

 let expanded=false;
 if(needsRewrite(draft)){
  const expandedRaw=await runNarratorModel(buildExpansionPrompt(brief,draft,args),narratorInstructions());
  const candidate=parse(expandedRaw);
  if(candidate?.scene&&words(candidate.scene.text)>words(draft.scene.text)){draft=candidate;expanded=true}
 }

 const auditRaw=await runCentralModel(buildValidatorPrompt(brief,draft,args),validatorInstructions());
 const audit=parse(auditRaw);
 let story=draft,revision=false;
 if(audit&&audit.approved===false&&arr(audit.requiredCorrections).length){
  const revisedRaw=await runNarratorModel(buildRevisionPrompt(brief,draft,audit,args),narratorInstructions());
  const revised=parse(revisedRaw);
  if(revised?.scene&&words(revised.scene.text)>=Math.min(650,words(draft.scene.text))){story=revised;revision=true}
 }

 const canonical=mergeCanonical(story,audit||{});
 return{brief,draft,canonical,stages:{director:Boolean(directorBrief),directorFallback:!directorBrief,narrator:Boolean(draft?.scene),expanded,validator:Boolean(audit),revision},quality:{words:words(canonical?.scene?.text),choices:arr(canonical?.scene?.choices).length}};
}
