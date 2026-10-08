/* Claude Autopilot — arayüz mantığı */
'use strict';

/* ============================================================
   Yardımcılar
   ============================================================ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = (name, cls = '') => `<span class="ic ${cls}" aria-hidden="true">${ICONS[name] || ''}</span>`;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const D = s => (s ? new Date(s) : null);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* önemli değil */ } },
};

function left(ms) {
  if (ms <= 0) return 'süre doldu';
  const total = Math.floor(ms / 60000);
  const d = Math.floor(total / 1440), h = Math.floor((total % 1440) / 60), m = total % 60;
  if (d > 0) return `${d} g ${h} sa`;
  if (h > 0) return `${h} sa ${m} dk`;
  if (m > 0) return `${m} dk`;
  return `${Math.max(1, Math.ceil(ms / 1000))} sn`;
}
function rel(d) {
  if (!d) return '';
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 45) return 'az önce';
  if (s < 3600) return `${Math.round(s / 60)} dk önce`;
  if (s < 86400) return `${Math.round(s / 3600)} sa önce`;
  if (s < 172800) return 'dün';
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}
const clock = d => (d ? d.toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const size = b => (b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`);
function progress(t) {
  const s = D(t.start), e = D(t.end);
  if (!s || !e || e <= s) return null;
  return clamp((Date.now() - s) / (e - s), 0, 1);
}
/* Kısa, güvenli metin biçimi: önce kaçış, sonra `kod`, **kalın**, satır sonu. */
function md(t) {
  return esc(t)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/\n/g, '<br>');
}
function busy(el, on) {
  if (!el || !el.isConnected) return;
  el.disabled = on;
  el.classList.toggle('busy', on);
}

/* ============================================================
   Sabitler
   ============================================================ */
const TYPES = {
  '': { label: 'Otomatik', icon: 'wand', cls: 't-auto' },
  kod: { label: 'Kod', icon: 'code', cls: 't-kod' },
  arastir: { label: 'Araştırma', icon: 'compass', cls: 't-ara' },
  kontrol: { label: 'Kontrol', icon: 'shield', cls: 't-kon' },
};
const STATES = {
  open: { label: 'Açık', cls: 's-open' },
  running: { label: 'Süreli', cls: 's-run' },
  done: { label: 'Bitti', cls: 's-done' },
  blocked: { label: 'Takıldı', cls: 's-block' },
};
const ENGINE = {
  running: { title: 'Çalışıyor', tone: 'ok', pulse: true },
  starting: { title: 'Başlatılıyor', tone: 'info', pulse: true },
  limit: { title: 'Limit doldu', tone: 'warn' },
  waiting: { title: 'Bekliyor', tone: 'info', pulse: true },
  login: { title: 'Giriş gerekli', tone: 'err' },
  error: { title: 'Hata', tone: 'err' },
  finished: { title: 'Tüm işler bitti', tone: 'done' },
  stopped: { title: 'Durdu', tone: 'idle' },
  idle: { title: 'Hazır', tone: 'idle' },
};
const DURATIONS = [
  { v: '', label: 'Tek sefer' }, { v: '30dk', label: '30 dk' }, { v: '1s', label: '1 saat' }, { v: '3s', label: '3 saat' },
  { v: '12s', label: '12 saat' }, { v: '24s', label: '24 saat' }, { v: '48s', label: '48 saat' },
];
const DURATION_RE = /^\s*\d+([.,]\d+)?\s*(dk|dak|dakika|m|min|s|sa|saat|h|g|gün|gun|d|hafta|w)?\s*$/i;
const KINDS = {
  research: { label: 'Araştırmalar', icon: 'compass', cls: 't-ara' },
  check: { label: 'Kontroller', icon: 'shield', cls: 't-kon' },
  journal: { label: 'Günlükler', icon: 'book', cls: 't-kod' },
  other: { label: 'Diğer', icon: 'file', cls: 't-auto' },
};
const LOG_STATUS = {
  success: { label: 'Başarılı', cls: 's-done', icon: 'check-circle' },
  error: { label: 'Hata', cls: 's-block', icon: 'alert' },
  limit: { label: 'Limit', cls: 's-dur', icon: 'hourglass' },
  running: { label: 'Sürüyor', cls: 's-run', icon: 'activity' },
  interrupted: { label: 'Yarıda kaldı', cls: 's-muted', icon: 'x' },
  text: { label: 'Eski kayıt', cls: 's-muted', icon: 'file' },
  unknown: { label: 'Belirsiz', cls: 's-muted', icon: 'file' },
};
const TOOL_ICON = { Read: 'file', Write: 'pencil', Edit: 'pencil', MultiEdit: 'pencil', NotebookEdit: 'pencil', Bash: 'terminal', PowerShell: 'terminal', Glob: 'search', Grep: 'search', WebSearch: 'globe', WebFetch: 'globe', TodoWrite: 'list', Task: 'sparkles', Agent: 'sparkles' };
const TOOL_LABEL = { Read: 'Okudu', Write: 'Yazdı', Edit: 'Düzenledi', MultiEdit: 'Düzenledi', NotebookEdit: 'Düzenledi', Bash: 'Komut', PowerShell: 'Komut', Glob: 'Dosya aradı', Grep: 'İçerik aradı', WebSearch: 'Web araması', WebFetch: 'Sayfa okudu', TodoWrite: 'Plan', Task: 'Alt görev', Agent: 'Alt görev' };
const NAV = [
  { view: 'dashboard', label: 'Pano', icon: 'dashboard' },
  { view: 'tasks', label: 'Görevler', icon: 'tasks', count: true },
  { view: 'results', label: 'Sonuçlar', icon: 'results' },
  { view: 'logs', label: 'Kayıtlar', icon: 'logs' },
  { view: 'settings', label: 'Ayarlar', icon: 'settings' },
];

/* ============================================================
   Durum
   ============================================================ */
const S = {
  view: 'dashboard',
  init: null,
  state: null,
  filter: 'all',
  search: '',
  composer: { type: '', duration: '', custom: '', text: '' },
  results: null, resultOpen: null, resultDoc: null, resultSearch: '',
  logs: null, logOpen: null, logEvents: [], logOffset: 0,
  live: { name: null, offset: 0, events: [], info: null },
};
const project = () => S.init?.settings?.current || null;
const task = line => S.state?.tasks.find(t => t.line === line);

/* ============================================================
   Ortak bileşenler
   ============================================================ */
function typeBadge(type, withLabel = true) {
  const t = TYPES[type] || TYPES[''];
  return `<span class="type ${t.cls}" title="${t.label}">${ic(t.icon)}${withLabel ? `<span>${t.label}</span>` : ''}</span>`;
}
function ring(p) {
  const off = p == null ? 100 : 100 - p * 100;
  return `<div class="ring"><svg viewBox="0 0 44 44" aria-hidden="true"><circle class="ring-bg" cx="22" cy="22" r="18" pathLength="100"/><circle class="ring-fg" cx="22" cy="22" r="18" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${off.toFixed(2)}"/></svg><span class="pct">${p == null ? '—' : Math.round(p * 100) + '%'}</span></div>`;
}
const timeAttrs = t => `data-end="${esc(t.end)}"${t.start ? ` data-start="${esc(t.start)}"` : ''}`;
function outputChips(t) {
  return t.outputs.map(o => {
    const name = o.split('/').filter(Boolean).pop();
    const icon = o.endsWith('/') ? 'folder' : /\.html?$/i.test(o) ? 'globe' : 'file';
    return `<button class="chip file" data-act="open-output" data-path="${esc(o)}" title="${esc(o)}">${ic(icon)}<span>${esc(name)}</span></button>`;
  }).join('');
}
function iconBtn(icon, label, attrs, extra = '') {
  return `<button class="icon-btn sm ${extra}" ${attrs} aria-label="${esc(label)}" data-tip="${esc(label)}">${ic(icon)}</button>`;
}
function empty(icon, title, text = '', action = '') {
  return `<div class="empty"><div class="empty-icon">${ic(icon)}</div><b>${esc(title)}</b>${text ? `<p>${text}</p>` : ''}${action}</div>`;
}
function banner(tone, icon, title, text, action = '', id = '') {
  if (id && store.get('dismiss:' + id)) return '';
  const close = id ? `<button class="icon-btn sm" data-act="dismiss-banner" data-id="${id}" aria-label="Kapat" data-tip="Kapat">${ic('x')}</button>` : '';
  return `<div class="banner tone-${tone}">${ic(icon)}<div class="banner-body"><b>${esc(title)}</b><span>${text}</span></div>${action}${close}</div>`;
}

/* ============================================================
   Bildirim ve pencereler
   ============================================================ */
function toast(msg, kind = 'info', ms = 3200) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.setAttribute('role', kind === 'err' ? 'alert' : 'status');
  el.innerHTML = `${ic({ ok: 'check-circle', err: 'alert', warn: 'alert' }[kind] || 'info')}<span>${esc(msg)}</span>`;
  $('#toasts').appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 250); }, ms);
}

function modal(html, { mount, collect } = {}) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    $('#modal-root').appendChild(wrap);
    const before = document.activeElement;
    const close = value => {
      document.removeEventListener('keydown', onKey, true);
      wrap.classList.remove('in');
      setTimeout(() => wrap.remove(), 200);
      before?.focus?.();
      resolve(value);
    };
    const onKey = e => {
      if (e.key === 'Escape') { e.stopPropagation(); close(null); }
      if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); close(collect ? collect(wrap) : 'ok'); }
    };
    document.addEventListener('keydown', onKey, true);
    wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(null); });
    wrap.addEventListener('click', e => {
      const b = e.target.closest('[data-modal]');
      if (!b) return;
      close(b.dataset.modal === 'ok' ? (collect ? collect(wrap) : 'ok') : null);
    });
    mount?.(wrap);
    requestAnimationFrame(() => {
      wrap.classList.add('in');
      ($('[autofocus]', wrap) || $('[data-modal="ok"]', wrap))?.focus();
    });
  });
}

