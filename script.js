(function () {
  'use strict';

  function famCsrfHeaders(extra) {
    var headers = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
    try {
      var csrf = document.cookie.split(';').map(function (c) { return c.trim(); })
        .find(function (c) { return c.indexOf('fam_csrf=') === 0; });
      if (csrf) headers['X-CSRF-Token'] = decodeURIComponent(csrf.split('=').slice(1).join('='));
    } catch (e) { /* ignore */ }
    return headers;
  }

  var PRODUCTS = [
    { id: 'p1', name: 'Bombil (Bombay Duck)', category: 'fish', categoryLabel: 'Fish', price: 320, unit: 'kg', badge: 'Fresh', desc: 'Sourced fresh daily from the local dock. Cleaned and ready to fry.', image: '/uploads/products/seed_p1.png', featured: true },
    { id: 'p2', name: 'Silver Pomfret (Whole)', category: 'fish', categoryLabel: 'Fish', price: 650, unit: 'kg', badge: 'Fresh', desc: 'Prized whole pomfret, scaled and gutted on request.', image: '/uploads/products/seed_p2.png', featured: false },
    { id: 'p3', name: 'Rohu Curry Cut', category: 'fish', categoryLabel: 'Fish', price: 280, unit: 'kg', badge: 'Frozen', desc: 'Freshwater rohu, curry-cut and individually frozen.', image: '/uploads/products/seed_p3.png', featured: false },
    { id: 'p4', name: 'Prawns (Medium, Deveined)', category: 'fish', categoryLabel: 'Fish', price: 480, unit: 'kg', badge: 'Frozen', desc: 'Cleaned, deveined medium prawns. Ready to cook.', image: '/uploads/products/seed_p4.png', featured: true },
    { id: 'p5', name: 'Chicken Curry Cut (Skinless)', category: 'chicken', categoryLabel: 'Chicken', price: 220, unit: 'kg', badge: 'Fresh', desc: 'Hand-cut same day, skinless curry cut with bone.', image: '/uploads/products/seed_p5.png', featured: true },
    { id: 'p6', name: 'Chicken Breast (Boneless)', category: 'chicken', categoryLabel: 'Chicken', price: 320, unit: 'kg', badge: 'Fresh', desc: 'Lean boneless breast fillets, trimmed and portioned.', image: '/uploads/products/seed_p6.png', featured: false },
    { id: 'p7', name: 'Chicken Lollipop', category: 'chicken', categoryLabel: 'Chicken', price: 260, unit: 'kg', badge: 'Frozen', desc: 'Frenched drumettes, party-ready, frozen fresh.', image: '/uploads/products/seed_p7.png', featured: false },
    { id: 'p8', name: 'Mutton Curry Cut (Goat)', category: 'mutton', categoryLabel: 'Mutton', price: 780, unit: 'kg', badge: 'Fresh', desc: 'Bone-in goat curry cut, hand-selected and cut fresh.', image: '/uploads/products/seed_p8.png', featured: true },
    { id: 'p9', name: 'Mutton Keema (Minced)', category: 'mutton', categoryLabel: 'Mutton', price: 760, unit: 'kg', badge: 'Fresh', desc: 'Freshly minced goat meat, ideal for keema pav.', image: '/uploads/products/seed_p9.png', featured: false },
    { id: 'p10', name: 'Mutton Boneless', category: 'mutton', categoryLabel: 'Mutton', price: 850, unit: 'kg', badge: 'Fresh', desc: 'Trimmed boneless goat meat cubes.', image: '/uploads/products/seed_p10.png', featured: false },
    { id: 'p11', name: 'Malvani Chicken Masala Kit', category: 'ready-to-cook', categoryLabel: 'Ready-to-Cook', price: 149, unit: 'kit', badge: 'Marinated', desc: 'Marinated chicken with our proprietary Malvani spice base. Cook in 15 minutes.', image: '/uploads/products/seed_p11.png', featured: true },
    { id: 'p12', name: 'Tandoori Chicken Tikka Marinade', category: 'ready-to-cook', categoryLabel: 'Ready-to-Cook', price: 280, unit: 'kg', badge: 'Marinated', desc: 'Boneless chicken pre-marinated in tandoori masala, ready to grill.', image: '/uploads/products/seed_p12.png', featured: false },
    { id: 'p13', name: 'Fish Tikka Marinade (Pomfret)', category: 'ready-to-cook', categoryLabel: 'Ready-to-Cook', price: 420, unit: 'kg', badge: 'Marinated', desc: 'Pomfret fillets marinated in coastal spices, oven-ready.', image: '/uploads/products/seed_p13.png', featured: false },
    { id: 'p14', name: 'Mixed Vegetable Box', category: 'veg', categoryLabel: 'Veg', price: 180, unit: 'box', badge: 'Fresh', desc: 'A curated seasonal mix of fresh vegetables for the week.', image: '/uploads/products/seed_p14.png', featured: true },
    { id: 'p15', name: 'Farm Greens Combo', category: 'veg', categoryLabel: 'Veg', price: 90, unit: 'pack', badge: 'Fresh', desc: 'Spinach, coriander and fenugreek, freshly bunched.', image: '/uploads/products/seed_p15.png', featured: false }
  ];

  var CATEGORIES = [
    { id: 'all', label: 'All' },
    { id: 'fish', label: 'Fish' },
    { id: 'chicken', label: 'Chicken' },
    { id: 'mutton', label: 'Mutton' },
    { id: 'ready-to-cook', label: 'Ready-to-Cook' },
    { id: 'veg', label: 'Veg' }
  ];

  var LOCATIONS = [
    { id: 'store_andheri', name: 'Andheri', area: 'Andheri West, Mumbai', hours: '7 AM \u2013 10 PM', tag: 'Flagship Store' },
    { id: 'store_kharghar', name: 'Kharghar', area: 'Sector 12, Navi Mumbai', hours: '7 AM \u2013 10 PM', tag: 'New Store' },
    { id: 'store_thane', name: 'Thane', area: 'Station Road Area, Thane', hours: '7 AM \u2013 10 PM', tag: 'Fresh Counter' }
  ];

  var API_LIVE = false;
  var STOREFRONT_CONTENT = null;
  var selectedStoreId = 'store_andheri';
  var cartSyncTimer = null;

  function mapApiProduct(p) {
    var unit = 'kg';
    var variantId = null;
    if (p.variants && p.variants.length) {
      unit = p.variants[0].unit || p.variants[0].label || 'unit';
      variantId = p.variants[0].id;
    }
    var img = (p.images && p.images[0]) || p.image || p.name;
    return {
      id: p.id,
      name: p.name,
      category: p.category_id || p.category || '',
      category_id: p.category_id || p.category || '',
      categoryLabel: p.categoryLabel || '',
      price: p.price != null ? p.price : 0,
      unit: unit,
      badge: p.badge || (p.status === 'available' ? 'Fresh' : 'Out of Stock'),
      desc: p.description || p.desc || '',
      image: img,
      featured: !!p.featured,
      bestseller: !!p.bestseller,
      parameters: p.parameters || [],
      stock: Number(p.stock || 0),
      variant_id: variantId,
      variants: p.variants || [],
      store_inventory: p.store_inventory || [],
      gst_percent: Number(p.gst_percent || 0)
    };
  }

  function inventoryRow(product, variantId) {
    return (product.store_inventory || []).find(function (r) {
      return r.variant_id === variantId;
    });
  }

  function variantMeta(product, variantId) {
    var variant = (product.variants || []).find(function (v) { return v.id === variantId; }) || {};
    var inv = inventoryRow(product, variantId);
    return {
      id: variantId,
      label: variant.label || variant.unit || 'Default',
      unit: variant.unit || variant.label || 'unit',
      price: inv ? Number(inv.price || 0) : Number(product.price || 0),
      stock: inv ? Number(inv.stock || 0) : 0
    };
  }

  function defaultVariantId(product) {
    var variants = product.variants || [];
    for (var i = 0; i < variants.length; i++) {
      var inv = inventoryRow(product, variants[i].id);
      if (inv && inv.stock > 0) return variants[i].id;
    }
    return variants.length ? variants[0].id : product.variant_id;
  }

  function cartLineKey(item) {
    return item.id + '::' + (item.variant_id || '');
  }

  var _metaCache = { cats: null, stores: null, content: null, at: 0 };
  var META_TTL_MS = 0; // always refetch so admin edits show instantly on storefront

  function fetchJsonNoStore(url) {
    return fetch(url, { cache: 'no-store', credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); });
  }

  function loadCatalogFromApi(done) {
    var now = Date.now();
    var metaFresh = META_TTL_MS > 0 && _metaCache.cats && _metaCache.stores && _metaCache.content &&
      (now - _metaCache.at) < META_TTL_MS;
    var productUrl = '/api/products?store_id=' + encodeURIComponent(selectedStoreId);
    var tasks = [
      fetchJsonNoStore(productUrl)
    ];
    if (metaFresh) {
      tasks.push(Promise.resolve(_metaCache.cats));
      tasks.push(Promise.resolve(_metaCache.stores));
      tasks.push(Promise.resolve(_metaCache.content));
    } else {
      tasks.push(fetchJsonNoStore('/api/categories'));
      tasks.push(fetchJsonNoStore('/api/stores'));
      tasks.push(fetchJsonNoStore('/api/storefront-content'));
    }
    Promise.all(tasks).then(function (results) {
      var products = results[0];
      var cats = results[1];
      var stores = results[2];
      STOREFRONT_CONTENT = results[3];
      if (!metaFresh) {
        _metaCache = { cats: cats, stores: stores, content: STOREFRONT_CONTENT, at: Date.now() };
      }
      PRODUCTS = products.map(mapApiProduct);
      enrichCartFromCatalog();
      CATEGORIES = [{ id: 'all', label: 'All' }].concat(cats.map(function (c) {
        return { id: c.id, label: c.name, banner: c.banner || '' };
      }));
      LOCATIONS = stores.map(function (s) {
        return {
          id: s.id,
          name: s.name,
          area: s.address,
          hours: s.hours,
          tag: s.tag || 'Store',
          contact: s.contact || s.phone || ''
        };
      });
      if (LOCATIONS.length && !LOCATIONS.some(function (s) { return s.id === selectedStoreId; })) {
        selectedStoreId = LOCATIONS[0].id;
      }
      API_LIVE = true;
      applyPromoStrip();
      if (done) done();
    }).catch(function () {
      API_LIVE = false;
      if (done) done();
    });
  }

  function refreshStorefrontLive() {
    _metaCache.at = 0;
    loadCatalogFromApi(function () {
      if (state.page === 'home') renderHome();
      else renderCurrentPage();
      renderHeader();
    });
  }

  var _liveRefreshTimer = 0;
  function scheduleStorefrontRefresh() {
    if (_liveRefreshTimer) clearTimeout(_liveRefreshTimer);
    _liveRefreshTimer = setTimeout(function () {
      _liveRefreshTimer = 0;
      refreshStorefrontLive();
    }, 250);
  }

  function findProduct(id) {
    for (var i = 0; i < PRODUCTS.length; i++) if (PRODUCTS[i].id === id) return PRODUCTS[i];
    return null;
  }

  function cartItemSnapshot(product, variantId) {
    product = product || {};
    variantId = variantId || defaultVariantId(product);
    var meta = variantMeta(product, variantId);
    return {
      name: product.name || '',
      price: meta.price || product.price || 0,
      unit: meta.unit || product.unit || 'unit',
      variant_label: meta.label || '',
      image: product.image || (product.images && product.images[0]) || ''
    };
  }

  function enrichCartFromCatalog() {
    if (!state.cart.length) return;
    state.cart = state.cart.map(function (c) {
      if (c.name && c.price != null) return c;
      var p = findProduct(c.id);
      if (!p) return c;
      return Object.assign({}, c, cartItemSnapshot(p, c.variant_id));
    });
  }
  function esc(str) {
    return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function imgTag(src, alt, opts) {
    opts = opts || {};
    if (!src || String(src).indexOf('/') !== 0) return '';
    var attrs = [
      'src="' + esc(src) + '"',
      'alt="' + esc(alt || '') + '"',
      'decoding="async"'
    ];
    if (opts.eager) {
      attrs.push('fetchpriority="high"');
      attrs.push('loading="eager"');
    } else {
      attrs.push('loading="lazy"');
    }
    if (opts.width) attrs.push('width="' + opts.width + '"');
    if (opts.height) attrs.push('height="' + opts.height + '"');
    if (opts.className) attrs.push('class="' + esc(opts.className) + '"');
    if (opts.style) attrs.push('style="' + opts.style + '"');
    return '<img ' + attrs.join(' ') + ' />';
  }

  function closeMobileNav() {
    var nav = document.getElementById('main-nav');
    var toggle = document.getElementById('nav-toggle');
    if (nav) nav.classList.remove('is-open');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('nav-open');
  }

  function userAddresses() {
    return (state.user && state.user.addresses) || [];
  }

  function defaultAddress() {
    var list = userAddresses();
    return list.find(function (a) { return a.is_default; }) || list[0] || null;
  }

  function applyCustomerPayload(customer) {
    if (!customer) return;
    state.user = customer;
    if (!Array.isArray(state.user.addresses)) state.user.addresses = [];
  }

  var state = {
    page: 'home',
    category: 'all',
    selectedProductId: null,
    selectedVariantId: null,
    detailQty: 1,
    cart: [],
    user: null,
    orders: [],
    checkoutArea: '',
    checkoutMode: 'delivery',
    coupon: null,
    lastOrder: null
  };

  // Storefront settings (fees, minimum order) — served by admin panel
  var SETTINGS = {
    min_order_value: 499,
    delivery_fee_below_min: 49,
    free_delivery_above: 499,
    gst_enabled: true
  };
  fetch('/api/settings').then(function (r) { return r.ok ? r.json() : null; }).then(function (s) {
    if (s) { SETTINGS = Object.assign(SETTINGS, s); renderCurrentPage(); }
  }).catch(function () {});

  function saveCart() {
    // Guest carts stay in memory only for this visit.
    // Logged-in carts are persisted to MongoDB on the customer document.
    if (!state.user) return;
    clearTimeout(cartSyncTimer);
    cartSyncTimer = setTimeout(function () {
      fetch('/api/account/cart', {
        method: 'PUT',
        headers: famCsrfHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify({
          cart: state.cart,
          preferred_store_id: selectedStoreId
        })
      }).catch(function () {});
    }, 300);
  }

  function cartCount() {
    var n = 0;
    for (var i = 0; i < state.cart.length; i++) n += state.cart[i].qty;
    return n;
  }
  function cartLines() {
    return state.cart.map(function (c) {
      var p = findProduct(c.id) || {};
      var variantId = c.variant_id || defaultVariantId(p);
      var meta = variantMeta(p, variantId);
      var price = c.price != null ? c.price : (meta.price || p.price || 0);
      var unit = c.unit || meta.unit || p.unit || 'unit';
      var label = c.variant_label || meta.label || unit;
      var name = c.name || p.name || 'Product';
      var image = c.image || p.image || (p.images && p.images[0]) || '';
      return {
        id: c.id,
        name: name,
        image: image,
        qty: c.qty,
        variant_id: variantId,
        variant_label: label,
        unit: unit,
        price: price,
        gst_percent: p.gst_percent,
        lineTotal: price * c.qty,
        cartKey: cartLineKey(c)
      };
    });
  }
  function cartSubtotal() {
    return cartLines().reduce(function (n, l) { return n + l.lineTotal; }, 0);
  }
  function cartGstAmount() {
    if (!SETTINGS.gst_enabled) return 0;
    return cartLines().reduce(function (sum, l) {
      var pct = Number(l.gst_percent || 0);
      if (!pct) return sum;
      return sum + l.lineTotal * pct / (100 + pct);
    }, 0);
  }
  function deliveryFee() {
    var sub = cartSubtotal();
    if (sub === 0 || state.checkoutMode === 'pickup') return 0;
    return sub >= SETTINGS.free_delivery_above ? 0 : SETTINGS.delivery_fee_below_min;
  }
  function couponDiscount() {
    return state.coupon ? state.coupon.discount : 0;
  }

  function addToCart(id, qty, variantId) {
    qty = qty || 1;
    var product = findProduct(id) || {};
    variantId = variantId || defaultVariantId(product);
    var key = id + '::' + (variantId || '');
    var snap = cartItemSnapshot(product, variantId);
    var existing = state.cart.find(function (c) { return cartLineKey(c) === key; });
    if (existing) {
      existing.qty += qty;
      if (product.name) Object.assign(existing, snap);
    } else {
      state.cart.push(Object.assign({ id: id, qty: qty, variant_id: variantId }, snap));
    }
    saveCart();
    renderHeader();
  }
  function changeQty(cartKey, delta) {
    state.cart = state.cart.map(function (c) {
      return cartLineKey(c) === cartKey ? Object.assign({}, c, { qty: c.qty + delta }) : c;
    }).filter(function (c) { return c.qty > 0; });
    saveCart();
    renderHeader();
    renderCurrentPage();
  }
  function removeItem(cartKey) {
    state.cart = state.cart.filter(function (c) { return cartLineKey(c) !== cartKey; });
    saveCart();
    renderHeader();
    renderCurrentPage();
  }

  function navigate(page, opts) {
    opts = opts || {};
    closeMobileNav();
    function updatePage() {
      state.page = page;
      if (opts.category !== undefined) state.category = opts.category;
      if (opts.productId !== undefined) {
        state.selectedProductId = opts.productId;
        if (!opts.keepVariant) state.selectedVariantId = null;
        if (!opts.keepQty) state.detailQty = 1;
      }
      document.querySelectorAll('.page').forEach(function (el) { el.classList.add('hidden'); });
      document.getElementById('page-' + page).classList.remove('hidden');
      renderCurrentPage();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (document.startViewTransition && !reduceMotion) {
      return document.startViewTransition(updatePage).finished;
    }
    updatePage();
    return Promise.resolve();
  }

  function goToLocations() {
    navigate('home').then(function () {
      var locations = document.getElementById('store-locations');
      if (locations) locations.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function renderCurrentPage() {
    if (state.page === 'catalog') renderCatalog();
    if (state.page === 'product') renderProductDetail();
    if (state.page === 'cart') renderCart();
    if (state.page === 'checkout') renderCheckout();
    if (state.page === 'account') renderAccount();
  }

  function productCardHTML(p) {
    var imgHtml = imgTag(p.image, p.name, {
      width: 400,
      height: 300,
      style: 'width:100%;height:100%;object-fit:cover;'
    }) || '<span>[ ' + esc(p.image) + ' ]</span>';
    var isBestseller = !!p.bestseller;
    var isAvailable = !isBestseller && String(p.badge || '').toLowerCase() !== 'out of stock';
    var cardClass = 'product-card' + (isBestseller ? ' is-bestseller' : (isAvailable ? ' is-available' : ''));
    var badgeText = isBestseller ? 'Bestseller' : (p.badge || 'Fresh');
    var badgeClass = 'badge' + (isBestseller ? ' badge-bestseller' : (isAvailable ? ' badge-available' : ''));
    return '' +
      '<div class="' + cardClass + '" data-open="' + p.id + '">' +
        '<div class="product-image">' + imgHtml + '</div>' +
        '<div class="product-body">' +
          '<div class="' + badgeClass + '">' + esc(badgeText) + '</div>' +
          '<div class="product-name">' + esc(p.name) + '</div>' +
          '<div class="product-price">&#8377;' + p.price + ' / ' + esc(p.unit) + '</div>' +
          '<button type="button" class="add-btn" data-add="' + p.id + '">Add to Cart</button>' +
        '</div>' +
      '</div>';
  }

  function wireProductGrid(container) {
    if (!container || container.dataset.wired === '1') return;
    container.dataset.wired = '1';
    container.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-add]');
      if (btn && container.contains(btn)) {
        e.stopPropagation();
        e.preventDefault();
        addToCart(btn.getAttribute('data-add'), 1);
        btn.textContent = 'Added \u2713';
        btn.classList.add('added');
        window.setTimeout(function () {
          if (btn.isConnected) {
            btn.textContent = 'Add to Cart';
            btn.classList.remove('added');
          }
        }, 1000);
        return;
      }

      var card = e.target.closest('[data-open]');
      if (card && container.contains(card)) {
        navigate('product', { productId: card.getAttribute('data-open') });
      }
    });
  }

  function relatedProductsFor(product, limit) {
    limit = limit || 4;
    var same = [];
    var others = [];
    PRODUCTS.forEach(function (x) {
      if (x.id === product.id) return;
      if (x.category === product.category) same.push(x);
      else others.push(x);
    });
    function rank(list) {
      return list.slice().sort(function (a, b) {
        return (Number(!!b.bestseller) + Number(!!b.featured)) - (Number(!!a.bestseller) + Number(!!a.featured));
      });
    }
    var picked = rank(same).concat(rank(others));
    return picked.slice(0, limit);
  }

  function categoryThumb(cat) {
    if (cat.banner && String(cat.banner).indexOf('/') === 0) return cat.banner;
    for (var i = 0; i < PRODUCTS.length; i++) {
      if (PRODUCTS[i].category === cat.id && PRODUCTS[i].image && String(PRODUCTS[i].image).indexOf('/') === 0) {
        return PRODUCTS[i].image;
      }
    }
    return '';
  }

  function thumbHtml(src, label) {
    var img = imgTag(src, label, { width: 80, height: 80 });
    if (img) return img;
    var initial = String(label || '?').trim().charAt(0).toUpperCase() || '?';
    return '<span class="hs-thumb-fallback">' + esc(initial) + '</span>';
  }

  function initStoreSearch() {
    var input = document.getElementById('store-search');
    var results = document.getElementById('store-search-results');
    if (!input || !results) return;
    var timer = null;

    function hide() {
      results.classList.add('hidden');
      results.innerHTML = '';
    }

    function clearInput() {
      input.value = '';
      hide();
    }

    function render() {
      var q = input.value.trim().toLowerCase();
      if (q.length < 1) {
        hide();
        return;
      }

      var cats = CATEGORIES.filter(function (c) {
        return c.id !== 'all' && (c.label || '').toLowerCase().indexOf(q) !== -1;
      }).slice(0, 4);

      var products = PRODUCTS.filter(function (p) {
        var hay = ((p.name || '') + ' ' + (p.categoryLabel || '') + ' ' + (p.badge || '') + ' ' + (p.desc || '')).toLowerCase();
        return hay.indexOf(q) !== -1;
      }).slice(0, 6);

      if (!cats.length && !products.length) {
        results.innerHTML = '<div class="hs-empty">No matches for “' + esc(input.value.trim()) + '”</div>';
        results.classList.remove('hidden');
        return;
      }

      var html = '';
      if (cats.length) {
        html += '<div class="hs-group">CATEGORIES</div>';
        cats.forEach(function (c) {
          html += '<button type="button" class="hs-item" data-search-cat="' + esc(c.id) + '" role="option">' +
            '<span class="hs-thumb">' + thumbHtml(categoryThumb(c), c.label) + '</span>' +
            '<span class="hs-meta"><span class="hs-name">' + esc(c.label) + '</span>' +
            '<span class="hs-sub">Shop category</span></span></button>';
        });
      }
      if (products.length) {
        html += '<div class="hs-group">PRODUCTS</div>';
        products.forEach(function (p) {
          html += '<button type="button" class="hs-item" data-search-product="' + esc(p.id) + '" role="option">' +
            '<span class="hs-thumb">' + thumbHtml(p.image, p.name) + '</span>' +
            '<span class="hs-meta"><span class="hs-name">' + esc(p.name) + '</span>' +
            '<span class="hs-sub">&#8377;' + p.price + ' / ' + esc(p.unit) +
            (p.categoryLabel ? ' · ' + esc(p.categoryLabel) : '') +
            '</span></span></button>';
        });
      }
      results.innerHTML = html;
      results.classList.remove('hidden');

      results.querySelectorAll('[data-search-cat]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          clearInput();
          closeMobileNav();
          navigate('catalog', { category: btn.getAttribute('data-search-cat') });
        });
      });
      results.querySelectorAll('[data-search-product]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          clearInput();
          closeMobileNav();
          navigate('product', { productId: btn.getAttribute('data-search-product') });
        });
      });
    }

    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(render, 120);
    });
    input.addEventListener('focus', function () {
      if (input.value.trim()) render();
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        hide();
        input.blur();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        var first = results.querySelector('[data-search-product], [data-search-cat]');
        if (first) first.click();
      }
    });
    document.addEventListener('click', function (e) {
      var wrap = document.getElementById('header-search');
      if (!wrap || wrap.contains(e.target)) return;
      hide();
    });
  }

  /* ---- HOME ---- */
  function setText(id, value) {
    var el = document.getElementById(id);
    if (el && value != null) el.textContent = value;
  }

  function setVisual(id, url, tone, opts) {
    var el = document.getElementById(id);
    if (!el) return;
    opts = opts || {};
    if (url) {
      el.classList.remove('placeholder', 'placeholder-dark', 'placeholder-light');
      el.innerHTML = imgTag(url, opts.alt || '', {
        eager: !!opts.eager,
        width: opts.width || 800,
        height: opts.height || 600,
        style: 'width:100%;height:100%;object-fit:cover;border-radius:12px;'
      });
    } else if (!el.querySelector('img')) {
      el.classList.add('placeholder', tone === 'dark' ? 'placeholder-dark' : 'placeholder-light');
    }
  }

  function buildCustomSection(section) {
    var dark = section.style === 'dark';
    var el = document.createElement('section');
    el.className = 'section custom-section' + (dark ? ' custom-section-dark' : ' custom-section-light');
    el.setAttribute('data-storefront-section', 'custom:' + section.id);
    var visual = section.image
      ? imgTag(section.image, section.title || '', { width: 800, height: 520 })
      : '<div class="placeholder ' + (dark ? 'placeholder-dark' : 'placeholder-light') + '" style="height:100%;min-height:280px;">' +
        '<div class="placeholder-label' + (dark ? ' placeholder-label-light' : '') + '">[ section photo ]</div></div>';
    var button = section.button_text
      ? '<div class="custom-section-actions"><a class="btn ' + (dark ? 'btn-gold' : 'btn-dark') + '" href="' +
        esc(section.button_link || '#') + '">' + esc(section.button_text) + '</a></div>'
      : '';
    el.innerHTML =
      '<div class="custom-section-grid">' +
        '<div>' +
          (section.eyebrow ? '<div class="eyebrow ' + (dark ? 'c-gold' : 'c-red') + '">' + esc(section.eyebrow) + '</div>' : '') +
          (section.title ? '<h2 class="h2">' + esc(section.title) + '</h2>' : '') +
          (section.description ? '<p class="lead">' + esc(section.description) + '</p>' : '') +
          button +
        '</div>' +
        '<div class="custom-section-visual">' + visual + '</div>' +
      '</div>';
    if (section.button_link) {
      el.querySelector('a.btn').addEventListener('click', function (e) {
        var link = section.button_link;
        if (link && link.charAt(0) === '/' && link.indexOf('//') !== 0) {
          e.preventDefault();
          if (link.indexOf('catalog') !== -1 || link === '/shop') navigate('catalog', {});
          else navigate('home', {});
        }
      });
    }
    return el;
  }

  function applyStorefrontContent() {
    var c = STOREFRONT_CONTENT;
    if (!c) return;
    var home = document.getElementById('page-home');
    var customSections = c.custom_sections || [];
    (c.section_order || []).forEach(function (key) {
      var section = home.querySelector('[data-storefront-section="' + key + '"]');
      if (!section && key.indexOf('custom:') === 0) {
        var id = key.slice(7);
        var data = customSections.filter(function (s) { return s.id === id; })[0];
        if (data) section = buildCustomSection(data);
      }
      if (section) home.appendChild(section);
    });
    home.querySelectorAll('[data-storefront-section]').forEach(function (section) {
      var key = section.getAttribute('data-storefront-section');
      var hidden;
      if (key.indexOf('custom:') === 0) {
        var id = key.slice(7);
        var data = customSections.filter(function (s) { return s.id === id; })[0];
        hidden = !!(data && data.enabled === false);
      } else {
        hidden = !!(c[key] && c[key].enabled === false);
      }
      section.classList.toggle('hidden', hidden);
    });

    setText('home-hero-pill', c.hero.pill);
    setText('home-hero-line1', c.hero.title_line_1);
    setText('home-hero-accent', c.hero.title_accent);
    setText('home-hero-line3', c.hero.title_line_3);
    setText('home-hero-description', c.hero.description);
    setText('hero-shop', c.hero.primary_button);
    setText('hero-locations-label', c.hero.secondary_button || 'Find a Store');
    // Hero photo is embedded in index.html (assets/hero.webp) for fast first paint.
    var trust = document.getElementById('home-trust-items');
    trust.innerHTML = (c.trust.items || []).map(function (item) {
      return '<span class="trust-item"><span class="trust-ico" data-icon="' + trustIconKey(item) +
        '" aria-hidden="true"></span>' + esc(item) + '</span>';
    }).join('');

    setText('home-why-eyebrow', c.why_us.eyebrow);
    setText('home-why-title', c.why_us.title);
    setText('home-why-description', c.why_us.description);
    setVisual('home-why-visual', c.why_us.image, 'light', { alt: 'Why choose us', width: 800, height: 600 });
    var colors = ['num-green', 'num-gold', 'num-red', 'num-green'];
    document.getElementById('home-why-features').innerHTML = (c.why_us.features || []).map(function (feature, i) {
      return '<div class="feature-row"><div class="feature-num ' + colors[i % colors.length] + '">' + (i + 1) +
        '</div><div><div class="feature-title">' + esc(feature.title) + '</div><div class="feature-desc">' +
        esc(feature.description) + '</div></div></div>';
    }).join('');

    setText('home-range-eyebrow', c.product_range.eyebrow);
    setText('home-range-title', c.product_range.title);
    setText('home-range-description', c.product_range.description);
    setText('home-fav-eyebrow', c.favourites.eyebrow);
    setText('home-fav-title', c.favourites.title);
    setText('view-all-link', c.favourites.link_text);

    setText('home-promise-eyebrow', c.promise.eyebrow);
    setText('home-promise-title', c.promise.title);
    document.getElementById('home-promise-steps').innerHTML = (c.promise.steps || []).map(function (step, i) {
      return '<div class="step-row"><div class="step-num">' + (i + 1) + '</div><div><strong>' +
        esc(step.title) + '</strong> — ' + esc(step.description) + '</div></div>';
    }).join('');
    setText('home-promise-badge', c.promise.badge);
    setText('home-locations-eyebrow', c.locations.eyebrow);
    setText('home-locations-title', c.locations.title);
    setText('home-cta-title', c.cta.title);
    setText('home-cta-description', c.cta.description);
    setText('cta-shop', c.cta.button);
    setText('home-footer-description', c.footer.description);
    setText('home-footer-compliance', c.footer.compliance_text);
    applyPromoStrip();
  }

  function renderHome() {
    applyStorefrontContent();
    var tileGrid = document.getElementById('category-tiles');
    var rangeIds = STOREFRONT_CONTENT && STOREFRONT_CONTENT.product_range.category_ids || [];
    var rangeCategories = CATEGORIES.filter(function (c) {
      return c.id !== 'all' && (!rangeIds.length || rangeIds.indexOf(c.id) !== -1);
    });
    tileGrid.innerHTML = rangeCategories.map(function (c) {
      var label = c.label || 'Category';
      var fallback = '<span>[ ' + esc(label) + ' photo ]</span>';
      var tileVisual = fallback;
      if (c.banner && String(c.banner).indexOf('/') === 0) {
        tileVisual =
          '<img src="' + esc(c.banner) + '" alt="' + esc(label) + '" width="480" height="280" loading="lazy" decoding="async" ' +
          'onerror="this.onerror=null;var s=document.createElement(\'span\');s.textContent=this.getAttribute(\'data-fallback\')||\'[ photo ]\';this.replaceWith(s);" ' +
          'data-fallback="[ ' + esc(label) + ' photo ]" />';
      }
      return '' +
        '<div class="tile" data-cat="' + c.id + '">' +
          '<div class="tile-image">' + tileVisual + '</div>' +
          '<div class="tile-label">' + esc(label) + '</div>' +
        '</div>';
    }).join('');
    tileGrid.querySelectorAll('[data-cat]').forEach(function (el) {
      el.addEventListener('click', function () { navigate('catalog', { category: el.getAttribute('data-cat') }); });
    });

    var featuredGrid = document.getElementById('featured-products');
    var favConfig = STOREFRONT_CONTENT && STOREFRONT_CONTENT.favourites || {};
    var favIds = favConfig.product_ids || [];
    var favourites = favIds.length
      ? favIds.map(function (id) { return findProduct(id); }).filter(Boolean)
      : PRODUCTS.filter(function (p) { return p.featured; });
    featuredGrid.innerHTML = favourites.slice(0, Number(favConfig.limit || 6)).map(productCardHTML).join('');
    wireProductGrid(featuredGrid);

    var locGrid = document.getElementById('location-grid');
    locGrid.innerHTML = LOCATIONS.map(function (loc) {
      var phones = String(loc.contact || '').split(/[\n,;/|]+/).map(function (n) {
        return n.replace(/\s+/g, ' ').trim();
      }).filter(Boolean);
      var phoneHtml = phones.map(function (n) {
        var href = n.replace(/[^\d+]/g, '');
        return '<div class="location-phone"><a href="tel:' + esc(href) + '">📞 ' + esc(n) + '</a></div>';
      }).join('');
      return '' +
        '<div class="location-card">' +
          '<div class="location-tag">' + esc(loc.tag) + '</div>' +
          '<div class="location-name">' + esc(loc.name) + '</div>' +
          '<div class="location-area">' + esc(loc.area) + '</div>' +
          phoneHtml +
          '<div class="location-hours">' + esc(loc.hours) + '</div>' +
        '</div>';
    }).join('');

    var footerShop = document.getElementById('footer-shop-links');
    footerShop.innerHTML = '<span data-shop-all="1">All Products</span>' + CATEGORIES.filter(function (c) { return c.id !== 'all'; }).map(function (c) {
      return '<span data-cat-link="' + c.id + '">' + esc(c.label) + '</span>';
    }).join('');
    footerShop.querySelector('[data-shop-all]').addEventListener('click', function () { navigate('catalog', { category: 'all' }); });
    footerShop.querySelectorAll('[data-cat-link]').forEach(function (el) {
      el.addEventListener('click', function () { navigate('catalog', { category: el.getAttribute('data-cat-link') }); });
    });
  }

  /* ---- CATALOG ---- */
  function renderCatalog() {
    var tabs = document.getElementById('category-tabs');
    tabs.innerHTML = CATEGORIES.map(function (c) {
      return '<span class="tab' + (c.id === state.category ? ' active' : '') + '" data-tab="' + c.id + '">' + esc(c.label) + '</span>';
    }).join('');
    tabs.querySelectorAll('[data-tab]').forEach(function (el) {
      el.addEventListener('click', function () { state.category = el.getAttribute('data-tab'); renderCatalog(); });
    });

    var grid = document.getElementById('catalog-products');
    var list = state.category === 'all' ? PRODUCTS : PRODUCTS.filter(function (p) { return p.category === state.category; });
    grid.innerHTML = list.map(productCardHTML).join('');
    wireProductGrid(grid);
  }

  /* ---- PRODUCT DETAIL ---- */
  function renderProductDetail() {
    var p = findProduct(state.selectedProductId);
    if (!p) { navigate('catalog'); return; }
    var el = document.getElementById('product-detail');
    var variantId = state.selectedVariantId || defaultVariantId(p);
    state.selectedVariantId = variantId;
    var selected = variantMeta(p, variantId);
    var variants = (p.variants || []).length
      ? p.variants
      : [{ id: p.variant_id || 'v1', label: p.unit || 'Default', unit: p.unit || 'unit' }];
    var variantCards = variants.map(function (v) {
      var meta = variantMeta(p, v.id);
      var isSelected = v.id === variantId;
      var disabled = meta.stock <= 0;
      return '<button type="button" class="variant-card' + (isSelected ? ' selected' : '') +
        (disabled ? ' disabled' : '') + '" data-variant="' + esc(v.id) + '"' +
        (disabled ? ' disabled' : '') + '>' +
        '<span class="variant-check" aria-hidden="true">&#10003;</span>' +
        '<span class="variant-weight">' + esc(meta.label) + '</span>' +
        '<span class="variant-price">&#8377;' + meta.price + '</span>' +
        '</button>';
    }).join('');
    var detailImage = imgTag(p.image, p.name, { width: 700, height: 700, eager: true })
      || '<div class="placeholder-label">[ ' + esc(p.image) + ' ]</div>';
    var parameters = (p.parameters || []).map(function (item) {
      return '<div class="detail-parameter"><span>' + esc(item.label) + '</span><strong>' + esc(item.value) + '</strong></div>';
    }).join('');
    var inStock = selected.stock > 0;
    el.innerHTML = '' +
      '<div class="detail-grid">' +
        '<div class="detail-image' + ((typeof p.image === 'string' && p.image.indexOf('/') === 0) ? '' : ' placeholder placeholder-light') + '">' + detailImage + '</div>' +
        '<div>' +
          '<div class="eyebrow c-red">' + esc(p.categoryLabel) + '</div>' +
          '<h1 class="detail-title">' + esc(p.name) + '</h1>' +
          '<div class="detail-price-row">' +
            '<div class="detail-price">&#8377;' + selected.price + ' <span>/ ' + esc(selected.unit) + '</span></div>' +
            '<span class="detail-availability' + (inStock ? '' : ' out') + '">' +
              (inStock ? 'Available' : 'Out of Stock') + '</span>' +
          '</div>' +
          '<p class="detail-desc">' + esc(p.desc) + '</p>' +
          (parameters ? '<div class="detail-parameters" aria-label="Product parameters">' + parameters + '</div>' : '') +
          '<div class="detail-stock ' + (inStock ? 'in-stock' : 'out-of-stock') + '">' +
            (inStock ? esc(selected.stock) + ' in stock at this store' : 'Currently out of stock') +
          '</div>' +
          (variants.length > 1
            ? '<div class="variant-section"><div class="variant-label">Select Weight</div><div class="variant-grid">' +
              variantCards + '</div></div>'
            : '') +
          '<div class="detail-qty-label">Quantity</div>' +
          '<div class="qty-row">' +
            '<div class="qty-stepper"><button id="qty-dec" type="button">&minus;</button><span id="qty-val">' + state.detailQty + '</span><button id="qty-inc" type="button">+</button></div>' +
            '<span style="font-size:13px;color:#55594F;">' + esc(selected.label) + '</span>' +
          '</div>' +
          '<button class="btn btn-dark" id="detail-add"' + (inStock ? '' : ' disabled') + '>Add to Cart</button>' +
        '</div>' +
      '</div>';
    el.querySelectorAll('[data-variant]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        state.selectedVariantId = btn.getAttribute('data-variant');
        renderProductDetail();
      });
    });
    document.getElementById('qty-dec').addEventListener('click', function () {
      state.detailQty = Math.max(1, state.detailQty - 1);
      document.getElementById('qty-val').textContent = state.detailQty;
    });
    document.getElementById('qty-inc').addEventListener('click', function () {
      state.detailQty += 1;
      document.getElementById('qty-val').textContent = state.detailQty;
    });
    document.getElementById('detail-add').addEventListener('click', function () {
      addToCart(p.id, state.detailQty, variantId);
      state.detailQty = 1;
      renderProductDetail();
      renderHeader();
    });

    var relatedGrid = document.getElementById('related-products');
    var related = relatedProductsFor(p, 4);
    relatedGrid.innerHTML = related.length
      ? related.map(productCardHTML).join('')
      : '<p class="muted">More products coming soon.</p>';
    wireProductGrid(relatedGrid);
  }

  /* ---- CART ---- */
  function renderCart() {
    var lines = cartLines();
    var el = document.getElementById('cart-content');
    if (lines.length === 0) {
      el.innerHTML = '<div class="empty-state"><div class="empty-copy">Your cart is empty.</div><button class="btn btn-dark" id="cart-shop">Shop Now</button></div>';
      document.getElementById('cart-shop').addEventListener('click', function () { navigate('catalog', { category: 'all' }); });
      return;
    }
    var sub = cartSubtotal(), fee = deliveryFee(), total = sub + fee;
    el.innerHTML = '' +
      '<div class="cart-grid">' +
        '<div class="cart-lines">' + lines.map(function (l) {
          var thumb = imgTag(l.image, l.name, { width: 96, height: 96 });
          return '' +
            '<div class="cart-line">' +
              '<div class="cart-thumb">' + thumb + '</div>' +
              '<div class="cart-line-info"><div class="cart-line-name">' + esc(l.name) +
              (l.variant_label ? ' <span class="muted">(' + esc(l.variant_label) + ')</span>' : '') +
              '</div><div class="cart-line-price">&#8377;' + l.price + ' / ' + esc(l.unit) + '</div></div>' +
              '<div class="qty-stepper"><button data-dec="' + esc(l.cartKey) + '">&minus;</button><span>' + l.qty + '</span><button data-inc="' + esc(l.cartKey) + '">+</button></div>' +
              '<div class="cart-line-total">&#8377;' + l.lineTotal + '</div>' +
              '<span class="remove-btn" data-remove="' + esc(l.cartKey) + '">Remove</span>' +
            '</div>';
        }).join('') + '</div>' +
        '<div class="card">' +
          '<h3 class="h3">Order Summary</h3>' +
          '<div class="summary-row"><span>Subtotal</span><span>&#8377;' + sub + '</span></div>' +
          '<div class="summary-row"><span>Delivery Fee</span><span>&#8377;' + fee + '</span></div>' +
          '<div class="summary-row total"><span>Total</span><span>&#8377;' + total + '</span></div>' +
          '<button class="btn btn-dark full-width" id="cart-checkout" style="margin-top:22px;">Proceed to Checkout</button>' +
        '</div>' +
      '</div>';
    el.querySelectorAll('[data-inc]').forEach(function (b) { b.addEventListener('click', function () { changeQty(b.getAttribute('data-inc'), 1); }); });
    el.querySelectorAll('[data-dec]').forEach(function (b) { b.addEventListener('click', function () { changeQty(b.getAttribute('data-dec'), -1); }); });
    el.querySelectorAll('[data-remove]').forEach(function (b) { b.addEventListener('click', function () { removeItem(b.getAttribute('data-remove')); }); });
    document.getElementById('cart-checkout').addEventListener('click', function () { navigate('checkout'); });
  }

  /* ---- CHECKOUT ---- */
  function fillCheckoutSavedAddresses() {
    var field = document.getElementById('checkout-saved-address-field');
    var select = document.getElementById('checkout-saved-address');
    if (!field || !select) return;
    var addresses = userAddresses();
    var isPickup = state.checkoutMode === 'pickup';
    if (!state.user || !addresses.length || isPickup) {
      field.style.display = 'none';
      return;
    }
    field.style.display = '';
    var current = select.value;
    select.innerHTML = '<option value="">Enter a new address</option>' + addresses.map(function (a) {
      var label = esc(a.label) + ' — ' + esc(a.line1);
      return '<option value="' + esc(a.id) + '">' + label + '</option>';
    }).join('');
    if (current && addresses.some(function (a) { return a.id === current; })) {
      select.value = current;
    } else {
      var def = defaultAddress();
      select.value = def ? def.id : '';
    }
    applySavedAddressSelection();
    select.onchange = applySavedAddressSelection;
  }

  function applySavedAddressSelection() {
    var select = document.getElementById('checkout-saved-address');
    var addressInput = document.getElementById('checkout-address');
    var pincodeInput = document.getElementById('checkout-pincode');
    if (!select || !addressInput) return;
    var id = select.value;
    if (!id) return;
    var addr = userAddresses().find(function (a) { return a.id === id; });
    if (!addr) return;
    addressInput.value = addr.line1 || '';
    if (pincodeInput && addr.pincode) pincodeInput.value = addr.pincode;
    if (addr.area) {
      var match = LOCATIONS.find(function (loc) {
        return loc.name.toLowerCase() === String(addr.area).toLowerCase()
          || String(loc.area || '').toLowerCase().indexOf(String(addr.area).toLowerCase()) !== -1;
      });
      if (match) state.checkoutArea = match.name;
    }
  }

  function renderCheckout() {
    if (state.user) {
      if (!document.getElementById('checkout-name').value) document.getElementById('checkout-name').value = state.user.name || '';
      if (!document.getElementById('checkout-phone').value) document.getElementById('checkout-phone').value = state.user.phone || '';
      if (!document.getElementById('checkout-address').value) {
        var def = defaultAddress();
        if (def) {
          document.getElementById('checkout-address').value = def.line1 || '';
          if (def.pincode) document.getElementById('checkout-pincode').value = def.pincode;
          if (def.area && !state.checkoutArea) {
            var match = LOCATIONS.find(function (loc) {
              return loc.name.toLowerCase() === String(def.area).toLowerCase();
            });
            if (match) state.checkoutArea = match.name;
          }
        } else if (state.user.address) {
          document.getElementById('checkout-address').value = state.user.address;
        }
      }
    }
    var modeEl = document.getElementById('checkout-mode');
    if (modeEl) {
      modeEl.querySelectorAll('[data-mode]').forEach(function (el) {
        el.classList.toggle('selected', el.getAttribute('data-mode') === state.checkoutMode);
        el.onclick = function () { state.checkoutMode = el.getAttribute('data-mode'); renderCheckout(); };
      });
      var addrField = document.getElementById('checkout-address-field');
      var pinField = document.getElementById('checkout-pincode-field');
      var isPickup = state.checkoutMode === 'pickup';
      if (addrField) addrField.style.display = isPickup ? 'none' : '';
      if (pinField) pinField.style.display = isPickup ? 'none' : '';
    }
    fillCheckoutSavedAddresses();

    var areasEl = document.getElementById('checkout-areas');
    areasEl.innerHTML = LOCATIONS.map(function (loc) {
      return '<span class="area-option' + (loc.name === state.checkoutArea ? ' selected' : '') + '" data-area="' + esc(loc.name) + '">' + esc(loc.name) + '</span>';
    }).join('');
    areasEl.querySelectorAll('[data-area]').forEach(function (el) {
      el.addEventListener('click', function () { state.checkoutArea = el.getAttribute('data-area'); renderCheckout(); });
    });

    var applyBtn = document.getElementById('checkout-apply-coupon');
    if (applyBtn) applyBtn.onclick = applyCoupon;

    var lines = cartLines(), sub = cartSubtotal(), fee = deliveryFee(), disc = couponDiscount();
    var gstAmount = cartGstAmount();
    var halfGst = gstAmount > 0 ? (gstAmount / 2) : 0;
    var total = Math.max(0, sub - disc) + fee;
    document.getElementById('checkout-summary-lines').innerHTML = lines.map(function (l) {
      var label = l.variant_label ? l.name + ' (' + l.variant_label + ')' : l.name;
      return '<div class="summary-line"><span>' + esc(label) + ' &times; ' + l.qty + '</span><span>&#8377;' + l.lineTotal + '</span></div>';
    }).join('');
    document.getElementById('checkout-subtotal').textContent = '\u20b9' + sub.toFixed(2);
    document.getElementById('checkout-delivery').textContent = '\u20b9' + fee;
    document.getElementById('checkout-total').textContent = '\u20b9' + total.toFixed(2);
    var cgstRow = document.getElementById('checkout-cgst-row');
    var sgstRow = document.getElementById('checkout-sgst-row');
    if (cgstRow && sgstRow) {
      var showGst = gstAmount > 0;
      cgstRow.classList.toggle('hidden', !showGst);
      sgstRow.classList.toggle('hidden', !showGst);
      if (showGst) {
        document.getElementById('checkout-cgst').textContent = '\u20b9' + halfGst.toFixed(2);
        document.getElementById('checkout-sgst').textContent = '\u20b9' + halfGst.toFixed(2);
      }
    }
    var discRow = document.getElementById('checkout-discount-row');
    if (discRow) {
      discRow.classList.toggle('hidden', !disc);
      document.getElementById('checkout-discount').textContent = '\u2212\u20b9' + disc;
    }
    var note = document.getElementById('checkout-minorder-note');
    if (note) {
      note.textContent = (state.checkoutMode === 'delivery' && sub > 0 && sub < SETTINGS.min_order_value)
        ? 'Orders below \u20b9' + SETTINGS.min_order_value + ' include a \u20b9' + SETTINGS.delivery_fee_below_min + ' delivery charge. Add \u20b9' + (SETTINGS.min_order_value - sub) + ' more for free delivery.'
        : '';
    }
  }

  function applyCoupon() {
    var input = document.getElementById('checkout-coupon');
    var msg = document.getElementById('checkout-coupon-msg');
    var code = input.value.trim();
    if (!code) { state.coupon = null; msg.textContent = ''; renderCheckout(); return; }
    fetch('/api/coupons/validate', {
      method: 'POST',
      headers: famCsrfHeaders(),
      body: JSON.stringify({
        code: code,
        subtotal: cartSubtotal(),
        phone: (document.getElementById('checkout-phone') || {}).value || ''
      })
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (res.ok && res.d.valid) {
          state.coupon = { code: code.toUpperCase(), discount: res.d.discount };
          msg.style.color = '#1E7A34';
          msg.textContent = 'Coupon applied — you save \u20b9' + res.d.discount + '!';
        } else {
          state.coupon = null;
          msg.style.color = '#A5342A';
          msg.textContent = (res.d && res.d.error) || 'Invalid coupon';
        }
        renderCheckout();
      })
      .catch(function () {
        state.coupon = null;
        msg.style.color = '#A5342A';
        msg.textContent = 'Could not validate coupon';
      });
  }

  function storeIdForArea(areaName) {
    var loc = LOCATIONS.find(function (l) { return l.name === areaName; });
    return (loc && loc.id) || selectedStoreId || 'store_andheri';
  }

  function finishLocalOrder(order) {
    state.lastOrder = order;
    state.cart = [];
    saveCart();
    state.coupon = null;
    state.orders = [];
    renderHeader();
    var msg = order.mode === 'pickup'
      ? 'Order #' + esc(order.id) + ' confirmed for pickup at ' + esc(order.area) + '. Pay &#8377;' + order.total + ' in cash at the store.'
      : 'Order #' + esc(order.id) + ' confirmed for ' + esc(order.area) + '. Pay &#8377;' + order.total + ' in cash when it arrives.';
    document.getElementById('confirm-text').innerHTML = msg;
    navigate('confirmation');
  }

  function submitCheckout(e) {
    e.preventDefault();
    var name = document.getElementById('checkout-name').value.trim();
    var phone = document.getElementById('checkout-phone').value.trim();
    var address = document.getElementById('checkout-address').value.trim();
    var pincode = document.getElementById('checkout-pincode').value.trim();
    var instructions = (document.getElementById('checkout-instructions') || { value: '' }).value.trim();
    var area = state.checkoutArea;
    var isPickup = state.checkoutMode === 'pickup';
    var errEl = document.getElementById('checkout-error');
    if (!name || !phone || !area || (!isPickup && !address)) {
      errEl.textContent = isPickup
        ? 'Please fill in your name, phone and pickup store area.'
        : 'Please fill in all delivery details, including area.';
      return;
    }
    errEl.textContent = '';
    var lines = cartLines(), sub = cartSubtotal(), fee = deliveryFee(), disc = couponDiscount();
    var total = Math.max(0, sub - disc) + fee;
    var storeId = storeIdForArea(area);
    selectedStoreId = storeId;

    var payload = {
      name: name,
      phone: phone,
      address: isPickup ? '' : address,
      area: area,
      pincode: pincode,
      store_id: storeId,
      delivery_mode: state.checkoutMode,
      coupon_code: state.coupon ? state.coupon.code : '',
      special_instructions: instructions,
      items: lines.map(function (l) {
        return {
          product_id: l.id,
          variant_id: l.variant_id || (l.variants && l.variants[0] && l.variants[0].id) || 'v1',
          qty: l.qty
        };
      })
    };

    if (!API_LIVE) {
      errEl.textContent = 'Server unavailable. Orders must be saved to the database.';
      return;
    }

    fetch('/api/orders', {
      method: 'POST',
      headers: famCsrfHeaders(),
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) {
          errEl.textContent = (res.d && res.d.error) || 'Could not place order.';
          return;
        }
        var o = res.d.order;
        finishLocalOrder({
          id: o.order_id,
          date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
          items: lines.map(function (l) { return { name: l.name, qty: l.qty, price: l.price, unit: l.unit }; }),
          subtotal: o.subtotal, deliveryFee: o.delivery_fee, discount: o.discount || 0, total: o.total,
          name: name, phone: phone, address: address, area: area, pincode: pincode,
          mode: o.delivery_mode || state.checkoutMode,
          status: o.status || 'new'
        });
        loadCatalogFromApi(function () {});
      })
      .catch(function () {
        errEl.textContent = 'Server error while placing order. Try again.';
      });
  }

  /* ---- LOGIN / SIGNUP ---- */
  function submitLogin(e) {
    e.preventDefault();
    var phone = document.getElementById('login-phone').value.trim();
    var password = document.getElementById('login-password').value;
    var errEl = document.getElementById('login-error');
    if (!phone || !password) { errEl.textContent = 'Enter phone and password.'; return; }
    errEl.textContent = 'Signing in…';
    fetch('/api/auth/login', {
      method: 'POST',
      headers: famCsrfHeaders(),
      credentials: 'same-origin',
      body: JSON.stringify({ phone: phone, password: password })
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) {
          errEl.textContent = (res.d && res.d.error) || 'No matching account found. Please sign up.';
          return;
        }
        applyCustomerPayload(res.d.customer);
        if (Array.isArray(res.d.cart) && res.d.cart.length) state.cart = res.d.cart;
        if (res.d.preferred_store_id) selectedStoreId = res.d.preferred_store_id;
        saveCart();
        document.getElementById('login-phone').value = '';
        document.getElementById('login-password').value = '';
        errEl.textContent = '';
        renderHeader();
        loadAccountOrders(function () { navigate('account'); });
      })
      .catch(function () {
        errEl.textContent = 'Could not reach the server. Please try again.';
      });
  }

  function submitSignup(e) {
    e.preventDefault();
    var name = document.getElementById('signup-name').value.trim();
    var phone = document.getElementById('signup-phone').value.trim();
    var email = document.getElementById('signup-email').value.trim();
    var password = document.getElementById('signup-password').value;
    var errEl = document.getElementById('signup-error');
    if (!name || !phone || !password) { errEl.textContent = 'Please fill in name, phone and password.'; return; }
    errEl.textContent = 'Creating account…';
    fetch('/api/auth/signup', {
      method: 'POST',
      headers: famCsrfHeaders(),
      credentials: 'same-origin',
      body: JSON.stringify({ name: name, phone: phone, email: email, password: password })
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) {
          errEl.textContent = (res.d && res.d.error) || 'Could not create account.';
          return;
        }
        applyCustomerPayload(res.d.customer);
        saveCart();
        document.getElementById('signup-form').reset();
        errEl.textContent = '';
        renderHeader();
        loadAccountOrders(function () { navigate('account'); });
      })
      .catch(function () {
        errEl.textContent = 'Could not reach the server. Please try again.';
      });
  }

  function logout() {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(function () {});
    state.user = null;
    state.orders = [];
    state.cart = [];
    renderHeader();
    navigate('home');
  }

  function loadAccountOrders(done) {
    if (!state.user) {
      state.orders = [];
      if (done) done();
      return;
    }
    fetch('/api/account/orders', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (data) {
        state.orders = (data.items || []).map(function (o) {
          return {
            id: o.id,
            date: o.date,
            status: (o.status || '').replace(/_/g, ' '),
            total: o.total,
            area: o.area,
            items: o.items || [],
            subtotal: o.subtotal,
            deliveryFee: o.delivery_fee || 0,
            discount: o.discount || 0,
            gstAmount: o.gst_amount || 0,
            couponCode: o.coupon_code || '',
            deliveryMode: o.delivery_mode || 'delivery',
            paymentMethod: o.payment_method || 'cod',
            address: o.address || '',
            deliveryArea: o.delivery_area || '',
            pincode: o.pincode || '',
            instructions: o.special_instructions || ''
          };
        });
        if (done) done();
        else if (state.page === 'account') renderAccount();
      })
      .catch(function () {
        state.orders = [];
        if (done) done();
      });
  }

  function restoreCustomerSession() {
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (data) {
        if (data.authenticated && data.customer) {
          applyCustomerPayload(data.customer);
          if (Array.isArray(data.cart)) state.cart = data.cart;
          if (data.preferred_store_id) selectedStoreId = data.preferred_store_id;
          enrichCartFromCatalog();
          renderHeader();
          loadAccountOrders();
        } else {
          state.user = null;
          state.orders = [];
        }
      })
      .catch(function () {
        state.user = null;
        state.orders = [];
      });
  }

  /* ---- ACCOUNT ---- */
  function setAccountMsg(id, text, ok) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('is-ok', !!ok);
    el.classList.toggle('is-err', !ok && !!text);
  }

  function saveProfile(e) {
    e.preventDefault();
    var name = document.getElementById('acct-name').value.trim();
    var email = document.getElementById('acct-email').value.trim();
    var preferred = document.getElementById('acct-preferred-store').value;
    setAccountMsg('acct-profile-msg', 'Saving…', true);
    fetch('/api/account/profile', {
      method: 'PUT',
      headers: famCsrfHeaders(),
      credentials: 'same-origin',
      body: JSON.stringify({ name: name, email: email, preferred_store_id: preferred })
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) {
          setAccountMsg('acct-profile-msg', (res.d && res.d.error) || 'Could not update profile.', false);
          return;
        }
        applyCustomerPayload(res.d.customer);
        if (preferred) selectedStoreId = preferred;
        renderHeader();
        setAccountMsg('acct-profile-msg', 'Profile updated.', true);
      })
      .catch(function () { setAccountMsg('acct-profile-msg', 'Could not reach the server.', false); });
  }

  function savePassword(e) {
    e.preventDefault();
    var current = document.getElementById('acct-current-password').value;
    var next = document.getElementById('acct-new-password').value;
    setAccountMsg('acct-password-msg', 'Updating…', true);
    fetch('/api/account/password', {
      method: 'PUT',
      headers: famCsrfHeaders(),
      credentials: 'same-origin',
      body: JSON.stringify({ current_password: current, new_password: next })
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) {
          setAccountMsg('acct-password-msg', (res.d && res.d.error) || 'Could not update password.', false);
          return;
        }
        document.getElementById('acct-current-password').value = '';
        document.getElementById('acct-new-password').value = '';
        setAccountMsg('acct-password-msg', 'Password updated.', true);
      })
      .catch(function () { setAccountMsg('acct-password-msg', 'Could not reach the server.', false); });
  }

  function saveAddressForm(e) {
    e.preventDefault();
    var editingId = document.getElementById('addr-edit-id').value;
    var payload = {
      label: document.getElementById('addr-label').value.trim() || 'Home',
      line1: document.getElementById('addr-line1').value.trim(),
      area: document.getElementById('addr-area').value.trim(),
      pincode: document.getElementById('addr-pincode').value.trim(),
      is_default: document.getElementById('addr-default').checked
    };
    if (!payload.line1) {
      setAccountMsg('acct-address-msg', 'Address line is required.', false);
      return;
    }
    var url = editingId ? '/api/account/addresses/' + encodeURIComponent(editingId) : '/api/account/addresses';
    var method = editingId ? 'PUT' : 'POST';
    setAccountMsg('acct-address-msg', 'Saving address…', true);
    fetch(url, {
      method: method,
      headers: famCsrfHeaders(),
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) {
          setAccountMsg('acct-address-msg', (res.d && res.d.error) || 'Could not save address.', false);
          return;
        }
        applyCustomerPayload(res.d.customer || Object.assign({}, state.user, { addresses: res.d.addresses || [] }));
        renderAccount();
      })
      .catch(function () { setAccountMsg('acct-address-msg', 'Could not reach the server.', false); });
  }

  function editAddress(id) {
    var addr = userAddresses().find(function (a) { return a.id === id; });
    if (!addr) return;
    document.getElementById('addr-edit-id').value = addr.id;
    document.getElementById('addr-label').value = addr.label || '';
    document.getElementById('addr-line1').value = addr.line1 || '';
    document.getElementById('addr-area').value = addr.area || '';
    document.getElementById('addr-pincode').value = addr.pincode || '';
    document.getElementById('addr-default').checked = !!addr.is_default;
    document.getElementById('addr-form-title').textContent = 'Edit Address';
    document.getElementById('addr-submit').textContent = 'Update Address';
    document.getElementById('addr-cancel-edit').classList.remove('hidden');
    setAccountMsg('acct-address-msg', '', true);
  }

  function resetAddressForm() {
    document.getElementById('addr-edit-id').value = '';
    document.getElementById('addr-label').value = '';
    document.getElementById('addr-line1').value = '';
    document.getElementById('addr-area').value = '';
    document.getElementById('addr-pincode').value = '';
    document.getElementById('addr-default').checked = userAddresses().length === 0;
    document.getElementById('addr-form-title').textContent = 'Add Address';
    document.getElementById('addr-submit').textContent = 'Save Address';
    document.getElementById('addr-cancel-edit').classList.add('hidden');
  }

  function deleteAddress(id) {
    if (!window.confirm('Remove this saved address?')) return;
    fetch('/api/account/addresses/' + encodeURIComponent(id), {
      method: 'DELETE',
      credentials: 'same-origin'
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) {
          setAccountMsg('acct-address-msg', (res.d && res.d.error) || 'Could not delete address.', false);
          return;
        }
        applyCustomerPayload(res.d.customer || Object.assign({}, state.user, { addresses: res.d.addresses || [] }));
        renderAccount();
      })
      .catch(function () { setAccountMsg('acct-address-msg', 'Could not reach the server.', false); });
  }

  function renderAccount() {
    var el = document.getElementById('account-content');
    if (!state.user) {
      el.innerHTML = '<div class="empty-state"><div class="empty-copy">Please log in to view your account.</div><button class="btn btn-dark" id="acct-login">Log In</button></div>';
      document.getElementById('acct-login').addEventListener('click', function () { navigate('login'); });
      return;
    }
    loadAccountOrders(function () {
      var addresses = userAddresses();
      var storeOptions = LOCATIONS.map(function (loc) {
        var selected = (state.user.preferred_store_id || selectedStoreId) === loc.id ? ' selected' : '';
        return '<option value="' + esc(loc.id) + '"' + selected + '>' + esc(loc.name) + '</option>';
      }).join('');
      var addressCards = addresses.length === 0
        ? '<p class="muted">No saved addresses yet. Add one below for faster checkout.</p>'
        : '<div class="address-list">' + addresses.map(function (a) {
            return '' +
              '<div class="address-card' + (a.is_default ? ' is-default' : '') + '">' +
                '<div>' +
                  '<div class="address-label">' + esc(a.label || 'Home') +
                    (a.is_default ? '<span class="address-default-pill">Default</span>' : '') +
                  '</div>' +
                  '<div class="address-line">' + esc(a.line1) + '</div>' +
                  ((a.area || a.pincode) ? '<div class="address-line">' + esc([a.area, a.pincode].filter(Boolean).join(' · ')) + '</div>' : '') +
                '</div>' +
                '<div class="address-actions">' +
                  '<button type="button" data-edit-addr="' + esc(a.id) + '">Edit</button>' +
                  '<button type="button" class="danger" data-del-addr="' + esc(a.id) + '">Delete</button>' +
                '</div>' +
              '</div>';
          }).join('') + '</div>';

      var ordersHTML = state.orders.length === 0
        ? '<div class="empty-state card-style"><div class="empty-copy">No orders yet.</div><button class="btn btn-dark" id="acct-shop">Shop Now</button></div>'
        : state.orders.map(function (o, orderIndex) {
            var itemRows = o.items.map(function (item) {
              var qty = Number(item.qty) || 1;
              var price = Number(item.price) || 0;
              var lineTotal = item.line_total != null ? Number(item.line_total) : price * qty;
              return '<div class="order-detail-item">' +
                '<div><div class="order-item-name">' + esc(item.name || 'Item') + '</div>' +
                '<div class="order-item-meta">' + qty + ' &times; &#8377;' + price + '</div></div>' +
                '<strong>&#8377;' + lineTotal + '</strong></div>';
            }).join('');
            var deliveryAddress = [o.address, o.deliveryArea, o.pincode].filter(Boolean).map(esc).join(', ');
            var subtotal = o.subtotal != null ? o.subtotal : Number(o.total) + Number(o.discount || 0) - Number(o.deliveryFee || 0);
            var deliveryLabel = o.deliveryMode === 'pickup' ? 'Store Pickup' : 'Home Delivery';
            var paymentLabel = o.paymentMethod === 'cod' ? 'Cash on Delivery' : o.paymentMethod.replace(/_/g, ' ');
            return '' +
              '<div class="order-card">' +
                '<div><div class="order-id">Order #' + esc(o.id) + '</div><div class="order-meta">' + esc(o.date) + ' &middot; ' + o.items.length + ' item(s) &middot; ' + esc(o.area) + '</div></div>' +
                '<div class="order-card-actions"><span class="order-status">' + esc(o.status) + '</span><div class="order-total">&#8377;' + o.total + '</div>' +
                '<button type="button" class="order-details-btn" data-order-details="' + orderIndex + '" aria-expanded="false">View Details</button></div>' +
                '<div class="order-details hidden" id="order-details-' + orderIndex + '">' +
                  '<div class="order-details-grid">' +
                    '<div><h3 class="h3">Items</h3><div class="order-detail-items">' + itemRows + '</div></div>' +
                    '<div><h3 class="h3">Delivery &amp; Payment</h3>' +
                      '<div class="order-info-row"><span>Order type</span><strong>' + esc(deliveryLabel) + '</strong></div>' +
                      (deliveryAddress ? '<div class="order-info-block"><span>Address</span><strong>' + deliveryAddress + '</strong></div>' : '') +
                      '<div class="order-info-row"><span>Payment</span><strong>' + esc(paymentLabel) + '</strong></div>' +
                      (o.instructions ? '<div class="order-info-block"><span>Instructions</span><strong>' + esc(o.instructions) + '</strong></div>' : '') +
                    '</div>' +
                  '</div>' +
                  '<div class="order-totals">' +
                    '<div class="order-info-row"><span>Subtotal</span><strong>&#8377;' + subtotal + '</strong></div>' +
                    (o.discount ? '<div class="order-info-row discount"><span>Discount' + (o.couponCode ? ' (' + esc(o.couponCode) + ')' : '') + '</span><strong>&minus;&#8377;' + o.discount + '</strong></div>' : '') +
                    '<div class="order-info-row"><span>Delivery fee</span><strong>&#8377;' + o.deliveryFee + '</strong></div>' +
                    (o.gstAmount ? '<div class="order-info-row"><span>GST included</span><strong>&#8377;' + o.gstAmount + '</strong></div>' : '') +
                    '<div class="order-info-row order-grand-total"><span>Total</span><strong>&#8377;' + o.total + '</strong></div>' +
                  '</div>' +
                '</div>' +
              '</div>';
          }).join('');

      el.innerHTML = '' +
        '<h1 class="h1">My Account</h1>' +
        '<div class="account-profile">' +
          '<div class="account-profile-top">' +
            '<div><div class="account-name">' + esc(state.user.name) + '</div>' +
              '<div class="account-detail">' + esc(state.user.phone) + '</div>' +
              '<div class="account-detail">' + esc(state.user.email || 'No email on file') + '</div></div>' +
            '<span class="logout-link" id="acct-logout">Log Out</span>' +
          '</div>' +
          '<form id="acct-profile-form" class="account-form-grid">' +
            '<div class="field"><label>Full Name</label><input id="acct-name" type="text" value="' + esc(state.user.name) + '" required /></div>' +
            '<div class="field"><label>Email</label><input id="acct-email" type="email" value="' + esc(state.user.email || '') + '" placeholder="you@example.com" /></div>' +
            '<div class="field"><label>Phone</label><input type="tel" value="' + esc(state.user.phone) + '" disabled /></div>' +
            '<div class="field"><label>Preferred Store</label><select id="acct-preferred-store"><option value="">No preference</option>' + storeOptions + '</select></div>' +
            '<div class="field full account-form-actions"><button type="submit" class="btn btn-dark">Save Profile</button></div>' +
          '</form>' +
          '<div class="account-msg" id="acct-profile-msg"></div>' +
        '</div>' +
        '<div class="account-section">' +
          '<h3 class="h3">Saved Addresses</h3>' +
          addressCards +
          '<form id="acct-address-form" class="account-form-grid">' +
            '<input type="hidden" id="addr-edit-id" value="" />' +
            '<div class="field full"><h3 class="h3" id="addr-form-title" style="margin:8px 0 0;">Add Address</h3></div>' +
            '<div class="field"><label>Label</label><input id="addr-label" type="text" placeholder="Home / Office" /></div>' +
            '<div class="field"><label>Area</label><input id="addr-area" type="text" placeholder="Andheri West" /></div>' +
            '<div class="field full"><label>Address</label><input id="addr-line1" type="text" placeholder="Flat, building, street" required /></div>' +
            '<div class="field"><label>Pincode</label><input id="addr-pincode" type="text" placeholder="400053" /></div>' +
            '<div class="field" style="display:flex;align-items:flex-end;"><label style="display:flex;gap:8px;align-items:center;font-weight:600;"><input id="addr-default" type="checkbox"' + (addresses.length === 0 ? ' checked' : '') + ' /> Set as default</label></div>' +
            '<div class="field full account-form-actions">' +
              '<button type="submit" class="btn btn-dark" id="addr-submit">Save Address</button>' +
              '<button type="button" class="btn btn-outline-dark hidden" id="addr-cancel-edit">Cancel</button>' +
            '</div>' +
          '</form>' +
          '<div class="account-msg" id="acct-address-msg"></div>' +
        '</div>' +
        '<div class="account-section">' +
          '<h3 class="h3">Change Password</h3>' +
          '<form id="acct-password-form" class="account-form-grid">' +
            '<div class="field"><label>Current Password</label><input id="acct-current-password" type="password" required /></div>' +
            '<div class="field"><label>New Password</label><input id="acct-new-password" type="password" minlength="4" required /></div>' +
            '<div class="field full account-form-actions"><button type="submit" class="btn btn-outline-dark">Update Password</button></div>' +
          '</form>' +
          '<div class="account-msg" id="acct-password-msg"></div>' +
        '</div>' +
        '<h2 class="h2-sm" style="margin-bottom:20px;">Order History</h2>' +
        ordersHTML;

      document.getElementById('acct-logout').addEventListener('click', logout);
      document.getElementById('acct-profile-form').addEventListener('submit', saveProfile);
      document.getElementById('acct-password-form').addEventListener('submit', savePassword);
      document.getElementById('acct-address-form').addEventListener('submit', saveAddressForm);
      document.getElementById('addr-cancel-edit').addEventListener('click', resetAddressForm);
      el.querySelectorAll('[data-edit-addr]').forEach(function (btn) {
        btn.addEventListener('click', function () { editAddress(btn.getAttribute('data-edit-addr')); });
      });
      el.querySelectorAll('[data-del-addr]').forEach(function (btn) {
        btn.addEventListener('click', function () { deleteAddress(btn.getAttribute('data-del-addr')); });
      });
      var shopBtn = document.getElementById('acct-shop');
      if (shopBtn) shopBtn.addEventListener('click', function () { navigate('catalog', { category: 'all' }); });
      el.querySelectorAll('[data-order-details]').forEach(function (button) {
        button.addEventListener('click', function () {
          var details = document.getElementById('order-details-' + button.getAttribute('data-order-details'));
          var opening = details.classList.contains('hidden');
          details.classList.toggle('hidden');
          button.textContent = opening ? 'Hide Details' : 'View Details';
          button.setAttribute('aria-expanded', opening ? 'true' : 'false');
        });
      });
    });
  }

  function trustIconKey(label) {
    var t = String(label || '').toLowerCase();
    if (t.indexOf('fssai') !== -1 || t.indexOf('certif') !== -1) return 'badge';
    if (t.indexOf('frozen') !== -1 || t.indexOf('freshness') !== -1 || t.indexOf('snow') !== -1) return 'snow';
    if (t.indexOf('cash') !== -1 || t.indexOf('cod') !== -1 || t.indexOf('payment') !== -1) return 'cash';
    if (t.indexOf('deliver') !== -1 || t.indexOf('same-day') !== -1 || t.indexOf('same day') !== -1) return 'scooter';
    if (t.indexOf('preserv') !== -1 || t.indexOf('leaf') !== -1 || t.indexOf('natural') !== -1) return 'leaf';
    return 'badge';
  }

  /* ---- PROMO STRIP (configurable from Admin → Storefront Content) ---- */
  var _promoWired = false;
  var _promoCode = '';
  var _promoDismissKey = '';

  function promoDismissKey(promo) {
    var id = String((promo && (promo.code || promo.message)) || 'default')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 48);
    return 'fam_promo_dismissed_' + (id || 'default');
  }

  function formatPromoMessage(message, highlight) {
    var msg = String(message || '');
    var hi = String(highlight || '').trim();
    if (!hi || msg.toLowerCase().indexOf(hi.toLowerCase()) === -1) {
      return esc(msg);
    }
    var idx = msg.toLowerCase().indexOf(hi.toLowerCase());
    return esc(msg.slice(0, idx)) +
      '<strong class="promo-highlight">' + esc(msg.slice(idx, idx + hi.length)) + '</strong>' +
      esc(msg.slice(idx + hi.length));
  }

  function applyPromoStrip() {
    var strip = document.getElementById('promo-strip');
    if (!strip) return;
    var promo = (STOREFRONT_CONTENT && STOREFRONT_CONTENT.promo_strip) || null;
    if (!promo || promo.enabled === false || !(promo.message || '').trim()) {
      strip.classList.add('hidden');
      document.documentElement.classList.add('promo-dismissed');
      document.body.classList.add('promo-dismissed');
      return;
    }

    _promoDismissKey = promoDismissKey(promo);
    var dismissed = false;
    try { dismissed = sessionStorage.getItem(_promoDismissKey) === '1'; } catch (e) { /* ignore */ }
    if (dismissed) {
      strip.classList.add('hidden');
      document.documentElement.classList.add('promo-dismissed');
      document.body.classList.add('promo-dismissed');
      return;
    }

    document.documentElement.classList.remove('promo-dismissed');
    document.body.classList.remove('promo-dismissed');
    strip.classList.remove('hidden');

    var textEl = document.getElementById('promo-text');
    if (textEl) textEl.innerHTML = formatPromoMessage(promo.message, promo.highlight);

    _promoCode = String(promo.code || '').trim().toUpperCase();
    var codeWrap = document.getElementById('promo-code-wrap');
    var codeBtn = document.getElementById('promo-code-btn');
    var codeLabel = document.getElementById('promo-code-label');
    if (codeWrap) codeWrap.classList.toggle('hidden', !_promoCode);
    if (codeLabel) codeLabel.textContent = promo.code_label || 'Use Code:';
    if (codeBtn && _promoCode) {
      codeBtn.textContent = _promoCode;
      codeBtn.title = 'Copy code ' + _promoCode;
      codeBtn.setAttribute('aria-label', 'Copy coupon code ' + _promoCode);
    }

    var shopBtn = document.getElementById('promo-shop');
    if (shopBtn) shopBtn.textContent = promo.cta_text || 'SHOP NOW';

    var closeBtn = document.getElementById('promo-close');
    if (closeBtn) {
      closeBtn.classList.toggle('hidden', promo.dismissible === false);
    }

    wirePromoStripOnce();
  }

  function wirePromoStripOnce() {
    if (_promoWired) return;
    _promoWired = true;

    var closeBtn = document.getElementById('promo-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        document.getElementById('promo-strip').classList.add('hidden');
        document.documentElement.classList.add('promo-dismissed');
        document.body.classList.add('promo-dismissed');
        try {
          if (_promoDismissKey) sessionStorage.setItem(_promoDismissKey, '1');
        } catch (e) { /* ignore */ }
      });
    }

    var shopBtn = document.getElementById('promo-shop');
    if (shopBtn) {
      shopBtn.addEventListener('click', function () {
        navigate('catalog', { category: 'all' });
      });
    }

    var codeBtn = document.getElementById('promo-code-btn');
    if (codeBtn) {
      codeBtn.addEventListener('click', function () {
        var code = _promoCode;
        if (!code) return;
        var done = function () {
          codeBtn.classList.add('is-copied');
          codeBtn.textContent = 'COPIED';
          setTimeout(function () {
            codeBtn.classList.remove('is-copied');
            codeBtn.textContent = code;
          }, 1400);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).then(done).catch(done);
        } else {
          done();
        }
      });
    }
  }

  function initPromoStrip() {
    applyPromoStrip();
  }

  /* ---- HEADER ---- */
  function renderHeader() {
    var count = cartCount();
    var badge = document.getElementById('nav-cart-badge');
    var cartBtn = document.getElementById('nav-cart');
    if (badge) badge.textContent = String(count);
    if (cartBtn) cartBtn.setAttribute('aria-label', 'Cart (' + count + ')');
    var acctEl = document.getElementById('nav-account');
    if (state.user) {
      acctEl.textContent = 'Hi, ' + state.user.name;
      acctEl.onclick = function () { navigate('account'); };
    } else {
      acctEl.textContent = 'Login';
      acctEl.onclick = function () { navigate('login'); };
    }
  }

  /* ---- WIRE STATIC EVENTS ---- */
  function init() {
    initStoreSearch();
    var navToggle = document.getElementById('nav-toggle');
    if (navToggle) {
      navToggle.addEventListener('click', function () {
        var nav = document.getElementById('main-nav');
        var open = !nav.classList.contains('is-open');
        nav.classList.toggle('is-open', open);
        navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        document.body.classList.toggle('nav-open', open);
      });
    }
    document.getElementById('logo-home').addEventListener('click', function () { navigate('home'); });
    document.getElementById('nav-home').addEventListener('click', function () { navigate('home'); });
    document.getElementById('nav-shop').addEventListener('click', function () { navigate('catalog', { category: 'all' }); });
    document.getElementById('nav-locations').addEventListener('click', goToLocations);
    document.getElementById('nav-cart').addEventListener('click', function () { navigate('cart'); });
    document.getElementById('hero-shop').addEventListener('click', function () { navigate('catalog', { category: 'all' }); });
    document.getElementById('hero-locations').addEventListener('click', goToLocations);
    document.getElementById('view-all-link').addEventListener('click', function () { navigate('catalog', { category: 'all' }); });
    document.getElementById('cta-shop').addEventListener('click', function () { navigate('catalog', { category: 'all' }); });
    document.getElementById('product-back').addEventListener('click', function () { navigate('catalog', { category: 'all' }); });
    document.getElementById('checkout-form').addEventListener('submit', submitCheckout);
    document.getElementById('confirm-view-order').addEventListener('click', function () { navigate('account'); });
    document.getElementById('confirm-continue').addEventListener('click', function () { navigate('catalog', { category: 'all' }); });
    document.getElementById('login-form').addEventListener('submit', submitLogin);
    document.getElementById('signup-form').addEventListener('submit', submitSignup);
    document.getElementById('go-signup').addEventListener('click', function () { navigate('signup'); });
    document.getElementById('go-login').addEventListener('click', function () { navigate('login'); });
    document.getElementById('footer-account').addEventListener('click', function () { navigate('account'); });
    document.getElementById('footer-cart').addEventListener('click', function () { navigate('cart'); });
    document.getElementById('footer-locations').addEventListener('click', goToLocations);

    initPromoStrip();

    renderHeader();
    restoreCustomerSession();
    loadCatalogFromApi(function () {
      renderHome();
    });

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) scheduleStorefrontRefresh();
    });
    window.addEventListener('focus', function () {
      scheduleStorefrontRefresh();
    });
    window.addEventListener('pageshow', function (e) {
      if (e.persisted) {
        loadCatalogFromApi(function () {
          enrichCartFromCatalog();
          renderCurrentPage();
          renderHeader();
        });
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
