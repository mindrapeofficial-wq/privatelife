import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../lib/auth.js';
import { ensureSchema, query } from '../../../lib/db.js';

export const runtime = 'nodejs';

function profileFrom(row){
  const save=row?.save_data||{};
  const identity=save.identity||{};
  const sources=save.sources||{};
  return {
    id:Number(row.id),
    username:row.username,
    name:String(identity.name||row.username||'Jugador'),
    age:identity.age||'',
    city:String(identity.city||''),
    occupation:String(identity.occupation||''),
    photo:String(sources.photo||'')
  };
}
function pair(a,b){const x=Number(a),y=Number(b);return x<y?[x,y]:[y,x]}
async function areFriends(a,b){
  const [low,high]=pair(a,b);
  const r=await query('SELECT 1 FROM private_life.facebook_friendships WHERE user_low_id=$1 AND user_high_id=$2 LIMIT 1',[low,high]);
  return !!r.rows[0];
}
function bad(message,status=400){return NextResponse.json({error:message},{status})}

export async function GET(request){
  try{
    await ensureSchema();
    const user=await getCurrentUser();
    if(!user)return bad('No autorizado.',401);

    const url=new URL(request.url);
    const withId=Number(url.searchParams.get('with')||0);

    const meResult=await query(`SELECT u.id,u.username,g.save_data
      FROM private_life.users u LEFT JOIN private_life.game_saves g ON g.user_id=u.id
      WHERE u.id=$1`,[user.id]);
    const me=profileFrom(meResult.rows[0]);

    const peopleResult=await query(`SELECT u.id,u.username,g.save_data
      FROM private_life.users u LEFT JOIN private_life.game_saves g ON g.user_id=u.id
      WHERE u.id<>$1 ORDER BY COALESCE(g.updated_at,u.created_at) DESC LIMIT 100`,[user.id]);
    const people=peopleResult.rows.map(profileFrom);

    const friendships=await query(`SELECT CASE WHEN user_low_id=$1 THEN user_high_id ELSE user_low_id END AS friend_id
      FROM private_life.facebook_friendships
      WHERE user_low_id=$1 OR user_high_id=$1`,[user.id]);
    const friendIds=new Set(friendships.rows.map(r=>Number(r.friend_id)));

    const pending=await query(`SELECT id,requester_id,recipient_id,status,created_at
      FROM private_life.facebook_friend_requests
      WHERE status='pending' AND (requester_id=$1 OR recipient_id=$1)
      ORDER BY created_at DESC`,[user.id]);
    const pendingByUser=new Map();
    for(const r of pending.rows){
      const other=Number(r.requester_id)===Number(user.id)?Number(r.recipient_id):Number(r.requester_id);
      pendingByUser.set(other,{id:Number(r.id),direction:Number(r.requester_id)===Number(user.id)?'outgoing':'incoming'});
    }
    const decoratedPeople=people.map(p=>({...p,relationship:friendIds.has(p.id)?'friend':(pendingByUser.get(p.id)?.direction||'none'),requestId:pendingByUser.get(p.id)?.id||null}));
    const friends=decoratedPeople.filter(p=>p.relationship==='friend');
    const requests=decoratedPeople.filter(p=>p.relationship==='incoming');

    const postsResult=await query(`SELECT p.id,p.user_id,p.body,p.created_at,u.username,g.save_data,
      (SELECT COUNT(*)::int FROM private_life.facebook_post_likes l WHERE l.post_id=p.id) AS likes,
      EXISTS(SELECT 1 FROM private_life.facebook_post_likes l WHERE l.post_id=p.id AND l.user_id=$1) AS liked
      FROM private_life.facebook_posts p
      JOIN private_life.users u ON u.id=p.user_id
      LEFT JOIN private_life.game_saves g ON g.user_id=u.id
      WHERE p.user_id=$1 OR EXISTS(
        SELECT 1 FROM private_life.facebook_friendships f
        WHERE (f.user_low_id=$1 AND f.user_high_id=p.user_id) OR (f.user_high_id=$1 AND f.user_low_id=p.user_id)
      )
      ORDER BY p.created_at DESC LIMIT 80`,[user.id]);

    const postIds=postsResult.rows.map(r=>Number(r.id));
    let comments=[];
    if(postIds.length){
      const cr=await query(`SELECT c.id,c.post_id,c.body,c.created_at,u.id AS user_id,u.username,g.save_data
        FROM private_life.facebook_comments c
        JOIN private_life.users u ON u.id=c.user_id
        LEFT JOIN private_life.game_saves g ON g.user_id=u.id
        WHERE c.post_id = ANY($1::bigint[]) ORDER BY c.created_at ASC`,[postIds]);
      comments=cr.rows.map(r=>({id:Number(r.id),postId:Number(r.post_id),body:r.body,createdAt:r.created_at,author:profileFrom(r)}));
    }
    const posts=postsResult.rows.map(r=>({
      id:Number(r.id),body:r.body,createdAt:r.created_at,likes:Number(r.likes||0),liked:!!r.liked,
      author:profileFrom(r),comments:comments.filter(c=>c.postId===Number(r.id))
    }));

    const conv=await query(`SELECT f.friend_id,u.username,g.save_data,
      m.body AS last_body,m.created_at AS last_at,
      COALESCE(unread.count,0)::int AS unread
      FROM (
        SELECT CASE WHEN user_low_id=$1 THEN user_high_id ELSE user_low_id END AS friend_id
        FROM private_life.facebook_friendships WHERE user_low_id=$1 OR user_high_id=$1
      ) f
      JOIN private_life.users u ON u.id=f.friend_id
      LEFT JOIN private_life.game_saves g ON g.user_id=u.id
      LEFT JOIN LATERAL (
        SELECT body,created_at FROM private_life.facebook_messages
        WHERE (sender_id=$1 AND recipient_id=f.friend_id) OR (sender_id=f.friend_id AND recipient_id=$1)
        ORDER BY created_at DESC LIMIT 1
      ) m ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS count FROM private_life.facebook_messages
        WHERE sender_id=f.friend_id AND recipient_id=$1 AND read_at IS NULL
      ) unread ON true
      ORDER BY m.created_at DESC NULLS LAST,u.username ASC`,[user.id]);
    const conversations=conv.rows.map(r=>({...profileFrom({id:r.friend_id,username:r.username,save_data:r.save_data}),lastBody:r.last_body||'',lastAt:r.last_at||null,unread:Number(r.unread||0)}));

    let messages=[];
    if(withId && await areFriends(user.id,withId)){
      const mr=await query(`SELECT id,sender_id,recipient_id,body,created_at,read_at
        FROM private_life.facebook_messages
        WHERE (sender_id=$1 AND recipient_id=$2) OR (sender_id=$2 AND recipient_id=$1)
        ORDER BY created_at ASC LIMIT 200`,[user.id,withId]);
      messages=mr.rows.map(r=>({id:Number(r.id),senderId:Number(r.sender_id),recipientId:Number(r.recipient_id),body:r.body,createdAt:r.created_at,readAt:r.read_at}));
      await query('UPDATE private_life.facebook_messages SET read_at=COALESCE(read_at,NOW()) WHERE sender_id=$1 AND recipient_id=$2 AND read_at IS NULL',[withId,user.id]);
    }

    return NextResponse.json({me,people:decoratedPeople,friends,requests,posts,conversations,messages});
  }catch(error){
    console.error('facebook_get_failed',error);
    return bad('No se pudo cargar Facebook.',500);
  }
}