function confirmBox(title, text, okLabel = 'Tamam', danger = false) {
  return modal(`<h3>${esc(title)}</h3><p>${esc(text)}</p>
    <div class="modal-actions"><button class="btn ghost" data-modal="cancel">Vazgeç</button><button class="btn ${danger ? 'danger' : 'primary'}" data-modal="ok">${esc(okLabel)}</button></div>`)
    .then(v => v === 'ok');
}

async function editTask(t) {
  let type = t.type;
  const res = await modal(`<h3>Görevi düzenle</h3>
    <textarea class="input" id="e-text" rows="4" autofocus>${esc(t.text)}</textarea>
    <div class="field"><span class="field-label">Tür</span><div class="seg" id="e-type">${Object.entries(TYPES).map(([k, x]) =>
      `<button type="button" class="seg-btn ${type === k ? 'on' : ''} ${x.cls}" data-v="${k}">${ic(x.icon)}${x.label}</button>`).join('')}</div></div>
    <div class="field"><span class="field-label">Süre (boş bırakırsan tek sefer)</span><input class="input" id="e-dur" placeholder="ör. 90dk, 3s, 2g" value="${esc(t.duration || '')}"></div>
    <div class="modal-actions"><button class="btn ghost" data-modal="cancel">Vazgeç</button><button class="btn primary" data-modal="ok">Kaydet</button></div>`, {
    mount: el => $('#e-type', el).addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (!b) return;
      type = b.dataset.v;
      $$('.seg-btn', el).forEach(x => x.classList.toggle('on', x === b));
    }),
    collect: el => ({ text: $('#e-text', el).value.trim(), type, duration: $('#e-dur', el).value.trim() }),
  });
  if (!res) return;
  if (!res.text) { toast('Görev metni boş olamaz.', 'warn'); return; }
  if (res.duration && !DURATION_RE.test(res.duration)) { toast('Süre anlaşılamadı. Örnek: 90dk, 3s, 2g', 'warn'); return; }
  await taskOp(t.line, 'edit', res);
}

/* ============================================================
   Veri
   ============================================================ */
let refreshing = false, refreshAgain = false;
async function refreshState() {
  if (!project()) { S.state = null; updateAll(); return; }
  if (refreshing) { refreshAgain = true; return; }
  refreshing = true;
  try {
    S.state = await Api.call('state.get', { project: project() });
    updateAll();
  } catch (e) {
    console.warn(e);
  } finally {
    refreshing = false;
    if (refreshAgain) { refreshAgain = false; refreshState(); }
  }
}
const scheduleRefresh = debounce(refreshState, 150);

async function taskOp(line, op, arg, el) {
  const t = task(line);
  if (!t) return;
  busy(el, true);
  try {
    S.state = await Api.call('task.op', { project: project(), line: t.line, raw: t.raw, op, arg });
    updateAll();
    if (op === 'extend') toast(`${arg.minutes >= 60 ? arg.minutes / 60 + ' saat' : arg.minutes + ' dakika'} uzatıldı`, 'ok');
    if (op === 'retry') toast('Görev tekrar sıraya alındı', 'ok');
    if (op === 'finish') toast('Sıradaki turda son kontrol yapılıp kapanacak', 'ok', 4200);
    if (op === 'delete') toast('Görev silindi', 'ok');
    if (op === 'edit') toast('Görev güncellendi', 'ok');
  } catch (e) {
    toast(e.message, 'err', 4500);
    refreshState();
  } finally {
    busy(el, false);
  }
}

function resetProjectData() {
  S.results = null; S.resultOpen = null; S.resultDoc = null;
  S.logs = null; S.logOpen = null; S.logEvents = []; S.logOffset = 0;
  S.live = { name: null, offset: 0, events: [], info: null };
}

/* ============================================================
   Kenar çubuğu
   ============================================================ */
function renderNav() {
  $('#brand-mark').innerHTML = LOGO;
  $('#sb-nav').innerHTML = NAV.map((n, i) => `<button class="nav-item ${S.view === n.view ? 'on' : ''}" data-act="nav" data-view="${n.view}" title="Ctrl+${i + 1}">${ic(n.icon)}<span>${n.label}</span>${n.count ? '<span class="count" id="nav-count"></span>' : ''}</button>`).join('');
}

function renderSidebar() {
  const i = S.init;
  const cur = i.projects.find(p => p.path === i.settings.current);
  $('#sb-project').innerHTML = cur
    ? `<span class="ps-icon">${ic('folder')}</span><span class="ps-body"><span class="ps-name">${esc(cur.name)}</span><span class="ps-path">${esc(cur.path)}</span></span>${ic('chevron-down', 'ps-chev')}`
    : `<span class="ps-icon">${ic('plus')}</span><span class="ps-body"><span class="ps-name">Proje ekle</span><span class="ps-path">TASKS.md klasörünü seç</span></span>`;
  $$('.nav-item').forEach(n => n.classList.toggle('on', n.dataset.view === S.view));
  const c = S.state?.counts;
  const count = $('#nav-count');
  if (count) count.textContent = c && c.open + c.running ? c.open + c.running : '';

  const e = S.state?.engine;
  if (!e) { $('#sb-engine').innerHTML = ''; return; }
  const meta = ENGINE[e.state] || ENGINE.idle;
  const action = e.running
    ? iconBtn('stop', 'Motoru durdur', 'data-act="engine-stop"')
    : iconBtn('play', 'Motoru başlat', `data-act="engine-start" ${e.scriptsOk ? '' : 'disabled'}`);
  $('#sb-engine').innerHTML = `<span class="mini-dot tone-${meta.tone}${meta.pulse ? ' pulse' : ''}"></span>
    <div class="mini-body"><div class="mini-title">${meta.title}</div><div class="mini-sub">${esc(miniSub(e))}</div></div>${action}`;
}

function miniSub(e) {
  if (e.state === 'limit') return e.resumeAt ? `${e.resumeAt}'de devam edecek` : 'Limit sıfırlanınca devam';
  if (e.state === 'waiting') return 'Uygulama zamanlayıcısı çalışıyor';
  if (e.state === 'login') return 'Token yenilenmeli';
  if (e.running && e.current?.action === 'DÖNGÜ') return `Süreli görev · tur ${e.current.round ?? ''}`;
  if (e.running && e.current?.action === 'NORMAL') return 'Görev üzerinde çalışıyor';
  if (e.running) return e.detail || 'Çalışıyor';
  if (e.state === 'finished') return 'Yapılacak iş kalmadı';
  return 'Başlatmaya hazır';
}

function toggleProjectMenu() {
  const old = $('#project-menu');
  if (old) { old.remove(); return; }
  const i = S.init;
  const r = $('#sb-project').getBoundingClientRect();
  const m = document.createElement('div');
  m.id = 'project-menu';
  m.className = 'menu';
  m.setAttribute('role', 'menu');
  Object.assign(m.style, { left: `${r.left}px`, top: `${r.bottom + 6}px`, width: `${Math.max(r.width, 280)}px` });
  m.innerHTML = i.projects.map(p => `<button class="menu-item ${p.path === i.settings.current ? 'on' : ''}" role="menuitem" data-act="select-project" data-path="${esc(p.path)}">${ic('folder')}<span><b>${esc(p.name)}</b><small>${esc(p.path)}</small></span>${p.path === i.settings.current ? ic('check') : ''}</button>`).join('')
    + `<div class="menu-sep"></div><button class="menu-item" role="menuitem" data-act="add-project">${ic('plus')}<span><b>Klasör ekle…</b><small>TASKS.md'nin olduğu ya da olacağı klasör</small></span></button>`;
  document.body.appendChild(m);
  $('.menu-item', m)?.focus();
}

/* ============================================================
   Pano
   ============================================================ */
function mountDashboard(root) {
  root.innerHTML = `<div class="page">
    <header class="page-head">
      <div><h1>Pano</h1><p class="sub" id="d-sub"></p></div>
      <div class="head-actions"><button class="btn primary" data-act="new-task">${ic('plus')} Yeni görev <kbd>Ctrl N</kbd></button></div>
    </header>
    <div class="banners" id="d-banners"></div>
    <section class="card hero" id="d-hero"></section>
    <section class="stats" id="d-stats"></section>
    <div class="grid-2">
      <section class="card">
        <header class="card-head"><h3>${ic('hourglass')} Süreli görevler</h3><button class="link" data-act="filter-go" data-filter="running">Tümü</button></header>
        <div id="d-timed"></div>
      </section>
      <section class="card live-card">
        <header class="card-head"><h3>${ic('activity')} Canlı akış <span class="live-dot" id="d-live-dot"></span></h3><button class="link" data-act="nav" data-view="logs">Kayıtlar</button></header>
        <div class="feed" id="d-feed"></div>
      </section>
    </div>
    <section class="card">
      <header class="card-head"><h3>${ic('check-circle')} Son tamamlananlar</h3><button class="link" data-act="filter-go" data-filter="done">Tümü</button></header>
      <div id="d-recent"></div>
    </section>
  </div>`;
  pollLive();
}

