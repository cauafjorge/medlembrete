const STORAGE_KEY='medlembrete_v3',UI_KEY='medlembrete_ui';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const uid=()=>crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`;
const esc=(s='')=>String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const today=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const seed=()=>{const p=uid();return{activeProfileId:p,profiles:[{id:p,name:'Usuário',relation:'Eu',avatar:''}],medications:[],logs:[],version:3}};
let state=(()=>{try{return JSON.parse(localStorage.getItem(STORAGE_KEY))||seed()}catch{return seed()}})();
let ui={fontScale:1,highContrast:false,darkMode:false,gamification:false,...JSON.parse(localStorage.getItem(UI_KEY)||'{}')};
let historyDetailedMobile=false,historyFilter='all',currentUser=null,auth=null,db=null,syncTimer=null,syncing=false,authMode='login',refillMedId='',pendingAvatar='';

function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));scheduleSync()}
function saveUI(){localStorage.setItem(UI_KEY,JSON.stringify(ui));applyUI();scheduleSync()}
function applyUI(){document.documentElement.style.setProperty('--font-scale',ui.fontScale||1);document.body.classList.toggle('high-contrast',!!ui.highContrast);document.body.classList.toggle('dark',!!ui.darkMode)}
applyUI();

function activeProfile(){return state.profiles.find(p=>p.id===state.activeProfileId)||state.profiles[0]}
function meds(){return state.medications.filter(m=>m.profileId===state.activeProfileId)}
function logs(){return state.logs.filter(l=>l.profileId===state.activeProfileId)}
function doseId(m,t,d=today()){return `${d}|${m}|${t}`}
function getLog(m,t,d=today()){return state.logs.find(l=>l.doseId===doseId(m,t,d))}
function dosesToday(){return meds().flatMap(m=>(m.times||[]).map(time=>({med:m,time,log:getLog(m.id,time)}))).sort((a,b)=>a.time.localeCompare(b.time))}
function toast(msg,error=false){const e=$('#toast');if(!e)return;e.textContent=msg;e.classList.toggle('error',error);e.classList.add('show');clearTimeout(window._tt);window._tt=setTimeout(()=>e.classList.remove('show'),2500)}
function empty(i,t,x){return `<div class="empty"><div class="emoji">${i}</div><strong>${t}</strong><div>${x}</div></div>`}
function avatarHTML(p,cls='avatar'){return p?.avatar?`<img class="${cls}" src="${p.avatar}" alt="Foto de ${esc(p.name)}">`:`<div class="${cls}">${esc(p?.name?.[0]?.toUpperCase()||'?')}</div>`}

function renderHeader(){
  const p=activeProfile();
  $('#dateLabel').textContent=new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'long'}).format(new Date());
  $('#pageTitle').textContent=`Olá, ${p.name.split(' ')[0]} 👋`;
  $('#sidebarProfile').textContent=p.name;
  $('#sidebarAvatarWrap').innerHTML=avatarHTML(p);
}
function adherence(){
  const d=dosesToday(),taken=d.filter(x=>x.log?.status==='taken').length;
  return{total:d.length,taken,pct:d.length?Math.round(taken/d.length*100):0}
}
function stockPercent(m){
  const baseline=Math.max(+m.threshold*4,30,+m.stock);
  return Math.max(2,Math.min(100,Math.round((+m.stock/baseline)*100)));
}
function renderHome(){
  const d=dosesToday(),a=adherence(),low=meds().filter(m=>+m.stock<=+m.threshold);
  $('#view-home').innerHTML=`
    <div class="grid stats-grid">
      <article class="card stat-card"><div class="label">Medicamentos ativos</div><div class="value">${meds().length}</div><div class="helper">no perfil atual</div></article>
      <article class="card stat-card"><div class="label">Adesão hoje</div><div class="value">${a.pct}%</div><div class="helper">${a.taken} de ${a.total} doses</div></article>
      <article class="card stat-card"><div class="label">Pendentes</div><div class="value">${d.filter(x=>!x.log).length}</div><div class="helper">doses de hoje</div></article>
      <article class="card stat-card"><div class="label">Estoque baixo</div><div class="value">${low.length}</div><div class="helper">item(ns)</div></article>
    </div>
    ${ui.gamification?`<article class="card motivation-card"><strong>Progresso de hoje</strong><div class="progress-line"><span style="width:${a.pct}%"></span></div><div class="progress-meta"><span>${a.pct}% concluído</span><span>${a.total-a.taken} dose(s) restante(s)</span></div><p class="helper">Este recurso é opcional e pode ser desligado em Ajustes.</p></article>`:''}
    <div class="grid home-layout">
      <article class="card">
        <div class="section-title"><div><h2>Agenda de hoje</h2><p>Confirme cada dose de forma simples.</p></div></div>
        <div class="dose-list">${d.length?d.map(x=>`<div class="dose-row"><div class="dose-time">${x.time}</div><div class="dose-main"><strong>${esc(x.med.name)} · ${esc(x.med.dose)}</strong><small>${esc(x.med.form)}</small></div><div class="dose-actions">${x.log?.status==='taken'?'<span class="status-pill status-taken">✓ Tomada</span>':x.log?.status==='skipped'?'<span class="status-pill status-skipped">Não tomada</span>':`<button class="mini-btn take" data-dose="take" data-med="${x.med.id}" data-time="${x.time}">✓ Tomei</button><button class="mini-btn skip" data-dose="skip" data-med="${x.med.id}" data-time="${x.time}">Pular</button>`}</div></div>`).join(''):empty('📅','Sem doses hoje.','Cadastre um medicamento para começar.')}</div>
      </article>
      <div class="grid">
        <article class="card"><div class="section-title"><div><h2>Estoque</h2><p>Itens que precisam de atenção.</p></div></div>${low.length?low.map(m=>`<div class="alert-card"><strong>${esc(m.name)} — ${m.stock} unidade(s)</strong><small>Seu aviso está configurado para ${m.threshold} unidade(s).</small><button class="mini-btn" data-refill="${m.id}">＋ Repor agora</button></div>`).join(''):empty('✓','Tudo certo.','Nenhum estoque baixo.')}</article>
        <article class="card"><div class="section-title"><div><h2>Conta</h2><p>${currentUser?'Backup e sincronização ativos.':'Entre para sincronizar seus dados.'}</p></div></div><div class="card-actions"><button class="secondary-btn" data-view-jump="history">Ver histórico</button><button class="secondary-btn" data-view-jump="settings">Ajustes</button></div></article>
      </div>
    </div>
    <div class="disclaimer"><strong>Importante:</strong> o MedLembrete ajuda na organização, mas não substitui orientação médica ou farmacêutica.</div>`;
}
function renderMeds(filter=''){
  const q=filter.toLowerCase(),list=meds().filter(m=>m.name.toLowerCase().includes(q)||m.dose.toLowerCase().includes(q));
  $('#view-meds').innerHTML=`
    <div class="toolbar"><div><p class="eyebrow">Tratamento</p><h2>Meus medicamentos</h2></div><input class="search" id="medSearch" placeholder="Buscar medicamento..." value="${esc(filter)}" aria-label="Buscar medicamento"></div>
    <div class="grid med-grid">${list.length?list.map(m=>`<article class="card med-card ${m.stock<=m.threshold?'stock-low':''}">
      <div class="med-head"><div class="med-dot">💊</div><div><h3>${esc(m.name)}</h3><p>${esc(m.dose)} · ${esc(m.form)}</p></div></div>
      <div class="med-times">${(m.times||[]).map(t=>`<span class="time-chip">${t}</span>`).join('')}</div>
      <div class="stock-block"><div class="stock-row"><span>Estoque atual</span><strong class="${m.stock<=m.threshold?'low-stock':''}">${m.stock} unidade(s)</strong></div><div class="stock-meter"><span style="width:${stockPercent(m)}%"></span></div><small class="helper">${m.stock<=m.threshold?`Estoque baixo. Aviso configurado em ${m.threshold}.`:`Aviso quando chegar a ${m.threshold}.`}</small></div>
      ${m.notes?`<p class="med-notes">${esc(m.notes)}</p>`:''}
      <div class="card-actions"><button class="primary-btn" data-refill="${m.id}">＋ Repor</button><button class="secondary-btn" data-edit-med="${m.id}">Editar</button><button class="danger-btn" data-delete-med="${m.id}">Excluir</button></div>
    </article>`).join(''):empty('💊','Nenhum medicamento.','Cadastre o primeiro.')}</div>`;
}
function renderHistory(){
  const all=[...logs()].sort((a,b)=>new Date(b.at)-new Date(a.at));
  const list=historyFilter==='all'?all:all.filter(l=>l.status===historyFilter);
  const taken=all.filter(l=>l.status==='taken').length,skipped=all.filter(l=>l.status==='skipped').length;
  const pct=all.length?Math.round(taken/all.length*100):0;
  $('#view-history').innerHTML=`
    <div class="toolbar"><div><p class="eyebrow">Acompanhamento</p><h2>Histórico</h2></div><button class="secondary-btn history-mobile-toggle" id="historyToggle">${historyDetailedMobile?'Resumir':'Ver detalhes'}</button></div>
    <div class="grid history-summary"><article class="card stat-card"><div class="label">Registros</div><div class="value">${all.length}</div></article><article class="card stat-card"><div class="label">Tomadas</div><div class="value">${taken}</div></article><article class="card stat-card"><div class="label">Adesão registrada</div><div class="value">${pct}%</div></article></div>
    <div class="history-filters" aria-label="Filtrar histórico"><button class="filter-chip ${historyFilter==='all'?'active':''}" data-history-filter="all">Todos</button><button class="filter-chip ${historyFilter==='taken'?'active':''}" data-history-filter="taken">Tomadas</button><button class="filter-chip ${historyFilter==='skipped'?'active':''}" data-history-filter="skipped">Não tomadas</button></div>
    <div class="history-list">${list.length?list.map(l=>{const m=state.medications.find(x=>x.id===l.medId);return `<div class="history-row ${historyDetailedMobile?'mobile-detailed':''}"><strong>${esc(m?.name||l.medName||'Medicamento')}</strong><span class="status-cell ${l.status==='taken'?'status-pill status-taken':'status-pill status-skipped'}">${l.status==='taken'?'Tomada':'Não tomada'}</span><span class="detail">${esc(m?.dose||l.dose||'')}</span><span class="detail">${new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(l.at))}</span></div>`}).join(''):empty('↺','Nenhum registro neste filtro.','As doses registradas aparecerão aqui.')}</div>`;
}
function renderProfiles(){
  $('#view-profiles').innerHTML=`
    <div class="toolbar"><div><p class="eyebrow">Pessoas</p><h2>Perfis</h2></div><button class="primary-btn" id="addProfile">＋ Novo perfil</button></div>
    <article class="card profile-help"><strong>Gerencie mais de uma pessoa na mesma conta</strong><p class="helper">Cada perfil mantém seus próprios medicamentos, estoque e histórico.</p></article>
    <div class="grid profile-grid">${state.profiles.map(p=>`<article class="card profile-card ${p.id===state.activeProfileId?'active':''}"><div class="profile-top">${avatarHTML(p,'profile-avatar')}<div><h3>${esc(p.name)}</h3><p>${esc(p.relation)}</p>${p.id===state.activeProfileId?'<span class="status-pill status-taken">Perfil ativo</span>':''}</div></div><div class="card-actions"><button class="secondary-btn" data-profile="${p.id}">${p.id===state.activeProfileId?'Em uso':'Usar perfil'}</button><button class="secondary-btn" data-edit-profile="${p.id}">Editar</button>${state.profiles.length>1?`<button class="danger-btn" data-delete-profile="${p.id}">Excluir</button>`:''}</div></article>`).join('')}</div>`;
}
function renderSettings(){
  $('#view-settings').innerHTML=`
    <div class="grid settings-grid">
      <article class="card"><h2>Aparência e acessibilidade</h2>
        <div class="setting-row"><span>Tamanho do texto</span><div><button class="secondary-btn" data-font="0.9">A−</button> <button class="secondary-btn" data-font="1">A</button> <button class="secondary-btn" data-font="1.15">A＋</button></div></div>
        <div class="setting-row"><span>Modo escuro</span><label class="switch"><input id="darkToggle" type="checkbox" ${ui.darkMode?'checked':''}> Ativar</label></div>
        <div class="setting-row"><span>Alto contraste</span><label class="switch"><input id="contrastToggle" type="checkbox" ${ui.highContrast?'checked':''}> Ativar</label></div>
      </article>
      <article class="card"><h2>Backup e sincronização</h2>
        <div class="backup-explainer"><strong>O que é isso?</strong>Quando você está conectado, o MedLembrete salva uma cópia na nuvem para manter seus dados entre dispositivos. O arquivo JSON é uma cópia manual que você pode guardar.</div>
        <p id="cloudSyncStatus">${currentUser?'☁ Sincronização em nuvem ativa':'Você não está conectado à nuvem'}</p>
        <div class="card-actions"><button class="primary-btn" id="syncNow">Sincronizar agora</button><button class="secondary-btn" id="exportBtn">Exportar JSON</button><label class="secondary-btn">Importar JSON<input id="importInput" type="file" accept="application/json" hidden></label>${currentUser?'<button class="danger-btn" id="logoutBtn">Sair da conta</button>':''}</div>
      </article>
      <article class="card"><h2>Lembretes</h2><p class="helper">Ative as notificações para receber avisos nos horários cadastrados. O navegador pode exigir permissão.</p><button class="primary-btn" id="settingsNotify">Ativar notificações</button></article>
      <article class="card"><h2>Motivação</h2><p class="helper">O progresso diário é opcional. Desative se esse tipo de acompanhamento não ajudar você.</p><div class="setting-row"><span>Mostrar progresso diário</span><label class="switch"><input id="gamificationToggle" type="checkbox" ${ui.gamification?'checked':''}> Exibir</label></div></article>
    </div>`;
}
function renderAll(){renderHeader();renderHome();renderMeds();renderHistory();renderProfiles();renderSettings();bindDynamic()}
function switchView(v){$$('.view').forEach(x=>x.classList.remove('active'));$(`#view-${v}`)?.classList.add('active');$$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.view===v));window.scrollTo({top:0,behavior:'smooth'})}

