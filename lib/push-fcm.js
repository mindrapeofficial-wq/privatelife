import crypto from 'crypto';
import { query } from './db.js';

const FCM_SCOPE='https://www.googleapis.com/auth/firebase.messaging';
const GOOGLE_TOKEN_URL='https://oauth2.googleapis.com/token';

let cachedAccessToken='';
let cachedAccessTokenExpiresAt=0;

function clean(value,max=2000){
  return String(value??'').replace(/\u0000/g,'').trim().slice(0,max);
}

function serviceAccount(){
  const projectId=clean(process.env.FIREBASE_PROJECT_ID,180);
  const clientEmail=clean(process.env.FIREBASE_CLIENT_EMAIL,320);
  const privateKey=String(process.env.FIREBASE_PRIVATE_KEY||'').replace(/\\n/g,'\n').trim();
  if(!projectId||!clientEmail||!privateKey)return null;
  return {projectId,clientEmail,privateKey};
}

export function isFcmConfigured(){
  return Boolean(serviceAccount());
}

function base64url(value){
  const buffer=Buffer.isBuffer(value)?value:Buffer.from(String(value),'utf8');
  return buffer.toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}

async function accessToken(){
  const account=serviceAccount();
  if(!account)throw new Error('Firebase server credentials are not configured');
  if(cachedAccessToken&&cachedAccessTokenExpiresAt>Date.now()+60000)return cachedAccessToken;

  const now=Math.floor(Date.now()/1000);
  const header=base64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const payload=base64url(JSON.stringify({
    iss:account.clientEmail,
    scope:FCM_SCOPE,
    aud:GOOGLE_TOKEN_URL,
    iat:now,
    exp:now+3600
  }));
  const unsigned=header+'.'+payload;
  const signer=crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const assertion=unsigned+'.'+base64url(signer.sign(account.privateKey));

  const response=await fetch(GOOGLE_TOKEN_URL,{
    method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({
      grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    }),
    signal:AbortSignal.timeout(12000)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.access_token){
    throw new Error('Firebase OAuth failed: '+clean(data?.error_description||data?.error||response.status,500));
  }
  cachedAccessToken=String(data.access_token);
  cachedAccessTokenExpiresAt=Date.now()+Math.max(300,Number(data.expires_in)||3600)*1000;
  return cachedAccessToken;
}

function stringData(input={}){
  const payload=input?.payload&&typeof input.payload==='object'?JSON.stringify(input.payload):'';
  return {
    app:clean(input.app||'PRIVATE LIFE',80),
    title:clean(input.title||'PRIVATE LIFE',160),
    body:clean(input.body||'',700),
    eventType:clean(input.eventType||'game_event',80),
    eventId:clean(input.eventId||'',120),
    route:clean(input.route||'',180),
    payload:clean(payload,1800)
  };
}

async function sendOne(token,input){
  const account=serviceAccount();
  if(!account)return {ok:false,status:503,error:'not_configured'};
  const bearer=await accessToken();
  const response=await fetch(
    'https://fcm.googleapis.com/v1/projects/'+encodeURIComponent(account.projectId)+'/messages:send',
    {
      method:'POST',
      headers:{authorization:'Bearer '+bearer,'content-type':'application/json'},
      body:JSON.stringify({
        message:{
          token,
          data:stringData(input),
          android:{priority:'HIGH',ttl:'86400s'}
        }
      }),
      signal:AbortSignal.timeout(12000)
    }
  );
  const text=await response.text();
  let data={};
  try{data=text?JSON.parse(text):{}}catch{data={raw:text.slice(0,1000)}}
  return {ok:response.ok,status:response.status,data};
}

function invalidToken(result){
  const raw=JSON.stringify(result?.data||{});
  return result?.status===404||/UNREGISTERED|registration-token-not-registered|NOT_FOUND/i.test(raw);
}

export async function sendPushToUser(userId,input){
  const devices=await query(
    "SELECT id,token FROM private_life.push_devices WHERE user_id=$1 AND enabled=TRUE ORDER BY updated_at DESC LIMIT 12",
    [userId]
  );
  const results=[];
  for(const device of devices.rows){
    try{
      const result=await sendOne(device.token,input);
      results.push({id:Number(device.id),ok:result.ok,status:result.status});
      if(result.ok){
        await query("UPDATE private_life.push_devices SET last_seen_at=NOW(),updated_at=NOW() WHERE id=$1",[device.id]);
      }else if(invalidToken(result)){
        await query("DELETE FROM private_life.push_devices WHERE id=$1",[device.id]);
      }
    }catch(error){
      console.error('fcm_send_failed',error);
      results.push({id:Number(device.id),ok:false,status:0});
    }
  }
  return {attempted:devices.rows.length,sent:results.filter(x=>x.ok).length,results};
}