function updateDashboard() {
  const st = S.state;
  if (!st || !$('#d-hero')) return;
  $('#d-sub').textContent = `${st.project.name} · ${st.project.path}`;
  $('#d-banners').innerHTML = banners();
  const meta = ENGINE[st.engine.state] || ENGINE.idle;
  const hero = $('#d-hero');
  hero.className = `card hero tone-${meta.tone}`;
  hero.innerHTML = engineHero(st.engine, meta);
  $('#d-stats').innerHTML = stats(st.counts);

  const timed = st.tasks.filter(t => t.state === 'running');
  $('#d-timed').innerHTML = timed.length
    ? timed.map(timedCard).join('')
    : empty('hourglass', 'Süreli görev yok', 'Görev eklerken bir süre seçersen, iş bitmiş gibi görünse bile süre dolana kadar kontrol edip geliştirmeye devam eder.', `<button class="btn sm" data-act="new-task">${ic('plus')} Süreli görev ekle</button>`);

  const done = st.tasks.filter(t => t.state === 'done').slice(-6).reverse();
  $('#d-recent').innerHTML = done.length
    ? `<div class="recent">${done.map(t => `<div class="recent-row">${typeBadge(t.type, false)}<div class="recent-body"><div class="clamp-1" title="${esc(t.text)}">${esc(t.text)}</div>${t.outputs.length ? `<div class="task-outputs">${outputChips(t)}</div>` : ''}</div></div>`).join('')}</div>`
    : empty('check-circle', 'Henüz tamamlanan görev yok', 'Motor görevleri bitirdikçe burada görünür.');
  renderFeed();
}

function engineHero(e, meta) {
  const sub = {
    limit: e.resumeAt ? `${e.resumeAt}'de kendiliğinden devam edecek.` : 'Limit sıfırlanınca kendiliğinden devam edecek.',
    waiting: 'Claude uygulamasındaki zamanlanmış görev bu listede çalışıyor; o bitince motor devam eder.',
    login: "Claude oturumu düştü. Ayarlar > Claude girişi bölümünden token'ı yenile ve yeniden başlat.",
    idle: 'Motor çalışmıyor. Başlatınca listedeki görevleri sırayla yapar.',
    finished: 'Yapılacak iş kalmadı. Yeni görev ekleyip yeniden başlatabilirsin.',
    stopped: e.detail || 'Motor durduruldu.',
    starting: 'Motor açılıyor, ilk görev birazdan başlar.',
  }[e.state] || e.detail || '';

  let action;
  if (e.running) action = `<button class="btn danger-soft" data-act="engine-stop">${ic('stop')} Durdur</button>`;
  else if (e.state === 'login') action = `<button class="btn primary" data-act="nav" data-view="settings" data-anchor="set-login">${ic('key')} Girişi düzelt</button>`;
  else action = `<button class="btn primary" data-act="engine-start" ${e.scriptsOk ? '' : 'disabled'}>${ic('play')} Başlat</button>`;

  const cur = e.running && e.current && e.current.action && e.current.action !== 'YOK' ? e.current : null;
  const curLabel = cur ? ({ 'NORMAL': 'Görev', 'DÖNGÜ': `Süreli · tur ${cur.round ?? ''}`, 'BİTİR': 'Kapanış turu' }[cur.action] || cur.action) : '';
  const scheduler = e.schedulerActive ? 'şu an çalışıyor' : e.schedulerInstalled ? 'kurulu, boşta' : 'bağlı değil';

  return `<div class="hero-main">
      <div class="orb${meta.pulse ? ' pulse' : ''}"></div>
      <div class="hero-text">
        <div class="eyebrow">Terminal motoru${e.since ? ` · ${esc(rel(D(e.since)))}` : ''}</div>
        <h2>${meta.title}</h2>
        <p>${esc(sub)}</p>
      </div>
      <div class="hero-actions">${action}</div>
    </div>
    ${cur ? `<div class="now"><div class="now-label">${ic('activity')} Şu an</div>
      <div class="now-body"><span class="pill s-run">${esc(curLabel)}</span><span class="now-task" title="${esc(cur.task)}">${esc(cur.task || '')}</span></div>
      ${cur.end ? `<div class="now-end" data-end="${esc(cur.end)}">${ic('hourglass')}<b class="cd-text">${left(D(cur.end) - Date.now())}</b> kaldı</div>` : ''}</div>` : ''}
    <div class="hero-foot">
      <label class="switch-row" data-tip="İzin sormadan her komutu çalıştırır. Sadece git ile yedeklenen, güvendiğin klasörlerde aç. Motor bir sonraki başlatmada uygular.">
        <span class="switch"><input type="checkbox" data-setting="fullAccess" ${S.init.settings.fullAccess ? 'checked' : ''}><i></i></span> Tam yetki
      </label>
      <span class="hero-chip ${e.schedulerActive ? 'on' : ''}" data-tip="Claude masaüstü uygulamasındaki zamanlanmış görev (30 dakikada bir) bu listeyi işleyebilir. İkisi aynı anda çalışmaz.">${ic('clock')} Uygulama zamanlayıcısı: ${scheduler}</span>
    </div>`;
}

function stats(c) {
  return [
    { k: 'open', label: 'Açık', icon: 'list', tone: 'info' },
    { k: 'running', label: 'Süreli', icon: 'hourglass', tone: 'accent' },
    { k: 'done', label: 'Biten', icon: 'check-circle', tone: 'ok' },
    { k: 'blocked', label: 'Takılan', icon: 'alert', tone: 'err' },
  ].map(s => `<button class="stat tone-${s.tone}" data-act="filter-go" data-filter="${s.k}"><span class="stat-icon">${ic(s.icon)}</span><span class="stat-num">${c[s.k]}</span><span class="stat-label">${s.label}</span></button>`).join('');
}

function timedCard(t) {
  return `<div class="timed-card" ${timeAttrs(t)}>
    ${ring(progress(t))}
    <div class="timed-card-body">
      <div class="timed-card-title">${typeBadge(t.type, false)}<span class="clamp-2" title="${esc(t.text)}">${esc(t.text)}</span></div>
      <div class="timed-card-meta"><span>${ic('hourglass')}<b class="cd-text">${left(D(t.end) - Date.now())}</b> kaldı</span><span>${ic('repeat')} Tur ${t.round}</span></div>
    </div>
    <div class="timed-card-actions">
      <button class="btn xs ghost" data-act="op" data-op="extend" data-min="60" data-line="${t.line}" data-tip="1 saat uzat">+1 sa</button>
      ${t.id ? iconBtn('book', 'Günlüğü aç', `data-act="journal" data-id="${esc(t.id)}"`) : ''}
      ${iconBtn('flag', 'Şimdi bitir', `data-act="finish" data-line="${t.line}"`)}
    </div>
  </div>`;
}

function banners() {
  const i = S.init, e = S.state?.engine;
  const out = [];
  if (!i.scriptsOk) out.push(banner('err', 'alert', 'Motor betikleri bulunamadı', 'autopilot.ps1 ve sira.ps1 olan klasörü seç.', `<button class="btn sm" data-act="pick-scripts">Klasör seç</button>`));
  if (!i.pwsh) out.push(banner('err', 'alert', 'PowerShell 7 bulunamadı', 'Motor pwsh ile çalışır.', `<button class="btn sm" data-act="url" data-url="https://aka.ms/powershell">İndir</button>`));
  if (e?.state === 'login') out.push(banner('err', 'key', 'Claude girişi gerekli', "Motor oturum düştüğü için durdu. Token'ı yenileyip yeniden başlat.", `<button class="btn sm" data-act="nav" data-view="settings" data-anchor="set-login">Girişi düzelt</button>`));
  else if (!i.tokenSet) out.push(banner('info', 'key', 'Uzun süreli token önerilir', 'Token olmadan oturumun süresi dolunca motor durur. Ayarlar > Claude girişi.', `<button class="btn sm ghost" data-act="nav" data-view="settings" data-anchor="set-login">Ayarla</button>`, 'token'));
  return out.join('');
}

/* Canlı akış: en yeni tur kaydını parça parça okur. */
async function pollLive() {
  if (S.view !== 'dashboard' || !project()) return;
  try {
    const list = await Api.call('logs.list', { project: project(), max: 1 });
    const info = list[0] || null;
    if (!info) { S.live = { name: null, offset: 0, events: [], info: null }; renderFeed(); return; }
    if (info.name !== S.live.name) S.live = { name: info.name, offset: 0, events: [], info };
    else S.live.info = info;
    const chunk = await Api.call('logs.read', { project: project(), name: info.name, offset: S.live.offset });
    S.live.offset = chunk.offset;
    if (chunk.events.length) {
      S.live.events.push(...chunk.events);
      if (S.live.events.length > 500) S.live.events.splice(0, S.live.events.length - 500);
    }
    renderFeed();
  } catch { /* kayıt klasörü henüz yoksa sessiz kal */ }
}

function renderFeed() {
  const el = $('#d-feed');
  if (!el) return;
  const live = !!(S.state?.engine?.running && S.live.info?.status === 'running');
  $('#d-live-dot')?.classList.toggle('on', live);
  if (!S.live.name) {
    el.innerHTML = empty('activity', 'Henüz kayıt yok', "Motor çalışınca Claude'un attığı her adım burada canlı görünür.");
    return;
  }
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  el.innerHTML = `<div class="feed-head">${ic('clock')} ${esc(clock(D(S.live.info?.started)))} turu${live ? ' · canlı' : ''}</div>${renderEvents(S.live.events, { compact: true, live })}`;
  if (nearBottom || !el.dataset.touched) el.scrollTop = el.scrollHeight;
}

