/* ES5 gate: do not fetch dashboard CSS/modules until this engine passes. */
(function () {
  var VERSION = '20261105-fill4';
  var manual = /(?:\?|&)dashboard=1(?:&|$)/.test(location.search);
  var lite = /(?:\?|&)lite=1(?:&|$)/.test(location.search);
  var offline = /(?:\?|&)offline=1(?:&|$)/.test(location.search);
  var frameURL = './frame.html?v=' + VERSION + (offline ? '&offline=1' : '') + (lite ? '&lite=1' : '');
  function whenReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  function message(text) {
    whenReady(function () {
      var box = document.getElementById('entry-fallback');
      var label = document.getElementById('entry-message');
      var link = document.getElementById('entry-frame-link');
      if (box) box.hidden = false;
      if (label) label.textContent = text;
      if (link) link.href = frameURL;
    });
  }
  function supported() {
    try {
      var script = document.createElement('script');
      if (!('noModule' in script)) return false;
      // Modern syntax stays inside strings, so an old parser can run this gate.
      if (!new Function('const a={value:1}; const copy=()=>({...a}); let n=copy()?.value ?? 0; try {} catch {} for(const v of [1]){n+=v;} async function f(){await Promise.resolve(1);} return n===2 && 1_000===1000;')()) return false;
      if (new Function('return ' + String.fromCharCode(96) + 'probe' + String.fromCharCode(96))() !== 'probe') return false;
      if (typeof Promise !== 'function' || typeof Promise.prototype.finally !== 'function'
        || typeof fetch !== 'function' || typeof Map !== 'function' || typeof Set !== 'function'
        || typeof WeakMap !== 'function' || typeof URL !== 'function' || typeof URLSearchParams !== 'function') return false;
      if (new URLSearchParams({test:'1'}).get('test') !== '1') return false;
      if (typeof Object.entries !== 'function' || typeof Object.assign !== 'function'
        || typeof Object.freeze !== 'function' || typeof Array.from !== 'function'
        || typeof Array.prototype.includes !== 'function' || typeof Array.prototype.find !== 'function'
        || typeof Array.prototype.findIndex !== 'function' || typeof String.prototype.padStart !== 'function'
        || typeof Number.isFinite !== 'function') return false;
      var node = document.createElement('div');
      var dialog = document.createElement('dialog');
      if (typeof node.append !== 'function' || typeof node.replaceChildren !== 'function'
        || typeof node.closest !== 'function' || typeof node.scrollTo !== 'function'
        || typeof node.scrollIntoView !== 'function' || !('isConnected' in node)
        || !node.classList || !node.dataset || !document.documentElement.dataset
        || typeof document.querySelectorAll('body').forEach !== 'function'
        || typeof dialog.showModal !== 'function' || typeof dialog.close !== 'function') return false;
      if (typeof FormData !== 'function' || typeof Blob !== 'function' || typeof File !== 'function'
        || typeof File.prototype.text !== 'function' || typeof window.matchMedia !== 'function') return false;
      if (!window.CSS || typeof window.CSS.supports !== 'function' || typeof window.CSS.escape !== 'function'
        || !window.CSS.supports('display','grid')
        || !window.CSS.supports('width','min(1024px,100vw)')
        || !window.CSS.supports('height','min(640px,100vh)')) return false;
      return true;
    } catch (error) { return false; }
  }
  if (!supported()) {
    if (manual) message('Este motor no admite las funciones del dashboard. Abre la vista para el marco; tus datos permanecen intactos.');
    else {
      try { location.replace(frameURL); }
      catch (error) { message('Abre la vista para el marco para continuar. Tus datos permanecen intactos.'); }
    }
    return;
  }
  try {
    var android = /Android\s+(\d+)/i.exec(navigator.userAgent || '');
    var lightweight = lite || Boolean(android && Number(android[1]) <= 9)
      || (navigator.deviceMemory > 0 && navigator.deviceMemory <= 2);
    window.MosaicoRuntime = Object.freeze({lightweight:lightweight, entryVersion:VERSION});
    if (lightweight) document.documentElement.classList.add('lightweight');
    var cssReady = false, domReady = false, started = false;
    function start() {
      if (!cssReady || !domReady || started) return;
      started = true;
      document.getElementById('dashboard-root').hidden = false;
      var entry = document.createElement('script');
      entry.type = 'module';
      entry.src = './js/app.js?v=' + VERSION;
      entry.onerror = function () { message('No se pudo iniciar el dashboard. Abre la vista para el marco; tus datos guardados se conservan.'); };
      entry.onload = function () {
        if (document.documentElement.getAttribute('data-mosaico-ready') !== 'true') return;
        document.getElementById('entry-fallback').hidden = true;
        if (!lightweight) {
          var fonts = document.createElement('link');
          fonts.rel = 'stylesheet';
          fonts.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap';
          document.head.appendChild(fonts);
        }
      };
      document.body.appendChild(entry);
    }
    whenReady(function () { domReady = true; start(); });
    var css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = './style.css?v=' + VERSION;
    css.onload = function () { cssReady = true; start(); };
    css.onerror = function () { message('No se pudo cargar el dashboard. Abre la vista para el marco.'); };
    document.head.appendChild(css);
    var favicon = document.createElement('link');
    favicon.rel = 'icon'; favicon.href = './assets/favicon.svg'; favicon.type = 'image/svg+xml';
    document.head.appendChild(favicon);
    setTimeout(function () {
      if (document.documentElement.getAttribute('data-mosaico-ready') !== 'true') {
        message('No pudimos iniciar Mosaico. Abre la vista para el marco; tus datos guardados se conservan.');
        var recovery = document.getElementById('startup-status');
        if (recovery) recovery.hidden = false;
      }
    }, 8000);
  } catch (error) {
    message('No se pudo iniciar Mosaico. Abre la vista para el marco; tus datos guardados se conservan.');
  }
}());
