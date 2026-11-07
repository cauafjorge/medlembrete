const STORAGE_KEY='medlembrete_v3',UI_KEY='medlembrete_ui',OWNER_KEY='medlembrete_owner',FLAG_KEY='medlembrete_logged',DIRTY_KEY='medlembrete_dirty',PREV_KEY='medlembrete_prev';
const PRIVACY_CONTACT=''; // opcional: e-mail de contato do responsável, mostrado na política de privacidade
const lsGet=k=>{try{return localStorage.getItem(k)}catch{return null}},lsSet=(k,v)=>{try{localStorage.setItem(k,v);return true}catch{return false}},lsDel=k=>{try{localStorage.removeItem(k)}catch{}};
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const uid=()=>crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`;
const esc=(s='')=>String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const today=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const ic=(n,extra='')=>`<svg class="ic ${extra}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const seed=()=>{const p=uid();return{activeProfileId:p,profiles:[{id:p,name:'Usuário',relation:'Eu',avatar:''}],medications:[],logs:[],version:3}};
const readJSON=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))||f}catch{return f}};
const safeAvatar=a=>typeof a==='string'&&a.length<400000&&/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(a)?a:'';
const cut=(v,n)=>String(v??'').slice(0,n);
const nonNeg=(v,d=0)=>{v=+v;return Number.isFinite(v)&&v>=0?Math.min(v,99999):d};
const isDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v);
function sanitizeState(s){
  if(!s||typeof s!=='object'||!Array.isArray(s.profiles)||!Array.isArray(s.medications)||!Array.isArray(s.logs))return null;
  const profiles=s.profiles.filter(p=>p&&p.id).slice(0,50).map(p=>({id:cut(p.id,80),name:cut(p.name,40)||'Perfil',relation:cut(p.relation,30),avatar:safeAvatar(p.avatar)}));
  if(!profiles.length)return null;
  const ids=new Set(profiles.map(p=>p.id)),t0=today();
  const medications=s.medications.filter(m=>m&&m.id&&ids.has(m.profileId)).slice(0,500).map(m=>({id:cut(m.id,80),profileId:cut(m.profileId,80),name:cut(m.name,80),dose:cut(m.dose,80),form:cut(m.form,30),times:[...new Set((Array.isArray(m.times)?m.times:[]).filter(t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t)))].sort(),stock:nonNeg(m.stock),threshold:nonNeg(m.threshold),notes:cut(m.notes,500),createdAt:isDate(m.createdAt)?m.createdAt:t0}));
  const logs=s.logs.filter(l=>l&&l.id&&typeof l.doseId==='string'&&/^\d{4}-\d{2}-\d{2}\|[^|]+\|\d\d:\d\d$/.test(l.doseId)&&['taken','skipped'].includes(l.status)&&!Number.isNaN(new Date(l.at).getTime())&&ids.has(l.profileId)).slice(-20000).map(l=>({id:cut(l.id,80),doseId:l.doseId,profileId:cut(l.profileId,80),medId:cut(l.medId,80),medName:cut(l.medName,80),dose:cut(l.dose,80),time:cut(l.time,5),status:l.status,at:new Date(l.at).toISOString()}));
  return{activeProfileId:ids.has(s.activeProfileId)?s.activeProfileId:profiles[0].id,profiles,medications,logs,version:3};
}
const UI_DEFAULT={fontScale:1,highContrast:false,darkMode:false,gamification:false};
function sanitizeUI(u){u=u&&typeof u==='object'?u:{};const f=+u.fontScale;return{fontScale:Number.isFinite(f)?Math.min(1.5,Math.max(.8,f)):1,highContrast:!!u.highContrast,darkMode:!!u.darkMode,gamification:!!u.gamification}}
let state=sanitizeState(readJSON(STORAGE_KEY,null))||seed();
let ui={...UI_DEFAULT,...sanitizeUI(readJSON(UI_KEY,{}))};
let historyFilter='all',medQuery='',currentUser=null,auth=null,db=null,syncTimer=null,syncing=false,authMode='login',pendingAvatar='';
let refill={medId:'',amount:30},lastUndo=null,currentView='home';

const MED_COLORS=['linear-gradient(135deg,#ff9b4a,#e85d04)','linear-gradient(135deg,#6a7df0,#3b4cc0)','linear-gradient(135deg,#34d3b6,#0f9d8a)','linear-gradient(135deg,#f472b6,#be185d)','linear-gradient(135deg,#a78bfa,#6d28d9)','linear-gradient(135deg,#38bdf8,#0369a1)'];
const medColor=m=>MED_COLORS[[...(m.name||'')].reduce((a,c)=>a+c.charCodeAt(0),0)%MED_COLORS.length];
const AVATAR_CLASSES=['','c1','c2','c3'];

function save(){lsSet(STORAGE_KEY,JSON.stringify(state));lsSet(DIRTY_KEY,'1');scheduleSync()}
function saveUI(){lsSet(UI_KEY,JSON.stringify(ui));applyUI();scheduleSync()}
function applyUI(){
  document.documentElement.style.setProperty('--font-scale',ui.fontScale||1);
  document.body.classList.toggle('high-contrast',!!ui.highContrast);
  document.body.classList.toggle('dark',!!ui.darkMode);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content',ui.darkMode?'#0b1020':'#172b79');
}
applyUI();

