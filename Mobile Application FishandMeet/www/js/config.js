/* APK / Capacitor: leave FAM_API_URL unset so login always asks for Website URL.
   PWA at https://YOUR-DOMAIN/mobile/ uses that origin automatically. */
(function () {
  var origin = (typeof location !== 'undefined' && location.origin) ? location.origin : '';
  // Do NOT hardcode production URL — staff enter it on the login screen.
  // window.FAM_API_URL = '';
  window.FAM_DEFAULT_API = window.FAM_API_URL || '';
  // Keep empty for APK so the field is blank; PWA fills from same-origin at runtime.
  if (origin && /localhost|127\.0\.0\.1/i.test(origin) === false && typeof location !== 'undefined' && location.protocol && location.protocol.indexOf('http') === 0) {
    // only used when opened as PWA / same-origin web
  }
})();
