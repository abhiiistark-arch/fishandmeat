(function () {
  'use strict';

  var STORAGE_KEY = 'fam_mobile_session_v1';
  var state = {
    apiBase: '',
    token: '',
    admin: null,
    stores: [],
    catalog: { categories: [], products: [] },
    punchItems: [],
    lastConfirmed: [],
    lastCreatedUnitIds: [],
    printUnits: [],
    printSelected: {},
    scanner: null,
    lastScanAt: 0
  };

  function $(id) { return document.getElementById(id); }

  function toast(msg, isError) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.toggle('error', !!isError);
    el.classList.remove('hidden');
    setTimeout(function () { el.classList.add('hidden'); }, 2600);
  }

  function money(n) {
    return '₹' + Number(n || 0).toLocaleString('en-IN');
  }

  function normalizeBase(url) {
    return String(url || '').trim().replace(/\/+$/, '');
  }

  function isNativeOrStandalone() {
    try {
      if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function') {
        return window.Capacitor.isNativePlatform();
      }
    } catch (e) { /* ignore */ }
    return location.protocol === 'file:' ||
      (location.hostname === 'localhost' && location.pathname.indexOf('/mobile') !== 0);
  }

  function isSameOriginPwa() {
    return !isNativeOrStandalone() &&
      location.protocol.indexOf('http') === 0 &&
      location.pathname.indexOf('/mobile') === 0;
  }

  function saveSession() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        apiBase: state.apiBase,
        token: state.token,
        admin: state.admin
      }));
    } catch (e) { /* ignore */ }
  }

  function loadSession() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function clearSession() {
    state.token = '';
    state.admin = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  }

  async function api(path, opts) {
    opts = opts || {};
    if (!state.apiBase) throw new Error('Set your website / server URL first');
    var headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (state.token) headers.Authorization = 'Bearer ' + state.token;
    var res;
    try {
      res = await fetch(state.apiBase + path, Object.assign({}, opts, { headers: headers }));
    } catch (e) {
      throw new Error('No network / server connection. Check Wi‑Fi and server URL.');
    }
    var data = null;
    var ct = res.headers.get('content-type') || '';
    if (ct.indexOf('application/json') !== -1) data = await res.json();
    if (res.status === 401) {
      clearSession();
      showScreen('login');
      throw new Error((data && data.error) || 'Session expired — login again');
    }
    if (!res.ok) throw new Error((data && data.error) || 'Request failed');
    return data;
  }

  function showScreen(name) {
    document.querySelectorAll('.screen').forEach(function (el) {
      el.classList.remove('active');
    });
    var map = {
      splash: 'screen-splash',
      login: 'screen-login',
      home: 'screen-home',
      generate: 'screen-generate',
      print: 'screen-print',
      'punch-setup': 'screen-punch-setup',
      punch: 'screen-punch',
      'punch-done': 'screen-punch-done'
    };
    var id = map[name];
    if (id) $(id).classList.add('active');
    if (name !== 'punch') stopScanner();
    closeDrawer();
  }

  function openDrawer() {
    $('drawer').classList.add('open');
    $('drawer').setAttribute('aria-hidden', 'false');
  }

  function closeDrawer() {
    $('drawer').classList.remove('open');
    $('drawer').setAttribute('aria-hidden', 'true');
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function fillStoreSelect(sel, preferred) {
    sel.innerHTML = state.stores.map(function (s) {
      return '<option value="' + escapeHtml(s.id) + '">' + escapeHtml(s.name) + '</option>';
    }).join('') || '<option value="">No stores available</option>';
    var pick = preferred || (state.admin && state.admin.store_id) || '';
    if (pick) sel.value = pick;
    if (state.admin && state.admin.role !== 'Super Admin' && state.admin.store_id) {
      sel.value = state.admin.store_id;
      sel.disabled = true;
    } else {
      sel.disabled = false;
    }
  }

  function renderHome() {
    var admin = state.admin || {};
    $('welcome-name').textContent = 'Welcome, ' + (admin.name || 'Staff');
    $('home-role').textContent = (admin.role || '') +
      (admin.username ? ' · @' + admin.username : '');
    $('drawer-user').textContent = (admin.name || '') +
      (admin.role ? ' · ' + admin.role : '');
  }

  async function loadDashboard() {
    renderHome();
    var data = await api('/api/mobile/dashboard');
    var cards = data.cards || {};
    $('sales-cards').innerHTML = [
      { label: "Today's Sales", value: money(cards.today_sales) },
      { label: "Today's Orders", value: String(cards.today_orders || 0) },
      { label: 'Open Orders', value: String(cards.open_orders || 0) },
      { label: 'Delivered Today', value: String(cards.delivered_today || 0) },
      { label: 'Low Stock SKUs', value: String(cards.low_stock || 0) },
      { label: 'Stock Units', value: String(cards.total_stock_units || 0) }
    ].map(function (c, i) {
      return '<article class="stat-card" style="animation-delay:' + (i * 0.05) + 's">' +
        '<div class="label">' + c.label + '</div>' +
        '<div class="value">' + c.value + '</div></article>';
    }).join('');
  }

  async function loadStores() {
    state.stores = await api('/api/mobile/stores');
    fillStoreSelect($('punch-store'));
    fillStoreSelect($('gen-store'));
    fillStoreSelect($('print-store'));
  }

  async function loadCatalog() {
    state.catalog = await api('/api/mobile/catalog');
    $('gen-category').innerHTML =
      '<option value="">Select category</option>' +
      (state.catalog.categories || []).map(function (c) {
        return '<option value="' + escapeHtml(c.id) + '">' + escapeHtml(c.name) + '</option>';
      }).join('');
    $('gen-product').innerHTML = '<option value="">Select category first</option>';
  }

  function fillGenProducts() {
    var catId = $('gen-category').value;
    var sel = $('gen-product');
    if (!catId) {
      sel.innerHTML = '<option value="">Select category first</option>';
      return;
    }
    var list = (state.catalog.products || []).filter(function (p) {
      return p.category_id === catId;
    });
    sel.innerHTML = '<option value="">Select product</option>' + list.map(function (p) {
      return '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(p.name) +
        (p.sku ? ' · ' + escapeHtml(p.sku) : '') + '</option>';
    }).join('') || '<option value="">No products in this category</option>';
  }

  function productPrice(product, storeId, variantId) {
    var rows = (product && product.store_inventory) || [];
    var match = rows.find(function (r) {
      return r.store_id === storeId && (!variantId || r.variant_id === variantId) && Number(r.price || 0) > 0;
    }) || rows.find(function (r) {
      return r.store_id === storeId && Number(r.price || 0) > 0;
    });
    if (match) return Number(match.price || 0);
    return Number((product && product.price_min) || 0);
  }

  async function submitGeneratePrint() {
    var err = $('gen-error');
    err.textContent = '';
    var storeId = $('gen-store').value;
    var categoryId = $('gen-category').value;
    var productId = $('gen-product').value;
    var qty = Number($('gen-qty').value || 0);
    if (!storeId || !categoryId || !productId) {
      err.textContent = 'Store, category and product are all required.';
      return;
    }
    if (!qty || qty < 1 || Math.floor(qty) !== qty) {
      err.textContent = 'Enter a valid quantity (at least 1).';
      return;
    }
    var product = (state.catalog.products || []).find(function (p) { return p.id === productId; });
    if (!product) {
      err.textContent = 'Product not found.';
      return;
    }
    var variantId = (product.variants && product.variants[0] && product.variants[0].id) || 'v1';
    var btn = $('btn-gen-submit');
    btn.disabled = true;
    btn.textContent = 'Generating…';
    try {
      var result = await api('/api/mobile/qr-generate', {
        method: 'POST',
        body: JSON.stringify({
          store_id: storeId,
          category_id: categoryId,
          product_id: productId,
          variant_id: variantId,
          qty: qty,
          price: productPrice(product, storeId, variantId)
        })
      });
      var unitIds = result.created_unit_ids || [];
      toast((unitIds.length || result.units_created || qty) +
        ' QR(s) generated (pending — punch to add stock)');
      if (unitIds.length) {
        await downloadUnitPdf(unitIds, 'fam_generated_qr.pdf');
      }
      showScreen('home');
      try { await loadDashboard(); } catch (e) { /* ignore */ }
    } catch (e) {
      err.textContent = e.message || 'Could not generate QR codes';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Generate & Print';
    }
  }

  async function loadPrintUnits() {
    var storeId = $('print-store').value;
    if (!storeId) {
      $('print-list').innerHTML = '<p class="muted">Select a store.</p>';
      return;
    }
    $('print-list').innerHTML = '<p class="muted">Loading…</p>';
    try {
      var data = await api('/api/mobile/qr-units?store_id=' + encodeURIComponent(storeId));
      state.printUnits = data.items || [];
      state.printSelected = {};
      renderPrintList();
    } catch (e) {
      $('print-list').innerHTML = '<p class="error-text">' + escapeHtml(e.message) + '</p>';
    }
  }

  function filteredPrintUnits() {
    var q = ($('print-search').value || '').trim().toLowerCase();
    if (!q) return state.printUnits.slice();
    return state.printUnits.filter(function (u) {
      return (u.name || '').toLowerCase().indexOf(q) !== -1 ||
        (u.unit_serial || '').toLowerCase().indexOf(q) !== -1 ||
        (u.qr_code || '').toLowerCase().indexOf(q) !== -1 ||
        (u.sku || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  function renderPrintList() {
    var rows = filteredPrintUnits();
    var el = $('print-list');
    if (!rows.length) {
      el.innerHTML = '<p class="muted">No unique QR units for this store yet. Use Generate &amp; Print first.</p>';
      return;
    }
    el.innerHTML = rows.map(function (u) {
      var id = u.unit_id || u.id;
      var checked = state.printSelected[id] ? ' checked' : '';
      return '<label class="print-item">' +
        '<input type="checkbox" data-print-id="' + escapeHtml(id) + '"' + checked + ' />' +
        '<span><strong>' + escapeHtml(u.name) + '</strong>' +
        '<div class="code">Unique ' + escapeHtml(u.unit_serial || u.qr_uid || '') +
        (u.status ? ' · ' + escapeHtml(u.status) : '') +
        (u.created_at ? ' · ' + escapeHtml(String(u.created_at).slice(0, 16).replace('T', ' ')) : '') +
        '</div></span></label>';
    }).join('');
    el.querySelectorAll('[data-print-id]').forEach(function (cb) {
      cb.onchange = function () {
        var id = cb.getAttribute('data-print-id');
        if (cb.checked) state.printSelected[id] = true;
        else delete state.printSelected[id];
      };
    });
  }

  async function downloadUnitPdf(unitIds, filename) {
    if (!unitIds || !unitIds.length) throw new Error('Select at least one QR unit');
    var res = await fetch(state.apiBase + '/api/mobile/qr-print', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + state.token
      },
      body: JSON.stringify({ unit_ids: unitIds })
    });
    if (!res.ok) {
      var err = await res.json().catch(function () { return {}; });
      throw new Error(err.error || 'Could not build PDF');
    }
    var blob = await res.blob();
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename || 'fam_qr_codes.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('PDF downloaded — one unique QR per page');
  }

  async function downloadSelectedPrint() {
    var err = $('print-error');
    err.textContent = '';
    var ids = Object.keys(state.printSelected);
    if (!ids.length) {
      err.textContent = 'Select at least one QR unit.';
      return;
    }
    var btn = $('btn-print-download');
    btn.disabled = true;
    btn.textContent = 'Building PDF…';
    try {
      await downloadUnitPdf(ids, 'fam_qr_codes.pdf');
    } catch (e) {
      err.textContent = e.message || 'Download failed';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Download PDF';
    }
  }

  function renderPunchList() {
    $('punch-count').textContent = String(state.punchItems.length);
    var el = $('punch-list');
    if (!state.punchItems.length) {
      el.innerHTML = '<p class="muted">Scan one pending unit QR to punch into inventory.</p>';
      return;
    }
    var item = state.punchItems[0];
    el.innerHTML = '<div class="punch-item">' +
      '<div><strong>' + escapeHtml(item.name) + '</strong>' +
      (item.qr_uid ? '<div class="code">UID ' + escapeHtml(item.qr_uid) + '</div>' : '') +
      '<div class="code">' + escapeHtml(item.qr_code) + '</div>' +
      '<div class="muted">Ready to punch · +1 stock</div></div>' +
      '<button type="button" class="btn btn-outline" id="btn-punch-clear">Clear</button>' +
      '</div>';
    var clearBtn = $('btn-punch-clear');
    if (clearBtn) {
      clearBtn.onclick = function () {
        state.punchItems = [];
        renderPunchList();
      };
    }
  }

  async function onScan(decodedText) {
    var now = Date.now();
    if (now - state.lastScanAt < 900) return;
    state.lastScanAt = now;
    var code = String(decodedText || '').trim().toUpperCase();
    if (!code) return;
    if (state.punchItems.length) {
      if (state.punchItems[0].qr_code === code) {
        toast('Already selected — confirm to punch');
        return;
      }
      toast('Only one product at a time. Clear or confirm first.', true);
      return;
    }
    try {
      var storeId = $('punch-store').value;
      var row = await api('/api/mobile/qr-lookup?code=' + encodeURIComponent(code) +
        '&store_id=' + encodeURIComponent(storeId) + '&purpose=punch');
      state.punchItems = [{
        qr_code: row.qr_code || code,
        qr_uid: row.qr_uid || row.qr_serial || '',
        unit_id: row.unit_id || '',
        product_id: row.id,
        name: row.name,
        variant_id: row.preferred_variant_id,
        price: row.preferred_price,
        qty: 1
      }];
      renderPunchList();
      toast('Ready · ' + (row.name || code) + (row.qr_uid ? ' · ' + row.qr_uid : ''));
    } catch (e) {
      toast(e.message || 'Unknown QR', true);
    }
  }

  async function startScanner() {
    if (!window.Html5Qrcode) {
      toast('QR scanner library failed to load', true);
      return;
    }
    stopScanner();
    state.scanner = new Html5Qrcode('qr-reader');
    try {
      await state.scanner.start(
        { facingMode: 'environment' },
        { fps: 8, qrbox: { width: 240, height: 240 } },
        function (text) { onScan(text); },
        function () { /* ignore frame miss */ }
      );
    } catch (e) {
      toast('Camera permission denied or unavailable', true);
      showScreen('punch-setup');
    }
  }

  async function stopScanner() {
    if (!state.scanner) return;
    try {
      await state.scanner.stop();
      await state.scanner.clear();
    } catch (e) { /* ignore */ }
    state.scanner = null;
  }

  async function confirmPunch() {
    var err = $('punch-error');
    err.textContent = '';
    if (!state.punchItems.length) {
      err.textContent = 'Scan one pending QR before confirming.';
      return;
    }
    if (state.punchItems.length > 1) {
      err.textContent = 'Only one product can be punched at a time.';
      return;
    }
    var btn = $('btn-punch-confirm');
    btn.disabled = true;
    btn.textContent = 'Punching…';
    try {
      var snapshot = state.punchItems.slice(0, 1);
      var item = snapshot[0];
      var result = await api('/api/mobile/punch', {
        method: 'POST',
        body: JSON.stringify({
          store_id: $('punch-store').value,
          items: [{
            qr_code: item.qr_code,
            unit_id: item.unit_id,
            variant_id: item.variant_id,
            qty: 1,
            price: item.price
          }]
        })
      });
      state.lastConfirmed = snapshot;
      state.lastCreatedUnitIds = (result && result.created_unit_ids) || (item.unit_id ? [item.unit_id] : []);
      state.punchItems = [];
      renderPunchList();
      toast('Punched into inventory');
      await stopScanner();
      var updated = (result && result.updated && result.updated[0]) || {};
      $('punch-done-copy').textContent =
        'Unit moved to inventory · stock +1 · synced to admin, website & readers.';
      $('punch-done-summary').innerHTML =
        '<article class="stat-card"><div class="label">' +
        escapeHtml(updated.product_name || item.name || 'Item') +
        '</div><div class="value">+1</div>' +
        '<div class="code">Stock now: ' + escapeHtml(String(updated.stock != null ? updated.stock : '—')) + '</div>' +
        (updated.unit_serial || item.qr_uid
          ? '<div class="code">UID ' + escapeHtml(updated.unit_serial || item.qr_uid) + '</div>'
          : '') +
        '</article>';
      showScreen('punch-done');
    } catch (e) {
      err.textContent = e.message || 'Could not punch this QR';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Confirm Punch';
    }
  }

  async function downloadPunchPdf() {
    if (!state.lastConfirmed.length && !(state.lastCreatedUnitIds || []).length) {
      toast('Nothing to print', true);
      return;
    }
    var btn = $('btn-punch-print');
    btn.disabled = true;
    btn.textContent = 'Downloading…';
    try {
      if ((state.lastCreatedUnitIds || []).length) {
        await downloadUnitPdf(state.lastCreatedUnitIds, 'fam_punch_qr.pdf');
      } else {
        var res = await fetch(state.apiBase + '/api/mobile/qr-print', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + state.token
          },
          body: JSON.stringify({
            product_ids: state.lastConfirmed.map(function (i) { return i.product_id; }),
            qr_codes: state.lastConfirmed.map(function (i) { return i.qr_code; })
          })
        });
        if (!res.ok) {
          var err = await res.json().catch(function () { return {}; });
          throw new Error(err.error || 'Could not build PDF');
        }
        var blob = await res.blob();
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'fam_punch_qr.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast('QR PDF downloaded');
      }
    } catch (e) {
      toast(e.message || 'Download failed', true);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Print / Download QR PDF';
    }
  }

  async function requestAppPermissions() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return false;
    }
    try {
      var stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      stream.getTracks().forEach(function (t) { t.stop(); });
      return true;
    } catch (e) {
      toast('Camera permission is required for QR punching', true);
      return false;
    }
  }

  function prepareLoginForm() {
    var field = $('server-url-field');
    var input = $('login-server');
    var defaultUrl = normalizeBase(window.FAM_DEFAULT_API || window.FAM_API_URL || location.origin);
    if (isSameOriginPwa()) {
      field.classList.add('hidden');
      input.value = location.origin;
    } else {
      field.classList.remove('hidden');
      input.value = defaultUrl || '';
    }
  }

  async function login() {
    var err = $('login-error');
    err.textContent = '';
    var serverInput = ($('login-server').value || '').trim();
    state.apiBase = normalizeBase(
      isSameOriginPwa()
        ? location.origin
        : (serverInput || window.FAM_DEFAULT_API || window.FAM_API_URL || location.origin)
    );
    var username = ($('login-user').value || '').trim();
    var password = $('login-pass').value || '';
    if (!state.apiBase || !username || !password) {
      err.textContent = 'Server URL, username and password are required.';
      return;
    }
    var btn = $('login-submit');
    btn.disabled = true;
    btn.textContent = 'Connecting…';
    try {
      var res = await fetch(state.apiBase + '/api/mobile/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password })
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || 'Login failed');
      state.token = data.token;
      state.admin = data.admin;
      saveSession();
      await requestAppPermissions();
      showScreen('home');
      await loadDashboard();
      await loadStores();
      toast('Connected to Fish and Meat');
    } catch (e) {
      err.textContent = e.message || 'Could not reach the web application server';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  }

  function logout() {
    stopScanner();
    clearSession();
    state.punchItems = [];
    prepareLoginForm();
    showScreen('login');
  }

  async function openGenerate() {
    await loadStores();
    await loadCatalog();
    $('gen-error').textContent = '';
    $('gen-qty').value = '1';
    showScreen('generate');
  }

  async function openPrint() {
    await loadStores();
    $('print-error').textContent = '';
    $('print-search').value = '';
    showScreen('print');
    await loadPrintUnits();
  }

  function bind() {
    $('login-submit').onclick = login;
    $('btn-menu').onclick = openDrawer;
    $('drawer-backdrop').onclick = closeDrawer;
    $('btn-logout').onclick = logout;
    $('drawer-logout').onclick = logout;
    $('btn-go-generate').onclick = openGenerate;
    $('btn-go-print').onclick = openPrint;
    $('btn-go-punch').onclick = async function () {
      await loadStores();
      showScreen('punch-setup');
    };
    $('gen-category').onchange = fillGenProducts;
    $('btn-gen-submit').onclick = submitGeneratePrint;
    $('print-store').onchange = loadPrintUnits;
    $('print-search').oninput = renderPrintList;
    $('print-select-all').onclick = function () {
      filteredPrintUnits().forEach(function (u) {
        state.printSelected[u.unit_id || u.id] = true;
      });
      renderPrintList();
    };
    $('print-clear').onclick = function () {
      state.printSelected = {};
      renderPrintList();
    };
    $('btn-print-download').onclick = downloadSelectedPrint;
    $('btn-start-punch').onclick = async function () {
      if (!$('punch-store').value) {
        toast('Select a store first', true);
        return;
      }
      await requestAppPermissions();
      var store = state.stores.find(function (s) { return s.id === $('punch-store').value; });
      $('punch-store-label').textContent = (store && store.name) || 'Store';
      state.punchItems = [];
      renderPunchList();
      $('punch-error').textContent = '';
      showScreen('punch');
      await startScanner();
    };
    $('btn-punch-cancel').onclick = async function () {
      state.punchItems = [];
      await stopScanner();
      showScreen('punch-setup');
    };
    $('btn-punch-confirm').onclick = confirmPunch;
    $('btn-punch-print').onclick = downloadPunchPdf;
    $('btn-punch-home').onclick = async function () {
      showScreen('home');
      try { await loadDashboard(); } catch (e) { /* ignore */ }
    };
    document.querySelectorAll('.back-btn').forEach(function (btn) {
      btn.onclick = function () {
        var target = btn.getAttribute('data-back');
        if (target === 'home') showScreen('home');
        else if (target === 'punch-setup') showScreen('punch-setup');
      };
    });
    document.querySelectorAll('[data-nav]').forEach(function (btn) {
      btn.onclick = async function () {
        var nav = btn.getAttribute('data-nav');
        if (nav === 'home') {
          showScreen('home');
          try { await loadDashboard(); } catch (e) { toast(e.message, true); }
        } else if (nav === 'generate') {
          try { await openGenerate(); } catch (e) { toast(e.message, true); }
        } else if (nav === 'print') {
          try { await openPrint(); } catch (e) { toast(e.message, true); }
        } else if (nav === 'punch-setup') {
          try { await loadStores(); } catch (e) { toast(e.message, true); }
          showScreen('punch-setup');
        }
      };
    });
  }

  async function boot() {
    bind();
    prepareLoginForm();
    var saved = loadSession();
    state.apiBase = normalizeBase(
      (saved && saved.apiBase) || window.FAM_DEFAULT_API || window.FAM_API_URL || location.origin
    );
    if ($('login-server') && !isSameOriginPwa()) {
      $('login-server').value = state.apiBase;
    }
    setTimeout(async function () {
      if (saved && saved.token && state.apiBase) {
        state.token = saved.token;
        state.admin = saved.admin;
        try {
          var me = await api('/api/mobile/me');
          state.admin = me.admin;
          saveSession();
          await requestAppPermissions();
          showScreen('home');
          await loadDashboard();
          await loadStores();
          return;
        } catch (e) {
          clearSession();
        }
      }
      showScreen('login');
    }, 1400);
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