function bindDynamic(){
  document.onclick=e=>{
    const t=e.target.closest('button,[data-view-jump]');if(!t)return;
    if(t.dataset.viewJump)switchView(t.dataset.viewJump);
    if(t.dataset.dose)recordDose(t.dataset.med,t.dataset.time,t.dataset.dose==='take'?'taken':'skipped');
    if(t.dataset.refill)openRefill(t.dataset.refill);
    if(t.dataset.editMed)openMedModal(t.dataset.editMed);
    if(t.dataset.deleteMed)deleteMed(t.dataset.deleteMed);
    if(t.dataset.profile){state.activeProfileId=t.dataset.profile;save();renderAll()}
    if(t.dataset.editProfile)openProfileModal(t.dataset.editProfile);
    if(t.dataset.deleteProfile)deleteProfile(t.dataset.deleteProfile);
    if(t.dataset.font){ui.fontScale=+t.dataset.font;saveUI();renderAll()}
    if(t.dataset.historyFilter){historyFilter=t.dataset.historyFilter;renderHistory();bindDynamic()}
  };
  $('#medSearch')?.addEventListener('input',e=>renderMeds(e.target.value));
  $('#historyToggle')&&($('#historyToggle').onclick=()=>{historyDetailedMobile=!historyDetailedMobile;renderHistory();bindDynamic()});
  $('#addProfile')&&($('#addProfile').onclick=()=>openProfileModal());
  $('#contrastToggle')&&($('#contrastToggle').onchange=e=>{ui.highContrast=e.target.checked;saveUI()});
  $('#darkToggle')&&($('#darkToggle').onchange=e=>{ui.darkMode=e.target.checked;saveUI()});
  $('#gamificationToggle')&&($('#gamificationToggle').onchange=e=>{ui.gamification=e.target.checked;saveUI();renderAll()});
  $('#syncNow')&&($('#syncNow').onclick=()=>syncToCloud(true));
  $('#logoutBtn')&&($('#logoutBtn').onclick=logoutUser);
  $('#exportBtn')&&($('#exportBtn').onclick=exportData);
  $('#importInput')&&($('#importInput').onchange=importData);
  $('#settingsNotify')&&($('#settingsNotify').onclick=requestNotifications);
}
function recordDose(medId,time,status){
  const m=state.medications.find(x=>x.id===medId),id=doseId(medId,time);
  if(state.logs.some(l=>l.doseId===id))return;
  state.logs.push({id:uid(),doseId:id,profileId:state.activeProfileId,medId,medName:m?.name||'',dose:m?.dose||'',time,status,at:new Date().toISOString()});
  if(status==='taken'&&m)m.stock=Math.max(0,+m.stock-1);
  save();renderAll();toast(status==='taken'?'Dose registrada como tomada.':'Dose registrada como não tomada.')
}
function openRefill(id){const m=state.medications.find(x=>x.id===id);if(!m)return;refillMedId=id;$('#refillMedName').textContent=m.name;$('#refillCurrent').textContent=`Estoque atual: ${m.stock} unidade(s)`;$('#refillAmount').value='';openModal('refillModal')}
function saveRefill(e){e.preventDefault();const m=state.medications.find(x=>x.id===refillMedId),n=+$('#refillAmount').value;if(!m||!Number.isFinite(n)||n<=0)return toast('Informe uma quantidade válida.',true);m.stock=+m.stock+n;save();closeModal('refillModal');renderAll();toast(`${n} unidade(s) adicionada(s) ao estoque.`)}
function deleteMed(id){if(!confirm('Excluir este medicamento?'))return;state.medications=state.medications.filter(m=>m.id!==id);save();renderAll()}
function deleteProfile(id){if(!confirm('Excluir este perfil e seus medicamentos/histórico?'))return;state.profiles=state.profiles.filter(p=>p.id!==id);state.medications=state.medications.filter(m=>m.profileId!==id);state.logs=state.logs.filter(l=>l.profileId!==id);state.activeProfileId=state.profiles[0].id;save();renderAll()}
function openModal(id){const e=$(`#${id}`);e.classList.add('open');e.setAttribute('aria-hidden','false')}
function closeModal(id){const e=$(`#${id}`);e.classList.remove('open');e.setAttribute('aria-hidden','true')}