export async function POST(request){
  try{
    await ensureSchema();
    const user=await getCurrentUser();
    if(!user)return bad('No autorizado.',401);
    const body=await request.json();
    const action=String(body?.action||'');

    if(action==='create_post'){
      const text=String(body.text||'').trim().slice(0,2000);
      if(!text)return bad('Escribe algo para publicar.');
      const r=await query('INSERT INTO private_life.facebook_posts(user_id,body) VALUES($1,$2) RETURNING id',[user.id,text]);
      return NextResponse.json({ok:true,id:Number(r.rows[0].id)});
    }

    if(action==='toggle_like'){
      const postId=Number(body.postId);
      const visible=await query(`SELECT 1 FROM private_life.facebook_posts p WHERE p.id=$1 AND (
        p.user_id=$2 OR EXISTS(SELECT 1 FROM private_life.facebook_friendships f WHERE
        (f.user_low_id=$2 AND f.user_high_id=p.user_id) OR (f.user_high_id=$2 AND f.user_low_id=p.user_id)))`,[postId,user.id]);
      if(!visible.rows[0])return bad('Publicación no disponible.',404);
      const exists=await query('SELECT 1 FROM private_life.facebook_post_likes WHERE post_id=$1 AND user_id=$2',[postId,user.id]);
      if(exists.rows[0])await query('DELETE FROM private_life.facebook_post_likes WHERE post_id=$1 AND user_id=$2',[postId,user.id]);
      else await query('INSERT INTO private_life.facebook_post_likes(post_id,user_id) VALUES($1,$2)',[postId,user.id]);
      return NextResponse.json({ok:true});
    }

    if(action==='comment'){
      const postId=Number(body.postId),text=String(body.text||'').trim().slice(0,1000);
      if(!text)return bad('Escribe un comentario.');
      const visible=await query(`SELECT 1 FROM private_life.facebook_posts p WHERE p.id=$1 AND (
        p.user_id=$2 OR EXISTS(SELECT 1 FROM private_life.facebook_friendships f WHERE
        (f.user_low_id=$2 AND f.user_high_id=p.user_id) OR (f.user_high_id=$2 AND f.user_low_id=p.user_id)))`,[postId,user.id]);
      if(!visible.rows[0])return bad('Publicación no disponible.',404);
      await query('INSERT INTO private_life.facebook_comments(post_id,user_id,body) VALUES($1,$2,$3)',[postId,user.id,text]);
      return NextResponse.json({ok:true});
    }

    if(action==='send_request'){
      const target=Number(body.userId);
      if(!target||target===Number(user.id))return bad('Jugador no válido.');
      if(await areFriends(user.id,target))return NextResponse.json({ok:true,status:'friend'});
      const reverse=await query(`SELECT id FROM private_life.facebook_friend_requests
        WHERE requester_id=$1 AND recipient_id=$2 AND status='pending' LIMIT 1`,[target,user.id]);
      if(reverse.rows[0]){
        const [low,high]=pair(user.id,target);
        await query('UPDATE private_life.facebook_friend_requests SET status=\'accepted\',responded_at=NOW() WHERE id=$1',[reverse.rows[0].id]);
        await query('INSERT INTO private_life.facebook_friendships(user_low_id,user_high_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[low,high]);
        return NextResponse.json({ok:true,status:'friend'});
      }
      const existing=await query(`SELECT id FROM private_life.facebook_friend_requests
        WHERE requester_id=$1 AND recipient_id=$2 AND status='pending' LIMIT 1`,[user.id,target]);
      if(!existing.rows[0])await query('INSERT INTO private_life.facebook_friend_requests(requester_id,recipient_id) VALUES($1,$2)',[user.id,target]);
      return NextResponse.json({ok:true,status:'outgoing'});
    }

    if(action==='respond_request'){
      const requestId=Number(body.requestId),accept=!!body.accept;
      const r=await query(`SELECT id,requester_id FROM private_life.facebook_friend_requests
        WHERE id=$1 AND recipient_id=$2 AND status='pending' LIMIT 1`,[requestId,user.id]);
      if(!r.rows[0])return bad('Solicitud no disponible.',404);
      await query('UPDATE private_life.facebook_friend_requests SET status=$1,responded_at=NOW() WHERE id=$2',[accept?'accepted':'rejected',requestId]);
      if(accept){
        const [low,high]=pair(user.id,r.rows[0].requester_id);
        await query('INSERT INTO private_life.facebook_friendships(user_low_id,user_high_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[low,high]);
      }
      return NextResponse.json({ok:true});
    }

    if(action==='send_message'){
      const target=Number(body.userId),text=String(body.text||'').trim().slice(0,2000);
      if(!text)return bad('Escribe un mensaje.');
      if(!await areFriends(user.id,target))return bad('Solo puedes escribir a tus amigos.',403);
      const r=await query('INSERT INTO private_life.facebook_messages(sender_id,recipient_id,body) VALUES($1,$2,$3) RETURNING id,created_at',[user.id,target,text]);
      return NextResponse.json({ok:true,id:Number(r.rows[0].id),createdAt:r.rows[0].created_at});
    }

    return bad('Acción no válida.');
  }catch(error){
    console.error('facebook_post_failed',error);
    return bad('No se pudo completar la acción.',500);
  }
}
