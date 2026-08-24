// Configuração pública do app Web no Firebase.
// A segurança dos dados é controlada pelo Firebase Authentication + regras do Firestore.
window.MEDLEMBRETE_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyA669oq_oN2anxhpRYSj7NNdeCG3HrXyJQ',
  authDomain: 'medlembrete-d265e.firebaseapp.com',
  projectId: 'medlembrete-d265e',
  storageBucket: 'medlembrete-d265e.firebasestorage.app',
  messagingSenderId: '980003685280',
  appId: '1:980003685280:web:cc988927adbd066e559ac5',
  measurementId: 'G-SYNRDJKZZZ'
};

// Editor de horários amigável para Android/iPhone.
// Mantém #medTimes como campo oculto para compatibilidade com o restante do app.
document.addEventListener('DOMContentLoaded', () => {
  const hidden = document.getElementById('medTimes');
  const modal = document.getElementById('medModal');
  if (!hidden || !modal || hidden.dataset.timeEnhanced) return;

  hidden.dataset.timeEnhanced = '1';
  hidden.type = 'hidden';
  hidden.required = false;

  const label = hidden.closest('label');
  if (!label) return;

  const helper = label.querySelector('small');
  if (helper) helper.textContent = 'Escolha um horário e toque em “Adicionar horário”. Você pode adicionar vários.';

  const wrap = document.createElement('div');
  wrap.className = 'time-editor';
  wrap.innerHTML = `
    <div class="time-editor-row">
      <input id="medTimePicker" type="time" aria-label="Escolher horário" />
      <button id="addMedTime" type="button" class="secondary-btn">＋ Adicionar horário</button>
    </div>
    <div id="medTimeList" class="time-editor-list" aria-live="polite"></div>
  `;
  hidden.insertAdjacentElement('afterend', wrap);

  const style = document.createElement('style');
  style.textContent = `
    .time-editor{margin-top:6px}
    .time-editor-row{display:flex;gap:8px;align-items:center}
    .time-editor-row input[type="time"]{flex:1;min-width:0;margin:0!important;border:1px solid #cfd7e6;border-radius:11px;padding:11px;background:#fff;font:inherit}
    .time-editor-list{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
    .time-editor-chip{display:inline-flex;align-items:center;gap:7px;background:#eef2fb;color:#172b79;border-radius:999px;padding:7px 10px;font-weight:700}
    .time-editor-chip button{border:0;background:transparent;color:#c73d4d;font-weight:900;font-size:1rem;line-height:1;padding:0;cursor:pointer}
    @media(max-width:560px){.time-editor-row{align-items:stretch}.time-editor-row input[type="time"]{min-height:48px}.time-editor-row .secondary-btn{white-space:nowrap;padding:10px 12px}.time-editor-chip{font-size:1rem}}
  `;
  document.head.appendChild(style);

  const picker = document.getElementById('medTimePicker');
  const addBtn = document.getElementById('addMedTime');
  const list = document.getElementById('medTimeList');

  const getTimes = () => hidden.value.split(',').map(x => x.trim()).filter(Boolean);
  const setTimes = times => {
    hidden.value = [...new Set(times)].sort().join(', ');
    render();
  };
  const render = () => {
    const times = getTimes();
    list.innerHTML = times.length
      ? times.map(t => `<span class="time-editor-chip">${t}<button type="button" data-remove-time="${t}" aria-label="Remover horário ${t}">×</button></span>`).join('')
      : '<small style="color:#677086">Nenhum horário adicionado.</small>';
  };

  addBtn.addEventListener('click', () => {
    const value = picker.value;
    if (!value) {
      picker.focus();
      return;
    }
    setTimes([...getTimes(), value]);
    picker.value = '';
  });

  list.addEventListener('click', e => {
    const btn = e.target.closest('[data-remove-time]');
    if (!btn) return;
    setTimes(getTimes().filter(t => t !== btn.dataset.removeTime));
  });

  // Ao abrir para editar um medicamento, o app preenche #medTimes primeiro.
  // Observamos a abertura do modal e atualizamos os chips.
  const observer = new MutationObserver(() => {
    if (modal.classList.contains('open')) setTimeout(render, 0);
  });
  observer.observe(modal, { attributes: true, attributeFilter: ['class'] });

  render();
});
