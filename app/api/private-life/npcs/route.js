import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth.js';
import { ensureSchema, query } from '../../../../lib/db.js';

export const runtime='nodejs';

function bad(message,status=400){return NextResponse.json({error:message},{status})}
function cleanText(value,max=500){return String(value??'').trim().slice(0,max)}
function safeConfig(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  const raw=JSON.stringify(value);
  if(raw.length>120000)throw new Error('La configuración del personaje es demasiado grande.');
  return JSON.parse(raw);
}
function mapRow(r){
  return {
    id:Number(r.id),
    name:r.name,
    age:Number(r.age),
    publicHandle:r.public_handle||'',
    avatar:r.avatar||'',
    isActive:!!r.is_active,
    visibility:r.visibility,
    allowPlayerInteractions:!!r.allow_player_interactions,
    config:r.config||{},
    createdAt:r.created_at,
    updatedAt:r.updated_at
  };
}

export async function GET(){
  try{
    await ensureSchema();
    const user=await getCurrentUser();
    if(!user)return bad('No autorizado.',401);
    const r=await query(`SELECT id,name,age,public_handle,avatar,is_active,visibility,allow_player_interactions,config,created_at,updated_at
      FROM private_life.ai_characters
      WHERE owner_user_id=$1
      ORDER BY updated_at DESC,id DESC`,[user.id]);
    return NextResponse.json({characters:r.rows.map(mapRow)});
  }catch(error){
    console.error('private_life_npcs_get_failed',error);
    return bad('No se pudieron cargar tus personajes IA.',500);
  }
}

export async function POST(request){
  try{
    await ensureSchema();
    const user=await getCurrentUser();
    if(!user)return bad('No autorizado.',401);
    const body=await request.json();
    const action=cleanText(body?.action,30);

    if(action==='create'){
      const count=await query('SELECT COUNT(*)::int AS count FROM private_life.ai_characters WHERE owner_user_id=$1',[user.id]);
      if(Number(count.rows[0]?.count||0)>=50)return bad('Has alcanzado el máximo de 50 personajes IA.',409);
      const name=cleanText(body?.name,80);
      const age=Math.max(18,Math.min(120,Number(body?.age)||18));
      const publicHandle=cleanText(body?.publicHandle,60).replace(/^@/,'');
      const avatar=cleanText(body?.avatar,3000);
      const visibility=['private','contacts','public'].includes(body?.visibility)?body.visibility:'private';
      const allow=!!body?.allowPlayerInteractions;
      const config=safeConfig(body?.config);
      if(!name)return bad('El personaje necesita un nombre.');
      const r=await query(`INSERT INTO private_life.ai_characters
        (owner_user_id,name,age,public_handle,avatar,is_active,visibility,allow_player_interactions,config)
        VALUES($1,$2,$3,$4,$5,TRUE,$6,$7,$8::jsonb)
        RETURNING id,name,age,public_handle,avatar,is_active,visibility,allow_player_interactions,config,created_at,updated_at`,
        [user.id,name,age,publicHandle||null,avatar,visibility,allow,JSON.stringify(config)]);
      return NextResponse.json({ok:true,character:mapRow(r.rows[0])});
    }

    const id=Number(body?.id);
    if(!id)return bad('Personaje no válido.');
    const owned=await query('SELECT * FROM private_life.ai_characters WHERE id=$1 AND owner_user_id=$2 LIMIT 1',[id,user.id]);
    if(!owned.rows[0])return bad('Personaje no encontrado.',404);

    if(action==='update'){
      const current=owned.rows[0];
      const name=cleanText(body?.name??current.name,80);
      const age=Math.max(18,Math.min(120,Number(body?.age??current.age)||18));
      const publicHandle=cleanText(body?.publicHandle??current.public_handle,60).replace(/^@/,'');
      const avatar=cleanText(body?.avatar??current.avatar,3000);
      const visibility=['private','contacts','public'].includes(body?.visibility)?body.visibility:current.visibility;
      const allow=body?.allowPlayerInteractions===undefined?current.allow_player_interactions:!!body.allowPlayerInteractions;
      const active=body?.isActive===undefined?current.is_active:!!body.isActive;
      const config=body?.config===undefined?current.config:safeConfig(body.config);
      if(!name)return bad('El personaje necesita un nombre.');
      const r=await query(`UPDATE private_life.ai_characters SET
        name=$1,age=$2,public_handle=$3,avatar=$4,is_active=$5,visibility=$6,allow_player_interactions=$7,config=$8::jsonb,updated_at=NOW()
        WHERE id=$9 AND owner_user_id=$10
        RETURNING id,name,age,public_handle,avatar,is_active,visibility,allow_player_interactions,config,created_at,updated_at`,
        [name,age,publicHandle||null,avatar,active,visibility,allow,JSON.stringify(config),id,user.id]);
      return NextResponse.json({ok:true,character:mapRow(r.rows[0])});
    }

    if(action==='duplicate'){
      const c=owned.rows[0];
      const r=await query(`INSERT INTO private_life.ai_characters
        (owner_user_id,name,age,public_handle,avatar,is_active,visibility,allow_player_interactions,config)
        VALUES($1,$2,$3,NULL,$4,FALSE,'private',FALSE,$5::jsonb)
        RETURNING id,name,age,public_handle,avatar,is_active,visibility,allow_player_interactions,config,created_at,updated_at`,
        [user.id,cleanText(c.name+' copia',80),c.age,c.avatar||'',JSON.stringify(c.config||{})]);
      return NextResponse.json({ok:true,character:mapRow(r.rows[0])});
    }

    if(action==='delete'){
      await query('DELETE FROM private_life.ai_characters WHERE id=$1 AND owner_user_id=$2',[id,user.id]);
      return NextResponse.json({ok:true});
    }

    if(action==='toggle_active'){
      const r=await query(`UPDATE private_life.ai_characters SET is_active=NOT is_active,updated_at=NOW()
        WHERE id=$1 AND owner_user_id=$2
        RETURNING id,name,age,public_handle,avatar,is_active,visibility,allow_player_interactions,config,created_at,updated_at`,[id,user.id]);
      return NextResponse.json({ok:true,character:mapRow(r.rows[0])});
    }

    return bad('Acción no válida.');
  }catch(error){
    console.error('private_life_npcs_post_failed',error);
    return bad(error?.message||'No se pudo completar la acción.',500);
  }
}
