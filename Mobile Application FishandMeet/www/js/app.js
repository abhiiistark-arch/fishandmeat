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
    billScanner: null,
    lastScanAt: 0,
    billCatalog: { categories: [], products: [] },
    billCategoryId: '',
    billCart: [],
    lastBill: null,
    inventoryRows: [],
    editingInv: null,
    catalogCategoryId: ''
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
      'punch-done': 'screen-punch-done',
      'billing-setup': 'screen-billing-setup',
      billing: 'screen-billing',
      'billing-scan': 'screen-billing-scan',
      'billing-done': 'screen-billing-done',
      'billing-recent': 'screen-billing-recent',
      inventory: 'screen-inventory',
      'inventory-edit': 'screen-inventory-edit',
      catalog: 'screen-catalog'
    };
    var id = map[name];
    if (id) $(id).classList.add('active');
    if (name !== 'punch') stopScanner();
    if (name !== 'billing-scan') stopBillScanner();
    closeDrawer();
  }

  function canManageInventory() {
    var role = (state.admin && state.admin.role) || '';
    return role === 'Super Admin' || role === 'Store Admin';
  }

  function applyRoleUi() {
    var invBtn = $('btn-go-inventory');
    var navInv = $('nav-inventory');
    var showInv = canManageInventory();
    if (invBtn) invBtn.classList.toggle('hidden', !showInv);
    if (navInv) navInv.classList.toggle('hidden', !showInv);
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
    applyRoleUi();
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
    ['punch-store', 'gen-store', 'print-store', 'bill-store', 'inv-store', 'cat-store'].forEach(function (id) {
      if ($(id)) fillStoreSelect($(id));
    });
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
      toast('Camera permission is required for QR scanning', true);
      return false;
    }
  }

  function cartKey(line) {
    return line.unit_id ? ('unit|' + line.unit_id) : (line.product_id + '|' + line.variant_id);
  }

  function billSubtotal() {
    return state.billCart.reduce(function (sum, line) {
      return sum + Number(line.price || 0) * Number(line.qty || 0);
    }, 0);
  }

  function renderBillCart() {
    var el = $('bill-cart');
    if (!state.billCart.length) {
      el.innerHTML = '<p class="muted">Add products or scan an in-stock QR.</p>';
    } else {
      el.innerHTML = state.billCart.map(function (line, idx) {
        return '<div class="bill-line">' +
          '<div><strong>' + escapeHtml(line.name) + '</strong>' +
          '<div class="code">' + escapeHtml(line.variant_label || '') +
          (line.unit_serial ? ' · UID ' + escapeHtml(line.unit_serial) : '') +
          ' · ' + money(line.price) + '</div></div>' +
          '<div class="bill-line-actions">' +
          (line.unit_id
            ? '<span class="pill">×1</span>'
            : '<button type="button" class="btn btn-sm btn-outline" data-bill-dec="' + idx + '">−</button>' +
              '<span class="pill">' + line.qty + '</span>' +
              '<button type="button" class="btn btn-sm btn-outline" data-bill-inc="' + idx + '">+</button>') +
          '<button type="button" class="btn btn-sm btn-outline" data-bill-rm="' + idx + '">✕</button>' +
          '</div></div>';
      }).join('');
      el.querySelectorAll('[data-bill-inc]').forEach(function (btn) {
        btn.onclick = function () {
          var i = Number(btn.getAttribute('data-bill-inc'));
          var line = state.billCart[i];
          if (!line || line.unit_id) return;
          if (line.qty >= line.max_stock) {
            toast('Only ' + line.max_stock + ' in stock', true);
            return;
          }
          line.qty += 1;
          renderBillCart();
        };
      });
      el.querySelectorAll('[data-bill-dec]').forEach(function (btn) {
        btn.onclick = function () {
          var i = Number(btn.getAttribute('data-bill-dec'));
          var line = state.billCart[i];
          if (!line || line.unit_id) return;
          line.qty -= 1;
          if (line.qty < 1) state.billCart.splice(i, 1);
          renderBillCart();
        };
      });
      el.querySelectorAll('[data-bill-rm]').forEach(function (btn) {
        btn.onclick = function () {
          state.billCart.splice(Number(btn.getAttribute('data-bill-rm')), 1);
          renderBillCart();
        };
      });
    }
    var sub = billSubtotal();
    var discount = Math.max(0, Math.min(Number($('bill-discount').value || 0), sub));
    $('bill-subtotal').textContent = money(sub);
    $('bill-total').textContent = money(sub - discount);
  }

  function addBillLine(line) {
    var key = cartKey(line);
    var existing = state.billCart.find(function (x) { return cartKey(x) === key; });
    if (existing) {
      if (line.unit_id) {
        toast('This QR is already in the cart');
        return;
      }
      if (existing.qty >= existing.max_stock) {
        toast('Only ' + existing.max_stock + ' in stock', true);
        return;
      }
      existing.qty += 1;
    } else {
      state.billCart.push(line);
    }
    renderBillCart();
    toast('Added · ' + line.name);
  }

  function renderBillProducts() {
    var q = ($('bill-search').value || '').trim().toLowerCase();
    var cat = state.billCategoryId;
    var products = (state.billCatalog.products || []).filter(function (p) {
      if (cat && p.category_id !== cat) return false;
      if (!q) return true;
      return (p.name || '').toLowerCase().indexOf(q) !== -1 ||
        (p.sku || '').toLowerCase().indexOf(q) !== -1;
    });
    var el = $('bill-products');
    if (!products.length) {
      el.innerHTML = '<p class="muted">No in-stock products for this filter.</p>';
      return;
    }
    el.innerHTML = products.map(function (p) {
      return '<div class="list-card">' +
        '<div><strong>' + escapeHtml(p.name) + '</strong>' +
        (p.sku ? '<div class="code">' + escapeHtml(p.sku) + '</div>' : '') +
        '</div>' +
        (p.variants || []).map(function (v) {
          return '<button type="button" class="btn btn-sm btn-outline bill-add-btn" ' +
            'data-pid="' + escapeHtml(p.id) + '" data-vid="' + escapeHtml(v.variant_id) + '">' +
            escapeHtml(v.variant_label) + ' · ' + money(v.price) + ' · stock ' + v.stock +
            '</button>';
        }).join('') +
        '</div>';
    }).join('');
    el.querySelectorAll('.bill-add-btn').forEach(function (btn) {
      btn.onclick = function () {
        var pid = btn.getAttribute('data-pid');
        var vid = btn.getAttribute('data-vid');
        var product = (state.billCatalog.products || []).find(function (p) { return p.id === pid; });
        var variant = product && (product.variants || []).find(function (v) { return v.variant_id === vid; });
        if (!product || !variant) return;
        addBillLine({
          product_id: product.id,
          variant_id: variant.variant_id,
          name: product.name,
          variant_label: variant.variant_label,
          price: variant.price,
          qty: 1,
          max_stock: variant.stock,
          unit_id: '',
          unit_serial: ''
        });
      };
    });
  }

  function renderBillCategories() {
    var cats = state.billCatalog.categories || [];
    $('bill-cats').innerHTML =
      '<button type="button" class="chip' + (!state.billCategoryId ? ' active' : '') + '" data-cat="">All</button>' +
      cats.map(function (c) {
        return '<button type="button" class="chip' +
          (state.billCategoryId === c.id ? ' active' : '') +
          '" data-cat="' + escapeHtml(c.id) + '">' + escapeHtml(c.name) + '</button>';
      }).join('');
    $('bill-cats').querySelectorAll('[data-cat]').forEach(function (btn) {
      btn.onclick = function () {
        state.billCategoryId = btn.getAttribute('data-cat') || '';
        renderBillCategories();
        renderBillProducts();
      };
    });
  }

  async function openBillingSetup() {
    await loadStores();
    showScreen('billing-setup');
  }

  async function startBilling() {
    var storeId = $('bill-store').value;
    if (!storeId) {
      toast('Select a store first', true);
      return;
    }
    var store = state.stores.find(function (s) { return s.id === storeId; });
    $('bill-store-label').textContent = (store && store.name) || 'Store';
    state.billCart = [];
    state.billCategoryId = '';
    $('bill-customer-name').value = '';
    $('bill-customer-phone').value = '';
    $('bill-discount').value = '0';
    $('bill-notes').value = '';
    $('bill-payment').value = 'cash';
    $('bill-error').textContent = '';
    state.billCatalog = await api('/api/mobile/pos/catalog?store_id=' + encodeURIComponent(storeId));
    renderBillCategories();
    renderBillProducts();
    renderBillCart();
    showScreen('billing');
  }

  async function stopBillScanner() {
    if (!state.billScanner) return;
    try {
      await state.billScanner.stop();
      await state.billScanner.clear();
    } catch (e) { /* ignore */ }
    state.billScanner = null;
  }

  async function onBillScan(decodedText) {
    var now = Date.now();
    if (now - state.lastScanAt < 900) return;
    state.lastScanAt = now;
    var code = String(decodedText || '').trim().toUpperCase();
    if (!code) return;
    var err = $('bill-scan-error');
    err.textContent = '';
    try {
      var storeId = $('bill-store').value;
      var row = await api('/api/mobile/qr-lookup?code=' + encodeURIComponent(code) +
        '&store_id=' + encodeURIComponent(storeId) + '&purpose=sale');
      addBillLine({
        product_id: row.product_id || row.id,
        variant_id: row.variant_id || row.preferred_variant_id,
        name: row.name,
        variant_label: '',
        price: row.preferred_price,
        qty: 1,
        max_stock: 1,
        unit_id: row.unit_id || '',
        unit_serial: row.qr_uid || row.qr_serial || ''
      });
      await stopBillScanner();
      showScreen('billing');
    } catch (e) {
      err.textContent = e.message || 'Could not use this QR';
      toast(e.message || 'Unknown QR', true);
    }
  }

  async function startBillScanner() {
    await requestAppPermissions();
    showScreen('billing-scan');
    $('bill-scan-error').textContent = '';
    if (!window.Html5Qrcode) {
      toast('QR scanner library failed to load', true);
      return;
    }
    await stopBillScanner();
    state.billScanner = new Html5Qrcode('bill-qr-reader');
    try {
      await state.billScanner.start(
        { facingMode: 'environment' },
        { fps: 8, qrbox: { width: 240, height: 240 } },
        function (text) { onBillScan(text); },
        function () { /* ignore */ }
      );
    } catch (e) {
      toast('Camera permission denied or unavailable', true);
      showScreen('billing');
    }
  }

  async function checkoutBill() {
    var err = $('bill-error');
    err.textContent = '';
    if (!state.billCart.length) {
      err.textContent = 'Add at least one item.';
      return;
    }
    var btn = $('btn-bill-checkout');
    btn.disabled = true;
    btn.textContent = 'Billing…';
    try {
      var payload = {
        store_id: $('bill-store').value,
        customer_name: ($('bill-customer-name').value || '').trim() || 'Walk-in Customer',
        customer_phone: ($('bill-customer-phone').value || '').trim(),
        payment_method: $('bill-payment').value || 'cash',
        discount: Number($('bill-discount').value || 0),
        notes: ($('bill-notes').value || '').trim(),
        items: state.billCart.map(function (line) {
          var item = {
            product_id: line.product_id,
            variant_id: line.variant_id,
            qty: line.qty
          };
          if (line.unit_id) {
            item.unit_id = line.unit_id;
            item.unit_ids = [line.unit_id];
          }
          return item;
        })
      };
      var result = await api('/api/mobile/pos/orders', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      state.lastBill = result.order;
      state.billCart = [];
      $('bill-done-copy').textContent =
        'Sale complete · stock deducted · synced to admin & website.';
      $('bill-done-summary').innerHTML =
        '<article class="stat-card"><div class="label">Bill</div><div class="value">' +
        escapeHtml((result.order && result.order.order_id) || '') +
        '</div></article>' +
        '<article class="stat-card"><div class="label">Total</div><div class="value">' +
        money(result.order && result.order.total) +
        '</div></article>' +
        '<article class="stat-card"><div class="label">Payment</div><div class="value">' +
        escapeHtml(((result.order && result.order.payment_method) || 'cash').toUpperCase()) +
        '</div></article>';
      showScreen('billing-done');
      toast('Bill created');
    } catch (e) {
      err.textContent = e.message || 'Could not complete sale';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Complete Sale';
    }
  }

  async function downloadBillInvoice() {
    if (!state.lastBill) {
      toast('No bill to download', true);
      return;
    }
    var btn = $('btn-bill-invoice');
    btn.disabled = true;
    btn.textContent = 'Downloading…';
    try {
      var orderKey = state.lastBill.order_id || state.lastBill.id;
      var res = await fetch(state.apiBase + '/api/mobile/pos/invoice/' + encodeURIComponent(orderKey), {
        headers: { Authorization: 'Bearer ' + state.token }
      });
      if (!res.ok) {
        var err = await res.json().catch(function () { return {}; });
        throw new Error(err.error || 'Could not download invoice');
      }
      var blob = await res.blob();
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'invoice_' + orderKey + '.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast('Invoice downloaded');
    } catch (e) {
      toast(e.message || 'Download failed', true);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Download Invoice PDF';
    }
  }

  async function openRecentBills() {
    await loadStores();
    var storeId = $('bill-store').value;
    var url = '/api/mobile/pos/orders?limit=20';
    if (storeId) url += '&store_id=' + encodeURIComponent(storeId);
    var orders = await api(url);
    var el = $('bill-recent-list');
    if (!orders.length) {
      el.innerHTML = '<p class="muted">No recent in-store bills.</p>';
    } else {
      el.innerHTML = orders.map(function (o) {
        return '<div class="list-card">' +
          '<div><strong>' + escapeHtml(o.order_id) + '</strong>' +
          '<div class="code">' + escapeHtml(o.customer_name || 'Walk-in') +
          ' · ' + escapeHtml(o.store_name || '') +
          ' · ' + escapeHtml(String(o.created_at || '').slice(0, 16).replace('T', ' ')) +
          '</div></div>' +
          '<div class="value">' + money(o.total) + '</div></div>';
      }).join('');
    }
    showScreen('billing-recent');
  }

  async function openInventory() {
    if (!canManageInventory()) {
      toast('Inventory edit is for Super / Store Admin', true);
      return;
    }
    await loadStores();
    showScreen('inventory');
    await loadInventoryRows();
  }

  async function loadInventoryRows() {
    var storeId = $('inv-store').value;
    $('inv-error').textContent = '';
    $('inv-list').innerHTML = '<p class="muted">Loading…</p>';
    try {
      var url = '/api/mobile/inventory';
      if (storeId) url += '?store_id=' + encodeURIComponent(storeId);
      state.inventoryRows = await api(url);
      renderInventoryList();
    } catch (e) {
      $('inv-list').innerHTML = '';
      $('inv-error').textContent = e.message || 'Could not load inventory';
    }
  }

  function renderInventoryList() {
    var q = ($('inv-search').value || '').trim().toLowerCase();
    var rows = state.inventoryRows.filter(function (r) {
      if (!q) return true;
      return (r.product_name || '').toLowerCase().indexOf(q) !== -1 ||
        (r.sku || '').toLowerCase().indexOf(q) !== -1 ||
        (r.variant_label || '').toLowerCase().indexOf(q) !== -1 ||
        (r.category_name || '').toLowerCase().indexOf(q) !== -1;
    });
    var el = $('inv-list');
    if (!rows.length) {
      el.innerHTML = '<p class="muted">No inventory rows.</p>';
      return;
    }
    el.innerHTML = rows.map(function (r) {
      return '<button type="button" class="list-card clickable" data-inv="' + escapeHtml(r.id) + '">' +
        '<div><strong>' + escapeHtml(r.product_name || 'Product') + '</strong>' +
        '<div class="code">' + escapeHtml(r.category_name || '') +
        (r.variant_label ? ' · ' + escapeHtml(r.variant_label) : '') +
        (r.sku ? ' · ' + escapeHtml(r.sku) : '') +
        (r.low_stock ? ' · LOW' : '') +
        '</div></div>' +
        '<div class="value">' + money(r.price) + '<div class="code">Stock ' +
        escapeHtml(String(r.stock || 0)) + '</div></div></button>';
    }).join('');
    el.querySelectorAll('[data-inv]').forEach(function (btn) {
      btn.onclick = function () {
        openInventoryEdit(btn.getAttribute('data-inv'));
      };
    });
  }

  function openInventoryEdit(invId) {
    var row = state.inventoryRows.find(function (r) { return r.id === invId; });
    if (!row) return;
    state.editingInv = row;
    $('inv-edit-title').textContent = row.product_name || 'Item';
    $('inv-edit-meta').textContent =
      (row.store_name || '') + ' · ' + (row.variant_label || '—') +
      (row.sku ? ' · ' + row.sku : '');
    $('inv-edit-price').value = String(row.price || 0);
    $('inv-edit-stock').value = String(row.stock || 0);
    $('inv-edit-add').value = '0';
    $('inv-edit-error').textContent = '';
    showScreen('inventory-edit');
  }

  async function saveInventoryEdit() {
    if (!state.editingInv) return;
    var err = $('inv-edit-error');
    err.textContent = '';
    var btn = $('btn-inv-save');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      var price = Number($('inv-edit-price').value);
      var stock = Number($('inv-edit-stock').value);
      var addQty = Number($('inv-edit-add').value || 0);
      await api('/api/mobile/inventory/' + encodeURIComponent(state.editingInv.id), {
        method: 'PUT',
        body: JSON.stringify({ price: price, stock: stock })
      });
      if (addQty > 0) {
        await api('/api/mobile/inventory', {
          method: 'POST',
          body: JSON.stringify({ inventory_id: state.editingInv.id, quantity: addQty })
        });
      }
      toast('Inventory updated');
      showScreen('inventory');
      await loadInventoryRows();
    } catch (e) {
      err.textContent = e.message || 'Save failed';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save';
    }
  }

  async function openCatalogBrowse() {
    await loadStores();
    await loadCatalog();
    state.catalogCategoryId = '';
    $('cat-search').value = '';
    renderCatalogBrowse();
    showScreen('catalog');
  }

  function renderCatalogBrowse() {
    var storeId = $('cat-store').value;
    var cats = state.catalog.categories || [];
    $('cat-chips').innerHTML =
      '<button type="button" class="chip' + (!state.catalogCategoryId ? ' active' : '') + '" data-ccat="">All</button>' +
      cats.map(function (c) {
        return '<button type="button" class="chip' +
          (state.catalogCategoryId === c.id ? ' active' : '') +
          '" data-ccat="' + escapeHtml(c.id) + '">' + escapeHtml(c.name) + '</button>';
      }).join('');
    $('cat-chips').querySelectorAll('[data-ccat]').forEach(function (btn) {
      btn.onclick = function () {
        state.catalogCategoryId = btn.getAttribute('data-ccat') || '';
        renderCatalogBrowse();
      };
    });
    var q = ($('cat-search').value || '').trim().toLowerCase();
    var products = (state.catalog.products || []).filter(function (p) {
      if (state.catalogCategoryId && p.category_id !== state.catalogCategoryId) return false;
      if (!q) return true;
      return (p.name || '').toLowerCase().indexOf(q) !== -1 ||
        (p.sku || '').toLowerCase().indexOf(q) !== -1;
    });
    var el = $('cat-list');
    if (!products.length) {
      el.innerHTML = '<p class="muted">No products.</p>';
      return;
    }
    el.innerHTML = products.map(function (p) {
      var rows = (p.store_inventory || []).filter(function (r) {
        return !storeId || r.store_id === storeId;
      });
      var stock = rows.reduce(function (n, r) { return n + Number(r.stock || 0); }, 0);
      var prices = rows.map(function (r) { return Number(r.price || 0); }).filter(function (n) { return n > 0; });
      var priceText = prices.length ? money(Math.min.apply(null, prices)) : money(p.price_min || 0);
      var cat = (state.catalog.categories || []).find(function (c) { return c.id === p.category_id; });
      return '<div class="list-card">' +
        '<div><strong>' + escapeHtml(p.name) + '</strong>' +
        '<div class="code">' + escapeHtml((cat && cat.name) || '') +
        (p.sku ? ' · ' + escapeHtml(p.sku) : '') +
        '</div>' +
        (rows.length
          ? '<div class="code">' + rows.map(function (r) {
              var label = '';
              var v = (p.variants || []).find(function (x) { return x.id === r.variant_id; });
              if (v) label = v.label || '';
              return escapeHtml(label || '—') + ': ' + money(r.price) + ' / stock ' + (r.stock || 0);
            }).join(' · ') + '</div>'
          : '<div class="code">No stock row for this store</div>') +
        '</div>' +
        '<div class="value">' + priceText +
        '<div class="code">Stock ' + stock + '</div></div></div>';
    }).join('');
  }

  function prepareLoginForm() {
    var field = $('server-url-field');
    var input = $('login-server');
    // APK / Capacitor: always show Website URL (never bake domain into the binary)
    if (isSameOriginPwa()) {
      field.classList.add('hidden');
      input.value = location.origin;
    } else {
      field.classList.remove('hidden');
      var saved = null;
      try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { saved = null; }
      input.value = normalizeBase((saved && saved.apiBase) || window.FAM_DEFAULT_API || '') || '';
      input.placeholder = 'https://your-site.com or http://192.168.x.x:5000';
      input.required = true;
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
    stopBillScanner();
    clearSession();
    state.punchItems = [];
    state.billCart = [];
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
    $('btn-go-billing').onclick = function () {
      openBillingSetup().catch(function (e) { toast(e.message, true); });
    };
    $('btn-go-inventory').onclick = function () {
      openInventory().catch(function (e) { toast(e.message, true); });
    };
    $('btn-go-catalog').onclick = function () {
      openCatalogBrowse().catch(function (e) { toast(e.message, true); });
    };
    $('btn-go-generate').onclick = openGenerate;
    $('btn-go-print').onclick = openPrint;
    $('btn-go-punch').onclick = async function () {
      await loadStores();
      showScreen('punch-setup');
    };
    $('btn-start-billing').onclick = function () {
      startBilling().catch(function (e) { toast(e.message, true); });
    };
    $('btn-bill-recent').onclick = function () {
      openRecentBills().catch(function (e) { toast(e.message, true); });
    };
    $('bill-search').oninput = renderBillProducts;
    $('bill-discount').oninput = renderBillCart;
    $('btn-bill-scan').onclick = function () {
      startBillScanner().catch(function (e) { toast(e.message, true); });
    };
    $('btn-bill-scan-back').onclick = async function () {
      await stopBillScanner();
      showScreen('billing');
    };
    $('btn-bill-checkout').onclick = checkoutBill;
    $('btn-bill-invoice').onclick = downloadBillInvoice;
    $('btn-bill-another').onclick = function () {
      startBilling().catch(function (e) { toast(e.message, true); });
    };
    $('btn-bill-home').onclick = async function () {
      showScreen('home');
      try { await loadDashboard(); } catch (e) { /* ignore */ }
    };
    $('inv-store').onchange = loadInventoryRows;
    $('inv-search').oninput = renderInventoryList;
    $('btn-inv-save').onclick = saveInventoryEdit;
    $('cat-store').onchange = renderCatalogBrowse;
    $('cat-search').oninput = renderCatalogBrowse;
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
        else if (target === 'billing-setup') showScreen('billing-setup');
        else if (target === 'billing') showScreen('billing');
        else if (target === 'inventory') showScreen('inventory');
      };
    });
    document.querySelectorAll('[data-nav]').forEach(function (btn) {
      btn.onclick = async function () {
        var nav = btn.getAttribute('data-nav');
        try {
          if (nav === 'home') {
            showScreen('home');
            await loadDashboard();
          } else if (nav === 'generate') {
            await openGenerate();
          } else if (nav === 'print') {
            await openPrint();
          } else if (nav === 'punch-setup') {
            await loadStores();
            showScreen('punch-setup');
          } else if (nav === 'billing-setup') {
            await openBillingSetup();
          } else if (nav === 'inventory') {
            await openInventory();
          } else if (nav === 'catalog') {
            await openCatalogBrowse();
          }
        } catch (e) {
          toast(e.message, true);
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
