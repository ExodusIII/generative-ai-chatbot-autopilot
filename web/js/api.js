/* Uygulama köprüsü: WebView2 içinde .NET tarafına mesaj gönderir; tarayıcıda açılırsa örnek verili önizlemeye düşer. */
'use strict';

const Api = (() => {
  // ?demo: uygulama içinde de örnek verilerle çalış (ekran görüntüsü ve tanıtım için)
  const demo = new URLSearchParams(location.search).has('demo');
  const wv = demo ? null : window.chrome && window.chrome.webview;
  const pending = new Map();
  const listeners = new Map();
  let seq = 0;

  if (wv) {
    wv.addEventListener('message', e => {
      const m = e.data;
      if (!m) return;
      if (m.id != null && pending.has(m.id)) {
        const { resolve, reject } = pending.get(m.id);
        pending.delete(m.id);
        if (m.ok) resolve(m.result);
        else reject(new Error(m.error || 'Bilinmeyen hata'));
      } else if (m.event) {
        (listeners.get(m.event) || []).forEach(fn => { try { fn(m.data); } catch (err) { console.error(err); } });
      }
    });
  }

  function call(method, params = {}) {
    if (!wv) return window.MockApi.call(method, params);
    return new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      wv.postMessage({ id, method, params });
    });
  }

  function on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, []);
    listeners.get(event).push(fn);
    if (!wv) window.MockApi.on(event, fn);
  }

  return { call, on, isMock: !wv };
})();
