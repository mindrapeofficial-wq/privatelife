import { NextResponse } from 'next/server';
import { isCurrentAdmin } from '../../../../lib/auth.js';
import { ensureSchema, query } from '../../../../lib/db.js';
import { resolveRoutineState } from '../../../../lib/life-routines.js';
import { loadSocialAnalysis } from '../../../../lib/life-social.js';
import { loadCausalAnalysis } from '../../../../lib/life-causality.js';
import { runCentralModel } from '../../../../lib/central-ai-provider.js';

export const runtime = 'nodejs';

export async function GET(request) {
  try {
    if (!(await isCurrentAdmin())) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
    await ensureSchema();
    const userId = request.nextUrl.searchParams.get('userId');
    if (!/^\d+$/.test(String(userId || ''))) {
      return NextResponse.json({ error: 'Jugador no válido.' }, { status: 400 });
    }
    const result = await query(
      `SELECT u.id, u.username, u.created_at, u.last_login_at,
              gs.updated_at, gs.save_data
         FROM private_life.users u
         LEFT JOIN private_life.game_saves gs ON gs.user_id = u.id
        WHERE u.id = $1
        LIMIT 1`,
      [userId]
    );
    const row = result.rows[0];
    if (!row) return NextResponse.json({ error: 'Jugador no encontrado.' }, { status: 404 });

    const phoneState = await query(
      'SELECT state_data, updated_at FROM private_life.phone_state WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    const phoneActivity = await query(
      `SELECT id, event_type, event_label, event_data, created_at
         FROM private_life.phone_activity
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 120`,
      [userId]
    );

    const whatsappMessages = await query(
      "SELECT id, contact_key, contact_name, direction, message_type, body, created_at, read_at FROM private_life.whatsapp_messages WHERE user_id = $1 ORDER BY created_at DESC LIMIT 160",
      [userId]
    );

    const clockResult=await query(`SELECT speed,paused,timezone,
      CASE WHEN paused THEN anchor_game_at
        ELSE anchor_game_at + ((NOW()-anchor_real_at)*speed)
      END AS game_now
      FROM private_life.world_clock WHERE user_id=$1 LIMIT 1`,[userId]);
    const clock=clockResult.rows[0]||{speed:1,paused:false,timezone:'UTC',game_now:new Date()};
    const [playerContextResult,lifeEventsResult,playerLocationResult,autonomyStateResult,autonomyEventsResult,npcMemoriesResult,npcIntentionsResult,socialGraph,causalGraph]=await Promise.all([
      query('SELECT location_key,location_label,activity_key,activity_label,availability,social_exposure,privacy,started_game_at,expected_until_game_at,revision,last_evaluated_game_at,next_evaluation_game_at,updated_at FROM private_life.player_context WHERE user_id=$1 LIMIT 1',[userId]),
      query("SELECT id,event_key,event_type,app,title,body,payload,scheduled_game_at,status,created_at,delivered_at FROM private_life.life_events WHERE user_id=$1 ORDER BY created_at DESC LIMIT 80",[userId]),
      query('SELECT source,display_label,area,city,region,country,country_code,latitude,longitude,accuracy_m,timezone,updated_at FROM private_life.player_location WHERE user_id=$1 LIMIT 1',[userId]),
      query("SELECT character_key,next_action_game_at,last_action_game_at,daily_key,daily_count,state_data,updated_at FROM private_life.npc_autonomy_state WHERE user_id=$1 ORDER BY next_action_game_at ASC LIMIT 200",[userId]),
      query("SELECT id,character_key,character_name,event_type,event_data,game_at,created_at FROM private_life.npc_autonomy_events WHERE user_id=$1 ORDER BY game_at DESC,id DESC LIMIT 120",[userId]),
      query("SELECT id,character_key,memory_type,summary,importance,emotional_valence,occurred_game_at,last_recalled_game_at,recall_count,status,metadata FROM private_life.npc_memories WHERE user_id=$1 ORDER BY importance DESC,occurred_game_at DESC LIMIT 300",[userId]),
      query("SELECT id,character_key,intention_type,summary,priority,status,not_before_game_at,due_game_at,trigger_data,created_game_at,resolved_game_at,resolution_note,metadata FROM private_life.npc_intentions WHERE user_id=$1 ORDER BY created_game_at DESC LIMIT 300",[userId]),
      loadSocialAnalysis(userId,{limitEvents:120}),
      loadCausalAnalysis(userId,{nodeLimit:220,consequenceLimit:180})
    ]);
    const save=row.save_data||{};
    const lifeCharacters=(Array.isArray(save?.world?.characters)?save.world.characters:[]).map(character=>({
      id:String(character?.id||''),
      name:String(character?.name||'Personaje'),
      ...resolveRoutineState(character?.routine,new Date(clock.game_now),{
        occupation:character?.occupation||'',
        city:character?.location||save?.identity?.city||'',
        timezone:clock.timezone||'UTC',
        characterKey:'admin:'+String(character?.id||character?.name||'npc')
      })
    }));

    return NextResponse.json({
      player: {
        id: String(row.id),
        username: row.username,
        createdAt: row.created_at,
        lastLoginAt: row.last_login_at,
        updatedAt: row.updated_at,
        save: row.save_data || {},
        phone: {
          state: phoneState.rows[0]?.state_data || {},
          updatedAt: phoneState.rows[0]?.updated_at || null,
          activity: phoneActivity.rows.map(x => ({
            id: String(x.id),
            type: x.event_type,
            label: x.event_label,
            data: x.event_data || {},
            createdAt: x.created_at,
          })),
          whatsapp: whatsappMessages.rows.map(x => ({
            id: String(x.id),
            contactId: x.contact_key,
            contactName: x.contact_name,
            side: x.direction,
            type: x.message_type,
            text: x.body || '',
            createdAt: x.created_at,
            readAt: x.read_at,
          })),
        },
        life:{
          gameNow:clock.game_now,
          timezone:clock.timezone||'UTC',
          speed:Number(clock.speed)||1,
          paused:!!clock.paused,
          context:playerContextResult.rows[0]||null,
          worldLocation:playerLocationResult.rows[0]||null,
          events:lifeEventsResult.rows.map(e=>({
            id:String(e.id),key:e.event_key,type:e.event_type,app:e.app,title:e.title,body:e.body,
            payload:e.payload||{},scheduledGameAt:e.scheduled_game_at,status:e.status,createdAt:e.created_at,deliveredAt:e.delivered_at
          })),
          autonomy:autonomyStateResult.rows.map(x=>({
            characterKey:x.character_key,nextActionGameAt:x.next_action_game_at,lastActionGameAt:x.last_action_game_at,
            dailyKey:x.daily_key,dailyCount:Number(x.daily_count)||0,state:x.state_data||{},updatedAt:x.updated_at
          })),
          autonomyEvents:autonomyEventsResult.rows.map(x=>({
            id:String(x.id),characterKey:x.character_key,characterName:x.character_name,type:x.event_type,
            data:x.event_data||{},gameAt:x.game_at,createdAt:x.created_at
          })),
          memories:npcMemoriesResult.rows.map(x=>({
            id:String(x.id),characterKey:x.character_key,type:x.memory_type,summary:x.summary,
            importance:Number(x.importance)||0,emotionalValence:Number(x.emotional_valence)||0,
            occurredGameAt:x.occurred_game_at,lastRecalledGameAt:x.last_recalled_game_at,
            recallCount:Number(x.recall_count)||0,status:x.status,metadata:x.metadata||{}
          })),
          intentions:npcIntentionsResult.rows.map(x=>({
            id:String(x.id),characterKey:x.character_key,type:x.intention_type,summary:x.summary,
            priority:Number(x.priority)||0,status:x.status,notBeforeGameAt:x.not_before_game_at,
            dueGameAt:x.due_game_at,triggerData:x.trigger_data||{},createdGameAt:x.created_game_at,
            resolvedGameAt:x.resolved_game_at,resolutionNote:x.resolution_note||'',metadata:x.metadata||{}
          })),
          socialGraph,
          causalGraph,
          characters:lifeCharacters,
        },
      },
    });
  } catch (error) {
    console.error('admin_player_read_failed', error);
    return NextResponse.json({ error: 'No se pudo cargar la partida.' }, { status: 500 });
  }
}