/* ============================================================
   Olay (kayıt) görünümü
   ============================================================ */
function renderEvents(events, { compact = false, live = false } = {}) {
  const results = new Map(events.filter(e => e.t === 'toolResult').map(e => [e.id, e]));
  let list = events.filter(e => e.t !== 'toolResult');
  if (compact) list = list.slice(-50);
  if (!list.length) return empty('activity', 'Henüz adım yok', live ? 'Claude çalışmaya başladı, adımlar birazdan gelir.' : '');
  const lastToolIndex = list.map(e => e.t).lastIndexOf('tool');
  return list.map((e, i) => eventRow(e, results, live && i === lastToolIndex)).join('');
}

function eventRow(e, results, isLatestTool) {
  switch (e.t) {
    case 'init':
      return `<div class="ev ev-init">${ic('sparkles')}<span>Tur başladı${e.name ? ` · ${esc(e.name)}` : ''}</span></div>`;
    case 'text':
      return `<div class="ev ev-text">${ic('message')}<div class="ev-body">${md(e.text)}</div></div>`;
    case 'tool': {
      const r = results.get(e.id);
      const st = r ? (r.ok ? 'ok' : 'err') : isLatestTool ? 'pending' : 'none';
      const mark = st === 'pending' ? '<i class="spinner"></i>' : st === 'ok' ? ic('check') : st === 'err' ? ic('x') : '';
      return `<div class="ev ev-tool st-${st}">${ic(TOOL_ICON[e.name] || 'terminal')}<div class="ev-body"><span class="ev-name">${esc(TOOL_LABEL[e.name] || e.name)}</span>${e.detail ? `<code class="ev-detail">${esc(e.detail)}</code>` : ''}${r && !r.ok && r.text ? `<div class="ev-err">${esc(r.text)}</div>` : ''}</div><span class="ev-state">${mark}</span></div>`;
    }
    case 'result': {
      const bits = [e.turns ? `${e.turns} adım` : '', e.minutes ? `${e.minutes} dk` : '', e.cost ? `$${e.cost.toFixed(2)}` : ''].filter(Boolean).join(' · ');
      return `<div class="ev ev-result ${e.ok ? 'ok' : 'err'}">${ic(e.ok ? 'check-circle' : 'alert')}<div class="ev-body"><div class="ev-result-head">${e.ok ? 'Tur bitti' : 'Tur hatayla bitti'}${bits ? ` · ${bits}` : ''}</div>${e.text ? `<div class="ev-result-text">${md(e.text)}</div>` : ''}</div></div>`;
    }
    case 'raw':
      return `<pre class="ev-raw">${esc(e.text)}</pre>`;
    case 'plain':
      return `<div class="ev ev-text">${ic('message')}<div class="ev-body">${md(e.text)}</div></div>`;
    default:
      return '';
  }
}

/* ============================================================
   Görevler
   ============================================================ */
function mountTasks(root) {
  root.innerHTML = `<div class="page">
    <header class="page-head">
      <div><h1>Görevler</h1><p class="sub" id="t-sub"></p></div>
      <div class="head-actions"><button class="btn ghost" data-act="open-tasks-file">${ic('external')} TASKS.md'yi aç</button></div>
    </header>
    <section class="card composer" id="composer"></section>
    <div class="toolbar">
      <div class="seg" id="t-filter" role="tablist" aria-label="Filtre"></div>
      <label class="search">${ic('search')}<input id="t-search" type="search" placeholder="Görevlerde ara  ( / )" value="${esc(S.search)}" aria-label="Görevlerde ara"></label>
    </div>
    <div class="task-list enter" id="t-list"></div>
  </div>`;
  renderComposer();
  $('#t-search').addEventListener('input', e => { S.search = e.target.value; updateTasks(); });
  setTimeout(() => $('#t-list')?.classList.remove('enter'), 600);
}

function renderComposer(keepFocus) {
  const el = $('#composer');
  if (!el) return;
  const c = S.composer;
  const hadFocus = document.activeElement?.id === 'c-text';
  el.innerHTML = `<textarea id="c-text" rows="2" placeholder="Claude'a ne yaptırmak istiyorsun?   Örnek: Kişisel siteme blog bölümü ekle" aria-label="Görev metni">${esc(c.text)}</textarea>
    <div class="composer-row">
      <div class="field"><span class="field-label">Tür</span>
        <div class="seg" role="radiogroup" aria-label="Görev türü">${Object.entries(TYPES).map(([k, t]) =>
          `<button type="button" role="radio" aria-checked="${c.type === k}" class="seg-btn ${t.cls} ${c.type === k ? 'on' : ''}" data-act="c-type" data-v="${k}">${ic(t.icon)}${t.label}</button>`).join('')}</div>
      </div>
      <div class="field"><span class="field-label">Süre</span>
        <div class="chips" role="radiogroup" aria-label="Süre">${DURATIONS.map(d =>
          `<button type="button" role="radio" aria-checked="${c.duration === d.v}" class="chip ${c.duration === d.v ? 'on' : ''}" data-act="c-dur" data-v="${d.v}">${d.label}</button>`).join('')}
          <button type="button" role="radio" aria-checked="${c.duration === 'custom'}" class="chip ${c.duration === 'custom' ? 'on' : ''}" data-act="c-dur" data-v="custom">Özel</button>
          ${c.duration === 'custom' ? `<input id="c-custom" class="input xs" placeholder="ör. 90dk, 6s, 2g" value="${esc(c.custom)}" aria-label="Özel süre">` : ''}
        </div>
      </div>
    </div>
    <div class="composer-foot">
      <p class="hint">${composerHint()}</p>
      <label class="check"><input type="checkbox" id="c-start" ${S.init.settings.autoStartEngine ? 'checked' : ''}> Motor çalışmıyorsa başlat</label>
      <button class="btn primary" data-act="c-add" id="c-add">${ic('plus')} Ekle <kbd>Ctrl ↵</kbd></button>
    </div>`;
  const ta = $('#c-text');
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(240, ta.scrollHeight + 2) + 'px'; };
  ta.addEventListener('input', () => { S.composer.text = ta.value; grow(); });
  grow();
  $('#c-custom')?.addEventListener('input', e => { S.composer.custom = e.target.value; });
  if (keepFocus && hadFocus) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
}

function composerHint() {
  const c = S.composer;
  if (c.duration) return `${ic('hourglass')}<span><b>Süreli görev:</b> iş bitmiş gibi görünse bile kapanmaz; süre dolana kadar her turda kontrol eder, düzeltir ve yeni şeyler ekler.</span>`;
  return {
    '': `${ic('wand')}<span>Türü Claude görevin metnine bakarak seçer.</span>`,
    kod: `${ic('code')}<span>Kodu yazar, varsa testleri çalıştırır ve commit atar.</span>`,
    arastir: `${ic('compass')}<span>Kaynaklı bir rapor yazar, ardından bağımsız bir kontrol görevi ekler.</span>`,
    kontrol: `${ic('shield')}<span>Hedefi doğrular, sorunları kanıtıyla raporlar ve düzeltme görevleri açar.</span>`,
  }[c.type];
}

async function addTask() {
  const c = S.composer;
  const text = ($('#c-text')?.value || '').trim();
  if (!text) { toast('Önce görevi yaz.', 'warn'); $('#c-text')?.focus(); return; }
  const duration = c.duration === 'custom' ? ($('#c-custom')?.value || '').trim() : c.duration;
  if (c.duration === 'custom' && !DURATION_RE.test(duration)) { toast('Süre anlaşılamadı. Örnek: 90dk, 6s, 2g', 'warn'); $('#c-custom')?.focus(); return; }
  const btn = $('#c-add');
  busy(btn, true);
  try {
    S.state = await Api.call('task.add', { project: project(), type: c.type, duration, text, start: $('#c-start')?.checked ?? false });
    // Süre seçimi sıfırlanır: bir sonraki görev yanlışlıkla 48 saatlik olmasın.
    Object.assign(S.composer, { text: '', duration: '', custom: '' });
    renderComposer();
    toast(duration ? 'Süreli görev eklendi' : 'Görev eklendi', 'ok');
    if (S.state.startError) toast(S.state.startError, 'err', 6000);
    updateAll();
  } catch (e) {
    toast(e.message, 'err', 5000);
  } finally {
    busy(btn, false);
  }
}

function updateTasks() {
  const st = S.state;
  if (!st || !$('#t-list')) return;
  $('#t-sub').textContent = `${st.project.path}\\TASKS.md · ${st.tasks.length} görev`;
  const counts = { all: st.tasks.length, ...st.counts };
  $('#t-filter').innerHTML = [['all', 'Tümü'], ['open', 'Açık'], ['running', 'Süreli'], ['done', 'Biten'], ['blocked', 'Takılan']].map(([k, l]) =>
    `<button role="tab" aria-selected="${S.filter === k}" class="seg-btn ${S.filter === k ? 'on' : ''}" data-act="filter" data-filter="${k}">${l}<span class="count">${counts[k]}</span></button>`).join('');

  const q = S.search.trim().toLocaleLowerCase('tr-TR');
  let list = st.tasks.filter(t => S.filter === 'all' || t.state === S.filter);
  if (q) list = list.filter(t => (t.text + ' ' + (t.reason || '')).toLocaleLowerCase('tr-TR').includes(q));
  if (S.filter === 'all') {
    const order = { running: 0, open: 1, blocked: 2, done: 3 };
    list = [...list].sort((a, b) => order[a.state] - order[b.state] || (a.state === 'done' ? b.line - a.line : a.line - b.line));
  } else if (S.filter === 'done') {
    list = [...list].reverse();
  }

  let html;
  if (list.length) html = list.map(taskRow).join('');
  else if (!st.tasks.length) html = empty('tasks', 'Henüz görev yok', 'Yukarıdan ilk görevini yaz. Kod, araştırma ya da kontrol olabilir; istersen bir süre ver.');
  else html = empty('search', 'Bu filtrede görev yok');
  $('#t-list').innerHTML = html;
}

