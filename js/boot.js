/* Runs before CSS: old Android frames should never load optional visual work. */
(function () {
  var android = /Android\s+(\d+)/i.exec(navigator.userAgent || '');
  var forced = /(?:\?|&)lite=1(?:&|$)/.test(location.search);
  var lightweight = forced || Boolean(android && Number(android[1]) <= 9)
    || (navigator.deviceMemory > 0 && navigator.deviceMemory <= 2);
  window.MosaicoRuntime = Object.freeze({ lightweight: lightweight });
  if (lightweight) document.documentElement.classList.add('lightweight');

  // An interrupted startup gets a usable retry without touching saved widgets.
  window.setTimeout(function () {
    if (document.documentElement.dataset.mosaicoReady) return;
    var message = document.getElementById('startup-status');
    if (message) message.hidden = false;
  }, 8000);
  window.addEventListener('load', function () {
    if (!lightweight) {
      var fonts = document.createElement('link');
      fonts.rel = 'stylesheet';
      fonts.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap';
      document.head.appendChild(fonts);
    }
  });
}());
