import { NextResponse } from 'next/server';
import { isCurrentAdmin } from '../../../../lib/auth.js';
import { ensureSchema, query } from '../../../../lib/db.js';
import { runCentralModel } from '../../../../lib/central-ai-provider.js';
import { buildDefaultRoutine } from '../../../../lib/life-routines.js';
import { WORLD_DIRECTOR_RULES } from '../../../../lib/world-director.js';
import { loadSocialAnalysis } from '../../../../lib/life-social.js';
import { loadCausalAnalysis, applyDirectorCausalPlan } from '../../../../lib/life-causality.js';

export const runtime = 'nodejs';

const arr = value => Array.isArray(value) ? value : [];
const obj = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const clip = (value, max = 1200) => String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
const uid = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const plusMinutes = (date, minutes) => new Date(new Date(date).getTime() + Number(minutes || 0) * 60000);
const TRAITS = ['confianza','atraccion','apego','tension','sospecha','celos','curiosidad','resentimiento'];

function normalizeSave(save = {}) {
  return {
    ...obj(save),
    world: {
      characters: [],
      events: [],
      directorLog: [],
      timeline: [],
      ...obj(save?.world),
      characters: arr(save?.world?.characters),
      events: arr(save?.world?.events),
      directorLog: arr(save?.world?.directorLog),
      timeline: arr(save?.world?.timeline)
    }
  };
}

function parseJson(text) {
  if (!text) return null;
  const raw = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(raw); } catch {}
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)); } catch {}
  }
  return null;
}

function compactCharacter(character = {}) {
  return {
    id: clip(character.id, 120),
    name: clip(character.name, 100),
    age: Number(character.age) || null,
    status: clip(character.status, 40),
    origin: clip(character.origin, 60),
    role: clip(character.role, 220),
    occupation: clip(character.occupation, 160),
    location: clip(character.location, 220),
    appearance: clip(character.appearance, 900),
    personality: clip(character.personality, 1400),
    communication: clip(character.communication, 1000),
    objectives: clip(character.objectives, 1000),
    boundaries: clip(character.boundaries, 1000),
    secrets: clip(character.secrets, 900),
    notes: clip(character.notes, 1000),
    traits: obj(character.traits),
    routine: obj(character.routine)
  };
}

function compactContact(contact = {}) {
  return {
    id: clip(contact.id, 120),
    name: clip(contact.name, 100),
    age: Number(contact.age) || null,
    city: clip(contact.city, 100),
    relationshipType: clip(contact.relationshipType, 80),
    relation: clip(contact.relation, 200),
    affection: clamp(contact.affection ?? 50),
    profile: clip(contact.profile, 1800),
    engineContext: clip(contact.engineContext, 2600),
    masterSheet: {
      confidence: clip(contact.masterSheet?.confidence, 30),
      evidence: obj(contact.masterSheet?.evidence),
      communication: obj(contact.masterSheet?.communication),
      vocabulary: arr(contact.masterSheet?.vocabulary).slice(0, 12),
      writingExamples: arr(contact.masterSheet?.writingExamples).slice(0, 5)
    }
  };
}