function taskRow(t) {
  const st = STATES[t.state];
  const tt = TYPES[t.type] || TYPES[''];
  const a = [];
  if (t.state === 'open') {
    a.push(iconBtn('arrow-up', 'Önceliği artır', `data-act="op" data-op="up" data-line="${t.line}"`));
    a.push(iconBtn('arrow-down', 'Önceliği azalt', `data-act="op" data-op="down" data-line="${t.line}"`));
    a.push(iconBtn('pencil', 'Düzenle', `data-act="edit" data-line="${t.line}"`));
    a.push(iconBtn('trash', 'Sil', `data-act="delete" data-line="${t.line}"`, 'danger'));
  } else if (t.state === 'running') {
    a.push(`<button class="btn xs ghost" data-act="op" data-op="extend" data-min="60" data-line="${t.line}" data-tip="1 saat uzat">+1 sa</button>`);
    a.push(`<button class="btn xs ghost" data-act="op" data-op="extend" data-min="720" data-line="${t.line}" data-tip="12 saat uzat">+12 sa</button>`);
    if (t.id) a.push(iconBtn('book', 'Günlüğü aç', `data-act="journal" data-id="${esc(t.id)}"`));
    a.push(iconBtn('flag', 'Şimdi bitir', `data-act="finish" data-line="${t.line}"`));
  } else if (t.state === 'blocked') {
    a.push(`<button class="btn xs" data-act="op" data-op="retry" data-line="${t.line}">${ic('rotate')} Tekrar dene</button>`);
    a.push(iconBtn('trash', 'Sil', `data-act="delete" data-line="${t.line}"`, 'danger'));
  } else {
    a.push(iconBtn('copy', 'Benzerini ekle', `data-act="clone" data-line="${t.line}"`));
    a.push(iconBtn('trash', 'Sil', `data-act="delete" data-line="${t.line}"`, 'danger'));
  }

  const meta = [`<span class="pill ${st.cls}">${st.label}</span>`];
  if (t.next) meta.push(`<span class="pill s-next">${ic('play')} Sıradaki</span>`);
  if (t.state === 'open' && t.duration) meta.push(`<span class="pill s-dur">${ic('hourglass')} ${esc(t.duration)}</span>`);
  meta.push(typeBadge(t.type));

  let timed = '';
  if (t.state === 'running' && t.end) {
    const p = progress(t);
    timed = `<div class="timed-inline" ${timeAttrs(t)}>
      <div class="bar"><i style="width:${p == null ? 0 : (p * 100).toFixed(2)}%"></i></div>
      <div class="timed-inline-meta"><span>${ic('hourglass')}<b class="cd-text">${left(D(t.end) - Date.now())}</b> kaldı</span><span>${ic('repeat')} Tur ${t.round}</span><span>${ic('calendar')} Bitiş ${esc(clock(D(t.end)))}</span><span class="pct">${p == null ? '' : Math.round(p * 100) + '%'}</span></div>
    </div>`;
  }

  return `<article class="task st-${t.state}">
    <div class="task-icon ${tt.cls}">${ic(tt.icon)}</div>
    <div class="task-body">
      <div class="task-text">${esc(t.text)}</div>
      <div class="task-meta">${meta.join('')}</div>
      ${timed}
      ${t.reason ? `<div class="task-reason">${ic('alert')}<span>${esc(t.reason)}</span></div>` : ''}
      ${t.outputs.length ? `<div class="task-outputs">${outputChips(t)}</div>` : ''}
      ${t.note ? `<div class="task-note">${esc(t.note)}</div>` : ''}
    </div>
    <div class="task-actions">${a.join('')}</div>
  </article>`;
}

/* ============================================================
   Sonuçlar
   ============================================================ */
function mountResults(root) {
  root.innerHTML = `<div class="split">
    <aside class="split-list">
      <div class="split-head"><h1>Sonuçlar</h1>
        <label class="search">${ic('search')}<input id="r-search" type="search" placeholder="Raporlarda ara  ( / )" value="${esc(S.resultSearch)}" aria-label="Raporlarda ara"></label>
      </div>
      <div class="list-scroll" id="r-list"></div>
    </aside>
    <section class="split-view" id="r-view"></section>
  </div>`;
  $('#r-search').addEventListener('input', e => { S.resultSearch = e.target.value; renderResultList(); });
  loadResults(true);
}

async function loadResults(first) {
  try {
    S.results = await Api.call('results.list', { project: project() });
  } catch (e) {
    S.results = [];
    toast(e.message, 'err');
  }
  renderResultList();
  if (!first) {
    // Açık dosya motor tarafından güncellendiyse kaydırma konumunu koruyarak yenile.
    const cur = S.results.find(r => r.path === S.resultOpen);
    if (cur && S.resultDoc && cur.modified !== S.resultDoc.modified) openResult(cur.path, true);
    return;
  }
  if (S.resultOpen) openResult(S.resultOpen);
  else if (S.results.length) openResult(S.results.find(r => r.ext === 'md')?.path || S.results[0].path);
  else $('#r-view').innerHTML = empty('results', 'Henüz sonuç yok', 'Araştırma ve kontrol raporları sonuclar/ klasörüne yazıldıkça burada görünür.');
}
const reloadResults = debounce(() => { if (S.view === 'results') loadResults(false); }, 400);

function renderResultList() {
  const el = $('#r-list');
  if (!el) return;
  if (!S.results) { el.innerHTML = `<div class="doc-loading" style="padding:40px"><i class="spinner"></i></div>`; return; }
  const q = S.resultSearch.trim().toLocaleLowerCase('tr-TR');
  const list = S.results.filter(r => !q || `${r.title} ${r.name}`.toLocaleLowerCase('tr-TR').includes(q));
  if (!list.length) {
    el.innerHTML = q ? empty('search', 'Eşleşen rapor yok') : empty('file', 'Klasör boş', 'sonuclar/ klasöründe henüz dosya yok.');
    return;
  }
  el.innerHTML = Object.keys(KINDS).map(k => {
    const items = list.filter(r => r.kind === k);
    if (!items.length) return '';
    return `<div class="group"><div class="group-title">${KINDS[k].label}<span>${items.length}</span></div>${items.map(r => {
      const kind = KINDS[r.kind] || KINDS.other;
      return `<button class="list-item ${S.resultOpen === r.path ? 'on' : ''}" data-act="open-result" data-path="${esc(r.path)}">
        <span class="li-icon ${kind.cls}">${ic(r.ext === 'html' ? 'globe' : kind.icon)}</span>
        <span class="li-body"><span class="li-title clamp-2">${esc(r.title)}</span><span class="li-meta">${esc(rel(D(r.modified)))} · ${size(r.size)}${r.ext !== 'md' ? ` · ${esc(r.ext.toUpperCase())}` : ''}</span></span>
      </button>`;
    }).join('')}</div>`;
  }).join('');
}

async function openResult(path, keepScroll = false) {
  S.resultOpen = path;
  renderResultList();
  const view = $('#r-view');
  if (!view) return;
  if (!keepScroll) view.innerHTML = `<div class="doc-loading"><i class="spinner"></i></div>`;
  try {
    S.resultDoc = await Api.call('results.read', { project: project(), path });
  } catch (e) {
    S.resultDoc = null;
    const journal = /gunluk-/.test(path);
    view.innerHTML = empty('alert', journal ? 'Günlük henüz oluşmadı' : 'Açılamadı', esc(journal ? 'Süreli görevin ilk turu bitince günlük dosyası yazılır.' : e.message));
    return;
  }
  renderResultView(keepScroll);
}