function openMedModal(id=''){
  const m=state.medications.find(x=>x.id===id);
  $('#medId').value=m?.id||'';$('#medName').value=m?.name||'';$('#medDose').value=m?.dose||'';$('#medFormType').value=m?.form||'Comprimido';$('#medTimes').value=m?.times?.join(', ')||'';$('#medStock').value=m?.stock??30;$('#medThreshold').value=m?.threshold??5;$('#medNotes').value=m?.notes||'';$('#medModalTitle').textContent=m?'Editar medicamento':'Novo medicamento';openModal('medModal')
}
function saveMedForm(e){
  e.preventDefault();
  const raw=$('#medTimes').value.split(',').map(x=>x.trim()).filter(Boolean),times=[...new Set(raw.filter(x=>/^([01]\d|2[0-3]):[0-5]\d$/.test(x)))].sort();
  if(!times.length)return toast('Informe ao menos um horário válido.',true);
  if(times.length!==raw.length)return toast('Revise os horários. Use o formato HH:MM.',true);
  const id=$('#medId').value||uid(),data={id,profileId:state.activeProfileId,name:$('#medName').value.trim(),dose:$('#medDose').value.trim(),form:$('#medFormType').value,times,stock:+$('#medStock').value,threshold:+$('#medThreshold').value,notes:$('#medNotes').value.trim()};
  const i=state.medications.findIndex(x=>x.id===id);i>=0?state.medications[i]=data:state.medications.push(data);save();closeModal('medModal');renderAll();toast('Medicamento salvo.')
}
function openProfileModal(id=''){
  const p=state.profiles.find(x=>x.id===id);pendingAvatar=p?.avatar||'';
  $('#profileId').value=p?.id||'';$('#profileName').value=p?.name||'';$('#profileRelation').value=p?.relation||'Eu';$('#profileAvatarFile').value='';
  $('#profileModalTitle').textContent=p?'Editar perfil':'Novo perfil';updateAvatarPreview(p?.name||'Usuário');openModal('profileModal')
}
function updateAvatarPreview(name='Usuário'){
  const box=$('#profileAvatarPreview');if(!box)return;
  if(pendingAvatar){box.outerHTML=`<img id="profileAvatarPreview" class="profile-avatar avatar-preview" src="${pendingAvatar}" alt="Prévia da foto">`}
  else{box.outerHTML=`<div id="profileAvatarPreview" class="profile-avatar avatar-preview">${esc(name[0]?.toUpperCase()||'?')}</div>`}
}
async function imageToAvatar(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=reject;
    reader.onload=()=>{const img=new Image();img.onerror=reject;img.onload=()=>{const max=256,scale=Math.min(1,max/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));c.getContext('2d').drawImage(img,0,0,c.width,c.height);resolve(c.toDataURL('image/jpeg',.78))};img.src=reader.result};
    reader.readAsDataURL(file)
  })
}
async function handleAvatarFile(e){const f=e.target.files?.[0];if(!f)return;if(!f.type.startsWith('image/'))return toast('Escolha uma imagem válida.',true);if(f.size>8*1024*1024)return toast('Escolha uma imagem de até 8 MB.',true);try{pendingAvatar=await imageToAvatar(f);updateAvatarPreview($('#profileName').value||'Usuário')}catch{toast('Não foi possível carregar a foto.',true)}}
function saveProfile(e){e.preventDefault();const id=$('#profileId').value||uid(),p={id,name:$('#profileName').value.trim(),relation:$('#profileRelation').value,avatar:pendingAvatar};const i=state.profiles.findIndex(x=>x.id===id);if(i>=0)state.profiles[i]=p;else{state.profiles.push(p);state.activeProfileId=p.id}save();closeModal('profileModal');e.target.reset();pendingAvatar='';renderAll();toast(i>=0?'Perfil atualizado.':'Perfil criado.')}