function directorInstructions() {
  return [
    'Eres DIRECTOR IA dentro del panel de administración de PRIVATE LIFE. Trabajas junto al administrador humano como codirector narrativo.',
    'Tienes contexto de la partida y un conjunto cerrado de herramientas narrativas. Interpreta órdenes naturales, analiza antes de actuar y ejecuta solo lo necesario.',
    'No eres un simple chatbot. Cuando la petición requiera una función disponible, devuelve la acción estructurada correspondiente.',
    'El administrador humano tiene la última palabra. No tomes decisiones políticas, económicas reales, de seguridad, credenciales, cuentas ni infraestructura.',
    'El teléfono del jugador se puede observar como contexto, pero no puedes falsear su actividad, leer fuera de los datos entregados ni modificar ajustes técnicos.',
    'Facebook es exclusivamente entre jugadores humanos. Nunca crees actividad NPC en Facebook.',
    'No inventes recuerdos confirmados ni datos sensibles. Todos los personajes creados deben tener 18 años o más.',
    ...WORLD_DIRECTOR_RULES,
    'HERRAMIENTAS AUTORIZADAS:',
    '1) create_character: crea una ficha NPC completa. args={name,age,role,occupation,location,appearance,personality,communication,objectives,boundaries,secrets,notes,traits}.',
    '2) update_character: modifica un personaje existente. args={id,name,patch,traits}. patch admite status,role,occupation,location,appearance,personality,communication,objectives,boundaries,secrets,notes. traits admite solo confianza,atraccion,apego,tension,sospecha,celos,curiosidad,resentimiento de 0 a 100.',
    '3) create_event: añade un evento a la cola narrativa del panel. args={description,condition,status,channel,contactName,message}.',
    '4) update_event: cambia un evento existente. args={id,status,description,condition}. status solo pendiente,activo,cerrado.',
    '5) queue_life_event: programa un evento real del Life Engine. args={eventType,app,title,body,delayMinutes,contactName,priority}. app solo PRIVATE LIFE, WhatsApp, Instagram, Mensajes, Teléfono o Sistema.',
    'Para comunicaciones oficiales al jugador, avisos del administrador, novedades o mantenimiento, usa queue_life_event con app Mensajes para que aparezcan dentro de la app Mensajes y como notificación.',
    '6) queue_whatsapp: programa un WhatsApp de un contacto/personaje existente. args={contactName,text,delayMinutes}.',
    '7) update_player_traits: ajusta variables ocultas visibles en el panel. args={patch}; valores 0 a 100.',
    '8) register_cause: registra un hecho como causa persistente. args={nodeKey,nodeType,sourceRef,summary,actorKey,targetKey,importance,playerRelevant,reason}.',
    '9) schedule_consequence: programa una consecuencia causal. args={sourceNodeId,sourceNodeKey,type,summary,priority,probability,delayMinutes,expiresMinutes,effectData,conditionData,playerRelevant,reason}. Tipos: social_delta, memory, intention, information_create, information_share, whatsapp_message, life_event, world_note. Para whatsapp_message usa un contactKey real de contacts y contactName existente.',
    '10) cancel_consequence: cancela una consecuencia pendiente. args={consequenceId,reason}.',
    '11) link_causal: enlaza dos hechos existentes. args={parentNodeId,childNodeId,relationType,weight}.',
    'Para preguntas, análisis o resúmenes no necesitas ejecutar acciones.',
    'Cuando el administrador pida análisis, estrategia, explicación o diagnóstico, responde con profundidad proporcional a la petición. No te limites a una frase corta.',
    'Cruza explícitamente los datos relevantes de jugador, contexto vivo, ubicación, teléfono, WhatsApp, personajes, relaciones, eventos, rutinas, historial y reloj cuando sean pertinentes.',
    'Distingue con claridad hechos observados, inferencias razonables, incertidumbres, riesgos narrativos y posibles líneas de acción.',
    'Puedes desarrollar análisis largos y complejos si aportan valor. Evita relleno, repeticiones y generalidades.',
    'Si detectas contradicciones o huecos en el mundo, señálalos y explica cómo podrían afectar a la simulación.',
    'Cuando propongas acciones, explica en reply por qué encajan con el estado actual y qué consecuencias podrían tener, sin revelar razonamiento interno paso a paso.',
    'El administrador puede pedir escenarios hipotéticos. Compáralos de forma causal: qué cambiaría, qué personajes reaccionarían, qué eventos se abrirían o cerrarían y qué efectos secundarios serían plausibles.',
    'No uses una herramienta si el administrador solo pregunta qué está ocurriendo.',
    'Si una orden es ambigua, responde pidiendo el dato que falta y devuelve actions vacío.',
    'Devuelve SOLO JSON válido: {"reply":"respuesta para el administrador","actions":[{"type":"...","args":{}}]}.',
    'Máximo 8 acciones por respuesta. La respuesta debe ser tan breve o profunda como requiera la petición del administrador. Explica qué entendiste, qué observaste, qué hiciste y las consecuencias relevantes, sin exponer razonamiento interno paso a paso.'
  ].join('\n');
}