function renderResultView(keepScroll) {
  const d = S.resultDoc, view = $('#r-view');
  if (!d || !view) return;
  const prev = keepScroll ? $('.doc-scroll', view)?.scrollTop ?? 0 : 0;
  const reading = d.words ? `<span>${d.words.toLocaleString('tr-TR')} kelime · ~${Math.max(1, Math.round(d.words / 220))} dk okuma</span>` : '';
  const head = `<header class="doc-head">
      <div class="doc-title"><h2>${esc(d.title)}</h2><div class="doc-meta"><span class="mono">${esc(d.path)}</span><span>${esc(clock(D(d.modified)))}</span>${reading}</div></div>
      <div class="doc-actions">
        ${iconBtn('rotate', 'Yenile', 'data-act="reload-result"')}
        ${iconBtn('folder-open', 'Klasörde göster', `data-act="reveal" data-path="${esc(d.path)}"`)}
        <button class="btn sm ghost" data-act="open-file" data-path="${esc(d.path)}">${ic('external')} Dışarıda aç</button>
      </div>
    </header>`;
  let body;
  if (d.kind === 'markdown') body = `<div class="doc-scroll"><div class="doc-wrap"><article class="prose" id="r-prose">${d.html}</article><nav class="toc" id="r-toc" aria-label="İçindekiler"></nav></div></div>`;
  else if (d.kind === 'html') body = empty('globe', 'Etkileşimli HTML sayfası', 'Güvenlik için uygulamanın içinde değil, varsayılan tarayıcında açılır.', `<button class="btn primary" data-act="open-file" data-path="${esc(d.path)}">${ic('external')} Tarayıcıda aç</button>`);
  else if (d.kind === 'text') body = `<div class="doc-scroll"><pre class="doc-text">${esc(d.text)}</pre></div>`;
  else body = empty('file', 'Önizleme yok', 'Bu dosya türü uygulamada gösterilemiyor.', `<button class="btn" data-act="open-file" data-path="${esc(d.path)}">Dışarıda aç</button>`);
  view.innerHTML = head + body;

  if (d.kind === 'markdown') {
    $$('#r-prose table').forEach(t => { const w = document.createElement('div'); w.className = 'table-wrap'; t.replaceWith(w); w.appendChild(t); });
    $$('#r-prose a[href^="http"]').forEach(a => a.classList.add('ext'));
    const hs = $$('#r-prose h2, #r-prose h3');
    const toc = $('#r-toc');
    if (hs.length >= 3) {
      toc.innerHTML = `<div class="toc-title">İçindekiler</div>${hs.map((h, i) => { h.dataset.toc = i; return `<button class="toc-item lvl-${h.tagName[1]}" data-act="toc" data-i="${i}">${esc(h.textContent)}</button>`; }).join('')}`;
    } else toc.remove();
  }
  if (keepScroll) { const sc = $('.doc-scroll', view); if (sc) sc.scrollTop = prev; }
}

function openResultAnywhere(path) {
  S.resultOpen = path;
  S.resultDoc = null;
  go('results');
}

function openOutput(path) {
  if (/\.md$/i.test(path)) { openResultAnywhere(path); return; }
  Api.call('shell.open', { project: project(), path }).catch(e => toast(e.message, 'err'));
}

/* ============================================================
   Kayıtlar
   ============================================================ */
function mountLogs(root) {
  root.innerHTML = `<div class="split">
    <aside class="split-list">
      <div class="split-head"><h1>Kayıtlar</h1><p class="sub">Her tur ayrı bir kayıt. Süren tur, motor yazdıkça canlı güncellenir.</p></div>
      <div class="list-scroll" id="l-list"></div>
    </aside>
    <section class="split-view" id="l-view"></section>
  </div>`;
  loadLogs(true);
}

async function loadLogs(first) {
  try {
    S.logs = await Api.call('logs.list', { project: project(), max: 200 });
  } catch (e) {
    S.logs = [];
    toast(e.message, 'err');
  }
  renderLogList();
  if (!first) return;
  if (S.logOpen && S.logs.some(l => l.name === S.logOpen)) openLog(S.logOpen);
  else if (S.logs.length) openLog(S.logs[0].name);
  else $('#l-view').innerHTML = empty('logs', 'Henüz kayıt yok', 'Terminal motoru her tur için .autopilot/logs klasörüne bir kayıt yazar.');
}
const reloadLogList = debounce(() => { if (S.view === 'logs') loadLogs(false); }, 800);

function renderLogList() {
  const el = $('#l-list');
  if (!el) return;
  if (!S.logs) { el.innerHTML = `<div class="doc-loading" style="padding:40px"><i class="spinner"></i></div>`; return; }
  if (!S.logs.length) { el.innerHTML = empty('logs', 'Kayıt yok'); return; }
  el.innerHTML = S.logs.map(l => {
    const s = LOG_STATUS[l.status] || LOG_STATUS.unknown;
    const bits = [l.minutes ? `${l.minutes} dk` : '', l.turns ? `${l.turns} adım` : '', l.cost ? `$${l.cost.toFixed(2)}` : ''].filter(Boolean).join(' · ');
    return `<button class="list-item ${S.logOpen === l.name ? 'on' : ''}" data-act="open-log" data-name="${esc(l.name)}">
      <span class="li-icon ${l.status === 'success' ? 't-ara' : l.status === 'running' ? 't-kod' : 't-auto'}">${ic(s.icon)}</span>
      <span class="li-body">
        <span class="li-title">${esc(clock(D(l.started)))}</span>
        <span class="li-meta"><span class="pill ${s.cls}">${s.label}</span>${bits ? `<span>${bits}</span>` : ''}</span>
        ${l.summary ? `<span class="li-summary clamp-2">${esc(l.summary)}</span>` : ''}
      </span>
    </button>`;
  }).join('');
}

const isLiveLog = name => !!(S.state?.engine?.running && S.logs?.[0]?.name === name && S.logs[0].status === 'running');

async function openLog(name) {
  S.logOpen = name;
  S.logEvents = [];
  S.logOffset = 0;
  renderLogList();
  const view = $('#l-view');
  if (view) view.innerHTML = `<div class="doc-loading"><i class="spinner"></i></div>`;
  await pollLog(true);
}

async function pollLog(first = false) {
  if (!S.logOpen) return;
  const name = S.logOpen;
  try {
    const c = await Api.call('logs.read', { project: project(), name, offset: S.logOffset });
    if (name !== S.logOpen) return;
    S.logOffset = c.offset;
    if (c.events.length || first) {
      S.logEvents.push(...c.events);
      renderLogView(!first);
    }
  } catch (e) {
    if (first) $('#l-view').innerHTML = empty('alert', 'Kayıt okunamadı', esc(e.message));
  }
}

function renderLogView(append) {
  const view = $('#l-view');
  if (!view) return;
  const info = (S.logs || []).find(l => l.name === S.logOpen);
  const live = isLiveLog(S.logOpen);
  const old = $('.log-scroll', view);
  const nearBottom = old ? old.scrollHeight - old.scrollTop - old.clientHeight < 80 : false;
  const prev = old?.scrollTop ?? 0;
  const s = LOG_STATUS[live ? 'running' : info?.status] || LOG_STATUS.unknown;
  view.innerHTML = `<header class="doc-head">
      <div class="doc-title"><h2>${esc(clock(D(info?.started)))} turu</h2><div class="doc-meta"><span class="pill ${s.cls}">${live ? `<span class="live-dot on"></span> Canlı` : s.label}</span><span class="mono">${esc(S.logOpen)}</span>${info ? `<span>· ${size(info.size)}</span>` : ''}</div></div>
      <div class="doc-actions"><button class="btn sm ghost" data-act="open-log-file" data-name="${esc(S.logOpen)}">${ic('external')} Dosyayı aç</button></div>
    </header>
    <div class="log-scroll"><div class="timeline">${renderEvents(S.logEvents, { live })}</div></div>`;
  const sc = $('.log-scroll', view);
  if ((append && nearBottom) || (!append && live)) sc.scrollTop = sc.scrollHeight;
  else if (append) sc.scrollTop = prev;
}

/* ============================================================
   Ayarlar
   ============================================================ */
function mountSettings(root) {
  root.innerHTML = `<div class="page narrow" id="s-page"></div>`;
  renderSettings();
}

function toggleRow(key, title, sub, on, warn) {
  return `<label class="row toggle-row"><div class="row-main"><div class="row-title">${title}${warn && on ? ' <span class="pill s-dur">Açık</span>' : ''}</div>${sub ? `<div class="row-sub">${sub}</div>` : ''}</div>
    <span class="switch"><input type="checkbox" data-setting="${key}" ${on ? 'checked' : ''}><i></i></span></label>`;
}

