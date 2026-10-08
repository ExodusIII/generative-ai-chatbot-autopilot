/* Örnek veri: tarayıcı önizlemesi ve uygulamanın --demo modu için. Gerçek dosyalara dokunmaz. */
'use strict';

window.MockApi = (() => {
  const M = 6e4, H = 36e5;
  const z = n => String(n).padStart(2, '0');
  const iso = t => { const d = new Date(t); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`; };
  const now = Date.now();
  const listeners = {};
  const emit = (e, d) => (listeners[e] || []).forEach(fn => fn(d));
  const clone = o => JSON.parse(JSON.stringify(o));
  const HOME = 'C:\\Users\\demo';
  const PROJECT = 'D:\\Projeler\\portfolio';

  const settings = {
    projects: [PROJECT, 'D:\\Projeler\\magaza-api'],
    current: PROJECT,
    scriptsDir: HOME + '\\AppData\\Local\\Programs\\ClaudeAutopilot\\autopilot',
    fullAccess: false,
    autoStartEngine: true,
    minimizeToTray: true,
    startWithWindows: false,
    theme: 'dark',
    notify: { done: true, timedDone: true, blocked: true, limit: true, login: true, finished: true },
  };
  let tokenSet = false;

  const engine = {
    running: true, pid: 4242, state: 'running', detail: 'tur #15, DÖNGÜ, kalan 27 saat 42 dk', since: iso(now - 3 * M),
    schedulerActive: false, schedulerInstalled: true, scriptsOk: true,
    current: {
      time: iso(now - 3 * M), action: 'DÖNGÜ', type: 'kod', round: 15, first: false, end: iso(now + 27.7 * H),
      task: 'Portfolyo sitesini geliştir: animasyonlar, yeni bölümler, mobil uyum ve performans',
      journal: PROJECT + '\\sonuclar\\gunluk-k7p2.md',
    },
  };

  let tasks = [
    { state: 'done', type: 'arastir', text: 'Küçük işletmeler için yapay zeka destekli tahsilat asistanı: pazar, rakipler ve fiyatlandırma', outputs: ['sonuclar/arastirma-tahsilat-asistani.md', 'sonuclar/arastirma-tahsilat-asistani.html'] },
    { state: 'done', type: 'kontrol', text: 'sonuclar/arastirma-tahsilat-asistani.md: iddiaları ve kaynakları doğrula', outputs: ['sonuclar/kontrol-tahsilat-asistani.md'] },
    { state: 'done', type: 'arastir', text: 'Açık bankacılık API sağlayıcıları: erişim koşulları ve entegrasyon süreleri', outputs: ['sonuclar/arastirma-acik-bankacilik.md'] },
    { state: 'done', type: 'kod', text: 'portfolio/: etkileşimli POS terminali demosu ve ISO 8583 mesaj çözücü', outputs: ['portfolio/', 'portfolio/index.html', 'portfolio/README.md'] },
    { state: 'running', type: 'kod', text: 'Portfolyo sitesini geliştir: animasyonlar, yeni bölümler, mobil uyum ve performans', start: iso(now - 20.3 * H), end: iso(now + 27.7 * H), round: 15, id: 'k7p2' },
    { state: 'running', type: 'arastir', text: 'Ödeme altyapısı sağlayıcılarını karşılaştır: komisyonlar, entegrasyon kolaylığı ve destek', start: iso(now - 2.2 * H), end: iso(now + 0.8 * H), round: 5, id: 'm3qx' },
    { state: 'open', type: 'kontrol', text: 'portfolio/: erişilebilirlik ve performans denetimi, mobil genişlikte görsel kontrol' },
    { state: 'open', type: '', text: "README'ye kurulum ve kullanım adımlarını ekle" },
    { state: 'open', type: 'arastir', text: 'Açık bankacılık düzenlemesindeki son değişiklikler ve ürüne etkisi', duration: '3 saat' },
    { state: 'blocked', type: 'kod', text: 'portfolio/: yazı tiplerini yerelde barındır', reason: 'woff2 indirme ağ izni gerektiriyor; komut izin listesinde değil' },
  ].map(t => ({ outputs: [], round: 0, next: false, ...t }));

  function reindex() {
    tasks.forEach((t, i) => { t.line = i + 4; t.raw = `raw-${i}`; t.next = false; });
    const next = tasks.find(t => t.state === 'open');
    if (next) next.next = true;
  }

  const projectsInfo = () => settings.projects.map(p => ({
    path: p, name: p === HOME ? 'Ana klasör' : p.split('\\').pop(), exists: true, hasTasks: p !== 'D:\\Projeler\\yeni-proje',
  }));

  const init = () => ({ version: '1.0.0', settings: clone(settings), projects: projectsInfo(), scriptsOk: true, pwsh: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe', tokenSet, settingsDir: HOME + '\\AppData\\Roaming\\ClaudeAutopilot', dark: true });

  function state() {
    reindex();
    const c = s => tasks.filter(t => t.state === s).length;
    const p = projectsInfo().find(x => x.path === settings.current);
    return { project: { path: p.path, name: p.name, exists: true, hasTasks: true }, tasks: clone(tasks), counts: { open: c('open'), running: c('running'), done: c('done'), blocked: c('blocked') }, engine: clone(engine), now: iso(Date.now()) };
  }

  const results = [
    { path: 'sonuclar/gunluk-k7p2.md', name: 'gunluk-k7p2.md', title: 'Günlük: Portfolyo sitesi (48 saat)', kind: 'journal', ext: 'md', size: 18422, modified: iso(now - 4 * M) },
    { path: 'sonuclar/arastirma-odeme-saglayicilari.md', name: 'arastirma-odeme-saglayicilari.md', title: 'Ödeme altyapısı sağlayıcıları karşılaştırması', kind: 'research', ext: 'md', size: 25610, modified: iso(now - 26 * M) },
    { path: 'sonuclar/arastirma-tahsilat-asistani.md', name: 'arastirma-tahsilat-asistani.md', title: 'Yapay zeka destekli tahsilat asistanı: pazar analizi', kind: 'research', ext: 'md', size: 48211, modified: iso(now - 20 * H) },
    { path: 'sonuclar/arastirma-tahsilat-asistani.html', name: 'arastirma-tahsilat-asistani.html', title: 'Tahsilat asistanı: görsel pano', kind: 'research', ext: 'html', size: 91822, modified: iso(now - 20 * H) },
    { path: 'sonuclar/kontrol-tahsilat-asistani.md', name: 'kontrol-tahsilat-asistani.md', title: 'Kontrol: tahsilat asistanı raporu', kind: 'check', ext: 'md', size: 14022, modified: iso(now - 18 * H) },
    { path: 'sonuclar/arastirma-acik-bankacilik.md', name: 'arastirma-acik-bankacilik.md', title: 'Açık bankacılık API sağlayıcıları', kind: 'research', ext: 'md', size: 31233, modified: iso(now - 30 * H) },
    { path: 'sonuclar/kontrol-acik-bankacilik.md', name: 'kontrol-acik-bankacilik.md', title: 'Kontrol: açık bankacılık raporu', kind: 'check', ext: 'md', size: 9120, modified: iso(now - 29 * H) },
    { path: 'sonuclar/notlar.md', name: 'notlar.md', title: 'Notlar', kind: 'other', ext: 'md', size: 812, modified: iso(now - 40 * H) },
  ];

  const research = `<h1>Ödeme altyapısı sağlayıcıları karşılaştırması</h1>
<h2 id="ozet">Özet</h2>
<ul><li>Karşılaştırılan <strong>6 sağlayıcının</strong> 4'ü kartlı ödemede benzer komisyon aralığında; fark, taksit ve iade süreçlerinde.</li>
<li>Hepsinde test ortamı var; belgeleri en eksiksiz olanlarda entegrasyon 1-2 günde tamamlanabiliyor.</li>
<li>Tekrarlayan ödeme (abonelik) desteği iki sağlayıcıda ek ücretli.</li></ul>
<h2 id="bulgular">Bulgular</h2>
<h3 id="tablo">Karşılaştırma</h3>
<table><thead><tr><th>Sağlayıcı</th><th>Kartlı ödeme</th><th>Abonelik</th><th>Kaynak</th></tr></thead><tbody>
<tr><td>Örnek Ödeme</td><td>%2,49 + sabit ücret</td><td>Var</td><td><a href="https://example.com/fiyat/1">fiyatlar</a></td></tr>
<tr><td>Kartlı Pay</td><td>%2,69</td><td>Ek ücretli</td><td><a href="https://example.com/fiyat/2">fiyatlar</a></td></tr>
<tr><td>Fintek Gateway</td><td>Pazarlıklı</td><td>Var</td><td><a href="https://example.com/fiyat/3">fiyatlar</a></td></tr>
</tbody></table>
<h3 id="entegrasyon">Entegrasyon</h3>
<p>Belgeleri en iyi olan iki sağlayıcı hazır SDK sunuyor; diğerlerinde istekleri imzalamak için <code>HMAC-SHA256</code> adımlarını elle yazmak gerekiyor.</p>
<blockquote><p>Not: Fiyatlar 1 Ekim 2026 itibarıyla sağlayıcıların herkese açık sayfalarından alındı.</p></blockquote>
<h2 id="kaynaklar">Kaynaklar</h2>
<ol><li><a href="https://example.com/kaynak-1">Örnek Ödeme: fiyatlandırma</a></li><li><a href="https://example.com/kaynak-2">Kartlı Pay: geliştirici belgeleri</a></li></ol>
<h2 id="acik-sorular">Açık sorular</h2>
<ul><li>Yüksek hacimde indirim koşulları sayfalarda yazmıyor; satış ekipleriyle doğrulanmalı.</li></ul>`;

  const journal = `<h1>Günlük: Portfolyo sitesi (48 saat)</h1>
<p><strong>Hedef:</strong> Animasyonlu, hızlı ve erişilebilir bir portfolyo sitesi; projeler, deneyim ve iletişim bölümleriyle.</p>
<h2 id="fikir">Fikir havuzu</h2>
<ul><li><input type="checkbox" disabled> Projeler için filtrelenebilir galeri</li><li><input type="checkbox" disabled> Karanlık/açık tema geçiş animasyonu</li><li><input type="checkbox" checked disabled> Etkileşimli POS terminali demosu</li></ul>
<h2 id="turlar">Tur kayıtları</h2>
<h3 id="tur-14">Tur 14 — 1 Ekim 14:05</h3>
<p><strong>Kontrol edilenler:</strong> mobil menü, proje kartları, sayfa yükleme süresi.<br><strong>Bulunan sorunlar:</strong> 860 px altında menü kapanmıyordu.<br><strong>Düzeltilenler:</strong> menü odak yönetimi, Esc ile kapanma.<br><strong>Eklenenler:</strong> giriş bölümüne parçacık animasyonu.</p>
<h3 id="tur-13">Tur 13 — 1 Ekim 13:38</h3>
<p><strong>Eklenenler:</strong> POS terminali demosunda EMV akış animasyonu.</p>`;

  const check = `<h1>Kontrol: tahsilat asistanı raporu</h1><h2 id="sonuc">Sonuç: KISMEN</h2><p>İddiaların çoğu kaynaklarla uyumlu; 3 rakam kaynak ifadesinden farklı aktarılmış.</p><h2 id="sorunlar">Sorunlar</h2><ol><li><strong>B2:</strong> Pazar büyüklüğü rakamı küresel veriye ait; Türkiye için ayrı kaynak gerekli.</li><li><strong>S7:</strong> Rakip fiyatının birincil kaynağı eksik.</li></ol><h2 id="oneriler">Öneriler</h2><p>Düzeltmeler için <code>[kod]</code> görevi açıldı.</p>`;

  const logs = [
    { name: 'tur-20261001-143210.log', started: iso(now - 3 * M), modified: iso(now - 5000), size: 182300, status: 'running' },
    { name: 'tur-20261001-140512.log', started: iso(now - 31 * M), modified: iso(now - 6 * M), size: 611230, status: 'success', minutes: 24.6, turns: 38, cost: 1.84, summary: 'Tur 14 tamam: giriş bölümüne parçacık animasyonu eklendi, mobil menü hatası düzeltildi → sonuclar/gunluk-k7p2.md' },
    { name: 'tur-20261001-133850.log', started: iso(now - 58 * M), modified: iso(now - 33 * M), size: 402003, status: 'success', minutes: 21.2, turns: 31, cost: 1.52, summary: 'Araştırma turu 4: 6 sağlayıcının fiyat sayfası doğrulandı, 2 ölü bağlantı değiştirildi' },
    { name: 'tur-20261001-091500.log', started: iso(now - 5.4 * H), modified: iso(now - 5.3 * H), size: 8200, status: 'limit', minutes: 3.1, turns: 4, summary: '5-hour limit reached ∙ resets 1pm' },
    { name: 'tur-20260930-220140.log', started: iso(now - 17 * H), modified: iso(now - 16.8 * H), size: 51200, status: 'error', minutes: 6.4, turns: 9, cost: 0.31, summary: 'Bash(docker build) izin listesinde olmadığı için çalıştırılamadı' },
    { name: 'tur-20260930-213005.log', started: iso(now - 17.5 * H), modified: iso(now - 17.3 * H), size: 30200, status: 'interrupted' },
    { name: 'tur-20260929-101500.log', started: iso(now - 52 * H), modified: iso(now - 51.6 * H), size: 2100, status: 'text', summary: 'Görev tamamlandı → sonuclar/arastirma-acik-bankacilik.md' },
  ];

  const script = [
    { t: 'init', name: 'claude-opus-5-5', detail: PROJECT },
    { t: 'text', text: 'Tur 15. Önce günlüğü okuyup son turda neler yapıldığına bakıyorum.' },
    { t: 'tool', id: 'a1', name: 'Read', detail: PROJECT + '\\sonuclar\\gunluk-k7p2.md' },
    { t: 'toolResult', id: 'a1', ok: true },
    { t: 'tool', id: 'a2', name: 'Read', detail: PROJECT + '\\portfolio\\js\\projects.js' },
    { t: 'toolResult', id: 'a2', ok: true },
    { t: 'text', text: 'Kontrol: proje kartlarındaki giriş animasyonu `prefers-reduced-motion` açıkken de çalışıyor. Bunu düzeltip fikir havuzundaki **filtrelenebilir galeri** maddesine geçeceğim.' },
    { t: 'tool', id: 'a3', name: 'Grep', detail: 'prefers-reduced-motion' },
    { t: 'toolResult', id: 'a3', ok: true },
    { t: 'tool', id: 'a4', name: 'Edit', detail: PROJECT + '\\portfolio\\css\\style.css' },
    { t: 'toolResult', id: 'a4', ok: true },
    { t: 'tool', id: 'a5', name: 'Bash', detail: 'npx html-validate portfolio/index.html' },
    { t: 'toolResult', id: 'a5', ok: false, text: 'Bu komut izin listesinde değil.' },
    { t: 'text', text: 'Doğrulayıcı çalıştırılamadı; HTML yapısını elle kontrol ediyorum.' },
    { t: 'tool', id: 'a6', name: 'Write', detail: PROJECT + '\\portfolio\\js\\gallery.js' },
    { t: 'toolResult', id: 'a6', ok: true },
    { t: 'tool', id: 'a7', name: 'Edit', detail: PROJECT + '\\portfolio\\index.html' },
    { t: 'toolResult', id: 'a7', ok: true },
    { t: 'tool', id: 'a8', name: 'WebSearch', detail: 'CSS grid masonry layout browser support 2026' },
    { t: 'toolResult', id: 'a8', ok: true },
    { t: 'tool', id: 'a9', name: 'Edit', detail: PROJECT + '\\sonuclar\\gunluk-k7p2.md' },
  ];
  const finished = [
    ...script.slice(0, 11),
    { t: 'result', ok: true, turns: 38, minutes: 24.6, cost: 1.84, text: 'Tur 14 tamam: giriş bölümüne parçacık animasyonu eklendi, mobil menü hatası düzeltildi. Günlük güncellendi → sonuclar/gunluk-k7p2.md' },
  ];

  const norm = d => {
    if (!d) return null;
    const m = /^\s*(\d+(?:[.,]\d+)?)\s*([a-zçğıöşü]*)\s*$/i.exec(d);
    if (!m) return d;
    const u = m[2].toLowerCase();
    return `${m[1]} ${/^(dk|dakika|m|min)$/.test(u) ? 'dakika' : /^(g|gün|gun|d)$/.test(u) ? 'gün' : /^(hafta|w)$/.test(u) ? 'hafta' : 'saat'}`;
  };
  const addMinutes = (s, m) => iso(new Date(s).getTime() + m * M);

  const handlers = {
    'app.init': () => init(),
    'app.theme': () => null,
    'app.shortcut': p => ({ path: p.where === 'desktop' ? HOME + '\\Desktop\\Claude Autopilot.lnk' : 'Başlat menüsü' }),
    'state.get': () => state(),
    'task.add': p => {
      tasks.push({ state: 'open', type: p.type || '', text: p.text, duration: norm(p.duration), outputs: [], round: 0 });
      if (p.start && !engine.running) Object.assign(engine, { running: true, state: 'running', detail: 'tur #1, NORMAL', since: iso(Date.now()) });
      return state();
    },
    'task.op': p => {
      reindex();
      const i = tasks.findIndex(t => t.line === p.line);
      if (i < 0) throw new Error('TASKS.md bu arada değişti. Liste yenilendi, tekrar dene.');
      const t = tasks[i];
      if (p.op === 'delete') tasks.splice(i, 1);
      if (p.op === 'retry') Object.assign(t, { state: 'open', reason: null });
      if (p.op === 'extend') t.end = addMinutes(new Date(t.end) < new Date() ? iso(Date.now()) : t.end, p.arg.minutes);
      if (p.op === 'finish') t.end = iso(Date.now());
      if (p.op === 'edit') Object.assign(t, { text: p.arg.text, type: p.arg.type, duration: norm(p.arg.duration) });
      if (p.op === 'up' || p.op === 'down') {
        const peers = tasks.filter(x => x.state === t.state);
        const j = peers.indexOf(t) + (p.op === 'up' ? -1 : 1);
        if (j >= 0 && j < peers.length) { const a = tasks.indexOf(t), b = tasks.indexOf(peers[j]); [tasks[a], tasks[b]] = [tasks[b], tasks[a]]; }
      }
      return state();
    },
    'engine.start': () => {
      Object.assign(engine, { running: true, state: 'starting', detail: 'Motor başlatılıyor…', since: iso(Date.now()) });
      setTimeout(() => { Object.assign(engine, { state: 'running', detail: 'tur #16, DÖNGÜ' }); emit('engine'); }, 1500);
      return state();
    },
    'engine.stop': () => { Object.assign(engine, { running: false, state: 'stopped', detail: 'uygulamadan durduruldu', since: iso(Date.now()) }); return state(); },
    'results.list': () => clone(results),
    'results.read': p => {
      const r = results.find(x => x.path === p.path) || { path: p.path, name: p.path.split('/').pop(), title: p.path.split('/').pop(), ext: 'md', size: 1200, modified: iso(now) };
      if (r.ext === 'html') return { ...r, kind: 'html' };
      const html = r.kind === 'journal' ? journal : r.kind === 'check' ? check : research.replace(/<h1>.*?<\/h1>/, `<h1>${r.title}</h1>`);
      return { ...r, kind: 'markdown', html, words: Math.round(r.size / 7) };
    },
    'logs.list': p => clone(logs.slice(0, p.max || 200)),
    'logs.read': p => {
      if (p.name !== logs[0].name) {
        const info = logs.find(l => l.name === p.name);
        if (info && info.status === 'text') return { events: [{ t: 'raw', text: 'Görevi okudum ve araştırmayı tamamladım.\n\nGörev tamamlandı → sonuclar/arastirma-acik-bankacilik.md' }], offset: 999, size: 999, format: 'text' };
        return p.offset ? { events: [], offset: p.offset, size: 999, format: 'json' } : { events: clone(finished), offset: 999, size: 999, format: 'json' };
      }
      const from = p.offset || 0;
      const to = from === 0 ? 12 : Math.min(script.length, from + 1);
      return { events: clone(script.slice(from, to)), offset: to, size: to, format: 'json' };
    },
    'shell.open': () => null, 'shell.reveal': () => null, 'shell.url': () => null, 'shell.scripts': () => null,
    'link.open': p => ({ open: p.href.endsWith('.md') ? p.href : null }),
    'project.add': () => { const p = 'D:\\Projeler\\yeni-proje'; if (!settings.projects.includes(p)) settings.projects.push(p); settings.current = p; return init(); },
    'project.remove': p => { settings.projects = settings.projects.filter(x => x !== p.path); if (settings.current === p.path) settings.current = settings.projects[0] || null; return init(); },
    'project.select': p => { settings.current = p.path; return init(); },
    'scripts.pick': () => init(),
    'settings.save': p => { const { notify, ...rest } = p; Object.assign(settings, rest); if (notify) Object.assign(settings.notify, notify); return init(); },
    'token.set': p => { tokenSet = !!(p.token && p.token.trim()); return { tokenSet }; },
    'login.terminal': () => null,
  };

  setInterval(() => emit('logs'), 2500);

  return {
    call(method, params) {
      return new Promise((resolve, reject) => setTimeout(() => {
        try {
          const h = handlers[method];
          if (!h) throw new Error('Bilinmeyen komut: ' + method);
          resolve(h(params || {}));
        } catch (e) { reject(e); }
      }, 60 + Math.random() * 120));
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
  };
})();
