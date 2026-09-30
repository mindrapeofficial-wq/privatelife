import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth.js';
import { ensureSchema, query } from '../../../../lib/db.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const clean=(v,n=180)=>String(v??'').replace(/\u0000/g,'').trim().slice(0,n);
const round3=v=>Math.round(Number(v)*1000)/1000;
const validLat=v=>Number.isFinite(Number(v))&&Number(v)>=-90&&Number(v)<=90;
const validLon=v=>Number.isFinite(Number(v))&&Number(v)>=-180&&Number(v)<=180;

function publicLocation(row){
  if(!row)return null;
  return {
    configured:true,
    source:row.source,
    displayLabel:row.display_label,
    area:row.area||'',
    city:row.city||'',
    region:row.region||'',
    country:row.country||'',
    countryCode:row.country_code||'',
    latitude:row.latitude==null?null:Number(row.latitude),
    longitude:row.longitude==null?null:Number(row.longitude),
    accuracy:row.accuracy_m==null?null:Number(row.accuracy_m),
    timezone:row.timezone||'UTC',
    updatedAt:row.updated_at
  };
}

async function reverseGeocode(lat,lon){
  try{
    const url='https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&addressdetails=1&lat='+encodeURIComponent(lat)+'&lon='+encodeURIComponent(lon);
    const response=await fetch(url,{
      headers:{
        'User-Agent':'PrivateLifeGame/1.0',
        'Accept-Language':'es,en;q=0.7',
        Accept:'application/json'
      },
      signal:AbortSignal.timeout(7000)
    });
    if(!response.ok)return null;
    const data=await response.json();
    const a=data?.address||{};
    const city=clean(a.city||a.town||a.village||a.municipality||a.county,100);
    const area=clean(a.suburb||a.neighbourhood||a.quarter||a.hamlet,100);
    const region=clean(a.state||a.region||a.province,100);
    const country=clean(a.country,100);
    return {
      displayLabel:clean([area,city].filter(Boolean).join(', ')||data?.display_name||city||region||country,180),
      area,city,region,country,countryCode:clean(a.country_code,8).toUpperCase()
    };
  }catch{return null}
}

export async function GET(){
  try{
    await ensureSchema();
    const user=await getCurrentUser();
    if(!user)return NextResponse.json({error:'No autorizado.'},{status:401});
    const result=await query('SELECT * FROM private_life.player_location WHERE user_id=$1 LIMIT 1',[user.id]);
    return NextResponse.json({location:publicLocation(result.rows[0]),configured:Boolean(result.rows[0])},{headers:{'Cache-Control':'no-store, max-age=0'}});
  }catch(error){
    console.error('player_location_read_failed',error);
    return NextResponse.json({error:'No se pudo leer la ubicación.'},{status:500});
  }
}

export async function PUT(request){
  try{
    await ensureSchema();
    const user=await getCurrentUser();
    if(!user)return NextResponse.json({error:'No autorizado.'},{status:401});
    const body=await request.json();
    const source=body?.source==='device'?'device':'manual';
    const timezone=clean(body?.timezone,80)||'UTC';
    let latitude=null,longitude=null,accuracy=null,displayLabel='',area='',city='',region='',country='',countryCode='';

    if(source==='device'){
      if(!validLat(body?.latitude)||!validLon(body?.longitude))return NextResponse.json({error:'Coordenadas no válidas.'},{status:400});
      latitude=round3(body.latitude);
      longitude=round3(body.longitude);
      accuracy=Math.max(0,Math.min(50000,Math.round(Number(body?.accuracy)||0)))||null;
      const geo=await reverseGeocode(latitude,longitude);
      displayLabel=geo?.displayLabel||'Ubicación actual';
      area=geo?.area||'';city=geo?.city||'';region=geo?.region||'';country=geo?.country||'';countryCode=geo?.countryCode||'';
    }else{
      displayLabel=clean(body?.label,180);
      if(displayLabel.length<2)return NextResponse.json({error:'Escribe tu ciudad o zona.'},{status:400});
      city=displayLabel;
    }

    const result=await query(`
      INSERT INTO private_life.player_location
        (user_id,source,display_label,area,city,region,country,country_code,latitude,longitude,accuracy_m,timezone,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
      ON CONFLICT(user_id) DO UPDATE SET
        source=EXCLUDED.source,
        display_label=EXCLUDED.display_label,
        area=EXCLUDED.area,
        city=EXCLUDED.city,
        region=EXCLUDED.region,
        country=EXCLUDED.country,
        country_code=EXCLUDED.country_code,
        latitude=EXCLUDED.latitude,
        longitude=EXCLUDED.longitude,
        accuracy_m=EXCLUDED.accuracy_m,
        timezone=EXCLUDED.timezone,
        updated_at=NOW()
      RETURNING *`,
      [user.id,source,displayLabel,area,city,region,country,countryCode,latitude,longitude,accuracy,timezone]
    );

    await Promise.all([
      query(
        "INSERT INTO private_life.phone_activity (user_id,event_type,event_label,event_data) VALUES($1,'world_location_changed',$2,$3::jsonb)",
        [user.id,displayLabel,JSON.stringify({source,displayLabel,area,city,region,country,countryCode,latitude,longitude,accuracy,timezone})]
      ),
      query("UPDATE private_life.life_events SET status='cancelled' WHERE user_id=$1 AND status='pending'",[user.id]),
      query("UPDATE private_life.player_context SET next_evaluation_game_at=NOW(),last_evaluated_game_at=NULL,updated_at=NOW() WHERE user_id=$1",[user.id]),
      query("UPDATE private_life.world_director_state SET next_run_game_at=NOW(),updated_at=NOW() WHERE user_id=$1",[user.id])
    ]);

    return NextResponse.json({ok:true,location:publicLocation(result.rows[0])});
  }catch(error){
    console.error('player_location_write_failed',error);
    return NextResponse.json({error:'No se pudo guardar la ubicación.'},{status:500});
  }
}
