'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const CONTACTS_KEY = 'private-life-contacts';
const CHAT_KEY = 'private-life-whatsapp-v1';
const STORY_KEY = 'private-life-narrative-events-v1';

function uid() {
  return crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value ?? fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
function clock(ts) {
  try {
    return new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(new Date(ts));
  } catch {
    return '';
  }
}
function todayLabel(ts) {
  const d = new Date(ts || Date.now());
  const n = new Date();
  const a = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.floor((a - b) / 86400000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(d);
}
function Avatar({ contact, size = 'md' }) {
  const photo = contact?.photos?.[0];
  if (photo) return <img className={'wa-avatar ' + size} src={photo} alt="" />;
  return <span className={'wa-avatar wa-avatar-fallback ' + size}>{String(contact?.name || '?').trim().charAt(0).toUpperCase()}</span>;
}
function contactsFromStorage() {
  const list = readJson(CONTACTS_KEY, []);
  return Array.isArray(list) ? list.filter(c => c?.id && c?.name && Number(c?.age) >= 18) : [];
}
function seededChats(contacts, stored) {
  const out = stored && typeof stored === 'object' && !Array.isArray(stored) ? { ...stored } : {};
  contacts.forEach(c => {
    if (!out[c.id]) out[c.id] = { messages: [], unread: 0 };
  });
  return out;
}
function hash(text) {
  let h = 0;
  for (const ch of String(text || '')) h = ((h << 5) - h + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}
function pick(list, seed) {
  return list[seed % list.length];
}
function aiReply(contact, input, hasImage, history) {
  const lower = String(input || '').toLowerCase();
  const affection = Math.max(0, Math.min(100, Number(contact?.affection) || 50));
  const examples = Array.isArray(contact?.masterSheet?.writingExamples)
    ? contact.masterSheet.writingExamples.map(x => String(x?.text || '').trim()).filter(Boolean)
    : [];
  const style = (contact?.masterSheet?.communication?.styleSignals || []).join(' ').toLowerCase();
  const seed = hash(lower + contact?.id + history.length);
  let pool;

  if (hasImage && !input.trim()) {
    pool = ['¿Y esto? 👀', 'Vale, necesito contexto de esa foto.', 'JAJA, espera… ¿qué estoy viendo?', 'No me mandes eso y desaparezcas. Cuéntame.'];
  } else if (/hola|buenas|hey|ey\b/.test(lower)) {
    pool = ['Holaa', 'Ey, ¿qué tal?', 'Buenas 👀', 'Aquí estoy. ¿Qué pasa?'];
  } else if (/qued|vernos|tomar algo|cita|salir/.test(lower)) {
    pool = affection > 65
      ? ['Puede ser. ¿Qué plan tienes en mente?', 'Sí me apetece. Dime cuándo.', 'Mmm… venga, sorpréndeme con el plan.']
      : ['Puede ser, pero dime bien qué propones.', 'No te digo que no. ¿Qué tienes pensado?', 'Ya veremos 😏 ¿cuándo?'];
  } else if (/perd[oó]n|lo siento|disculpa/.test(lower)) {
    pool = ['Vale. Te leo.', 'No pasa nada, pero explícame qué ocurrió.', 'Te lo compro… de momento.', 'Bueno. Hablemos claro entonces.'];
  } else if (/te echo|te extra|te quiero|te adoro/.test(lower)) {
    pool = affection > 60
      ? ['No me digas eso así de golpe…', 'Tú también me remueves cosas, ¿sabes?', 'Eso suena peligroso viniendo de ti.', 'Ven, que así no se puede hablar por WhatsApp.']
      : ['No sé qué contestarte a eso ahora mismo.', 'Eso es bastante directo.', '¿Y por qué me lo dices justo ahora?'];
  } else if (/jaja|😂|🤣|lol|xd/.test(lower)) {
    pool = ['JAJAJA', 'Eres idiota 😂', 'No puedo contigo.', 'Vale, esa te la compro 😂'];
  } else if (/\?$/.test(String(input).trim())) {
    pool = ['Puede ser. ¿Tú qué crees?', 'Sí… pero hay matices.', 'No exactamente.', 'Depende. ¿Quieres la respuesta bonita o la de verdad?'];
  } else {
    pool = ['Ya… sigue.', 'Mmm. Te estoy leyendo.', 'Eso cambia bastante las cosas.', 'Vale, pero ahora me has dejado con más preguntas.', 'No sé si me convence esa versión.', 'Te voy a decir una cosa y no te va a encantar.'];
  }

  let reply = pick(pool, seed);
  if (examples.length && seed % 4 === 0) {
    const ex = pick(examples, seed + 3).replace(/^["“]|["”]$/g, '').trim();
    if (ex.length >= 3 && ex.length <= 90 && !/https?:\/\//i.test(ex)) reply = ex;
  }
  if (style.includes('preguntas') && !reply.includes('?') && seed % 3 === 0) reply += ' ¿Y tú qué vas a hacer?';
  if (style.includes('emoji') && seed % 3 === 1) reply += ' 👀';
  if (style.includes('breve') && reply.length > 62) reply = reply.split(/[.!?]/)[0].slice(0, 62);
  return reply;
}
async function imageData(file) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const max = 1100;
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * s));
        canvas.height = Math.max(1, Math.round(img.height * s));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', .78));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function WhatsAppApp({ onClose }) {
  const [contacts, setContacts] = useState([]);
  const [chats, setChats] = useState({});
  const [activeId, setActiveId] = useState(null);
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [typing, setTyping] = useState(false);
  const [ready, setReady] = useState(false);
  const endRef = useRef(null);
  const fileRef = useRef(null);
  const timers = useRef([]);

  useEffect(() => {
    const c = contactsFromStorage();
    setContacts(c);
    setChats(seededChats(c, readJson(CHAT_KEY, {})));
    setReady(true);
    const sync = () => {
      const next = contactsFromStorage();
      setContacts(next);
      setChats(prev => seededChats(next, prev));
    };
    window.addEventListener('storage', sync);
    window.addEventListener('private-life:contacts-changed', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('private-life:contacts-changed', sync);
      timers.current.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    if (ready) writeJson(CHAT_KEY, chats);
  }, [chats, ready]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chats, typing, activeId]);

  const active = contacts.find(c => c.id === activeId) || null;
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts
      .filter(c => !q || String(c.name).toLowerCase().includes(q))
      .sort((a, b) => {
        const at = chats[a.id]?.messages?.at(-1)?.createdAt || '';
        const bt = chats[b.id]?.messages?.at(-1)?.createdAt || '';
        return bt.localeCompare(at) || String(a.name).localeCompare(String(b.name), 'es');
      });
  }, [contacts, chats, search]);

  function phoneEvent(type, contact, data = {}, state = {}) {
    fetch('/api/phone/state', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        state,
        event: { type, label: contact?.name || 'WhatsApp', data: { contactId: contact?.id, ...data } }
      })
    }).catch(() => {});
  }

  function storyEvent(contact, type, payload = {}) {
    const event = {
      id: uid(),
      createdAt: new Date().toISOString(),
      source: 'whatsapp',
      contactId: contact.id,
      contactName: contact.name,
      type,
      ...payload
    };
    const current = readJson(STORY_KEY, []);
    writeJson(STORY_KEY, [event, ...current].slice(0, 250));
    window.dispatchEvent(new CustomEvent('private-life:narrative-event', { detail: event }));
    phoneEvent('narrative_event', contact, { source: 'whatsapp', kind: type, ...payload }, {
      lastNarrativeEvent: { source: 'whatsapp', contactId: contact.id, type, at: event.createdAt }
    });
  }

  function addMessage(contactId, message, unread = 0) {
    setChats(prev => {
      const chat = prev[contactId] || { messages: [], unread: 0 };
      return {
        ...prev,
        [contactId]: {
          ...chat,
          messages: [...(chat.messages || []), message].slice(-350),
          unread: Math.max(0, (chat.unread || 0) + unread)
        }
      };
    });
  }

  function scheduleReply(contact, text, hasImage) {
    setTyping(true);
    const delay = 900 + Math.min(1900, Math.max(20, text.length) * 18);
    const timer = setTimeout(() => {
      setChats(prev => {
        const chat = prev[contact.id] || { messages: [], unread: 0 };
        const reply = aiReply(contact, text, hasImage, chat.messages || []);
        const message = {
          id: uid(),
          side: 'in',
          type: 'text',
          text: reply,
          createdAt: new Date().toISOString(),
          ai: true
        };
        phoneEvent('whatsapp_message_received', contact, { text: reply }, {
          whatsapp: { lastContactId: contact.id, lastAt: message.createdAt }
        });
        storyEvent(contact, 'message_received', { text: reply });
        return {
          ...prev,
          [contact.id]: {
            ...chat,
            messages: [...(chat.messages || []), message].slice(-350),
            unread: activeId === contact.id ? 0 : (chat.unread || 0) + 1
          }
        };
      });
      setTyping(false);
    }, delay);
    timers.current.push(timer);
  }

  function sendText() {
    const text = draft.trim();
    if (!active || !text) return;
    const message = { id: uid(), side: 'out', type: 'text', text, createdAt: new Date().toISOString() };
    addMessage(active.id, message);
    setDraft('');
    phoneEvent('whatsapp_message_sent', active, { text }, { whatsapp: { lastContactId: active.id, lastAt: message.createdAt } });
    storyEvent(active, 'message_sent', { text });
    scheduleReply(active, text, false);
  }

  async function sendPhoto(file) {
    if (!active || !file) return;
    try {
      const image = await imageData(file);
      const message = { id: uid(), side: 'out', type: 'image', image, text: '', createdAt: new Date().toISOString() };
      addMessage(active.id, message);
      phoneEvent('whatsapp_photo_sent', active, {}, { whatsapp: { lastContactId: active.id, lastAt: message.createdAt } });
      storyEvent(active, 'photo_sent');
      scheduleReply(active, '', true);
    } catch {}
    if (fileRef.current) fileRef.current.value = '';
  }

  function openChat(contactId) {
    setActiveId(contactId);
    setChats(prev => ({
      ...prev,
      [contactId]: { ...(prev[contactId] || { messages: [] }), unread: 0 }
    }));
  }

  if (!ready) {
    return <div className="whatsapp-app"><div className="wa-loading"><span />Abriendo WhatsApp…</div></div>;
  }

  if (active) {
    const messages = chats[active.id]?.messages || [];
    return <div className="whatsapp-app wa-thread">
      <header className="wa-chat-head">
        <button className="wa-back" onClick={() => setActiveId(null)} aria-label="Volver">‹</button>
        <button className="wa-person">
          <Avatar contact={active} size="sm" />
          <span><b>{active.name}</b><small>{typing ? 'escribiendo…' : 'en línea'}</small></span>
        </button>
        <button className="wa-head-icon" aria-label="Videollamada">⌁</button>
        <button className="wa-head-icon" aria-label="Llamar">⌕</button>
      </header>

      <main className="wa-wall">
        <div className="wa-date-pill">{todayLabel(messages.at(-1)?.createdAt)}</div>
        {!messages.length && <div className="wa-encryption">Esta conversación forma parte de tu partida de PRIVATE LIFE.</div>}
        {messages.map(m => <div key={m.id} className={'wa-message-row ' + (m.side === 'out' ? 'out' : 'in')}>
          <div className={'wa-bubble ' + (m.type === 'image' ? 'image-bubble' : '')}>
            {m.image && <img className="wa-photo" src={m.image} alt="Imagen enviada" />}
            {m.text && <span className="wa-text">{m.text}</span>}
            <small className="wa-time">{clock(m.createdAt)} {m.side === 'out' && <em>✓✓</em>}</small>
          </div>
        </div>)}
        {typing && <div className="wa-message-row in"><div className="wa-bubble wa-typing"><i /><i /><i /></div></div>}
        <div ref={endRef} />
      </main>

      <footer className="wa-compose">
        <button className="wa-plus" onClick={() => fileRef.current?.click()} aria-label="Adjuntar">＋</button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => sendPhoto(e.target.files?.[0])} />
        <div className="wa-input-wrap">
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendText();
              }
            }}
            placeholder="Mensaje"
          />
          <button className="wa-camera" onClick={() => fileRef.current?.click()} aria-label="Foto">◉</button>
        </div>
        <button className={'wa-send ' + (draft.trim() ? 'ready' : '')} onClick={draft.trim() ? sendText : undefined} aria-label={draft.trim() ? 'Enviar' : 'Audio'}>
          {draft.trim() ? '➤' : '●'}
        </button>
      </footer>
    </div>;
  }

  return <div className="whatsapp-app">
    <header className="wa-main-head">
      <button onClick={onClose} aria-label="Cerrar">‹</button>
      <span />
      <button aria-label="Nuevo chat">⌑</button>
    </header>
    <section className="wa-chats">
      <h1>Chats</h1>
      <div className="wa-search"><span>⌕</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar" /></div>
      <div className="wa-filter-row"><button className="active">Todos</button><button>No leídos</button><button>Favoritos</button></div>

      {!contacts.length
        ? <div className="wa-empty"><div>☏</div><b>No tienes contactos todavía</b><span>Añade personas desde Contactos y aparecerán aquí automáticamente.</span></div>
        : <div className="wa-chat-list">{visible.map(c => {
            const chat = chats[c.id] || {};
            const last = chat.messages?.at(-1);
            return <button className="wa-chat-row" key={c.id} onClick={() => openChat(c.id)}>
              <Avatar contact={c} size="lg" />
              <span className="wa-chat-copy">
                <b>{c.name}</b>
                <small>{last ? (last.side === 'out' ? '✓✓ ' : '') + (last.type === 'image' ? '📷 Foto' : last.text) : (c.relationshipType || 'Contacto')}</small>
              </span>
              <span className="wa-chat-meta">
                <time>{last ? clock(last.createdAt) : ''}</time>
                {chat.unread > 0 && <i>{chat.unread > 99 ? '99+' : chat.unread}</i>}
              </span>
            </button>;
          })}</div>}
    </section>
    <nav className="wa-bottom">
      <button><span>◉</span><b>Novedades</b></button>
      <button className="selected"><span>◌</span><b>Chats</b></button>
      <button><span>◎</span><b>Comunidades</b></button>
      <button><span>☎</span><b>Llamadas</b></button>
    </nav>
  </div>;
}
