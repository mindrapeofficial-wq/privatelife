(()=>{
  const KEY='private-life-user-notes-v1';
  const SYSTEM_ID='private-life-narrator-note';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const now=()=>new Date().toISOString();
  function load(){
    try{const x=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x:[]}catch{return []}
  }
  function save(items){try{localStorage.setItem(KEY,JSON.stringify(items))}catch{}}
  function formatDate(iso){
    const d=new Date(iso||Date.now()),today=new Date();
    if(d.toDateString()===today.toDateString())return d.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
    return d.toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:d.getFullYear()===today.getFullYear()?undefined:'2-digit'});
  }
  function statusHTML(){return `<div class="pl-notes-status"><b class="pl-notes-time">${new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</b><span class="pl-notes-signal"><i></i><i></i><i></i><i></i></span><span class="pl-notes-wifi">⌁</span><span class="pl-notes-battery"><i></i></span></div>`}
  function systemNote(){return {id:SYSTEM_ID,title:'Modo Narrador',body:'Convierte PRIVATE LIFE en una novela interactiva. Tus decisiones cambian relaciones, variables y acontecimientos que continúan ocurriendo en segundo plano.',updatedAt:'2026-09-30T00:00:00.000Z',system:true}}
  function root(){return document.querySelector('.phone')||document.body}
  function close(){document.querySelector('.pl-native-notes')?.remove()}
  function openNotes(){
    if(document.querySelector('.pl-native-notes'))return;
    const shell=document.createElement('div');shell.className='pl-native-notes';root().appendChild(shell);
    let query='';
    function renderList(){
      const items=load().sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));
      const all=[systemNote(),...items];
      const filtered=all.filter(n=>(n.title+' '+n.body).toLowerCase().includes(query.toLowerCase()));
      shell.innerHTML=`${statusHTML()}<header class="pl-notes-nav"><button class="pl-notes-back" aria-label="Volver">‹</button><b>Notas</b><button class="pl-notes-more" aria-label="Opciones">•••</button></header><main class="pl-notes-main"><h1>Notas</h1><label class="pl-notes-search"><span>⌕</span><input placeholder="Buscar" value="${esc(query)}"></label><section class="pl-notes-folder"><div class="pl-notes-folder-head"><b>Notas</b><span>${items.length}</span></div><div class="pl-notes-list">${filtered.length?filtered.map(n=>`<button class="pl-note-row ${n.system?'system':''}" data-note-id="${esc(n.id)}"><div><b>${esc(n.title||'Nueva nota')}</b><p><span>${n.system?'PRIVATE LIFE':formatDate(n.updatedAt)}</span> ${esc((n.body||'Sin texto').replace(/\s+/g,' ').slice(0,92))}</p></div>${n.system?'<i>›</i>':''}</button>`).join(''):'<div class="pl-notes-empty">No hay notas que coincidan.</div>'}</div></section></main><footer class="pl-notes-footer"><span>${items.length} nota${items.length===1?'':'s'}</span><button class="pl-notes-new" aria-label="Nueva nota">□<i>✎</i></button></footer><button class="pl-notes-homebar" aria-label="Cerrar Notas"><span></span></button>`;
      shell.querySelector('.pl-notes-back').onclick=close;shell.querySelector('.pl-notes-homebar').onclick=close;
      const input=shell.querySelector('.pl-notes-search input');input.oninput=e=>{query=e.target.value;renderList();requestAnimationFrame(()=>{const i=shell.querySelector('.pl-notes-search input');i?.focus();i?.setSelectionRange(query.length,query.length)})};
      shell.querySelector('.pl-notes-new').onclick=()=>openEditor({id:crypto.randomUUID?.()||String(Date.now()),title:'',body:'',updatedAt:now()},true);
      shell.querySelectorAll('[data-note-id]').forEach(b=>b.onclick=()=>{const id=b.dataset.noteId;if(id===SYSTEM_ID)openNarratorCard();else{const n=load().find(x=>String(x.id)===id);if(n)openEditor(n,false)}});
    }
    function openNarratorCard(){
      shell.innerHTML=`${statusHTML()}<header class="pl-notes-nav editor"><button class="pl-notes-listback">‹ <span>Notas</span></button><b></b><button class="pl-notes-done">Hecho</button></header><main class="pl-note-editor system-editor"><div class="pl-system-note-mark">PRIVATE LIFE</div><h1>Modo Narrador</h1><p>Convierte la partida en una novela interactiva. El narrador construye escenas a partir de tu personaje, tus contactos y lo que ya ha ocurrido.</p><div class="pl-system-note-box"><b>El mundo no se congela</b><span>Mientras decides, otros personajes pueden vivir acontecimientos, cambiar de opinión o relacionarse entre sí sin que lo veas inmediatamente.</span></div><button class="pl-open-narrator">ABRIR MODO NARRADOR</button></main><button class="pl-notes-homebar" aria-label="Cerrar Notas"><span></span></button>`;
      shell.querySelector('.pl-notes-listback').onclick=renderList;shell.querySelector('.pl-notes-done').onclick=renderList;shell.querySelector('.pl-notes-homebar').onclick=close;
      shell.querySelector('.pl-open-narrator').onclick=()=>{location.href='/notas'};
    }
    function openEditor(note,isNew){
      let draft={...note};
      shell.innerHTML=`${statusHTML()}<header class="pl-notes-nav editor"><button class="pl-notes-listback">‹ <span>Notas</span></button><b></b><button class="pl-notes-done">Hecho</button></header><main class="pl-note-editor"><div class="pl-note-date">${formatDate(draft.updatedAt)}</div><input class="pl-note-title" aria-label="Título" placeholder="Título" value="${esc(draft.title)}"><textarea class="pl-note-body" aria-label="Nota" placeholder="Empieza a escribir…">${esc(draft.body)}</textarea></main><footer class="pl-note-editor-footer"><button class="pl-note-delete" aria-label="Eliminar">⌫</button><button class="pl-note-add" aria-label="Nueva nota">□<i>✎</i></button></footer><button class="pl-notes-homebar" aria-label="Cerrar Notas"><span></span></button>`;
      const title=shell.querySelector('.pl-note-title'),body=shell.querySelector('.pl-note-body');
      function persist(){draft.title=title.value;draft.body=body.value;draft.updatedAt=now();let items=load().filter(x=>String(x.id)!==String(draft.id));if(draft.title.trim()||draft.body.trim())items.unshift(draft);save(items)}
      title.oninput=persist;body.oninput=persist;
      const done=()=>{persist();renderList()};shell.querySelector('.pl-notes-listback').onclick=done;shell.querySelector('.pl-notes-done').onclick=done;shell.querySelector('.pl-notes-homebar').onclick=()=>{persist();close()};
      shell.querySelector('.pl-note-delete').onclick=()=>{save(load().filter(x=>String(x.id)!==String(draft.id)));renderList()};
      shell.querySelector('.pl-note-add').onclick=()=>{persist();openEditor({id:crypto.randomUUID?.()||String(Date.now()),title:'',body:'',updatedAt:now()},true)};
      requestAnimationFrame(()=>{(isNew?body:title).focus()});
    }
    renderList();
  }
  document.addEventListener('click',e=>{
    const app=e.target.closest?.('.ios-app');if(!app)return;
    const label=(app.getAttribute('aria-label')||app.textContent||'').trim().toLowerCase();
    if(label==='notas'||label.includes('notas')){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();openNotes()}
  },true);
  window.__plOpenNotes=openNotes;
})();