async function loadDirectorContext(userId) {
  const [
    playerResult,
    phoneStateResult,
    phoneActivityResult,
    whatsappResult,
    clockResult,
    playerContextResult,
    locationResult,
    lifeEventsResult,
    memoriesResult,
    intentionsResult,
    socialGraph,
    causalGraph
  ] = await Promise.all([
    query(`SELECT u.id,u.username,u.created_at,u.last_login_at,gs.updated_at,gs.save_data
      FROM private_life.users u
      LEFT JOIN private_life.game_saves gs ON gs.user_id=u.id
      WHERE u.id=$1 LIMIT 1`, [userId]),
    query('SELECT state_data,updated_at FROM private_life.phone_state WHERE user_id=$1 LIMIT 1', [userId]),
    query(`SELECT event_type,event_label,event_data,created_at
      FROM private_life.phone_activity WHERE user_id=$1
      ORDER BY created_at DESC LIMIT 80`, [userId]),
    query(`SELECT contact_key,contact_name,direction,message_type,body,created_at,read_at
      FROM private_life.whatsapp_messages WHERE user_id=$1
      ORDER BY created_at DESC LIMIT 80`, [userId]),
    query(`SELECT speed,paused,timezone,
      CASE WHEN paused THEN anchor_game_at
        ELSE anchor_game_at + ((NOW()-anchor_real_at)*speed)
      END AS game_now
      FROM private_life.world_clock WHERE user_id=$1 LIMIT 1`, [userId]),
    query('SELECT * FROM private_life.player_context WHERE user_id=$1 LIMIT 1', [userId]),
    query('SELECT source,display_label,area,city,region,country,country_code,timezone,updated_at FROM private_life.player_location WHERE user_id=$1 LIMIT 1', [userId]),
    query(`SELECT id,event_key,event_type,app,title,body,payload,scheduled_game_at,status,created_at,delivered_at
      FROM private_life.life_events WHERE user_id=$1
      ORDER BY created_at DESC LIMIT 60`, [userId]),
    query(`SELECT id,character_key,memory_type,summary,importance,emotional_valence,occurred_game_at,last_recalled_game_at,recall_count,status
      FROM private_life.npc_memories WHERE user_id=$1 AND status='active'
      ORDER BY importance DESC,occurred_game_at DESC LIMIT 120`,[userId]),
    query(`SELECT id,character_key,intention_type,summary,priority,status,not_before_game_at,due_game_at,trigger_data,created_game_at
      FROM private_life.npc_intentions WHERE user_id=$1 AND status IN ('pending','active')
      ORDER BY priority DESC,COALESCE(due_game_at,not_before_game_at,created_game_at) ASC LIMIT 100`,[userId]),
    loadSocialAnalysis(userId,{limitEvents:80}),
    loadCausalAnalysis(userId,{nodeLimit:160,consequenceLimit:140})
  ]);

  const row = playerResult.rows[0];
  if (!row) return null;
  const save = normalizeSave(row.save_data || {});
  const clock = clockResult.rows[0] || { speed: 1, paused: false, timezone: 'UTC', game_now: new Date() };

  return {
    row,
    save,
    runtime: {
      gameNow: new Date(clock.game_now || Date.now()).toISOString(),
      speed: Number(clock.speed) || 1,
      paused: !!clock.paused,
      timezone: clock.timezone || 'UTC',
      context: playerContextResult.rows[0] || null,
      location: locationResult.rows[0] || null
    },
    context: {
      player: {
        id: String(row.id),
        username: row.username,
        identity: obj(save.identity),
        profile: obj(save.profile),
        hidden: obj(save.hidden),
        free: clip(save.free, 5000),
        installedApps: arr(save.appStore?.installed),
        lastLoginAt: row.last_login_at,
        lastSaveAt: row.updated_at
      },
      life: {
        gameNow: new Date(clock.game_now || Date.now()).toISOString(),
        timezone: clock.timezone || 'UTC',
        speed: Number(clock.speed) || 1,
        paused: !!clock.paused,
        playerContext: playerContextResult.rows[0] || null,
        worldLocation: locationResult.rows[0] || null,
        scheduledEvents: lifeEventsResult.rows
      },
      phone: {
        state: phoneStateResult.rows[0]?.state_data || {},
        updatedAt: phoneStateResult.rows[0]?.updated_at || null,
        recentActivity: phoneActivityResult.rows.map(x => ({
          type: x.event_type,
          label: x.event_label,
          data: obj(x.event_data),
          createdAt: x.created_at
        })),
        recentWhatsApp: whatsappResult.rows.reverse().map(x => ({
          contactId: x.contact_key,
          contactName: x.contact_name,
          direction: x.direction,
          type: x.message_type,
          text: clip(x.body, 900),
          createdAt: x.created_at,
          readAt: x.read_at
        }))
      },
      contacts: arr(save.social?.contacts).slice(0, 40).map(compactContact),
      npcMind:{
        memories:memoriesResult.rows.map(x=>({
          id:String(x.id),characterKey:x.character_key,type:x.memory_type,summary:x.summary,
          importance:Number(x.importance)||0,emotionalValence:Number(x.emotional_valence)||0,
          occurredGameAt:x.occurred_game_at,lastRecalledGameAt:x.last_recalled_game_at,recallCount:Number(x.recall_count)||0
        })),
        intentions:intentionsResult.rows.map(x=>({
          id:String(x.id),characterKey:x.character_key,type:x.intention_type,summary:x.summary,priority:Number(x.priority)||0,
          status:x.status,notBeforeGameAt:x.not_before_game_at,dueGameAt:x.due_game_at,triggerData:x.trigger_data||{},createdGameAt:x.created_game_at
        }))
      },
      socialGraph,
      causalGraph,
      world: {
        characters: save.world.characters.slice(0, 80).map(compactCharacter),
        events: save.world.events.slice(0, 80),
        directorLog: save.world.directorLog.slice(0, 40),
        timeline: save.world.timeline.slice(0, 40),
        narratorHistory: arr(save.narrator?.history).slice(-40)
      }
    }
  };
}

