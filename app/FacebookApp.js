'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const CONTACTS_KEY='private-life-contacts';

async function fbRequest(url='/api/facebook',options={}){
  const r=await fetch(url,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})},cache:'no-store'});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data.error||'No se pudo completar la acción.');
  return data;
}
function Avatar({user,size='md'}){
  if(user?.photo)return <img className={'fb-avatar '+size} src={user.photo} alt=""/>;
  return <div className={'fb-avatar fb-avatar-fallback '+size}>{String(user?.name||user?.username||'?').trim().charAt(0).toUpperCase()}</div>;
}
function when(value){
  if(!value)return '';
  const d=new Date(value),s=Math.max(0,(Date.now()-d.getTime())/1000);
  if(s<60)return 'Ahora';
  if(s<3600)return Math.floor(s/60)+' min';
  if(s<86400)return Math.floor(s/3600)+' h';
  if(s<604800)return Math.floor(s/86400)+' d';
  return d.toLocaleDateString('es-ES',{day:'numeric',month:'short'});
}
function subtitle(u){
  return [u?.city,u?.occupation].filter(Boolean).join(' · ')||'Jugador de Private Life';
}
function addPlayerToContacts(player){
  try{
    const list=JSON.parse(localStorage.getItem(CONTACTS_KEY)||'[]');
    const contacts=Array.isArray(list)?list:[];
    const existing=contacts.findIndex(c=>String(c.realUserId||'')===String(player.id));
    const item={
      ...(existing>=0?contacts[existing]:{}),
      id:existing>=0?contacts[existing].id:'player-'+player.id,
      realUserId:player.id,
      username:player.username,
      name:player.name||player.username,
      age:player.age||18,
      city:player.city||'',
      relationshipType:'Amistad',
      relation:'Conocido en Facebook',
      affection:existing>=0?(contacts[existing].affection??50):50,
      notes:existing>=0?(contacts[existing].notes||''):'',
      conversation:existing>=0?(contacts[existing].conversation||''):'',
      photos:player.photo?[player.photo]:[],
      profile:player.occupation||'',
      consent:true,
      hideSourceType:true,
      test:existing>=0?(contacts[existing].test||[]):[],
      updatedAt:new Date().toISOString()
    };
    const next=existing>=0?contacts.map((c,i)=>i===existing?item:c):[...contacts,item];
    localStorage.setItem(CONTACTS_KEY,JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('private-life:contacts-changed',{detail:{userId:player.id}}));
    return existing>=0?'Ya estaba en tus contactos.':'Añadido a Contactos.';
  }catch{return 'No se pudo añadir a Contactos.'}
}