function exportData(){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({state,ui,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'}));a.download=`medlembrete-backup-${today()}.json`;a.click();URL.revokeObjectURL(a.href);toast('Backup JSON exportado.')}
async function importData(e){try{const f=e.target.files[0];if(!f)return;const d=JSON.parse(await f.text()),next=d.state||d;if(!Array.isArray(next.profiles)||!Array.isArray(next.medications)||!Array.isArray(next.logs))throw new Error();state=next;ui={...ui,...d.ui};save();saveUI();renderAll();toast('Backup restaurado com sucesso.')}catch{toast('Arquivo de backup inválido.',true)}finally{e.target.value=''}}
function requestNotifications(){if(!('Notification'in window))return toast('Notificações não suportadas neste navegador.',true);Notification.requestPermission().then(p=>toast(p==='granted'?'Notificações ativadas.':'Permissão de notificações não concedida.',p!=='granted'))}
function checkReminders(){if(!('Notification'in window)||Notification.permission!=='granted')return;const now=new Date(),hm=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;dosesToday().filter(x=>x.time===hm&&!x.log).forEach(x=>new Notification(`Hora de ${x.med.name}`,{body:`${x.med.dose} · ${x.time}`}))}
function firebaseConfigured(){const c=window.MEDLEMBRETE_FIREBASE_CONFIG||{};return !!(c.apiKey&&c.authDomain&&c.projectId&&c.appId)}
function setMsg(x,err=false){const e=$('#syncMessage');e.textContent=x||'';e.classList.toggle('error',err)}
function setAuthMode(m){authMode=m;const s=m==='signup';$('#authNameLabel').classList.toggle('show',s);$('#authName').required=s;$('#authSubmit').textContent=s?'Criar conta':'Entrar';$('#toggleAuthMode').textContent=s?'Já tenho uma conta':'Ainda não tenho conta';$('#forgotPassword').classList.toggle('hidden',s);$('#authSubtitle').textContent=s?'Crie sua conta para sincronizar seus dados com segurança.':'Entre para manter medicamentos, doses, perfis e histórico sincronizados entre seus dispositivos.';setMsg('')}
function authErr(e){const c=e?.code||'';if(c.includes('email-already'))return'Este e-mail já possui conta.';if(c.includes('weak-password'))return'A senha precisa ter ao menos 6 caracteres.';if(c.includes('invalid-email'))return'E-mail inválido.';if(c.includes('too-many-requests'))return'Muitas tentativas. Aguarde um pouco e tente novamente.';if(c.includes('invalid-credential')||c.includes('wrong-password')||c.includes('user-not-found'))return'E-mail ou senha incorretos.';return'Não foi possível concluir. Tente novamente.'}
async function initFirebase(){if(!firebaseConfigured()||!window.firebase){setMsg('Sincronização em nuvem indisponível no momento.',true);return}try{firebase.initializeApp(window.MEDLEMBRETE_FIREBASE_CONFIG);auth=firebase.auth();db=firebase.firestore();await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);auth.onAuthStateChanged(async u=>{currentUser=u||null;if(u){await restoreCloud();$('#loginOverlay').classList.add('hidden')}else $('#loginOverlay').classList.remove('hidden');renderAll()})}catch(e){console.error(e);setMsg('Falha ao iniciar a sincronização.',true)}}
async function handleAuth(e){e.preventDefault();if(!auth)return setMsg('Sincronização indisponível no momento.',true);const email=$('#authEmail').value.trim(),pass=$('#authPassword').value,name=$('#authName').value.trim();try{setMsg(authMode==='signup'?'Criando conta...':'Entrando...');if(authMode==='signup'){const c=await auth.createUserWithEmailAndPassword(email,pass);if(name)await c.user.updateProfile({displayName:name});const p=uid();state={activeProfileId:p,profiles:[{id:p,name:name||email.split('@')[0],relation:'Eu',avatar:''}],medications:[],logs:[],version:3};save();await syncToCloud(true)}else await auth.signInWithEmailAndPassword(email,pass)}catch(e){setMsg(authErr(e),true)}}
async function forgot(){if(!auth)return setMsg('Sincronização indisponível no momento.',true);const email=$('#authEmail').value.trim();if(!email)return setMsg('Digite seu e-mail primeiro.',true);try{await auth.sendPasswordResetEmail(email);setMsg('Link de recuperação enviado.')}catch(e){setMsg(authErr(e),true)}}
async function logoutUser(){try{await syncToCloud(false);await auth.signOut()}catch{toast('Não foi possível sair.',true)}}
function scheduleSync(){if(!currentUser||!db||syncing)return;clearTimeout(syncTimer);syncTimer=setTimeout(()=>syncToCloud(false),700)}
async function syncToCloud(show=false){if(!currentUser||!db)return show&&toast('Entre na conta para sincronizar.',true);syncing=true;try{await db.collection('users').doc(currentUser.uid).set({state,ui,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),email:currentUser.email||''},{merge:true});if(show)toast('Dados sincronizados com a nuvem.')}catch(e){console.error(e);if(show)toast('Falha ao sincronizar.',true)}finally{syncing=false}}
async function restoreCloud(){try{const ref=db.collection('users').doc(currentUser.uid),snap=await ref.get();if(snap.exists&&snap.data().state?.profiles){syncing=true;state=snap.data().state;ui={...ui,...snap.data().ui};localStorage.setItem(STORAGE_KEY,JSON.stringify(state));localStorage.setItem(UI_KEY,JSON.stringify(ui));applyUI();syncing=false}else await syncToCloud(false)}catch(e){console.error(e);toast('Não foi possível restaurar o backup da nuvem.',true)}}

$$('.nav-item').forEach(n=>n.onclick=()=>switchView(n.dataset.view));
$('#quickAddBtn').onclick=()=>openMedModal();
$('#notifyBtn').onclick=requestNotifications;
$('#medForm').onsubmit=saveMedForm;
$('#profileForm').onsubmit=saveProfile;
$('#refillForm').onsubmit=saveRefill;
$('#profileAvatarFile').onchange=handleAvatarFile;
$('#profileName').oninput=e=>{if(!pendingAvatar)updateAvatarPreview(e.target.value||'Usuário')};
$('#removeAvatarBtn').onclick=()=>{pendingAvatar='';updateAvatarPreview($('#profileName').value||'Usuário')};
$$('[data-close]').forEach(b=>b.onclick=()=>closeModal(b.dataset.close));
$$('.modal').forEach(m=>m.onclick=e=>{if(e.target===m)closeModal(m.id)});
$('#authForm').onsubmit=handleAuth;
$('#toggleAuthMode').onclick=()=>setAuthMode(authMode==='login'?'signup':'login');
$('#forgotPassword').onclick=forgot;
setAuthMode('login');
renderAll();
initFirebase();
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
setInterval(checkReminders,60000);
checkReminders();