export async function POST(request) {
  try {
    if (!(await isCurrentAdmin())) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
    await ensureSchema();
    const body = await request.json();
    const userId = String(body?.userId || '');
    const characterId = String(body?.characterId || '').trim();
    const action = String(body?.action || '').trim();

    if (action !== 'force_npc_message') {
      return NextResponse.json({ error: 'Acción no válida.' }, { status: 400 });
    }
    if (!/^\d+$/.test(userId) || !characterId) {
      return NextResponse.json({ error: 'Jugador o personaje no válido.' }, { status: 400 });
    }

    const [userResult, saveResult, clockResult, contextResult] = await Promise.all([
      query('SELECT id,username FROM private_life.users WHERE id=$1 LIMIT 1',[userId]),
      query('SELECT save_data FROM private_life.game_saves WHERE user_id=$1 LIMIT 1',[userId]),
      query(`SELECT speed,paused,timezone,
        CASE WHEN paused THEN anchor_game_at
          ELSE anchor_game_at + ((NOW()-anchor_real_at)*speed)
        END AS game_now
        FROM private_life.world_clock WHERE user_id=$1 LIMIT 1`,[userId]),
      query('SELECT revision,location_label,activity_label,availability FROM private_life.player_context WHERE user_id=$1 LIMIT 1',[userId])
    ]);

    if (!userResult.rows[0]) return NextResponse.json({ error: 'Jugador no encontrado.' }, { status: 404 });

    const save=saveResult.rows[0]?.save_data||{};
    const characters=Array.isArray(save?.world?.characters)?save.world.characters:[];
    const character=characters.find(x=>String(x?.id||'')===characterId);
    if(!character) return NextResponse.json({ error: 'Personaje no encontrado en la partida.' }, { status: 404 });

    const name=String(character.name||'Personaje').trim()||'Personaje';
    const recent=await query(
      `SELECT contact_key,contact_name,direction,message_type,body,created_at
         FROM private_life.whatsapp_messages
        WHERE user_id=$1 AND LOWER(contact_name)=LOWER($2)
        ORDER BY created_at DESC LIMIT 18`,
      [userId,name]
    );
    const contactKey=String(recent.rows[0]?.contact_key||('world:'+characterId));
    const clock=clockResult.rows[0]||{game_now:new Date(),timezone:'UTC',speed:1,paused:false};
    const gameNow=new Date(clock.game_now||Date.now());
    const context=contextResult.rows[0]||null;

    const instructions=[
      'Eres CENTRAL DIRECTOR de PRIVATE LIFE.',
      'Genera un único mensaje espontáneo de WhatsApp iniciado por este NPC ficticio adulto.',
      'Es una prueba de sistema solicitada por el Director, pero el texto debe sentirse completamente natural dentro del mundo.',
      'Respeta la personalidad, relación, contexto del jugador, hora, continuidad y conversación previa.',
      'No digas que es una prueba, no menciones IA, admin, motor, variables, prompts ni sistema.',
      'No supongas que el NPC conoce la ubicación o actividad exacta del jugador salvo que el historial lo justifique.',
      'Devuelve SOLO JSON válido con {message,reason,mood}. message debe tener entre 1 y 320 caracteres.'
    ].join('\n');

    const prompt=JSON.stringify({
      gameNow:gameNow.toISOString(),
      timezone:clock.timezone||'UTC',
      player:{
        username:userResult.rows[0].username,
        identity:save?.identity||{},
        profile:save?.profile||{},
        currentContext:context
      },
      character,
      recentConversation:[...recent.rows].reverse().map(m=>({
        side:m.direction,
        type:m.message_type,
        text:String(m.body||'').slice(0,500),
        at:m.created_at
      }))
    });

    let message='',reason='Prueba forzada del Director',mood='neutral',modelBacked=false;
    try{
      const raw=await runCentralModel(prompt,instructions);
      const parsed=raw?JSON.parse(raw):null;
      message=String(parsed?.message||'').trim().slice(0,320);
      reason=String(parsed?.reason||reason).trim().slice(0,220)||reason;
      mood=String(parsed?.mood||mood).trim().slice(0,80)||mood;
      modelBacked=Boolean(message);
    }catch{}

    if(!message){
      const fallback=[
        'Ey, me he acordado de ti. ¿Qué haces?',
        'Tengo un rato y me ha dado por escribirte. ¿Cómo va el día?',
        'Oye, me quedé pensando en lo último que hablamos.',
        '¿Qué tal estás? Hace un rato que me rondaba escribirte.'
      ];
      let h=0;for(const ch of characterId+String(Date.now()))h=((h<<5)-h+ch.charCodeAt(0))|0;
      message=fallback[Math.abs(h)%fallback.length];
      reason='Fallback local de prueba';
      mood='cotidiano';
    }

    const inserted=await query(
      `INSERT INTO private_life.whatsapp_messages
        (user_id,contact_key,contact_name,direction,message_type,body,media_data,character_snapshot,read_at)
        VALUES($1,$2,$3,'in','text',$4,NULL,$5::jsonb,NULL)
        RETURNING id,contact_key,contact_name,body,created_at`,
      [userId,contactKey,name,message,JSON.stringify({
        source:'director_forced_test',
        characterId,
        modelBacked,
        reason,
        mood,
        forcedAt:new Date().toISOString()
      })]
    );
    const row=inserted.rows[0];

    const revision=Number(context?.revision)||1;
    await query(
      `INSERT INTO private_life.life_events
        (user_id,context_revision,event_key,event_type,app,title,body,payload,scheduled_game_at,status,created_at)
        VALUES($1,$2,$3,'forced_npc_message','WhatsApp',$4,$5,$6::jsonb,$7,'pending',NOW())`,
      [
        userId,revision,'director-force-'+String(row.id),name,message,
        JSON.stringify({
          source:'director_forced_test',
          contactId:contactKey,
          contactName:name,
          messageId:String(row.id),
          characterId,
          modelBacked
        }),
        gameNow
      ]
    );

    await query(
      `INSERT INTO private_life.npc_autonomy_events
        (user_id,character_key,character_name,event_type,event_data,game_at)
        VALUES($1,$2,$3,'npc_forced_test',$4::jsonb,$5)`,
      [userId,'world:'+characterId,name,JSON.stringify({
        message,
        reason,
        mood,
        contactId:contactKey,
        messageId:String(row.id),
        modelBacked,
        source:'admin_panel'
      }),gameNow]
    );

    await query(
      `INSERT INTO private_life.phone_activity
        (user_id,event_type,event_label,event_data)
        VALUES($1,'npc_forced_test',$2,$3::jsonb)`,
      [userId,name,JSON.stringify({
        contactId:contactKey,
        characterId,
        messageId:String(row.id),
        message,
        modelBacked,
        source:'admin_panel'
      })]
    );

    console.log('director_forced_npc_message',{
      userId:String(userId),characterId,name,contactKey,messageId:String(row.id),modelBacked
    });

    return NextResponse.json({
      ok:true,
      message:{
        id:String(row.id),
        contactId:contactKey,
        contactName:name,
        text:message,
        createdAt:row.created_at
      },
      reason,
      mood,
      modelBacked
    });
  } catch (error) {
    console.error('admin_force_npc_message_failed', error);
    return NextResponse.json({ error: 'No se pudo forzar la interacción.' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    if (!(await isCurrentAdmin())) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
    await ensureSchema();
    const body = await request.json();
    const userId = String(body?.userId || '');
    const save = body?.save;
    if (!/^\d+$/.test(userId) || !save || typeof save !== 'object' || Array.isArray(save)) {
      return NextResponse.json({ error: 'Datos de partida no válidos.' }, { status: 400 });
    }
    const exists = await query('SELECT id FROM private_life.users WHERE id = $1 LIMIT 1', [userId]);
    if (!exists.rows[0]) return NextResponse.json({ error: 'Jugador no encontrado.' }, { status: 404 });
    const serialized = JSON.stringify(save);
    if (Buffer.byteLength(serialized, 'utf8') > 2_000_000) {
      return NextResponse.json({ error: 'La partida supera el tamaño permitido.' }, { status: 413 });
    }
    await query(
      `INSERT INTO private_life.game_saves (user_id, save_data, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET save_data = EXCLUDED.save_data, updated_at = NOW()`,
      [userId, serialized]
    );
    return NextResponse.json({ ok: true, save });
  } catch (error) {
    console.error('admin_player_write_failed', error);
    return NextResponse.json({ error: 'No se pudo guardar la intervención.' }, { status: 500 });
  }
}