const activeProfile=()=>state.profiles.find(p=>p.id===state.activeProfileId)||state.profiles[0];
const meds=()=>state.medications.filter(m=>m.profileId===state.activeProfileId);
const logs=()=>state.logs.filter(l=>l.profileId===state.activeProfileId);
const doseId=(m,t,d=today())=>`${d}|${m}|${t}`;
const getLog=(m,t,d=today())=>state.logs.find(l=>l.doseId===doseId(m,t,d));
const dosesToday=()=>meds().flatMap(m=>(m.times||[]).map(time=>({med:m,time,log:getLog(m.id,time)}))).sort((a,b)=>a.time.localeCompare(b.time));
const nowHM=()=>{const n=new Date();return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`};
const plural=(n,s,p)=>n===1?s:p;

/* ---------- avisos ---------- */
let toastTimer;
function toast(msg,opts={}){
  const o=typeof opts==='boolean'?{error:opts}:opts,e=$('#toast');if(!e)return;
  $('#toastText').textContent=msg;e.classList.toggle('error',!!o.error);
  lastUndo=o.undo||o.action?.run||null;$('#toastUndo').hidden=!lastUndo;$('#toastUndoLabel').textContent=o.action?.label||'Desfazer';
  e.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.classList.remove('show'),o.action?15000:o.undo?6500:2800);
}
function confirmAsk(title,text,label='Excluir'){
  return new Promise(res=>{
    $('#confirmTitle').textContent=title;$('#confirmText').textContent=text;$('#confirmYes').textContent=label;
    openModal('confirmModal');
    const done=v=>{closeModal('confirmModal');$('#confirmYes').onclick=$('#confirmNo').onclick=null;$('#confirmModal').onclick=null;res(v)};
    $('#confirmYes').onclick=()=>done(true);$('#confirmNo').onclick=()=>done(false);
    $('#confirmModal').onclick=e=>{if(e.target.id==='confirmModal')done(false)};
  });
}
function empty(icon,t,x,btn=''){return `<div class="empty"><div class="ill">${ic(icon)}</div><strong>${t}</strong><div>${x}</div>${btn}</div>`}
function avatarHTML(p,cls='avatar'){
  const av=safeAvatar(p?.avatar);if(av)return `<img class="${cls}" src="${av}" alt="Foto de ${esc(p.name)}">`;
  const i=Math.max(0,state.profiles.findIndex(x=>x.id===p?.id))%AVATAR_CLASSES.length;
  return `<div class="${cls} ${AVATAR_CLASSES[i]}">${esc(p?.name?.[0]?.toUpperCase()||'?')}</div>`;
}

/* ---------- cálculos ---------- */
function progress(){const d=dosesToday(),taken=d.filter(x=>x.log?.status==='taken').length,done=d.filter(x=>x.log).length;return{total:d.length,taken,done,left:d.length-done,pct:d.length?Math.round(done/d.length*100):0}}
function scheduleStats(days=30){
  const now=new Date(),t0=today(now),byId=new Map(state.logs.map(l=>[l.doseId,l])),missed=[];let taken=0,den=0;
  meds().forEach(m=>(m.times||[]).forEach(time=>{
    for(let i=0;i<days;i++){
      const d=new Date(now);d.setDate(d.getDate()-i);const ds=today(d);
      if(ds<(m.createdAt||t0))break;
      const l=byId.get(doseId(m.id,time,ds));
      if(l){den++;if(l.status==='taken')taken++}
      else if(i>0){den++;missed.push({med:m,time,date:ds,at:new Date(`${ds}T${time}`)})}
    }
  }));
  return{taken,den,missed,pct:den?Math.round(taken/den*100):null};
}
function stockPercent(m){const base=Math.max(+m.threshold*4,30,+m.stock);return Math.max(3,Math.min(100,Math.round((+m.stock/base)*100)))}
function points(){
  const taken=logs().filter(l=>l.status==='taken'),days=new Set(taken.map(l=>l.doseId.split('|')[0]));
  let streak=0,d=new Date();if(!days.has(today(d)))d.setDate(d.getDate()-1);
  while(days.has(today(d))){streak++;d.setDate(d.getDate()-1)}
  return{pts:taken.length*10,streak};
}

/* ---------- telas ---------- */
function renderSide(){const p=activeProfile();$('#sidebarProfile').textContent=p.name;$('#sidebarAvatarWrap').innerHTML=avatarHTML(p)}
function bell(){const on='Notification'in window&&Notification.permission==='granted';return `<button class="icon-btn ${on?'on':''}" data-act="notify" aria-label="${on?'Lembretes ativados':'Ativar lembretes no aparelho'}" title="${on?'Lembretes ativados':'Ativar lembretes'}">${ic('bell')}${on?'':'<i class="dot"></i>'}</button>`}
function heroText(p,next){
  if(!p.total)return{h:'Nenhuma dose hoje',s:'Cadastre um remédio para começar.'};
  if(!p.left)return{h:'Tudo em dia!',s:'Você registrou todas as doses de hoje.'};
  return{h:p.left===1?'Falta 1 dose':`Faltam ${p.left} doses`,s:next?`${next.med.name} às ${next.time}`:''};
}
function renderHome(){
  const d=dosesToday(),p=progress(),next=d.find(x=>!x.log),low=meds().filter(m=>+m.stock<=+m.threshold),ht=heroText(p,next);
  const C=2*Math.PI*34,off=C*(1-(p.total?p.done/p.total:0)),g=points(),prof=activeProfile();
  const late=next&&next.time<nowHM(),miss=scheduleStats().missed;
  $('#view-home').innerHTML=`
    <div class="page-head"><div><p class="eyebrow">${new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'numeric',month:'long'}).format(new Date())}</p><h1>Olá, ${esc(prof.name.split(' ')[0])}</h1></div>${bell()}</div>
    <div class="home-grid">
      <div>
        <div class="hero ${p.total&&!p.left?'done':''}">
          <div class="ring" role="img" aria-label="${p.done} de ${p.total} doses registradas"><svg viewBox="0 0 80 80"><circle class="track" cx="40" cy="40" r="34" fill="none" stroke-width="8"/><circle class="bar" cx="40" cy="40" r="34" fill="none" stroke-width="8" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/></svg><b>${p.done}/${p.total}</b></div>
          <div><small>Doses tomadas hoje</small><h2>${ht.h}</h2><p>${esc(ht.s)}</p></div>
        </div>
        ${next?`<article class="card next-card"><div><span class="lbl">Próximo remédio${late?'<span class="tag-late">Atrasado</span>':''}</span><strong>${esc(next.med.name)}</strong><small>${esc(next.med.dose)} · ${next.time}</small></div><button class="btn btn-primary" data-dose="take" data-med="${next.med.id}" data-time="${next.time}">${ic('check')}Tomei</button></article>`:''}
        <div class="mini-stats">
          <button class="mini-stat" data-go="meds"><span>Remédios</span><b>${meds().length}</b></button>
          <div class="mini-stat"><span>Faltam hoje</span><b>${p.left}</b></div>
          <button class="mini-stat alert ${low.length?'has':''}" data-go="meds"><span>Estoque baixo</span><b>${low.length}</b></button>
        </div>
        ${ui.gamification?`<div class="reward"><div>${ic('star')}<span>${g.pts} pontos<small>10 por dose tomada</small></span></div><div>${ic('flame')}<span>${g.streak} ${plural(g.streak,'dia','dias')}<small>seguidos</small></span></div></div>`:''}
      </div>
      <div>
        <div class="section-title" style="margin-top:6px"><div><h2>Agenda de hoje</h2><p>Confirme cada dose com um toque.</p></div></div>
        <div class="dose-list">${d.length?d.map(x=>{const st=x.log?.status;return `<div class="dose-row ${st==='taken'?'is-taken':st==='skipped'?'is-skipped':''}"><div class="dose-time">${x.time}</div><div class="dose-main"><strong>${esc(x.med.name)}</strong><small>${esc(x.med.dose)}</small></div><div class="dose-actions">${st==='taken'?`<span class="pill pill-ok">${ic('check')}Tomada</span>`:st==='skipped'?'<span class="pill pill-skip">Pulada</span>':`<button class="btn btn-soft btn-sm" data-dose="skip" data-med="${x.med.id}" data-time="${x.time}" aria-label="Pular dose de ${esc(x.med.name)}">Pular</button><button class="btn btn-primary btn-sm" data-dose="take" data-med="${x.med.id}" data-time="${x.time}" aria-label="Marcar ${esc(x.med.name)} como tomado">${ic('check')}Tomei</button>`}</div></div>`}).join(''):empty('pill','Sem doses hoje','Cadastre um remédio para ver a agenda.',`<button class="btn btn-primary" data-act="add-med">${ic('plus')}Novo remédio</button>`)}</div>
        ${miss.length?`<div class="alert-card miss-card">${ic('clock','big')}<div><strong>${miss.length} ${plural(miss.length,'dose sem registro','doses sem registro')}</strong><small>Dos últimos dias. Confira se você tomou.</small></div><button class="btn btn-primary btn-sm" data-go-missed="1">Ver</button></div>`:''}
        ${low.length?`<div class="section-title"><div><h2>Estoque</h2><p>Itens que precisam de atenção.</p></div></div><div class="dose-list">${low.map(m=>`<div class="alert-card">${ic('alert','big')}<div><strong>${esc(m.name)}</strong><small>Restam ${m.stock} ${plural(+m.stock,'unidade','unidades')}</small></div><button class="btn btn-primary btn-sm" data-refill="${m.id}">${ic('plus')}Repor</button></div>`).join('')}</div>`:''}
      </div>
    </div>
    <div class="disclaimer"><strong>Importante:</strong> o MedLembrete ajuda na organização, mas não substitui a orientação médica ou farmacêutica.</div>`;
}
function renderMeds(){
  const q=medQuery.toLowerCase(),list=meds().filter(m=>m.name.toLowerCase().includes(q)||m.dose.toLowerCase().includes(q));
  const v=$('#view-meds');
  v.innerHTML=`
    <div class="page-head"><div><p class="eyebrow">Tratamento</p><h1>Remédios</h1></div><button class="btn btn-primary" data-act="add-med">${ic('plus')}Novo</button></div>
    <div class="search-wrap">${ic('search')}<input id="medSearch" type="search" placeholder="Buscar remédio" value="${esc(medQuery)}" aria-label="Buscar remédio" autocomplete="off"></div>
    <div class="med-list">${list.length?list.map(m=>{const lowS=+m.stock<=+m.threshold;return `<article class="card med-card">
      <div class="med-head"><div class="med-ico" style="background:${medColor(m)}">${ic('pill')}</div><div><h3>${esc(m.name)}</h3><p>${esc(m.dose)} · ${esc(m.form)}</p></div></div>
      <div class="time-chips">${(m.times||[]).map(t=>{const done=getLog(m.id,t)?.status==='taken';return `<span class="time-chip ${done?'done':''}">${done?ic('check'):''}${t}</span>`}).join('')}</div>
      <div class="stock-row"><span>Estoque</span><strong class="${lowS?'low':''}">${m.stock} ${plural(+m.stock,'unidade','unidades')}</strong></div>
      <div class="meter ${lowS?'low':''}"><span style="width:${stockPercent(m)}%"></span></div>
      ${lowS?`<div class="low-badge">${ic('alert')}Estoque baixo: ${m.stock} ${plural(+m.stock,'unidade','unidades')}</div>`:''}
      ${m.notes?`<p class="med-notes">${esc(m.notes)}</p>`:''}
      <div class="med-actions"><button class="btn btn-primary" data-refill="${m.id}">${ic('plus')}Repor</button><button class="btn btn-soft" data-edit-med="${m.id}">${ic('edit')}Editar</button><button class="btn btn-danger" data-delete-med="${m.id}">${ic('trash')}Excluir</button></div>
    </article>`}).join(''):(medQuery?empty('search','Nada encontrado','Tente outro nome.'):empty('pill','Nenhum remédio ainda','Cadastre o primeiro para receber lembretes.',`<button class="btn btn-primary" data-act="add-med">${ic('plus')}Cadastrar remédio</button>`))}</div>`;
  $('#medSearch').oninput=e=>{medQuery=e.target.value;const pos=e.target.selectionStart;renderMeds();const i=$('#medSearch');i.focus();i.setSelectionRange(pos,pos)};
}
function renderHistory(){
  const st=scheduleStats(),fmt=new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
  const L=[...logs()],taken=L.filter(l=>l.status==='taken').length;
  const items=[...(historyFilter==='missed'?[]:L.filter(l=>historyFilter==='all'||l.status===historyFilter).map(l=>({k:'log',l,at:new Date(l.at)}))),...(historyFilter==='all'||historyFilter==='missed'?st.missed.map(x=>({k:'miss',x,at:x.at})):[])].sort((a,b)=>b.at-a.at).slice(0,300);
  $('#view-history').innerHTML=`
    <div class="page-head"><div><p class="eyebrow">Acompanhamento</p><h1>Histórico</h1></div></div>
    <div class="summary"><div class="mini-stat"><span>Registros</span><b>${L.length}</b></div><div class="mini-stat"><span>Tomadas</span><b>${taken}</b></div><div class="mini-stat"><span>Em dia (30 dias)</span><b>${st.pct===null?'—':st.pct+'%'}</b></div></div>
    <div class="filters" role="group" aria-label="Filtrar histórico">${[['all','Todos'],['taken','Tomadas'],['skipped','Puladas'],['missed',`Sem registro${st.missed.length?` (${st.missed.length})`:''}`]].map(([k,l])=>`<button class="filter-chip ${historyFilter===k?'active':''}" data-history-filter="${k}" aria-pressed="${historyFilter===k}">${l}</button>`).join('')}</div>
    <div class="history-list">${items.length?items.map(it=>{
      if(it.k==='miss'){const x=it.x;return `<div class="history-row"><strong>${esc(x.med.name)}</strong><span class="pill pill-warn">Sem registro</span><div class="meta"><span>${esc(x.med.dose)}</span><span>·</span><span>${fmt.format(x.at)}</span></div><div class="late-actions"><button class="btn btn-soft btn-sm" data-late="taken" data-med="${x.med.id}" data-time="${x.time}" data-date="${x.date}" aria-label="Marcar ${esc(x.med.name)} das ${x.time} como tomado">${ic('check')}Tomei</button><button class="btn btn-ghost btn-sm" data-late="skipped" data-med="${x.med.id}" data-time="${x.time}" data-date="${x.date}" aria-label="Marcar ${esc(x.med.name)} das ${x.time} como pulado">Não tomei</button></div></div>`}
      const l=it.l,m=state.medications.find(x=>x.id===l.medId),ok=l.status==='taken';return `<div class="history-row"><strong>${esc(m?.name||l.medName||'Remédio')}</strong><span class="pill ${ok?'pill-ok':'pill-skip'}">${ok?ic('check'):''}${ok?'Tomada':'Pulada'}</span><div class="meta"><span>${esc(m?.dose||l.dose||'')}</span><span>·</span><span>${fmt.format(it.at)}</span></div></div>`}).join(''):empty('history','Nenhum registro aqui',historyFilter==='missed'?'Tudo certo: nenhuma dose ficou sem registro.':'As doses registradas aparecem nesta lista.')}</div>`;
}
function renderProfiles(){
  $('#view-profiles').innerHTML=`
    <div class="page-head"><div><p class="eyebrow">Pessoas</p><h1>Perfis</h1></div><button class="btn btn-primary" data-act="add-profile">${ic('plus')}Perfil</button></div>
    <div class="stack profile-list">${state.profiles.map(p=>{const a=p.id===state.activeProfileId;return `<article class="card profile-card ${a?'active':''}"><div class="profile-top">${avatarHTML(p,'avatar avatar-lg')}<div><h3>${esc(p.name)}</h3><p>${esc(p.relation)}</p>${a?`<span class="pill pill-teal">${ic('check')}Perfil ativo</span>`:`<button class="btn btn-soft btn-sm" data-profile="${p.id}">Usar este perfil</button>`}</div></div><div class="profile-actions"><button class="btn btn-ghost btn-sm" data-edit-profile="${p.id}">${ic('edit')}Editar</button>${state.profiles.length>1?`<button class="btn btn-ghost btn-sm" style="color:var(--danger)" data-delete-profile="${p.id}">${ic('trash')}Excluir</button>`:''}</div></article>`}).join('')}</div>
    <p class="foot-note">A foto é opcional. Sem foto, aparece a inicial do nome.</p>`;
}
function renderSettings(){
  const f=+ui.fontScale||1,notif='Notification'in window&&Notification.permission==='granted';
  $('#view-settings').innerHTML=`
    <div class="page-head"><div><p class="eyebrow">Preferências</p><h1>Ajustes</h1></div></div>
    <div class="stack settings-grid">
      <article class="card group"><h2>Acessibilidade</h2>
        <div class="row"><strong>Tamanho do texto</strong><div class="segmented" role="group" aria-label="Tamanho do texto">${[[.92,'A−','Diminuir texto'],[1,'A','Texto normal'],[1.2,'A+','Aumentar texto']].map(([v,l,a])=>`<button class="${Math.abs(f-v)<.02?'on':''}" data-font="${v}" aria-label="${a}" aria-pressed="${Math.abs(f-v)<.02}">${l}</button>`).join('')}</div></div>
        <div class="row"><strong>Alto contraste</strong><label class="switch"><input id="contrastToggle" type="checkbox" role="switch" ${ui.highContrast?'checked':''} aria-label="Alto contraste"><i></i></label></div>
        <div class="row"><div><strong>Modo escuro</strong></div><label class="switch"><input id="darkToggle" type="checkbox" role="switch" ${ui.darkMode?'checked':''} aria-label="Modo escuro"><i></i></label></div>
      </article>
      <article class="card group"><h2>Lembretes</h2>
        <p class="helper">Receba um aviso no horário de cada remédio. O aparelho vai pedir sua permissão.</p>
        <div class="backup-actions"><button class="btn ${notif?'btn-soft':'btn-primary'}" data-act="notify">${ic('bell')}${notif?'Lembretes ativados':'Ativar lembretes'}</button></div>
      </article>
      <article class="card group"><div class="row" style="border:0"><div><strong>Pontos e conquistas</strong><small>Desligado. Você escolhe se quer ver pontuação.</small></div><label class="switch"><input id="gamificationToggle" type="checkbox" role="switch" ${ui.gamification?'checked':''} aria-label="Pontos e conquistas"><i></i></label></div></article>
      <article class="card group"><h2>${ic('cloud')}Cópia dos seus dados</h2>
        <p class="helper">Seus dados ficam guardados na sua conta e aparecem em outro aparelho. Use “Guardar cópia” para salvar um arquivo no aparelho e “Recuperar” para voltar com ele.</p>
        <p class="sync-status" id="cloudSyncStatus">${currentUser?'Sincronização ativa':lsGet(FLAG_KEY)==='1'?'Sem conexão com a conta. Os dados ficam salvos neste aparelho.':'Você não está conectado'}</p>
        <div class="backup-actions"><button class="btn btn-soft btn-sm" id="syncNow">${ic('cloud')}Sincronizar</button><button class="btn btn-soft btn-sm" id="exportBtn">${ic('download')}Guardar cópia</button><label class="btn btn-soft btn-sm" style="cursor:pointer">${ic('upload')}Recuperar<input id="importInput" type="file" accept="application/json" hidden></label></div>
      </article>
      <article class="card group"><h2>Privacidade</h2>
        <p class="helper">Veja quais dados o app guarda, onde ficam e como apagar tudo.</p>
        <div class="backup-actions"><button class="btn btn-soft btn-sm" data-act="privacy">Política de privacidade</button>${currentUser?`<button class="btn btn-outline-danger btn-sm" id="deleteAccountBtn">${ic('trash')}Excluir minha conta e dados</button>`:''}</div>
      </article>
      ${currentUser?`<button class="btn btn-outline-danger btn-block" id="logoutBtn">${ic('logout')}Sair da conta</button>`:''}
    </div>`;
}
function renderAll(){renderSide();renderHome();renderMeds();renderHistory();renderProfiles();renderSettings();bindDynamic()}
function switchView(v){
  currentView=v;$$('.view').forEach(x=>x.classList.toggle('active',x.id===`view-${v}`));
  $$('.tab').forEach(x=>{const on=x.dataset.view===v;x.classList.toggle('active',on);on?x.setAttribute('aria-current','page'):x.removeAttribute('aria-current')});
  window.scrollTo({top:0,behavior:'smooth'});
}

/* ---------- eventos ---------- */
function bindDynamic(){
  $('#contrastToggle')&&($('#contrastToggle').onchange=e=>{ui.highContrast=e.target.checked;saveUI()});
  $('#darkToggle')&&($('#darkToggle').onchange=e=>{ui.darkMode=e.target.checked;saveUI()});
  $('#gamificationToggle')&&($('#gamificationToggle').onchange=e=>{ui.gamification=e.target.checked;saveUI();renderAll()});
  $('#syncNow')&&($('#syncNow').onclick=()=>syncToCloud(true));
  $('#logoutBtn')&&($('#logoutBtn').onclick=logoutUser);
  $('#deleteAccountBtn')&&($('#deleteAccountBtn').onclick=startDeleteAccount);
  $('#exportBtn')&&($('#exportBtn').onclick=exportData);
  $('#importInput')&&($('#importInput').onchange=importData);
}
document.addEventListener('click',e=>{
  const t=e.target.closest('button');if(!t)return;
  const d=t.dataset;
  if(d.go)switchView(d.go);
  if(d.act==='notify')requestNotifications();
  if(d.act==='privacy')openPrivacy();
  if(d.goMissed){historyFilter='missed';renderHistory();switchView('history')}
  if(d.late)recordDose(d.med,d.time,d.late,d.date);
  if(d.act==='add-med')openMedModal();
  if(d.act==='add-profile')openProfileModal();
  if(d.dose)recordDose(d.med,d.time,d.dose==='take'?'taken':'skipped');
  if(d.refill)openRefill(d.refill);
  if(d.editMed)openMedModal(d.editMed);
  if(d.deleteMed)deleteMed(d.deleteMed);
  if(d.profile){state.activeProfileId=d.profile;save();renderAll();toast('Perfil trocado.')}
  if(d.editProfile)openProfileModal(d.editProfile);
  if(d.deleteProfile)deleteProfile(d.deleteProfile);
  if(d.font){ui.fontScale=+d.font;saveUI();renderSettings();bindDynamic()}
  if(d.historyFilter){historyFilter=d.historyFilter;renderHistory()}
  if(d.close)closeModal(d.close);
  if(t.id==='toastUndo'&&lastUndo){const u=lastUndo;lastUndo=null;$('#toast').classList.remove('show');u()}
});

function recordDose(medId,time,status,date=today()){
  const m=state.medications.find(x=>x.id===medId),id=doseId(medId,time,date);
  if(!m||!isDate(date)||state.logs.some(l=>l.doseId===id))return;
  const at=date===today()?new Date():new Date(`${date}T${time}`);
  const entry={id:uid(),doseId:id,profileId:m.profileId||state.activeProfileId,medId,medName:m.name||'',dose:m.dose||'',time,status,at:at.toISOString()};
  state.logs.push(entry);
  if(status==='taken')m.stock=Math.max(0,+m.stock-1);
  save();renderAll();
  toast(status==='taken'?'Dose registrada como tomada.':'Dose registrada como pulada.',{undo:()=>{
    state.logs=state.logs.filter(l=>l.id!==entry.id);
    if(status==='taken')m.stock=+m.stock+1;
    save();renderAll();toast('Registro desfeito.');
  }});
}

/* reposição de estoque */
function openRefill(id){
  const list=meds();if(!list.length)return toast('Cadastre um remédio primeiro.',true);
  refill={medId:list.some(m=>m.id===id)?id:list[0].id,amount:30};
  $('#refillChoices').innerHTML=list.map(m=>`<button type="button" class="choice" role="radio" data-choice="${m.id}"><strong>${esc(m.name)}</strong><small>${m.stock} ${plural(+m.stock,'unidade','unidades')}</small></button>`).join('');
  updateRefill();openModal('refillModal');
}
function updateRefill(){
  const m=state.medications.find(x=>x.id===refill.medId);if(!m)return;
  $$('#refillChoices .choice').forEach(c=>{const on=c.dataset.choice===refill.medId;c.classList.toggle('on',on);c.setAttribute('aria-checked',on)});
  const amt=Math.max(0,Math.floor(+refill.amount||0));
  if(document.activeElement!==$('#refillAmount'))$('#refillAmount').value=refill.amount;
  $('#refillPreview').innerHTML=amt>0?`Estoque: ${m.stock} → <b>${+m.stock+amt} unidades</b>`:'Informe quantas unidades chegaram.';
}
$('#refillChoices').onclick=e=>{const c=e.target.closest('[data-choice]');if(c){refill.medId=c.dataset.choice;updateRefill()}};
$('#amtMinus').onclick=()=>{refill.amount=Math.max(1,(+refill.amount||0)-1);updateRefill()};
$('#amtPlus').onclick=()=>{refill.amount=(+refill.amount||0)+1;updateRefill()};
$$('.chip[data-add]').forEach(b=>b.onclick=()=>{refill.amount=(+refill.amount||0)+ +b.dataset.add;updateRefill()});
$('#refillAmount').oninput=e=>{refill.amount=e.target.value;updateRefill()};
$('#refillForm').onsubmit=e=>{
  e.preventDefault();const m=state.medications.find(x=>x.id===refill.medId),n=Math.floor(+refill.amount);
  if(!m||!Number.isFinite(n)||n<=0)return toast('Informe uma quantidade válida.',true);
  m.stock=+m.stock+n;save();closeModal('refillModal');renderAll();toast(`${n} ${plural(n,'unidade adicionada','unidades adicionadas')} em ${m.name}.`);
};

async function deleteMed(id){
  const m=state.medications.find(x=>x.id===id);
  if(!await confirmAsk('Excluir remédio?',`“${m?.name||'Este remédio'}” será removido da lista. O histórico de doses é mantido.`))return;
  state.medications=state.medications.filter(x=>x.id!==id);save();renderAll();toast('Remédio excluído.');
}
async function deleteProfile(id){
  const p=state.profiles.find(x=>x.id===id);
  if(!await confirmAsk('Excluir perfil?',`Os remédios e o histórico de ${p?.name||'este perfil'} também serão apagados.`))return;
  state.profiles=state.profiles.filter(x=>x.id!==id);state.medications=state.medications.filter(m=>m.profileId!==id);state.logs=state.logs.filter(l=>l.profileId!==id);
  state.activeProfileId=state.profiles[0].id;save();renderAll();toast('Perfil excluído.');
}

/* modais */
let lastFocus=null;
function syncInert(){const m=!!$('.modal.open'),lo=!$('#loginOverlay').classList.contains('hidden');$('#appShell').inert=m||lo;$('#loginOverlay').inert=m}
function setOverlay(show){$('#loginOverlay').classList.toggle('hidden',!show);syncInert()}
function openModal(id){const e=$(`#${id}`);lastFocus=document.activeElement;e.inert=false;e.classList.add('open');e.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';syncInert();setTimeout(()=>e.querySelector('input:not([type=hidden]),button.btn')?.focus({preventScroll:true}),120)}
function closeModal(id){const e=$(`#${id}`);e.classList.remove('open');e.setAttribute('aria-hidden','true');e.inert=true;if(!$('.modal.open'))document.body.style.overflow='';syncInert();lastFocus?.focus?.({preventScroll:true})}
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){const o=$$('.modal.open').pop();if(o)o.id==='confirmModal'?$('#confirmNo').click():closeModal(o.id)}
  if(e.key==='Tab'){const o=$$('.modal.open').pop();if(!o)return;const f=[...o.querySelectorAll('button:not([disabled]),input:not([type=hidden]):not([disabled]),select,textarea,a[href],[tabindex]:not([tabindex="-1"])')].filter(x=>!x.hidden&&x.offsetParent!==null);if(!f.length)return;const a=f[0],z=f[f.length-1];if(e.shiftKey&&(document.activeElement===a||!o.contains(document.activeElement))){e.preventDefault();z.focus()}else if(!e.shiftKey&&(document.activeElement===z||!o.contains(document.activeElement))){e.preventDefault();a.focus()}}
});
$$('.modal').forEach(m=>{m.inert=true;m.addEventListener('click',e=>{if(e.target===m&&m.id!=='confirmModal')closeModal(m.id)})});