export default function FacebookApp({onClose}){
  const [data,setData]=useState({me:null,people:[],friends:[],requests:[],posts:[],conversations:[],messages:[]});
  const [tab,setTab]=useState('home');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [postText,setPostText]=useState('');
  const [search,setSearch]=useState('');
  const [profile,setProfile]=useState(null);
  const [chat,setChat]=useState(null);
  const [message,setMessage]=useState('');
  const [comments,setComments]=useState({});
  const [toast,setToast]=useState('');
  const bottomRef=useRef(null);

  async function load(silent=false){
    try{
      if(!silent)setLoading(true);
      const q=chat?.id?'?with='+chat.id:'';
      const next=await fbRequest('/api/facebook'+q);
      setData(next);
      if(profile){
        const updated=[next.me,...next.people].find(x=>x?.id===profile.id);
        if(updated)setProfile(updated);
      }
      if(chat){
        const updated=[...next.friends,next.me].find(x=>x?.id===chat.id);
        if(updated)setChat(updated);
      }
    }catch(e){setToast(e.message)}
    finally{if(!silent)setLoading(false)}
  }
  useEffect(()=>{load();},[]);
  useEffect(()=>{
    if(tab!=='messages'&&!chat)return;
    const id=setInterval(()=>load(true),4000);
    return()=>clearInterval(id);
  },[tab,chat?.id]);
  useEffect(()=>{if(chat?.id)load(true)},[chat?.id]);
  useEffect(()=>{if(chat?.id)bottomRef.current?.scrollIntoView({behavior:'smooth'})},[data.messages.length,chat?.id]);
  useEffect(()=>{if(!toast)return;const id=setTimeout(()=>setToast(''),2400);return()=>clearTimeout(id)},[toast]);

  async function action(payload,{keepBusy=false}={}){
    if(!keepBusy)setBusy(true);
    try{await fbRequest('/api/facebook',{method:'POST',body:JSON.stringify(payload)});await load(true);return true}
    catch(e){setToast(e.message);return false}
    finally{if(!keepBusy)setBusy(false)}
  }
  async function publish(){
    if(!postText.trim())return;
    const text=postText;setPostText('');
    if(!await action({action:'create_post',text}))setPostText(text);
  }
  async function send(){
    if(!chat||!message.trim())return;
    const text=message;setMessage('');
    if(!await action({action:'send_message',userId:chat.id,text},{keepBusy:true}))setMessage(text);
  }
  function openChat(user){
    setChat(user);setTab('messages');setProfile(null);
  }
  function contact(user){setToast(addPlayerToContacts(user))}
  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();
    if(!q)return data.people;
    return data.people.filter(p=>[p.name,p.username,p.city,p.occupation].join(' ').toLowerCase().includes(q));
  },[data.people,search]);
  const myPosts=data.posts.filter(p=>p.author?.id===data.me?.id);

  return <div className="facebook-app">
    <header className="fb-top">
      <button className="fb-close" onClick={onClose} aria-label="Cerrar">‹</button>
      <div className="fb-wordmark">facebook</div>
      <button className="fb-round" onClick={()=>{setTab('people');setSearch('')}} aria-label="Buscar">⌕</button>
    </header>

    <nav className="fb-tabs">
      <button className={tab==='home'?'active':''} onClick={()=>{setTab('home');setChat(null)}}><span>⌂</span></button>
      <button className={tab==='people'?'active':''} onClick={()=>{setTab('people');setChat(null)}}><span>♙</span>{data.requests.length>0&&<i>{data.requests.length}</i>}</button>
      <button className={tab==='messages'?'active':''} onClick={()=>setTab('messages')}><span>●</span>{data.conversations.reduce((n,c)=>n+(c.unread||0),0)>0&&<i>{data.conversations.reduce((n,c)=>n+(c.unread||0),0)}</i>}</button>
      <button className={tab==='profile'?'active':''} onClick={()=>{setTab('profile');setChat(null)}}><span>☻</span></button>
    </nav>

    {loading?<div className="fb-loading"><div/><span>Cargando Facebook…</span></div>:
    <main className="fb-body">
      {tab==='home'&&<>
        <section className="fb-composer">
          <Avatar user={data.me}/>
          <button onClick={()=>document.querySelector('.fb-compose-input')?.focus()}>¿Qué estás pensando, {data.me?.name?.split(' ')[0]||data.me?.username}?</button>
        </section>
        <section className="fb-compose-expanded">
          <textarea className="fb-compose-input" value={postText} maxLength={2000} onChange={e=>setPostText(e.target.value)} placeholder="Escribe una publicación…"/>
          <div><span>{postText.length}/2000</span><button disabled={!postText.trim()||busy} onClick={publish}>Publicar</button></div>
        </section>
        {data.requests.length>0&&<section className="fb-suggestion-strip">
          <div className="fb-section-head"><b>Solicitudes de amistad</b><button onClick={()=>setTab('people')}>Ver todas</button></div>
          <div className="fb-request-scroll">{data.requests.slice(0,5).map(u=><RequestCard key={u.id} user={u} busy={busy} accept={()=>action({action:'respond_request',requestId:u.requestId,accept:true})} reject={()=>action({action:'respond_request',requestId:u.requestId,accept:false})} open={()=>setProfile(u)}/>)}</div>
        </section>}
        <div className="fb-feed">{data.posts.length?data.posts.map(post=><Post key={post.id} post={post} me={data.me} comment={comments[post.id]||''} setComment={v=>setComments(x=>({...x,[post.id]:v}))} onProfile={()=>setProfile(post.author)} onLike={()=>action({action:'toggle_like',postId:post.id})} onComment={async()=>{const t=(comments[post.id]||'').trim();if(!t)return;if(await action({action:'comment',postId:post.id,text:t}))setComments(x=>({...x,[post.id]:''}))}}/>):<Empty title="Tu feed está tranquilo" text="Añade amigos y publica algo para empezar."/>}</div>
      </>}

      {tab==='people'&&<section className="fb-people">
        <div className="fb-page-title"><h1>Amigos</h1></div>
        <div className="fb-search"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar jugadores"/></div>
        {data.requests.length>0&&<><div className="fb-section-head padded"><b>Solicitudes</b><span>{data.requests.length}</span></div>{data.requests.map(u=><PersonRow key={'r'+u.id} user={u} open={()=>setProfile(u)} right={<div className="fb-inline-actions"><button className="primary" onClick={()=>action({action:'respond_request',requestId:u.requestId,accept:true})}>Confirmar</button><button onClick={()=>action({action:'respond_request',requestId:u.requestId,accept:false})}>Eliminar</button></div>}/>)}</>}
        <div className="fb-section-head padded"><b>Personas que quizá conozcas</b></div>
        {filtered.length?filtered.map(u=><PersonRow key={u.id} user={u} open={()=>setProfile(u)} right={<RelationButton user={u} busy={busy} send={()=>action({action:'send_request',userId:u.id})} chat={()=>openChat(u)}/>} />):<Empty title="No hay resultados" text="Prueba con otro nombre o ciudad."/>}
      </section>}

      {tab==='messages'&&(chat?
        <section className="fb-chat">
          <div className="fb-chat-head">
            <button onClick={()=>setChat(null)}>‹</button><Avatar user={chat} size="sm"/><button className="fb-chat-person" onClick={()=>setProfile(chat)}><b>{chat.name}</b><span>@{chat.username}</span></button>
            <button className="fb-chat-contact" onClick={()=>contact(chat)}>＋</button>
          </div>
          <div className="fb-chat-messages">
            {!data.messages.length&&<div className="fb-chat-start"><Avatar user={chat} size="xl"/><b>{chat.name}</b><span>Ahora sois amigos en Facebook.</span></div>}
            {data.messages.map(m=><div key={m.id} className={'fb-bubble-row '+(m.senderId===data.me?.id?'mine':'theirs')}>{m.senderId!==data.me?.id&&<Avatar user={chat} size="xs"/>}<div className="fb-bubble">{m.body}<small>{when(m.createdAt)}</small></div></div>)}
            <div ref={bottomRef}/>
          </div>
          <div className="fb-message-box"><textarea value={message} onChange={e=>setMessage(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}} placeholder="Aa"/><button disabled={!message.trim()} onClick={send}>➤</button></div>
        </section>:
        <section className="fb-messages">
          <div className="fb-page-title"><h1>Chats</h1></div>
          {data.conversations.length?data.conversations.map(c=><button className="fb-conversation" key={c.id} onClick={()=>openChat(c)}><Avatar user={c}/><div><b>{c.name}</b><span>{c.lastBody||'Toca para iniciar una conversación'}{c.lastAt?' · '+when(c.lastAt):''}</span></div>{c.unread>0&&<i>{c.unread}</i>}</button>):<Empty title="Aún no tienes chats" text="Haz amigos y empieza una conversación."/>}
        </section>)}

      {tab==='profile'&&<section className="fb-profile-page">
        <ProfileHero user={data.me}/>
        <div className="fb-profile-actions"><button onClick={()=>contact(data.me)}>Añadir a Contactos</button></div>
        <div className="fb-profile-info"><Info user={data.me}/></div>
        <div className="fb-section-head padded"><b>Publicaciones</b></div>
        {myPosts.length?myPosts.map(post=><Post key={post.id} post={post} me={data.me} comment={comments[post.id]||''} setComment={v=>setComments(x=>({...x,[post.id]:v}))} onProfile={()=>{}} onLike={()=>action({action:'toggle_like',postId:post.id})} onComment={async()=>{const t=(comments[post.id]||'').trim();if(!t)return;if(await action({action:'comment',postId:post.id,text:t}))setComments(x=>({...x,[post.id]:''}))}}/>):<Empty title="Sin publicaciones" text="Tus publicaciones aparecerán aquí."/>}
      </section>}
    </main>}

    {profile&&<div className="fb-profile-overlay" onClick={e=>{if(e.target===e.currentTarget)setProfile(null)}}>
      <div className="fb-profile-sheet">
        <button className="fb-sheet-close" onClick={()=>setProfile(null)}>×</button>
        <ProfileHero user={profile}/>
        {profile.id!==data.me?.id&&<div className="fb-profile-actions">
          {profile.relationship==='friend'?<><button className="primary" onClick={()=>openChat(profile)}>Mensaje</button><button onClick={()=>contact(profile)}>Añadir a Contactos</button></>:profile.relationship==='incoming'?<><button className="primary" onClick={()=>action({action:'respond_request',requestId:profile.requestId,accept:true})}>Confirmar</button><button onClick={()=>action({action:'respond_request',requestId:profile.requestId,accept:false})}>Eliminar</button></>:profile.relationship==='outgoing'?<button disabled>Solicitud enviada</button>:<button className="primary" onClick={()=>action({action:'send_request',userId:profile.id})}>Añadir amigo</button>}
        </div>}
        <Info user={profile}/>
      </div>
    </div>}

    {toast&&<div className="fb-toast">{toast}</div>}
  </div>;
}

