import { query } from './db.js';
import { tickLifeEngine } from './life-scheduler.js';
import { isFcmConfigured, sendPushToUser } from './push-fcm.js';

async function dueWhatsapp(userId){
  const result=await query(`
    WITH claimed AS (
      UPDATE private_life.npc_pending_messages p
         SET delivered_at=NOW()
       WHERE p.id IN (
         SELECT id
           FROM private_life.npc_pending_messages
          WHERE user_id=$1
            AND delivered_at IS NULL
            AND deliver_after<=NOW()
          ORDER BY deliver_after ASC
          LIMIT 30
          FOR UPDATE SKIP LOCKED
       )
       RETURNING id,user_id,contact_key,contact_name,body,snapshot,deliver_after
    ),
    inserted AS (
      INSERT INTO private_life.whatsapp_messages
        (user_id,contact_key,contact_name,direction,message_type,body,media_data,character_snapshot,read_at)
      SELECT user_id,contact_key,contact_name,'in','text',body,NULL,
             COALESCE(snapshot,'{}'::jsonb)||jsonb_build_object('source','life_engine_push','pendingId',id::text),
             NULL
        FROM claimed
      RETURNING id,contact_key,contact_name,body,created_at
    )
    SELECT * FROM inserted ORDER BY id ASC
  `,[userId]);
  return result.rows;
}

async function activeUsers(){
  const result=await query(`
    SELECT u.id,
           COALESCE(w.timezone,'UTC') AS timezone,
           COALESCE(ps.state_data,'{}'::jsonb) AS phone_state,
           ps.updated_at AS phone_updated_at
      FROM private_life.users u
      JOIN (
        SELECT DISTINCT user_id
          FROM private_life.push_devices
         WHERE enabled=TRUE
      ) d ON d.user_id=u.id
      LEFT JOIN private_life.world_clock w ON w.user_id=u.id
      LEFT JOIN private_life.phone_state ps ON ps.user_id=u.id
     ORDER BY u.id ASC
     LIMIT 120
  `);
  return result.rows;
}

function playerIsActivelyViewing(row){
  const visibility=String(row?.phone_state?.visibility||'').toLowerCase();
  const updated=row?.phone_updated_at?new Date(row.phone_updated_at).getTime():0;
  return visibility==='visible'&&updated>Date.now()-30000;
}

export async function processPushTick({skipVisible=true}={}){
  if(!isFcmConfigured()){
    return {ok:false,configured:false,users:0,processed:0,skippedVisible:0,lifePushes:0,whatsappPushes:0,pushSent:0};
  }

  const users=await activeUsers();
  let processed=0,skippedVisible=0,lifePushes=0,whatsappPushes=0,pushSent=0;

  for(const user of users){
    if(skipVisible&&playerIsActivelyViewing(user)){
      skippedVisible++;
      continue;
    }
    processed++;
    try{
      const tick=await tickLifeEngine(user.id,user.timezone||'UTC',[]);
      for(const event of tick.delivered||[]){
        const sent=await sendPushToUser(user.id,{
          app:event.app||'PRIVATE LIFE',
          title:event.title||'PRIVATE LIFE',
          body:event.body||'',
          eventType:event.type||'life_event',
          eventId:String(event.id||''),
          payload:event.payload||{}
        });
        lifePushes++;
        pushSent+=sent.sent;
      }

      const messages=await dueWhatsapp(user.id);
      for(const message of messages){
        const sent=await sendPushToUser(user.id,{
          app:'WhatsApp',
          title:message.contact_name||'WhatsApp',
          body:message.body||'Nuevo mensaje',
          eventType:'whatsapp_message',
          eventId:String(message.id||''),
          payload:{contactId:message.contact_key,messageId:String(message.id||'')}
        });
        whatsappPushes++;
        pushSent+=sent.sent;
      }
    }catch(error){
      console.error('push_tick_user_failed',user.id,error);
    }
  }

  return {
    ok:true,
    configured:true,
    users:users.length,
    processed,
    skippedVisible,
    lifePushes,
    whatsappPushes,
    pushSent,
    at:new Date().toISOString()
  };
}
