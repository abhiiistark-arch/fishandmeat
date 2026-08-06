/* Deployed Fish and Meat website URL for standalone Capacitor / APK builds.
   PWA opened at https://YOUR-DOMAIN/mobile/ uses that origin automatically. */
(function () {
  var origin = (typeof location !== 'undefined' && location.origin) ? location.origin : '';
  // REQUIRED for APK: set your live site (HTTPS recommended)
  // window.FAM_API_URL = 'https://your-deployed-domain.com';
  window.FAM_DEFAULT_API = window.FAM_API_URL || origin || '';
})();