const QUICK=['08:00','12:00','18:00','20:00','22:00'];
function renderQuickTimes(){
  const cur=parseTimes($('#medTimes').value).list;
  $('#quickTimes').innerHTML=QUICK.map(t=>`<button type="button" data-qt="${t}" style="${cur.includes(t)?'background:var(--navy);color:#fff':''}">${t}</button>`).join('');
}
function parseTimes(v){const raw=v.split(/[,;\s]+/).map(x=>x.trim()).filter(Boolean);const ok=raw.filter(x=>/^([01]?\d|2[0-3]):[0-5]\d$/.test(x)).map(x=>x.padStart(5,'0'));return{raw,list:[...new Set(ok)].sort()}}
$('#quickTimes').onclick=e=>{const b=e.target.closest('[data-qt]');if(!b)return;const {list}=parseTimes($('#medTimes').value),t=b.dataset.qt;const next=list.includes(t)?list.filter(x=>x!==t):[...list,t].sort();$('#medTimes').value=next.join(', ');renderQuickTimes()};
$('#medTimes').oninput=renderQuickTimes;

function openMedModal(id=''){
  const m=state.medications.find(x=>x.id===id);
  $('#medId').value=m?.id||'';$('#medName').value=m?.name||'';$('#medDose').value=m?.dose||'';$('#medFormType').value=m?.form||'Comprimido';
  $('#medTimes').value=m?.times?.join(', ')||'';$('#medStock').value=m?.stock??30;$('#medThreshold').value=m?.threshold??5;$('#medNotes').value=m?.notes||'';
  $('#medError').textContent='';$('#medModalTitle').textContent=m?'Editar remédio':'Novo remédio';renderQuickTimes();openModal('medModal');
}
function saveMedForm(e){
  e.preventDefault();const err=$('#medError');err.textContent='';
  const name=$('#medName').value.trim(),dose=$('#medDose').value.trim();
  if(!name||!dose){err.textContent='Preencha o nome e a dosagem.';return}
  const {raw,list}=parseTimes($('#medTimes').value);
  if(!list.length){err.textContent='Informe ao menos um horário. Ex.: 08:00, 20:00.';return}
  if(list.length!==raw.length&&new Set(raw).size===raw.length){err.textContent='Revise os horários. Use o formato HH:MM.';return}
  const id=$('#medId').value||uid(),data={id,profileId:state.activeProfileId,name,dose,form:$('#medFormType').value,times:list,stock:Math.max(0,+$('#medStock').value||0),threshold:Math.max(0,+$('#medThreshold').value||0),notes:$('#medNotes').value.trim()};
  const old=state.medications.find(x=>x.id===id);data.createdAt=old&&isDate(old.createdAt)&&JSON.stringify(old.times)===JSON.stringify(list)?old.createdAt:today();
  const i=state.medications.findIndex(x=>x.id===id);i>=0?state.medications[i]=data:state.medications.push(data);
  save();closeModal('medModal');renderAll();toast('Remédio salvo.');
}
function openProfileModal(id=''){
  const p=state.profiles.find(x=>x.id===id);pendingAvatar=p?.avatar||'';
  $('#profileId').value=p?.id||'';$('#profileName').value=p?.name||'';$('#profileRelation').value=p?.relation||'Eu';$('#profileAvatarFile').value='';
  $('#profileModalTitle').textContent=p?'Editar perfil':'Novo perfil';updateAvatarPreview(p?.name||'');openModal('profileModal');
}
function updateAvatarPreview(name=''){
  const box=$('#profileAvatarPreview');if(!box)return;
  box.outerHTML=safeAvatar(pendingAvatar)?`<img id="profileAvatarPreview" class="avatar avatar-lg" src="${safeAvatar(pendingAvatar)}" alt="Prévia da foto">`:`<div id="profileAvatarPreview" class="avatar avatar-lg">${esc(name[0]?.toUpperCase()||'?')}</div>`;
}
function imageToAvatar(file){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();r.onerror=reject;
    r.onload=()=>{const img=new Image();img.onerror=reject;img.onload=()=>{const max=256,s=Math.min(1,max/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*s));c.height=Math.max(1,Math.round(img.height*s));c.getContext('2d').drawImage(img,0,0,c.width,c.height);resolve(c.toDataURL('image/jpeg',.78))};img.src=r.result};
    r.readAsDataURL(file);
  });
}
async function handleAvatarFile(e){const f=e.target.files?.[0];if(!f)return;if(!f.type.startsWith('image/'))return toast('Escolha uma imagem válida.',true);if(f.size>8*1024*1024)return toast('Escolha uma imagem de até 8 MB.',true);try{pendingAvatar=await imageToAvatar(f);updateAvatarPreview($('#profileName').value)}catch{toast('Não foi possível carregar a foto.',true)}}
function saveProfile(e){
  e.preventDefault();const id=$('#profileId').value||uid(),p={id,name:$('#profileName').value.trim(),relation:$('#profileRelation').value,avatar:pendingAvatar};
  if(!p.name)return;
  const i=state.profiles.findIndex(x=>x.id===id);if(i>=0)state.profiles[i]=p;else{state.profiles.push(p);state.activeProfileId=p.id}
  save();closeModal('profileModal');e.target.reset();pendingAvatar='';renderAll();toast(i>=0?'Perfil atualizado.':'Perfil criado.');
}