function renderSettings() {
  const page = $('#s-page');
  if (!page) return;
  const i = S.init, s = i.settings;
  const projectRows = i.projects.length ? i.projects.map(p => `<div class="row">
      <div class="row-main"><div class="row-title">${esc(p.name)}${p.path === s.current ? ' <span class="pill s-next">Seçili</span>' : ''}${!p.exists ? ' <span class="pill s-block">Klasör yok</span>' : !p.hasTasks ? ' <span class="pill s-open">TASKS.md yok</span>' : ''}</div><div class="row-sub mono">${esc(p.path)}</div></div>
      <div class="row-actions">${p.path !== s.current ? `<button class="btn xs ghost" data-act="select-project" data-path="${esc(p.path)}">Seç</button>` : ''}${iconBtn('folder-open', 'Klasörü aç', `data-act="reveal-project" data-path="${esc(p.path)}"`)}${iconBtn('x', 'Listeden kaldır', `data-act="remove-project" data-path="${esc(p.path)}"`, 'danger')}</div>
    </div>`).join('') : `<div class="row"><div class="row-main muted">Henüz proje yok.</div></div>`;

  page.innerHTML = `<header class="page-head"><div><h1>Ayarlar</h1><p class="sub">Değişiklikler anında kaydedilir.</p></div></header>

    <section class="card set-card" id="set-projects">
      <header class="set-head"><div class="set-icon">${ic('folder')}</div><div><h3>Projeler</h3><p>Her proje, içinde TASKS.md olan bir klasör. Motor her proje için ayrı çalışır.</p></div><button class="btn sm" data-act="add-project">${ic('plus')} Klasör ekle</button></header>
      <div class="rows">${projectRows}</div>
    </section>

    <section class="card set-card">
      <header class="set-head"><div class="set-icon">${ic('terminal')}</div><div><h3>Motor</h3><p>Görevleri arka planda yapan PowerShell motoru (autopilot.ps1). Bu uygulama onu gizli pencerede başlatır.</p></div></header>
      <div class="rows">
        <div class="row"><div class="row-main"><div class="row-title">Motor klasörü ${i.scriptsOk ? '<span class="pill s-done">Bulundu</span>' : '<span class="pill s-block">Bulunamadı</span>'}</div><div class="row-sub mono">${esc(s.scriptsDir || '—')}</div></div>
          <div class="row-actions"><button class="btn xs ghost" data-act="pick-scripts">Değiştir</button><button class="btn xs ghost" data-act="open-rules">Kuralları aç</button></div></div>
        <div class="row"><div class="row-main"><div class="row-title">PowerShell 7 ${i.pwsh ? '<span class="pill s-done">Kurulu</span>' : '<span class="pill s-block">Bulunamadı</span>'}</div><div class="row-sub mono">${esc(i.pwsh || 'https://aka.ms/powershell')}</div></div></div>
        ${toggleRow('fullAccess', 'Tam yetki', 'İzin sormadan her komutu çalıştırır (<code>--dangerously-skip-permissions</code>). Sadece git ile yedeklenen, güvendiğin klasörlerde aç. Motor bir sonraki başlatmada uygular.', s.fullAccess, true)}
        ${toggleRow('autoStartEngine', 'Görev eklenince motoru başlat', 'Ekle düğmesinin yanındaki kutu varsayılan olarak işaretli gelir.', s.autoStartEngine)}
      </div>
    </section>

    <section class="card set-card" id="set-login">
      <header class="set-head"><div class="set-icon">${ic('key')}</div><div><h3>Claude girişi</h3><p>Arkada çalışan motor tarayıcıdan giriş yapamaz; uzun süreli bir token kullanır (Pro/Max, yaklaşık 1 yıl geçerli).</p></div><span class="pill ${i.tokenSet ? 's-done' : 's-open'}">${i.tokenSet ? 'Token ayarlı' : 'Token yok'}</span></header>
      <div class="rows">
        <div class="row"><div class="row-main"><div class="row-title">1. Token al</div><div class="row-sub">Terminalde <code>claude setup-token</code> açılır; tarayıcıda giriş yapınca token ekrana yazılır.</div></div>
          <div class="row-actions"><button class="btn xs" data-act="login-terminal">${ic('terminal')} Terminali aç</button></div></div>
        <div class="row"><div class="row-main"><div class="row-title">2. Token'ı yapıştır</div><div class="row-sub">Windows kullanıcı ortam değişkenine (<code>CLAUDE_CODE_OAUTH_TOKEN</code>) kaydedilir; başka hiçbir yere yazılmaz. Kimseyle paylaşma.</div>
          <div class="token-row"><input id="s-token" class="input" type="password" autocomplete="off" spellcheck="false" placeholder="sk-ant-oat01-…" aria-label="Token"><button class="btn primary sm" data-act="save-token">Kaydet</button>${i.tokenSet ? '<button class="btn ghost sm" data-act="clear-token">Kaldır</button>' : ''}</div></div></div>
      </div>
    </section>

    <section class="card set-card">
      <header class="set-head"><div class="set-icon">${ic('bell')}</div><div><h3>Bildirimler</h3><p>Pencere kapalıyken bile tepsi simgesinden Windows bildirimi gelir.</p></div></header>
      <div class="rows">${[['done', 'Görev tamamlandı'], ['timedDone', 'Süreli görev tamamlandı'], ['blocked', 'Görev takıldı veya motor hata verdi'], ['limit', 'Kullanım limiti doldu'], ['login', 'Giriş gerekli'], ['finished', 'Tüm görevler bitti']]
        .map(([k, l]) => toggleRow('notify.' + k, l, '', s.notify[k])).join('')}</div>
    </section>

    <section class="card set-card">
      <header class="set-head"><div class="set-icon">${ic('monitor')}</div><div><h3>Uygulama</h3><p>Görünüm ve Windows ile davranış.</p></div></header>
      <div class="rows">
        <div class="row"><div class="row-main"><div class="row-title">Tema</div></div>
          <div class="seg">${[['dark', 'moon', 'Koyu'], ['light', 'sun', 'Açık'], ['system', 'monitor', 'Sistem']].map(([v, icon, l]) => `<button class="seg-btn ${s.theme === v ? 'on' : ''}" data-act="theme" data-v="${v}">${ic(icon)}${l}</button>`).join('')}</div></div>
        ${toggleRow('minimizeToTray', 'Kapatınca tepsiye küçült', 'Pencereyi kapatınca uygulama tepside çalışmaya ve bildirim göndermeye devam eder.', s.minimizeToTray)}
        ${toggleRow('startWithWindows', 'Windows açılınca başlat', 'Oturum açınca tepside sessizce başlar.', s.startWithWindows)}
        <div class="row"><div class="row-main"><div class="row-title">Kısayol</div><div class="row-sub">Başlat menüsüne veya masaüstüne Claude Autopilot kısayolu ekler.</div></div>
          <div class="row-actions"><button class="btn xs ghost" data-act="shortcut" data-where="startmenu">Başlat menüsü</button><button class="btn xs ghost" data-act="shortcut" data-where="desktop">Masaüstü</button></div></div>
      </div>
    </section>

    <p class="about">Claude Autopilot ${esc(i.version || '')} · Ayarlar: <span class="mono">${esc(i.settingsDir || '')}</span> · Kısayollar: Ctrl+1…5 bölümler, Ctrl+N yeni görev</p>`;
}

/* ============================================================
   Karşılama (proje yokken)
   ============================================================ */
function welcome() {
  return `<div class="page"><div class="card welcome">
    <div class="welcome-mark">${LOGO}</div>
    <h1>Claude Autopilot'a hoş geldin</h1>
    <p>Görevlerini bir <code>TASKS.md</code> dosyasında topla; Claude arkada sırayla yapsın. Süre verdiğin görevlerde iş bitmiş gibi görünse bile süre dolana kadar kontrol edip geliştirmeye devam eder.</p>
    <div class="welcome-steps">
      <div class="step"><span>1</span><div><b>Proje klasörü seç</b><small>TASKS.md'nin olduğu ya da olacağı klasör</small></div></div>
      <div class="step"><span>2</span><div><b>Görev ekle</b><small>Kod, araştırma ya da kontrol; istersen süreli</small></div></div>
      <div class="step"><span>3</span><div><b>Motoru başlat</b><small>Limit dolarsa sıfırlanınca kendisi devam eder</small></div></div>
    </div>
    <button class="btn primary lg" data-act="add-project">${ic('folder')} Proje klasörü seç</button>
  </div></div>`;
}

/* ============================================================
   Gezinme
   ============================================================ */
const VIEWS = {
  dashboard: [mountDashboard, updateDashboard],
  tasks: [mountTasks, updateTasks],
  results: [mountResults, () => {}],
  logs: [mountLogs, () => { if (S.logOpen && isLiveLog(S.logOpen)) renderLogList(); }],
  settings: [mountSettings, () => {}],
};

function go(view) {
  S.view = view;
  $('#project-menu')?.remove();
  mountView();
  renderSidebar();
}

function mountView() {
  const root = $('#main');
  root.scrollTop = 0;
  if (!S.init.projects.length && S.view !== 'settings') { root.innerHTML = welcome(); return; }
  VIEWS[S.view][0](root);
  VIEWS[S.view][1]();
}

function updateAll() {
  renderSidebar();
  if (S.init.projects.length || S.view === 'settings') VIEWS[S.view][1]();
}

function applyTheme() {
  const t = S.init?.settings?.theme || 'dark';
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  Api.call('app.theme', { theme: dark ? 'dark' : 'light' }).catch(() => {});
}

async function afterProjectChange(info) {
  const before = S.init.settings.current;
  S.init = info;
  if (S.init.settings.current !== before) { resetProjectData(); S.state = null; await refreshState(); }
  renderSidebar();
  mountView();
}

/* ============================================================
   Eylemler (data-act)
   ============================================================ */
const call = (method, params, okMsg) => Api.call(method, params).then(r => { if (okMsg) toast(okMsg, 'ok'); return r; }).catch(e => { toast(e.message, 'err', 5000); throw e; });