function ProfileHero({user}){
  return <div className="fb-profile-hero"><div className="fb-cover"/><div className="fb-profile-avatar"><Avatar user={user} size="xl"/></div><h2>{user?.name||user?.username}</h2><p>@{user?.username}</p></div>
}
function Info({user}){
  return <div className="fb-info-card">
    <h3>Detalles</h3>
    {user?.city&&<p><span>⌂</span> Vive en <b>{user.city}</b></p>}
    {user?.occupation&&<p><span>▣</span> Trabaja como <b>{user.occupation}</b></p>}
    {user?.age&&<p><span>◷</span> {user.age} años</p>}
    {!user?.city&&!user?.occupation&&!user?.age&&<p className="muted">Este jugador aún no ha añadido detalles públicos.</p>}
  </div>
}
function RelationButton({user,busy,send,chat}){
  if(user.relationship==='friend')return <button className="fb-row-action primary" onClick={chat}>Mensaje</button>;
  if(user.relationship==='outgoing')return <button className="fb-row-action" disabled>Enviada</button>;
  if(user.relationship==='incoming')return <button className="fb-row-action primary">Responder arriba</button>;
  return <button className="fb-row-action primary" disabled={busy} onClick={send}>Añadir</button>;
}
function PersonRow({user,open,right}){
  return <div className="fb-person-row"><button className="fb-person-main" onClick={open}><Avatar user={user}/><div><b>{user.name}</b><span>{subtitle(user)}</span></div></button>{right}</div>
}
function RequestCard({user,accept,reject,open,busy}){
  return <div className="fb-request-card"><button onClick={open}><Avatar user={user} size="lg"/><b>{user.name}</b><span>{subtitle(user)}</span></button><div><button className="primary" disabled={busy} onClick={accept}>Confirmar</button><button disabled={busy} onClick={reject}>Eliminar</button></div></div>
}
function Post({post,me,comment,setComment,onProfile,onLike,onComment}){
  return <article className="fb-post">
    <div className="fb-post-head"><button onClick={onProfile}><Avatar user={post.author}/></button><button className="fb-post-author" onClick={onProfile}><b>{post.author?.name}</b><span>{when(post.createdAt)} · ●</span></button><span>•••</span></div>
    <div className="fb-post-body">{post.body}</div>
    <div className="fb-post-stats"><span>{post.likes>0?'👍 '+post.likes:''}</span><span>{post.comments.length?post.comments.length+' comentarios':''}</span></div>
    <div className="fb-post-actions"><button className={post.liked?'liked':''} onClick={onLike}>👍 <span>Me gusta</span></button><button onClick={()=>document.getElementById('comment-'+post.id)?.focus()}>◯ <span>Comentar</span></button></div>
    {post.comments.length>0&&<div className="fb-comments">{post.comments.map(c=><div className="fb-comment" key={c.id}><Avatar user={c.author} size="xs"/><div><b>{c.author.name}</b><p>{c.body}</p><small>{when(c.createdAt)}</small></div></div>)}</div>}
    <div className="fb-comment-box"><Avatar user={me} size="xs"/><input id={'comment-'+post.id} value={comment} onChange={e=>setComment(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();onComment()}}} placeholder="Escribe un comentario…"/><button disabled={!comment.trim()} onClick={onComment}>➤</button></div>
  </article>
}
function Empty({title,text}){return <div className="fb-empty"><div>f</div><b>{title}</b><span>{text}</span></div>}