/* cópia dos dados */
function exportData(){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({state,ui,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'}));a.download=`medlembrete-copia-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);toast('Cópia guardada no seu aparelho.')}
async function importData(e){
  const input=e.target;
  try{
    const f=input.files[0];if(!f)return;
    if(f.size>8*1024*1024)throw new Error('big');
    const d=JSON.parse(await f.text()),next=sanitizeState(d?.state||d);
    if(!next)throw new Error('invalid');
    const cur=`${state.medications.length} ${plural(state.medications.length,'remédio','remédios')} e ${state.logs.length} ${plural(state.logs.length,'registro','registros')}`,inc=`${next.medications.length} ${plural(next.medications.length,'remédio','remédios')} e ${next.logs.length} ${plural(next.logs.length,'registro','registros')}`;
    if(!await confirmAsk('Recuperar esta cópia?',`Os dados atuais (${cur}) serão trocados pelos da cópia (${inc}). Você poderá desfazer logo em seguida.`,'Recuperar'))return;
    const prev=state,prevUi={...ui};lsSet(PREV_KEY,JSON.stringify(prev));
    state=next;if(d?.ui)ui={...ui,...sanitizeUI(d.ui)};save();saveUI();renderAll();
    toast('Cópia recuperada com sucesso.',{undo:()=>{state=prev;ui=prevUi;save();saveUI();renderAll();toast('Dados anteriores restaurados.')}});
  }catch{toast('Arquivo inválido. Escolha uma cópia do MedLembrete.',true)}
  finally{input.value=''}
}

/* lembretes */
function requestNotifications(){
  if(!('Notification'in window))return toast('Este aparelho não permite lembretes pelo navegador.',true);
  Notification.requestPermission().then(p=>{toast(p==='granted'?'Lembretes ativados.':'Permissão não concedida.',p!=='granted');renderHome();renderSettings();bindDynamic()});
}
const toMin=t=>+t.slice(0,2)*60+ +t.slice(3,5);
const notified=new Set((()=>{try{return JSON.parse(sessionStorage.getItem('medlembrete_notified')||'[]')}catch{return[]}})());
function showReminder(x){
  const title=`Hora de ${x.med.name}`,opts={body:`${x.med.dose} · ${x.time}`,icon:'/icon-192.png',tag:doseId(x.med.id,x.time)};
  const fallback=()=>{try{new Notification(title,opts)}catch{}};
  (async()=>{try{const r=await navigator.serviceWorker?.getRegistration?.();if(r?.showNotification){await r.showNotification(title,opts);return}}catch{}fallback()})();
}
function checkReminders(){
  if(!('Notification'in window)||Notification.permission!=='granted')return;
  const n=toMin(nowHM());
  dosesToday().filter(x=>!x.log&&toMin(x.time)<=n&&n-toMin(x.time)<=10).forEach(x=>{
    const k=doseId(x.med.id,x.time);if(notified.has(k))return;notified.add(k);
    try{sessionStorage.setItem('medlembrete_notified',JSON.stringify([...notified].slice(-200)))}catch{}
    showReminder(x);
  });
}
let lastDay=today();
function tick(){if(today()!==lastDay){lastDay=today();renderAll()}checkReminders()}

/* conta e sincronização */
const firebaseConfigured=()=>{const c=window.MEDLEMBRETE_FIREBASE_CONFIG||{};return !!(c.apiKey&&c.authDomain&&c.projectId&&c.appId)};
function setMsg(x,err=false){const e=$('#syncMessage');e.textContent=x||'';e.classList.toggle('error',err)}
function setAuthMode(m){
  authMode=m;const s=m==='signup';
  $('#authNameLabel').classList.toggle('show',s);$('#authName').required=s;$('#authConfirmLabel').classList.toggle('show',s);$('#authPasswordConfirm').required=s;$('#authPasswordConfirm').value='';$('#authConsentLabel').classList.toggle('show',s);$('#authConsent').required=s;$('#authConsent').checked=false;
  $('#authSubmit').textContent=s?'Criar conta':'Entrar';
  $('#toggleAuthMode').textContent=s?'Já tenho conta':'Criar conta';
  $('#forgotPassword').classList.toggle('hidden',s);
  $('#authPassword').autocomplete=s?'new-password':'current-password';
  $('#authSubtitle').textContent=s?'Crie sua conta para guardar seus dados com segurança.':'Entre para manter remédios, doses e histórico sincronizados.';
  setMsg('');
}
function authErr(e){const c=e?.code||'';if(c.includes('email-already'))return'Este e-mail já tem conta.';if(c.includes('weak-password'))return'A senha precisa ter ao menos 6 caracteres.';if(c.includes('invalid-email'))return'E-mail inválido.';if(c.includes('too-many-requests'))return'Muitas tentativas. Aguarde um pouco.';if(c.includes('invalid-credential')||c.includes('wrong-password')||c.includes('user-not-found'))return'E-mail ou senha incorretos.';if(c.includes('network'))return'Sem internet no momento.';return'Não foi possível concluir. Tente de novo.'}
async function initFirebase(){
  if(!firebaseConfigured()||!window.firebase){
    if(lsGet(FLAG_KEY)==='1'){setOverlay(false);renderAll();toast('Sem conexão com a conta. Usando os dados salvos neste aparelho.')}
    else setMsg('Sem internet no momento. Conecte-se para entrar na conta.',true);
    return;
  }
  try{
    firebase.initializeApp(window.MEDLEMBRETE_FIREBASE_CONFIG);auth=firebase.auth();db=firebase.firestore();
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    auth.onAuthStateChanged(async u=>{
      currentUser=u||null;
      if(u){
        lsSet(FLAG_KEY,'1');
        const owner=lsGet(OWNER_KEY);
        if(owner&&owner!==u.uid){state=seed();lsSet(STORAGE_KEY,JSON.stringify(state));lsDel(DIRTY_KEY)}
        lsSet(OWNER_KEY,u.uid);
        setOverlay(false);renderAll();
        await restoreCloud();renderAll();
      }else{lsDel(FLAG_KEY);setOverlay(true);renderAll()}
    });
  }catch(e){console.error(e);setMsg('Falha ao iniciar a conta.',true)}
}
async function handleAuth(e){
  e.preventDefault();if(!auth)return setMsg('Conta indisponível no momento.',true);
  const email=$('#authEmail').value.trim(),pass=$('#authPassword').value,name=$('#authName').value.trim();
  if(authMode==='signup'&&pass!==$('#authPasswordConfirm').value){setMsg('As senhas não são iguais. Confira e digite de novo.',true);$('#authPasswordConfirm').focus();return}
  if(authMode==='signup'&&!$('#authConsent').checked){setMsg('Para criar a conta, aceite a Política de Privacidade.',true);$('#authConsent').focus();return}
  try{
    setMsg(authMode==='signup'?'Criando conta…':'Entrando…');
    if(authMode==='signup'){const c=await auth.createUserWithEmailAndPassword(email,pass);if(name)await c.user.updateProfile({displayName:name});const p=uid();state={activeProfileId:p,profiles:[{id:p,name:name||email.split('@')[0],relation:'Eu',avatar:''}],medications:[],logs:[],version:3};save();renderAll();await syncToCloud(true)}
    else await auth.signInWithEmailAndPassword(email,pass);
  }catch(err){setMsg(authErr(err),true)}
}
async function forgot(){if(!auth)return setMsg('Conta indisponível no momento.',true);const email=$('#authEmail').value.trim();if(!email)return setMsg('Digite seu e-mail primeiro.',true);try{await auth.sendPasswordResetEmail(email);setMsg('Enviamos um link para o seu e-mail.')}catch(err){setMsg(authErr(err),true)}}
function clearLocalData(){
  clearTimeout(syncTimer);[STORAGE_KEY,OWNER_KEY,FLAG_KEY,DIRTY_KEY,PREV_KEY].forEach(lsDel);
  state=seed();historyFilter='all';medQuery='';currentView='home';switchView('home');
}
async function logoutUser(){
  if(!await confirmAsk('Sair da conta?','Seus dados continuam guardados na sua conta. Eles serão apagados deste aparelho ao sair e voltam quando você entrar de novo.','Sair'))return;
  try{
    const ok=await syncToCloud(false);
    if(!ok&&!await confirmAsk('Alterações não enviadas','Não foi possível enviar as últimas alterações para a sua conta. Se sair agora, elas podem ser perdidas. Deseja sair mesmo assim?','Sair mesmo assim'))return;
    await auth.signOut();clearLocalData();renderAll();
  }catch{toast('Não foi possível sair.',true)}
}
function scheduleSync(){if(!currentUser||!db||syncing)return;clearTimeout(syncTimer);syncTimer=setTimeout(()=>syncToCloud(false),700)}
async function syncToCloud(show=false){
  if(!currentUser||!db){if(show)toast(lsGet(FLAG_KEY)==='1'?'Sem conexão com a conta agora. Suas alterações ficam neste aparelho.':'Entre na conta para sincronizar.',true);return false}
  syncing=true;
  try{await db.collection('users').doc(currentUser.uid).set({state,ui,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),email:currentUser.email||''},{merge:true});lsDel(DIRTY_KEY);if(show)toast('Dados sincronizados.');return true}
  catch(e){console.error(e);if(show)toast('Falha ao sincronizar. Confira a internet.',true);return false}
  finally{syncing=false}
}
async function restoreCloud(){
  try{
    const snap=await db.collection('users').doc(currentUser.uid).get();
    if(snap.exists&&lsGet(DIRTY_KEY)==='1'){await syncToCloud(false);toast('Alterações feitas sem internet foram enviadas.');return}
    if(snap.exists){
      const cs=sanitizeState(snap.data().state);
      if(!cs){toast('Os dados da nuvem estão em um formato inválido. Nada foi alterado.',true);return}
      syncing=true;state=cs;ui={...ui,...sanitizeUI(snap.data().ui)};lsSet(STORAGE_KEY,JSON.stringify(state));lsSet(UI_KEY,JSON.stringify(ui));lsDel(DIRTY_KEY);applyUI();syncing=false;
    }else await syncToCloud(false);
  }catch(e){console.error(e);syncing=false;toast(e?.code==='unavailable'||!navigator.onLine?'Sem conexão. Usando os dados salvos neste aparelho.':'Não foi possível restaurar os dados da nuvem.',true)}
}

/* privacidade e exclusão de conta */
function openPrivacy(){
  $('#privacyContact').innerHTML=PRIVACY_CONTACT?`<p>Contato do responsável: <a href="mailto:${esc(PRIVACY_CONTACT)}">${esc(PRIVACY_CONTACT)}</a></p>`:'';
  openModal('privacyModal');
}
function startDeleteAccount(){
  if(!currentUser)return;
  $('#deleteError').textContent='';$('#deletePassword').value='';openModal('deleteModal');
}
async function confirmDeleteAccount(e){
  e.preventDefault();const err=$('#deleteError'),pw=$('#deletePassword').value;err.textContent='';
  if(!currentUser||!auth||!db)return;
  if(!pw){err.textContent='Digite sua senha para confirmar.';return}
  const btn=$('#deleteConfirmBtn');btn.disabled=true;
  try{
    const u=currentUser,cred=firebase.auth.EmailAuthProvider.credential(u.email,pw);
    await u.reauthenticateWithCredential(cred);
    clearTimeout(syncTimer);syncing=true;
    await db.collection('users').doc(u.uid).delete();
    await u.delete();
    syncing=false;closeModal('deleteModal');clearLocalData();renderAll();toast('Conta e dados excluídos.');
  }catch(x){
    syncing=false;const c=x?.code||'';
    err.textContent=c.includes('wrong-password')||c.includes('invalid-credential')?'Senha incorreta.':c.includes('too-many')?'Muitas tentativas. Aguarde um pouco.':c.includes('network')?'Sem internet no momento.':'Não foi possível excluir agora. Tente de novo.';
  }finally{btn.disabled=false}
}

/* inicialização */
$$('.tab').forEach(n=>n.onclick=()=>switchView(n.dataset.view));
$('#medForm').onsubmit=saveMedForm;
$('#profileForm').onsubmit=saveProfile;
$('#profileAvatarFile').onchange=handleAvatarFile;
$('#profileName').oninput=e=>{if(!pendingAvatar)updateAvatarPreview(e.target.value)};
$('#removeAvatarBtn').onclick=()=>{pendingAvatar='';updateAvatarPreview($('#profileName').value)};
$('#authForm').onsubmit=handleAuth;
$('#deleteForm').onsubmit=confirmDeleteAccount;
$('#openPrivacy').onclick=openPrivacy;
$('#toggleAuthMode').onclick=()=>setAuthMode(authMode==='login'?'signup':'login');
$('#forgotPassword').onclick=forgot;
$('#authPasswordConfirm').oninput=()=>{const a=$('#authPassword').value,b=$('#authPasswordConfirm').value;setMsg(b&&a!==b?'As senhas não são iguais.':'',!!(b&&a!==b))};
$('#authPassword').addEventListener('input',()=>{if(authMode==='signup'&&$('#authPasswordConfirm').value)$('#authPasswordConfirm').oninput()});
$('#togglePass').onclick=()=>{const i=$('#authPassword'),show=i.type==='password';i.type=show?'text':'password';$('#authPasswordConfirm').type=i.type;$('#togglePass').innerHTML=ic(show?'eye-off':'eye');$('#togglePass').setAttribute('aria-label',show?'Ocultar senha':'Mostrar senha')};
setAuthMode('login');
syncInert();
renderAll();
initFirebase();
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').then(reg=>{
  reg.addEventListener('updatefound',()=>{const w=reg.installing;w?.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller)toast('Há uma versão nova do MedLembrete.',{action:{label:'Atualizar',run:()=>location.reload()}})})});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)reg.update().catch(()=>{})});
}).catch(()=>{});
setInterval(tick,30000);tick();
document.addEventListener('visibilitychange',()=>{if(document.hidden)return;if(today()!==lastDay){lastDay=today();renderAll()}else{renderHome();renderHistory()}checkReminders()});
window.addEventListener('online',()=>{if(currentUser)syncToCloud(false)});