const Actions = {
  nav: el => {
    go(el.dataset.view);
    if (el.dataset.anchor) setTimeout(() => document.getElementById(el.dataset.anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  },
  'new-task': () => { go('tasks'); setTimeout(() => $('#c-text')?.focus(), 30); },
  'filter-go': el => { S.filter = el.dataset.filter; go('tasks'); },
  filter: el => { S.filter = el.dataset.filter; updateTasks(); },

  'engine-start': async el => {
    busy(el, true);
    try { S.state = await call('engine.start', { project: project() }, 'Motor başlatıldı'); updateAll(); }
    catch { /* toast gösterildi */ }
    finally { busy(el, false); }
  },
  'engine-stop': async el => {
    if (!await confirmBox('Motor durdurulsun mu?', 'Şu anki tur yarıda kesilir. Süreli görevlerin süresi işlemeye devam eder; istediğin zaman yeniden başlatabilirsin.', 'Durdur', true)) return;
    busy(el, true);
    try { S.state = await call('engine.stop', { project: project() }, 'Motor durduruldu'); updateAll(); }
    catch { /* toast gösterildi */ }
    finally { busy(el, false); }
  },

  op: el => taskOp(+el.dataset.line, el.dataset.op, el.dataset.min ? { minutes: +el.dataset.min } : undefined, el),
  finish: async el => {
    const t = task(+el.dataset.line);
    if (!t) return;
    if (!await confirmBox('Süreli görev şimdi bitirilsin mi?', 'Sıradaki turda son kontrol yapılır, günlüğe özet yazılır ve görev kapanır.', 'Bitir')) return;
    taskOp(t.line, 'finish');
  },
  delete: async el => {
    const t = task(+el.dataset.line);
    if (!t) return;
    if (!await confirmBox('Görev silinsin mi?', t.text, 'Sil', true)) return;
    taskOp(t.line, 'delete');
  },
  edit: el => { const t = task(+el.dataset.line); if (t) editTask(t); },
  clone: el => {
    const t = task(+el.dataset.line);
    if (!t) return;
    S.composer = { ...S.composer, text: t.text, type: t.type };
    go('tasks');
    setTimeout(() => { const ta = $('#c-text'); if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } }, 30);
  },
  journal: el => openResultAnywhere(`sonuclar/gunluk-${el.dataset.id}.md`),
  'open-output': el => openOutput(el.dataset.path),

  'c-type': el => { S.composer.type = el.dataset.v; renderComposer(true); },
  'c-dur': el => {
    S.composer.duration = el.dataset.v;
    renderComposer(el.dataset.v !== 'custom');
    if (el.dataset.v === 'custom') setTimeout(() => $('#c-custom')?.focus(), 0);
  },
  'c-add': () => addTask(),

  'open-result': el => openResult(el.dataset.path),
  'reload-result': () => { if (S.resultOpen) openResult(S.resultOpen, true); },
  toc: el => $(`[data-toc="${el.dataset.i}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
  'open-file': el => call('shell.open', { project: project(), path: el.dataset.path }).catch(() => {}),
  reveal: el => call('shell.reveal', { project: project(), path: el.dataset.path }).catch(() => {}),
  'open-tasks-file': () => call('shell.open', { project: project(), path: 'TASKS.md' }).catch(() => {}),
  'open-log': el => openLog(el.dataset.name),
  'open-log-file': el => call('shell.open', { project: project(), path: `.autopilot/logs/${el.dataset.name}` }).catch(() => {}),
  url: el => call('shell.url', { url: el.dataset.url }).catch(() => {}),

  'project-menu': () => (S.init.projects.length ? toggleProjectMenu() : Actions['add-project']()),
  'select-project': async el => {
    $('#project-menu')?.remove();
    try { await afterProjectChange(await call('project.select', { path: el.dataset.path })); } catch { /* toast gösterildi */ }
  },
  'add-project': async () => {
    $('#project-menu')?.remove();
    try { await afterProjectChange(await call('project.add', {})); } catch { /* toast gösterildi */ }
  },
  'remove-project': async el => {
    if (!await confirmBox('Proje listeden kaldırılsın mı?', `${el.dataset.path}\n\nDosyalar silinmez, sadece uygulamanın listesinden çıkar.`, 'Kaldır', true)) return;
    try { await afterProjectChange(await call('project.remove', { path: el.dataset.path })); } catch { /* toast gösterildi */ }
  },
  'reveal-project': el => call('shell.open', { project: el.dataset.path, path: '' }).catch(() => {}),
  'pick-scripts': async () => {
    try { S.init = await call('scripts.pick', {}); renderSettings(); await refreshState(); } catch { /* toast gösterildi */ }
  },
  'open-rules': () => call('shell.scripts', { file: 'kurallar.md' }).catch(() => {}),

  'login-terminal': () => call('login.terminal', {}).then(() => toast("Terminal açıldı. Girişten sonra çıkan token'ı buraya yapıştır.", 'info', 6000)).catch(() => {}),
  'save-token': async el => {
    const input = $('#s-token');
    const v = input.value.trim();
    if (!v) { toast("Önce token'ı yapıştır.", 'warn'); input.focus(); return; }
    busy(el, true);
    try {
      const r = await call('token.set', { token: v });
      S.init.tokenSet = r.tokenSet;
      input.value = '';
      toast('Token kaydedildi. Motor bir sonraki başlatmada kullanır.', 'ok', 4500);
      renderSettings();
    } catch { /* toast gösterildi */ } finally { busy(el, false); }
  },
  'clear-token': async () => {
    if (!await confirmBox('Token kaldırılsın mı?', 'Motor bir sonraki başlatmada normal Claude oturumunu kullanmaya çalışır.', 'Kaldır', true)) return;
    try { const r = await call('token.set', { token: '' }, 'Token kaldırıldı'); S.init.tokenSet = r.tokenSet; renderSettings(); } catch { /* toast gösterildi */ }
  },
  theme: async el => {
    try { S.init = await call('settings.save', { theme: el.dataset.v }); applyTheme(); renderSettings(); } catch { /* toast gösterildi */ }
  },
  shortcut: el => call('app.shortcut', { where: el.dataset.where }, 'Kısayol oluşturuldu').catch(() => {}),
  'dismiss-banner': el => { store.set('dismiss:' + el.dataset.id, '1'); el.closest('.banner')?.remove(); },
};

/* ============================================================
   Olay dinleyicileri
   ============================================================ */
document.addEventListener('click', e => {
  // Rapor içindeki bağlantılar: web → tarayıcı, .md → uygulama içinde
  const a = e.target.closest('.prose a[href]');
  if (a) {
    e.preventDefault();
    const href = a.getAttribute('href');
    if (href.startsWith('#')) { document.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    Api.call('link.open', { project: project(), base: S.resultDoc?.path || '', href })
      .then(r => { if (r?.open) openResult(r.open); })
      .catch(err => toast(err.message, 'err'));
    return;
  }
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = Actions[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
});

document.addEventListener('change', async e => {
  const input = e.target.closest('input[data-setting]');
  if (!input) return;
  const key = input.dataset.setting, val = input.checked;
  if (key === 'fullAccess' && val) {
    const ok = await confirmBox('Tam yetki açılsın mı?', 'Motor, dosya silme dahil her komutu izin sormadan çalıştırır. Sadece git ile yedeklenen ve güvendiğin klasörlerde kullan. Motor bir sonraki başlatmada uygular.', 'Aç', true);
    if (!ok) { input.checked = false; return; }
  }
  const payload = key.startsWith('notify.') ? { notify: { [key.slice(7)]: val } } : { [key]: val };
  try {
    S.init = await Api.call('settings.save', payload);
    toast('Kaydedildi', 'ok', 1400);
    if (S.view === 'settings') renderSettings(); else updateAll();
  } catch (err) {
    input.checked = !val;
    toast(err.message, 'err');
  }
});

document.addEventListener('mousedown', e => {
  const m = $('#project-menu');
  if (m && !m.contains(e.target) && !e.target.closest('#sb-project')) m.remove();
});

document.addEventListener('scroll', e => { if (e.target.id === 'd-feed') e.target.dataset.touched = '1'; }, true);

document.addEventListener('keydown', e => {
  const tag = document.activeElement?.tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA';
  if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'n') { e.preventDefault(); Actions['new-task'](); }
  else if (e.ctrlKey && e.key === 'Enter' && document.activeElement?.id === 'c-text') { e.preventDefault(); addTask(); }
  else if (e.ctrlKey && /^[1-5]$/.test(e.key)) { e.preventDefault(); go(NAV[+e.key - 1].view); }
  else if (e.key === '/' && !typing) { const s = $('#t-search') || $('#r-search'); if (s) { e.preventDefault(); s.focus(); } }
  else if (e.key === 'Escape') $('#project-menu')?.remove();
});

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (S.init?.settings?.theme === 'system') applyTheme(); });

/* Geri sayım ve ilerleme: yeniden çizmeden her saniye güncellenir. */
setInterval(() => {
  const now = Date.now();
  $$('[data-end]').forEach(el => {
    const end = new Date(el.dataset.end).getTime();
    const cd = $('.cd-text', el);
    if (cd) cd.textContent = left(end - now);
    el.classList.toggle('overdue', end <= now);
    if (!el.dataset.start) return;
    const start = new Date(el.dataset.start).getTime();
    const p = clamp((now - start) / (end - start), 0, 1);
    $('.ring-fg', el)?.setAttribute('stroke-dashoffset', (100 - p * 100).toFixed(2));
    const bar = $('.bar > i', el);
    if (bar) bar.style.width = (p * 100).toFixed(2) + '%';
    const pct = $('.pct', el);
    if (pct) pct.textContent = Math.round(p * 100) + '%';
  });
}, 1000);

/* Uygulamadan gelen değişiklik olayları */
Api.on('tasks', scheduleRefresh);
Api.on('engine', scheduleRefresh);
Api.on('results', reloadResults);
Api.on('logs', () => {
  if (S.view === 'dashboard') pollLive();
  if (S.view === 'logs') { if (isLiveLog(S.logOpen)) pollLog(); reloadLogList(); }
});
// Olay kaçarsa diye yedek yoklama
setInterval(() => {
  if (document.hidden) return;
  if (S.view === 'dashboard') pollLive();
  if (S.view === 'logs' && isLiveLog(S.logOpen)) pollLog();
}, 4000);
setInterval(() => { if (!document.hidden) refreshState(); }, 20000);

/* ============================================================
   Açılış
   ============================================================ */
(async function boot() {
  try {
    S.init = await Api.call('app.init');
  } catch (e) {
    document.body.innerHTML = `<div class="fatal">Uygulama başlatılamadı: ${esc(e.message)}</div>`;
    document.body.classList.add('ready');
    return;
  }
  applyTheme();
  renderNav();
  if (project()) await refreshState();
  const startView = new URLSearchParams(location.search).get('view');
  go(VIEWS[startView] ? startView : 'dashboard');
  if (Api.isMock && !window.chrome?.webview) document.body.insertAdjacentHTML('beforeend', '<div class="mock-badge">Önizleme: örnek veriler gösteriliyor</div>');
  requestAnimationFrame(() => document.body.classList.add('ready'));
})();