function findCharacter(save, args = {}) {
  const id = clip(args.id, 120);
  if (id) {
    const hit = save.world.characters.find(character => String(character.id || '') === id);
    if (hit) return hit;
  }
  const name = clip(args.name, 100).toLowerCase();
  return name ? save.world.characters.find(character => String(character.name || '').trim().toLowerCase() === name) : null;
}

function findEvent(save, args = {}) {
  const id = clip(args.id, 120);
  if (!id) return null;
  return save.world.events.find(event => String(event.id || '') === id) || null;
}

function contactKeyFor(save, name) {
  const needle = clip(name, 100).toLowerCase();
  if (!needle) return null;
  const contact = arr(save.social?.contacts).find(item => String(item?.name || '').trim().toLowerCase() === needle);
  if (contact?.id) return { key: String(contact.id), name: contact.name };
  const character = save.world.characters.find(item => String(item?.name || '').trim().toLowerCase() === needle);
  if (character?.id) return { key: String(character.id), name: character.name };
  return null;
}

function summarizeAction(type, detail) {
  return { type, detail: clip(detail, 260) };
}

async function executeActions(userId, runtime, save, actions) {
  let saveChanged = false;
  const executed = [];
  const allowedCharacterPatch = new Set(['status','role','occupation','location','appearance','personality','communication','objectives','boundaries','secrets','notes']);
  const allowedApps = new Set(['PRIVATE LIFE','WhatsApp','Instagram','Mensajes','Teléfono','Sistema']);

  for (const action of arr(actions).slice(0, 8)) {
    const type = clip(action?.type, 60);
    const args = obj(action?.args);

    if (type === 'create_character') {
      const name = clip(args.name, 100);
      if (!name) continue;
      if (save.world.characters.some(character => String(character.name || '').trim().toLowerCase() === name.toLowerCase())) {
        executed.push(summarizeAction(type, `No se duplicó a ${name}: ya existe.`));
        continue;
      }
      const age = clamp(args.age || 25, 18, 90);
      const occupation = clip(args.occupation, 160);
      const location = clip(args.location || save.identity?.city || 'entorno cotidiano', 220);
      const traits = {};
      for (const trait of TRAITS) if (args.traits?.[trait] != null) traits[trait] = clamp(args.traits[trait]);
      const character = {
        id: uid('director-char'),
        name,
        age,
        status: 'activo',
        origin: 'director-ai',
        role: clip(args.role || 'personaje del mundo', 220),
        occupation,
        location,
        routine: buildDefaultRoutine({ occupation, city: location }),
        appearance: clip(args.appearance, 1200),
        personality: clip(args.personality, 1800),
        communication: clip(args.communication, 1200),
        objectives: clip(args.objectives, 1200),
        boundaries: clip(args.boundaries, 1200),
        secrets: clip(args.secrets, 1200),
        notes: clip(args.notes || 'Creado por Director IA desde el panel de administración.', 1600),
        traits: {
          confianza: 45, atraccion: 35, apego: 25, tension: 25,
          sospecha: 20, celos: 20, curiosidad: 55, resentimiento: 10,
          ...traits
        },
        createdAt: new Date().toISOString()
      };
      save.world.characters.unshift(character);
      saveChanged = true;
      executed.push(summarizeAction(type, `Personaje creado: ${name}.`));
      continue;
    }

    if (type === 'update_character') {
      const character = findCharacter(save, args);
      if (!character) {
        executed.push(summarizeAction(type, 'No se encontró el personaje indicado.'));
        continue;
      }
      const patch = obj(args.patch);
      for (const key of allowedCharacterPatch) {
        if (patch[key] != null) character[key] = clip(patch[key], key === 'status' ? 40 : 1800);
      }
      character.traits = { ...obj(character.traits) };
      for (const trait of TRAITS) if (args.traits?.[trait] != null) character.traits[trait] = clamp(args.traits[trait]);
      saveChanged = true;
      executed.push(summarizeAction(type, `Ficha actualizada: ${character.name || character.id}.`));
      continue;
    }

    if (type === 'create_event') {
      const description = clip(args.description, 1800);
      if (!description) continue;
      const status = ['pendiente','activo','cerrado'].includes(args.status) ? args.status : 'pendiente';
      save.world.events.unshift({
        id: uid('director-event'),
        description,
        status,
        trigger: 'director-ai',
        condition: clip(args.condition, 1000),
        channel: clip(args.channel, 60),
        contactName: clip(args.contactName, 100),
        message: clip(args.message, 1800),
        createdAt: new Date().toISOString()
      });
      saveChanged = true;
      executed.push(summarizeAction(type, `Evento narrativo creado: ${description}`));
      continue;
    }

    if (type === 'update_event') {
      const event = findEvent(save, args);
      if (!event) {
        executed.push(summarizeAction(type, 'No se encontró el evento indicado.'));
        continue;
      }
      if (['pendiente','activo','cerrado'].includes(args.status)) event.status = args.status;
      if (args.description != null) event.description = clip(args.description, 1800);
      if (args.condition != null) event.condition = clip(args.condition, 1000);
      saveChanged = true;
      executed.push(summarizeAction(type, `Evento actualizado: ${event.description || event.id}.`));
      continue;
    }

    if (type === 'queue_life_event') {
      const title = clip(args.title, 160);
      const body = clip(args.body, 1400);
      if (!title || !body) continue;
      const app = allowedApps.has(String(args.app || '')) ? String(args.app) : 'PRIVATE LIFE';
      const delay = clamp(args.delayMinutes || 1, 1, 1440);
      const scheduled = plusMinutes(runtime.gameNow, delay);
      const contextRevision = Number(runtime.context?.revision) || 1;
      await query(`INSERT INTO private_life.life_events
        (user_id,context_revision,event_key,event_type,app,title,body,payload,scheduled_game_at,status,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,'pending',NOW())`, [
        userId,
        contextRevision,
        uid('director-life').slice(0, 90),
        clip(args.eventType || 'director_event', 80),
        app,
        title,
        body,
        JSON.stringify({
          source: 'admin-director-ai',
          contactName: clip(args.contactName, 100),
          priority: clip(args.priority || 'normal', 30)
        }),
        scheduled
      ]);
      executed.push(summarizeAction(type, `Life Engine: ${title} programado en ${delay} min de juego.`));
      continue;
    }

    if (type === 'queue_whatsapp') {
      const contactName = clip(args.contactName, 100);
      const text = clip(args.text, 1800);
      const target = contactKeyFor(save, contactName);
      if (!target || !text) {
        executed.push(summarizeAction(type, `No se pudo programar WhatsApp para ${contactName || 'contacto desconocido'}.`));
        continue;
      }
      const gameDelay = clamp(args.delayMinutes || 1, 1, 1440);
      const realDelay = Math.max(1, Math.round(gameDelay / Math.max(0.01, Number(runtime.speed) || 1)));
      const deliverAfter = plusMinutes(new Date(), realDelay);
      await query(`INSERT INTO private_life.npc_pending_messages
        (user_id,contact_key,contact_name,body,snapshot,deliver_after)
        VALUES($1,$2,$3,$4,$5::jsonb,$6)`, [
        userId,
        target.key,
        target.name,
        text,
        JSON.stringify({ source: 'admin-director-ai', gameDelayMinutes: gameDelay }),
        deliverAfter
      ]);
      executed.push(summarizeAction(type, `WhatsApp programado para ${target.name}.`));
      continue;
    }

    if (type === 'update_player_traits') {
      const patch = obj(args.patch);
      save.profile = { ...obj(save.profile) };
      let count = 0;
      for (const [key, value] of Object.entries(patch).slice(0, 30)) {
        if (!/^[a-zA-Z0-9_áéíóúüñÁÉÍÓÚÜÑ -]{1,60}$/.test(key)) continue;
        save.profile[key] = clamp(value);
        count += 1;
      }
      if (count) {
        saveChanged = true;
        executed.push(summarizeAction(type, `${count} variables ocultas ajustadas.`));
      }
    }

    if (['register_cause','schedule_consequence','cancel_consequence','link_causal'].includes(type)) {
      const actionMap={
        register_cause:{action:'register_cause',...args},
        schedule_consequence:{action:'schedule_consequence',...args},
        cancel_consequence:{action:'cancel_consequence',...args},
        link_causal:{action:'link',...args}
      };
      const applied=await applyDirectorCausalPlan(userId,{gameNow:new Date(runtime.gameNow),causalActions:[actionMap[type]]});
      if(applied.length)executed.push(summarizeAction(type, applied[0]?.consequence?.summary||applied[0]?.node?.summary||`Acción causal ${type} ejecutada.`));
      else executed.push(summarizeAction(type, `No se pudo aplicar la acción causal ${type}.`));
      continue;
    }
  }

  return { saveChanged, executed };
}

async function persistSave(userId, save) {
  const serialized = JSON.stringify(save);
  if (Buffer.byteLength(serialized, 'utf8') > 2_000_000) throw new Error('La partida supera el tamaño permitido.');
  await query(`INSERT INTO private_life.game_saves(user_id,save_data,updated_at)
    VALUES($1,$2::jsonb,NOW())
    ON CONFLICT(user_id) DO UPDATE SET save_data=EXCLUDED.save_data,updated_at=NOW()`, [userId, serialized]);
}

export async function POST(request) {
  try {
    if (!(await isCurrentAdmin())) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
    await ensureSchema();

    const body = await request.json();
    const userId = String(body?.userId || '');
    const prompt = clip(body?.prompt, 8000);
    const history = arr(body?.history).slice(-20).map(item => ({
      role: item?.role === 'admin' ? 'admin' : 'ai',
      text: clip(item?.text, 3000)
    }));

    if (!/^\d+$/.test(userId) || !prompt) {
      return NextResponse.json({ error: 'Comando del Director no válido.' }, { status: 400 });
    }

    const loaded = await loadDirectorContext(userId);
    if (!loaded) return NextResponse.json({ error: 'Jugador no encontrado.' }, { status: 404 });

    const modelPrompt = [
      'MENSAJE ACTUAL DEL ADMINISTRADOR:',
      prompt,
      'CONVERSACIÓN RECIENTE DEL PANEL:',
      JSON.stringify(history),
      'ESTADO ACTUAL DE LA PARTIDA:',
      JSON.stringify(loaded.context)
    ].join('\n');

    const raw = await runCentralModel(modelPrompt, directorInstructions());
    const decision = parseJson(raw);
    if (!decision) {
      return NextResponse.json({
        error: 'La IA central no ha devuelto una respuesta utilizable. Prueba de nuevo.'
      }, { status: 503 });
    }

    const save = structuredClone(loaded.save);
    const { saveChanged, executed } = await executeActions(userId, loaded.runtime, save, decision.actions);

    const reply = clip(decision.reply || 'He revisado la partida.', 20000);
    save.world.directorLog = [
      {
        id: uid('admin-ai'),
        at: new Date().toISOString(),
        text: `ADMIN: ${prompt}`,
        reply,
        actions: executed
      },
      ...arr(save.world.directorLog)
    ].slice(0, 250);

    if (saveChanged || executed.length || reply) await persistSave(userId, save);

    await query(`INSERT INTO private_life.phone_activity(user_id,event_type,event_label,event_data)
      VALUES($1,'admin_director_ai','Director IA',$2::jsonb)`, [
      userId,
      JSON.stringify({
        prompt: clip(prompt, 500),
        reply: clip(reply, 700),
        actions: executed
      })
    ]);

    return NextResponse.json({
      ok: true,
      reply,
      executed,
      saveChanged,
      save
    });
  } catch (error) {
    console.error('admin_director_ai_failed', error);
    return NextResponse.json({ error: 'No se pudo ejecutar la intervención del Director IA.' }, { status: 500 });
  }
}
