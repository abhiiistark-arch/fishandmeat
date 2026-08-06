/* Fish and Meat Admin Portal JS */
(function (global) {
  'use strict';

  function toast(msg, isError) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('error', !!isError);
    el.classList.remove('hidden');
    setTimeout(function () { el.classList.add('hidden'); }, 2800);
  }

  async function api(url, opts) {
    opts = opts || {};
    var headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    var fetchOpts = Object.assign({
      credentials: 'same-origin'
    }, opts, { headers: headers });
    var res = await fetch(url, fetchOpts);
    if (res.status === 401) {
      window.location.href = '/admin/login';
      throw new Error('Unauthorized');
    }
    var data = null;
    var ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) data = await res.json();
    if (!res.ok) throw new Error((data && data.error) || 'Request failed');
    return data;
  }

  function isAbortError(err) {
    return err && (err.name === 'AbortError' || err.message === 'The user aborted a request.');
  }

  function upsertChart(existing, canvasId, config) {
    var canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return existing || null;
    if (existing) {
      existing.data.labels = config.data.labels;
      config.data.datasets.forEach(function (ds, i) {
        if (!existing.data.datasets[i]) {
          existing.data.datasets[i] = ds;
        } else {
          existing.data.datasets[i].data = ds.data;
          if (ds.label != null) existing.data.datasets[i].label = ds.label;
          if (ds.backgroundColor != null) existing.data.datasets[i].backgroundColor = ds.backgroundColor;
          if (ds.borderColor != null) existing.data.datasets[i].borderColor = ds.borderColor;
        }
      });
      existing.data.datasets.length = config.data.datasets.length;
      existing.update('none');
      return existing;
    }
    return new Chart(canvas, config);
  }

  function setSlicerBusy(busy) {
    document.querySelectorAll('.report-slicer, #report-kpis, #kpi-grid, .chart-box').forEach(function (el) {
      el.classList.toggle('is-slicer-busy', !!busy);
    });
  }

  function money(n) {
    return '₹' + Number(n || 0).toLocaleString('en-IN');
  }

  function statusBadge(st) {
    var cls = 'badge';
    if (st === 'delivered' || st === 'confirmed' || st === 'active' || st === 'available') cls += ' green';
    else if (st === 'cancelled' || st === 'out_of_stock' || st === 'inactive') cls += ' red';
    else if (st === 'pending' || st === 'new' || st === 'ready' || st === 'out_for_delivery') cls += ' gold';
    return '<span class="' + cls + '">' + (st || '').replace(/_/g, ' ') + '</span>';
  }

  function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name) || '';
  }

  function clearFocusParam() {
    var url = new URL(window.location.href);
    url.searchParams.delete('focus');
    var next = url.pathname + (url.searchParams.toString() ? '?' + url.searchParams.toString() : '');
    window.history.replaceState({}, '', next);
  }

  function renderFocusBar(hostId, label, onClear) {
    var host = document.getElementById(hostId);
    if (!host) return;
    if (!label) {
      host.classList.add('hidden');
      host.innerHTML = '';
      return;
    }
    host.classList.remove('hidden');
    host.innerHTML =
      '<div class="focus-bar-inner">' +
        '<span>Showing selected result: <strong>' + esc(label) + '</strong></span>' +
        '<button type="button" class="btn btn-sm btn-outline" id="focus-back-btn">&larr; View all</button>' +
      '</div>';
    var btn = document.getElementById('focus-back-btn');
    if (btn) {
      btn.onclick = function () {
        clearFocusParam();
        if (onClear) onClear();
      };
    }
  }

  function openModal(id) {
    var d = document.getElementById(id);
    if (d && d.showModal) d.showModal();
  }
  function closeModal(id) {
    var d = document.getElementById(id);
    if (d && d.close) d.close();
  }

  // -------- Shared shell (topbar, badges, footer) --------
  var AdminShell = {
    storeId: localStorage.getItem('fam_admin_store') || '',
    admin: {
      name: document.body.getAttribute('data-admin-name') || 'Admin',
      username: document.body.getAttribute('data-admin-username') || '',
      role: document.body.getAttribute('data-admin-role') || '',
      storeId: document.body.getAttribute('data-admin-store') || '',
      isSuper: document.body.getAttribute('data-admin-super') === '1',
      canManageQrUnits: (function () {
        var role = document.body.getAttribute('data-admin-role') || '';
        var isSuper = document.body.getAttribute('data-admin-super') === '1';
        return isSuper || role === 'Store Admin';
      })()
    },
    initSidebarScroll: function () {
      var nav = document.querySelector('.sidebar-nav');
      if (!nav) return;
      var saved = sessionStorage.getItem('fam_sidebar_scroll');
      if (saved != null) nav.scrollTop = Number(saved) || 0;
      var active = nav.querySelector('.nav-item.active');
      if (active) {
        var navRect = nav.getBoundingClientRect();
        var activeRect = active.getBoundingClientRect();
        if (activeRect.top < navRect.top || activeRect.bottom > navRect.bottom) {
          active.scrollIntoView({ block: 'nearest' });
        }
      }
      var saveTimer = null;
      nav.addEventListener('scroll', function () {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(function () {
          sessionStorage.setItem('fam_sidebar_scroll', String(nav.scrollTop));
        }, 120);
      });
      nav.querySelectorAll('a').forEach(function (link) {
        link.addEventListener('click', function () {
          sessionStorage.setItem('fam_sidebar_scroll', String(nav.scrollTop));
        });
      });
    },
    init: async function () {
      var self = this;
      this.initSidebarScroll();
      if (!this.admin.isSuper && this.admin.storeId) {
        this.storeId = this.admin.storeId;
        localStorage.setItem('fam_admin_store', this.storeId);
      }
      var greet = document.getElementById('topbar-greeting');
      if (greet) {
        var h = new Date().getHours();
        var word = h < 12 ? 'Good morning' : (h < 17 ? 'Good afternoon' : 'Good evening');
        var label = this.admin.name || 'Admin';
        // Show display name + username (e.g. Abhay · @abhi, Mohd Zaman · @zaman)
        if (this.admin.username) label += ' · @' + this.admin.username;
        greet.textContent = word + ', ' + label;
      }

      var sel = document.getElementById('global-store-filter');
      if (sel) {
        try {
          var stores = await api('/api/admin/stores');
          if (self.admin.isSuper) {
            sel.innerHTML = '<option value="">All Stores</option>' + stores.map(function (s) {
              return '<option value="' + s.id + '"' + (s.id === self.storeId ? ' selected' : '') + '>' + esc(s.name) + '</option>';
            }).join('');
            sel.disabled = false;
            sel.onchange = function () {
              self.storeId = sel.value;
              localStorage.setItem('fam_admin_store', sel.value);
              if (window.AdminDashboard && document.getElementById('kpi-grid')) AdminDashboard.scheduleLoad();
              if (window.AdminReports && document.getElementById('report-kpis')) {
                // Keep reports multi-select in sync when topbar store changes
                if (sel.value) AdminReports.selectedStoreIds = [sel.value];
                else AdminReports.selectedStoreIds = [];
                if (AdminReports.renderStoreFilter) AdminReports.renderStoreFilter();
                AdminReports.scheduleLoad();
              }
              var invFilter = document.getElementById('inv-store-filter');
              if (invFilter && window.AdminInventory) {
                invFilter.value = sel.value;
                AdminInventory.load();
              }
            };
          } else {
            var locked = stores.find(function (s) { return s.id === self.admin.storeId; })
              || stores[0]
              || { id: self.admin.storeId, name: 'Assigned Store' };
            sel.innerHTML = '<option value="' + esc(locked.id || '') + '" selected>' + esc(locked.name || 'Assigned Store') + '</option>';
            sel.disabled = true;
            self.storeId = locked.id || self.admin.storeId;
            localStorage.setItem('fam_admin_store', self.storeId);
          }
          var active = stores.filter(function (s) { return s.status === 'active'; }).length;
          var fsStores = document.getElementById('fs-stores');
          if (fsStores) fsStores.textContent = active + '/' + stores.length + ' Stores Active';
        } catch (e) {
          if (!self.admin.isSuper && self.admin.storeId) {
            sel.innerHTML = '<option value="' + esc(self.admin.storeId) + '" selected>Assigned Store</option>';
            sel.disabled = true;
          }
        }
      }

      this.initSearch();
      this.refreshBadges();
    },
    refreshBadges: async function () {
      try {
        var b = await api('/api/admin/badges');
        var ob = document.getElementById('badge-orders');
        var ib = document.getElementById('badge-inventory');
        if (ob) { ob.textContent = b.orders; ob.classList.toggle('hidden', !b.orders); }
        if (ib) { ib.textContent = b.inventory; ib.classList.toggle('hidden', !b.inventory); }
        var fsStock = document.getElementById('fs-stock');
        if (fsStock) fsStock.textContent = b.inventory ? (b.inventory + ' Low Stock Alerts') : 'Stock Healthy';
        var fsStockDot = fsStock && fsStock.previousElementSibling;
        if (fsStockDot) fsStockDot.className = 'f-dot ' + (b.inventory ? 'red' : 'green');
      } catch (e) { /* ignore */ }
    },
    initSearch: function () {
      var input = document.getElementById('global-search');
      var results = document.getElementById('global-search-results');
      if (!input || !results) return;
      var timer = null;
      var abortCtrl = null;
      input.addEventListener('input', function () {
        clearTimeout(timer);
        var q = input.value.trim();
        if (q.length < 2) { results.classList.add('hidden'); return; }
        timer = setTimeout(async function () {
          if (abortCtrl) abortCtrl.abort();
          abortCtrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
          try {
            var data = await api('/api/admin/search?q=' + encodeURIComponent(q), {
              signal: abortCtrl ? abortCtrl.signal : undefined
            });
            var html = '';
            if ((data.orders || []).length) {
              html += '<div class="sr-group">ORDERS</div>' + data.orders.map(function (o) {
                return '<a class="sr-item" href="/admin/orders?focus=' + encodeURIComponent(o.order_id) + '">' +
                  esc(o.order_id) + ' — ' + esc(o.customer_name || '') +
                  ' <span class="muted">' + money(o.total) + ' · ' + esc(o.status) + '</span></a>';
              }).join('');
            }
            if ((data.products || []).length) {
              html += '<div class="sr-group">PRODUCTS</div>' + data.products.map(function (p) {
                return '<a class="sr-item" href="/admin/products?focus=' + encodeURIComponent(p.id) + '">' +
                  esc(p.name) + ' <span class="muted">' + esc(p.sku || '') + '</span></a>';
              }).join('');
            }
            if ((data.categories || []).length) {
              html += '<div class="sr-group">CATEGORIES</div>' + data.categories.map(function (c) {
                return '<a class="sr-item" href="/admin/categories?focus=' + encodeURIComponent(c.id) + '">' +
                  esc(c.name) + ' <span class="muted">' + esc(c.slug || '') + '</span></a>';
              }).join('');
            }
            if ((data.customers || []).length) {
              html += '<div class="sr-group">CUSTOMERS</div>' + data.customers.map(function (c) {
                return '<a class="sr-item" href="/admin/customers?focus=' + encodeURIComponent(c.id) + '">' +
                  esc(c.name) + ' <span class="muted">' + esc(c.phone || '') + '</span></a>';
              }).join('');
            }
            if ((data.staff || []).length) {
              html += '<div class="sr-group">STAFF</div>' + data.staff.map(function (m) {
                return '<a class="sr-item" href="/admin/staff?focus=' + encodeURIComponent(m.id) + '">' +
                  esc(m.name) + ' <span class="muted">' + esc(m.role || '') + '</span></a>';
              }).join('');
            }
            results.innerHTML = html || '<div class="sr-empty">No matches for “' + esc(q) + '”</div>';
            results.classList.remove('hidden');
          } catch (e) {
            if (isAbortError(e)) return;
            results.classList.add('hidden');
          }
        }, 180);
      });
      document.addEventListener('click', function (e) {
        if (!input.contains(e.target) && !results.contains(e.target)) results.classList.add('hidden');
      });
    }
  };

  document.addEventListener('DOMContentLoaded', function () { AdminShell.init(); });

  // -------- Dashboard --------
  var salesChart, storeChart;

  function periodSalesKpi(period, k) {
    if (period === 'day') return money(k.sales_today);
    if (period === 'month') return money(k.sales_month);
    if (period === 'quarter') return money(k.sales_quarter);
    if (period === 'year') return money(k.sales_year);
    return money(k.sales_period);
  }

  var PERIOD_CAPTIONS = {
    day: 'Last 14 days',
    month: 'Last 12 months',
    quarter: 'Last 8 quarters',
    year: 'Last 5 years'
  };

  var PERIOD_KPI_LABELS = {
    day: 'Sales Today',
    month: 'Sales This Month',
    quarter: 'Sales This Quarter',
    year: 'Sales This Year'
  };

  var AdminDashboard = {
    period: 'month',
    anchor: '',
    loadToken: 0,
    loadTimer: null,
    abortCtrl: null,
    init: function () {
      var self = this;
      this.anchor = this.defaultAnchor(this.period);
      this.renderAnchorControl();
      document.querySelectorAll('.dashboard-slicer .seg-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          document.querySelectorAll('.dashboard-slicer .seg-btn').forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          self.period = btn.getAttribute('data-period');
          self.anchor = self.defaultAnchor(self.period);
          self.renderAnchorControl();
          self.updateCaption();
          self.scheduleLoad();
        });
      });
      this.updateCaption();
      this.load();
    },
    scheduleLoad: function () {
      var self = this;
      clearTimeout(this.loadTimer);
      this.loadTimer = setTimeout(function () { self.load(); }, 40);
    },
    updateCaption: function () {
      document.getElementById('chart-caption').textContent =
        PERIOD_CAPTIONS[this.period] || '';
    },
    defaultAnchor: function (period) {
      var now = new Date();
      var y = now.getFullYear();
      var m = String(now.getMonth() + 1).padStart(2, '0');
      var d = String(now.getDate()).padStart(2, '0');
      if (period === 'day') return y + '-' + m + '-' + d;
      if (period === 'month') return y + '-' + m;
      if (period === 'quarter') return y + '-Q' + (Math.floor(now.getMonth() / 3) + 1);
      return String(y);
    },
    queryParams: function () {
      var params = new URLSearchParams();
      params.set('period', this.period);
      if (this.anchor) params.set('anchor', this.anchor);
      if (AdminShell.storeId) params.set('store_id', AdminShell.storeId);
      return params;
    },
    renderAnchorControl: function () {
      var self = this;
      var wrap = document.getElementById('dashboard-anchor-wrap');
      if (!wrap) return;
      var html = '';
      if (this.period === 'day') {
        html = '<label for="dashboard-anchor">Date</label>' +
          '<input type="date" id="dashboard-anchor" value="' + esc(this.anchor) + '" />';
      } else if (this.period === 'month') {
        html = '<label for="dashboard-anchor">Month</label>' +
          '<input type="month" id="dashboard-anchor" value="' + esc(this.anchor) + '" />';
      } else if (this.period === 'quarter') {
        var parts = String(this.anchor || '').split('-Q');
        var year = parts[0] || String(new Date().getFullYear());
        var quarter = parts[1] || '1';
        html = '<label for="dashboard-anchor-year">Year</label>' +
          '<input type="number" id="dashboard-anchor-year" min="2000" max="2100" value="' + esc(year) + '" />' +
          '<label for="dashboard-anchor-quarter">Quarter</label>' +
          '<select id="dashboard-anchor-quarter">' +
            [1, 2, 3, 4].map(function (n) {
              return '<option value="' + n + '"' + (String(n) === String(quarter) ? ' selected' : '') + '>Q' + n + '</option>';
            }).join('') +
          '</select>';
      } else {
        html = '<label for="dashboard-anchor">Year</label>' +
          '<input type="number" id="dashboard-anchor" min="2000" max="2100" value="' + esc(this.anchor) + '" />';
      }
      wrap.innerHTML = html;
      wrap.querySelectorAll('input, select').forEach(function (control) {
        control.onchange = function () {
          if (self.period === 'quarter') {
            self.anchor = document.getElementById('dashboard-anchor-year').value +
              '-Q' + document.getElementById('dashboard-anchor-quarter').value;
          } else {
            self.anchor = document.getElementById('dashboard-anchor').value;
          }
          self.scheduleLoad();
        };
      });
    },
    periodSalesKpi: function (k) {
      return periodSalesKpi(this.period, k);
    },
    load: async function () {
      var token = ++this.loadToken;
      if (this.abortCtrl) this.abortCtrl.abort();
      this.abortCtrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      setSlicerBusy(true);
      var updEl = document.getElementById('dash-updated');
      if (updEl) updEl.textContent = 'Updating…';
      try {
        var data = await api('/api/admin/stats?' + this.queryParams().toString(), {
          signal: this.abortCtrl ? this.abortCtrl.signal : undefined
        });
        if (token !== this.loadToken) return;
        var k = data.kpis;
        var periodLabel = data.selection_label || PERIOD_KPI_LABELS[this.period] || 'Period Sales';
        if (data.period_caption) {
          document.getElementById('chart-caption').textContent = data.period_caption;
        }

        var dateEl = document.getElementById('dash-date');
        if (dateEl) {
          dateEl.textContent = data.period_caption || data.selection_label || '';
        }
        if (updEl) updEl.textContent = 'Last updated ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

        function deltaHtml(pct) {
          if (pct == null) return '';
          var up = pct >= 0;
          return '<div class="delta ' + (up ? 'up' : 'down') + '">' + (up ? '↑ ' : '↓ ') +
            Math.abs(pct) + '% <span style="font-weight:400;color:#55594F">vs previous</span></div>';
        }
        function kpiCard(label, value, cls, delta, sub, href, alert) {
          var tag = href ? 'a' : 'div';
          return '<' + tag + (href ? ' href="' + href + '"' : '') +
            ' class="kpi' + (href ? ' kpi-link' : '') + ' ' + (cls || '') + '">' +
            '<div class="label">' + (alert ? '<span class="alert-dot"></span>' : '') + label +
            '</div><div class="value">' + value + '</div>' + (delta || '') +
            (sub ? '<div class="sub">' + sub + '</div>' : '') + '</' + tag + '>';
        }
        document.getElementById('kpi-grid').innerHTML = [
          kpiCard(periodLabel, k.sales_selected != null ? money(k.sales_selected) : this.periodSalesKpi(k),
                  'gold', deltaHtml(data.deltas.sales_pct),
                  'Avg order ' + money(k.avg_order_value), '/admin/reports'),
          kpiCard('Total Orders', k.orders_selected != null ? k.orders_selected : k.orders_total,
                  '', deltaHtml(data.deltas.orders_pct),
                  k.pending_orders + ' open · ' + (k.cancelled_orders || 0) + ' cancelled',
                  '/admin/orders'),
          kpiCard('Customers', k.customers_selected != null ? k.customers_selected : k.customers_total,
                  '', '', 'Registered in selected period',
                  '/admin/customers'),
          // Inventory is live operational data and intentionally ignores date slicers.
          kpiCard('Low Stock Items', k.low_stock_count, k.low_stock_count ? 'accent' : '',
                  '', 'Threshold: ' + data.low_stock_threshold + ' units',
                  '/admin/inventory', k.low_stock_count > 0)
        ].join('');

        var labels = data.timeline.map(function (t) { return t.label; });
        var drawChart = function () {
          if (typeof Chart === 'undefined' || !document.getElementById('salesChart')) {
            window.setTimeout(drawChart, 40);
            return;
          }
          salesChart = upsertChart(salesChart, 'salesChart', {
            type: 'line',
            data: {
              labels: labels,
              datasets: [
                { label: 'Sales (₹)', data: data.timeline.map(function (t) { return t.sales; }),
                  borderColor: '#1E3A22', backgroundColor: 'rgba(30,58,34,.12)', tension: .35, fill: true },
                { label: 'Orders', data: data.timeline.map(function (t) { return t.orders; }),
                  borderColor: '#A5342A', backgroundColor: 'transparent', tension: .35, yAxisID: 'y1' },
                { label: 'New Customers', data: data.timeline.map(function (t) { return t.customers; }),
                  borderColor: '#E7B430', backgroundColor: 'transparent', tension: .35, yAxisID: 'y1', borderDash: [5, 3] }
              ]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              animation: { duration: 0 },
              scales: {
                y: { beginAtZero: true, ticks: { color: '#55594F' } },
                y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false } }
              },
              plugins: { legend: { labels: { font: { family: 'Work Sans', size: 11 }, boxWidth: 14 } } }
            }
          });
        };
        drawChart();

        // Activity feed (bundled in stats — no second request)
        var feed = document.getElementById('activity-feed');
        if (feed) {
          var activityRows = data.activity || [];
          feed.innerHTML = activityRows.map(function (a) {
            var when = a.created_at ? new Date(a.created_at.replace('Z', '+00:00')).toLocaleString('en-IN', {
              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
            }) : '';
            return '<div class="activity-item">' +
              '<div class="activity-dot ' + esc(a.kind || 'system') + '"></div>' +
              '<div><div class="activity-text">' + esc(a.text) + '</div>' +
              '<div class="activity-time">' + when + '</div></div>' +
              '</div>';
          }).join('') || '<p class="muted">No activity yet — place an order or update inventory.</p>';
        }

        // Recent orders
        var ot = document.querySelector('#recent-orders tbody');
        ot.innerHTML = data.recent_orders.map(function (o) {
          return '<tr><td><strong>' + esc(o.order_id) + '</strong></td><td>' + esc(o.customer_name) + '</td><td>' +
            esc(o.store_name || '') + '</td><td>' + money(o.total) + '</td><td>' + statusBadge(o.status) + '</td></tr>';
        }).join('') || '<tr><td colspan="5">No orders yet</td></tr>';

        // Inventory health bars
        var ih = document.getElementById('inventory-health');
        if (ih) {
          ih.innerHTML = (data.inventory_health || []).map(function (r) {
            var cls = r.low ? 'low' : (r.pct < 50 ? 'medium' : '');
            return '<a class="inv-row inv-row-link" href="/admin/inventory">' +
              '<div class="name">' + (r.low ? '<span class="alert-dot"></span>' : '') + esc(r.name) + '</div>' +
              '<div class="inv-bar-wrap"><div class="inv-bar ' + cls + '" style="width:' + Math.max(4, r.pct) + '%"></div></div>' +
              '<div class="inv-stock' + (r.low ? ' low' : '') + '">' + r.stock + ' units' + (r.low ? ' · Low!' : '') + '</div>' +
              '</a>';
          }).join('') || '<p class="muted">No inventory yet</p>';
        }

        // Store performance rows
        var sp = document.getElementById('store-performance');
        if (sp) {
          var maxSales = Math.max.apply(null, data.store_sales.map(function (s) { return s.sales; }).concat([1]));
          sp.innerHTML = data.store_sales
            .slice().sort(function (a, b) { return b.sales - a.sales; })
            .map(function (s) {
              var pct = Math.round(s.sales / maxSales * 100);
              var ch = s.change_pct;
              var chHtml = ch == null ? '<span class="store-change flat">—</span>'
                : '<span class="store-change ' + (ch >= 0 ? 'up' : 'down') + '">' + (ch >= 0 ? '↑' : '↓') + Math.abs(ch) + '%</span>';
              return '<div class="store-row">' +
                '<div class="name">' + esc(s.name) + '</div>' +
                '<div class="store-bar-wrap"><div class="store-bar" style="width:' + Math.max(4, pct) + '%"></div></div>' +
                '<div class="store-rev">' + money(s.sales) + '</div>' + chHtml +
                '</div>';
            }).join('') || '<p class="muted">No sales yet</p>';
        }

        // Top products
        var tp = document.getElementById('top-products');
        if (tp) {
          tp.innerHTML = (data.top_products || []).map(function (p, i) {
            return '<div class="product-row">' +
              '<div class="product-rank">' + (i + 1) + '</div>' +
              '<div><div class="pname">' + esc(p.name) + '</div><div class="pcat">' + esc(p.category || '') + '</div></div>' +
              '<div class="product-units">' + p.qty + ' sold</div>' +
              '<div class="product-rev">' + money(p.revenue) + '</div>' +
              '</div>';
          }).join('') || '<p class="muted">No sales in this period</p>';
        }

        // Staff on duty (bundled in stats)
        var staffEl = document.getElementById('staff-on-duty');
        if (staffEl) {
          var staff = data.on_duty_staff || [];
          staffEl.innerHTML = staff.slice(0, 5).map(function (m) {
            var initials = (m.name || '?').split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
            return '<div class="staff-row">' +
              '<div class="staff-avatar">' + esc(initials) + '</div>' +
              '<div class="staff-info"><div class="staff-name">' + esc(m.name) + '</div>' +
              '<div class="staff-role">' + esc(m.role) + ' · ' + esc(m.store_name || 'All Stores') + '</div></div>' +
              '<div class="staff-status ' + (m.on_duty ? 'on' : 'off') + '"><span class="staff-dot"></span>' +
              (m.on_duty ? 'On duty' : 'Off duty') + '</div>' +
              '</div>';
          }).join('') || '<p class="muted">No staff added yet. <a class="link" href="/admin/staff">Add staff</a></p>';
        }
      } catch (e) {
        if (isAbortError(e) || token !== this.loadToken) return;
        if (updEl) updEl.textContent = 'Update failed';
        toast(e.message || 'Could not load dashboard', true);
      } finally {
        if (token === this.loadToken) setSlicerBusy(false);
      }
    },
    loadActivity: async function () {},
    loadStaff: async function () {}
  };

  function kpi(label, value, cls) {
    return '<div class="kpi ' + (cls || '') + '"><div class="label">' + label +
      '</div><div class="value">' + value + '</div></div>';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderParameterEditor(hostId, parameters) {
    var host = document.getElementById(hostId);
    if (!host) return;
    host.innerHTML = (parameters || []).map(function (item) {
      return '<div class="parameter-row">' +
        '<input class="parameter-label" placeholder="Parameter (e.g. Protein)" value="' + esc(item.label || '') + '" />' +
        '<input class="parameter-value" placeholder="Value (e.g. 20 g / 100 g)" value="' + esc(item.value || '') + '" />' +
        '<button type="button" class="parameter-remove" aria-label="Remove parameter">&times;</button>' +
        '</div>';
    }).join('');
    host.querySelectorAll('.parameter-remove').forEach(function (btn) {
      btn.onclick = function () { btn.closest('.parameter-row').remove(); };
    });
  }

  function addParameterRow(hostId, item) {
    var host = document.getElementById(hostId);
    if (!host) return;
    var wrap = document.createElement('div');
    wrap.className = 'parameter-row';
    wrap.innerHTML =
      '<input class="parameter-label" placeholder="Parameter (e.g. Protein)" value="' + esc((item || {}).label || '') + '" />' +
      '<input class="parameter-value" placeholder="Value (e.g. 20 g / 100 g)" value="' + esc((item || {}).value || '') + '" />' +
      '<button type="button" class="parameter-remove" aria-label="Remove parameter">&times;</button>';
    wrap.querySelector('.parameter-remove').onclick = function () { wrap.remove(); };
    host.appendChild(wrap);
    wrap.querySelector('.parameter-label').focus();
  }

  function readParameters(hostId) {
    var host = document.getElementById(hostId);
    if (!host) return [];
    return Array.from(host.querySelectorAll('.parameter-row')).map(function (row) {
      return {
        label: row.querySelector('.parameter-label').value.trim(),
        value: row.querySelector('.parameter-value').value.trim()
      };
    }).filter(function (item) { return item.label && item.value; });
  }

  // -------- Stores --------
  var AdminStores = {
    init: function () {
      var self = this;
      document.getElementById('btn-add-store').onclick = function () { self.openForm(); };
      document.getElementById('store-cancel').onclick = function () { closeModal('store-modal'); };
      document.getElementById('store-form').onsubmit = function (e) {
        e.preventDefault();
        self.save();
      };
      this.load();
    },
    load: async function () {
      var stores = await api('/api/admin/stores');
      var self = this;
      var tbody = document.querySelector('#stores-table tbody');
      tbody.innerHTML = stores.map(function (s) {
        return '<tr>' +
          '<td><strong>' + esc(s.name) + '</strong></td>' +
          '<td>' + esc(s.address) + '</td>' +
          '<td>' + esc(s.contact) + '</td>' +
          '<td>' + esc(s.hours) + '</td>' +
          '<td>' + (s.delivery_radius_km != null ? s.delivery_radius_km + ' km' : '—') + '</td>' +
          '<td>' + esc(s.manager || '—') + '</td>' +
          '<td>' + statusBadge(s.status) + '</td>' +
          '<td>' + esc(s.tag || '') + '</td>' +
          '<td><button class="btn btn-sm btn-outline" data-edit="' + s.id + '">Edit</button></td></tr>';
      }).join('');
      tbody.querySelectorAll('[data-edit]').forEach(function (btn) {
        btn.onclick = function () {
          var s = stores.find(function (x) { return x.id === btn.getAttribute('data-edit'); });
          self.openForm(s);
        };
      });
    },
    openForm: function (s) {
      s = s || {};
      document.getElementById('store-modal-title').textContent = s.id ? 'Edit Store' : 'Add Store';
      document.getElementById('store-id').value = s.id || '';
      document.getElementById('store-name').value = s.name || '';
      document.getElementById('store-tag').value = s.tag || '';
      document.getElementById('store-address').value = s.address || '';
      document.getElementById('store-contact').value = s.contact || '';
      document.getElementById('store-hours').value = s.hours || '7 AM – 10 PM';
      document.getElementById('store-status').value = s.status || 'active';
      document.getElementById('store-radius').value = s.delivery_radius_km != null ? s.delivery_radius_km : 3;
      document.getElementById('store-manager').value = s.manager || '';
      openModal('store-modal');
    },
    save: async function () {
      var id = document.getElementById('store-id').value;
      var body = {
        name: document.getElementById('store-name').value,
        tag: document.getElementById('store-tag').value,
        address: document.getElementById('store-address').value,
        contact: document.getElementById('store-contact').value,
        hours: document.getElementById('store-hours').value,
        status: document.getElementById('store-status').value,
        delivery_radius_km: Number(document.getElementById('store-radius').value || 3),
        manager: document.getElementById('store-manager').value
      };
      if (id) await api('/api/admin/stores/' + id, { method: 'PUT', body: JSON.stringify(body) });
      else await api('/api/admin/stores', { method: 'POST', body: JSON.stringify(body) });
      closeModal('store-modal');
      toast('Store saved');
      this.load();
    }
  };

  // -------- Categories --------
  var AdminCategories = {
    init: function () {
      var self = this;
      document.getElementById('btn-add-cat').onclick = function () { self.openForm(); };
      document.getElementById('cat-cancel').onclick = function () { closeModal('cat-modal'); };
      document.getElementById('cat-form').onsubmit = function (e) {
        e.preventDefault();
        self.save();
      };
      document.getElementById('cat-add-parameter').onclick = function () {
        addParameterRow('cat-parameters');
      };
      document.getElementById('cat-image-file').onchange = async function (e) {
        var file = e.target.files[0];
        if (!file) return;
        var fd = new FormData();
        fd.append('image', file);
        try {
          var res = await fetch('/api/admin/content-image', {
            method: 'POST', body: fd, credentials: 'same-origin'
          });
          var data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Upload failed');
          document.getElementById('cat-banner').value = data.url;
          self.renderImage(data.url);
          toast('Category image uploaded');
        } catch (err) {
          toast(err.message || 'Upload failed', true);
        }
        e.target.value = '';
      };
      document.getElementById('cat-image-remove').onclick = function () {
        document.getElementById('cat-banner').value = '';
        self.renderImage('');
      };
      this.load();
    },
    renderImage: function (url) {
      var preview = document.getElementById('cat-image-preview');
      var remove = document.getElementById('cat-image-remove');
      preview.innerHTML = url
        ? '<img src="' + esc(url) + '" alt="Category banner">'
        : '<span class="muted">No image selected</span>';
      remove.classList.toggle('hidden', !url);
    },
    load: async function () {
      var cats = await api('/api/admin/categories');
      var self = this;
      var focus = getQueryParam('focus');
      var list = cats;
      if (focus) {
        list = cats.filter(function (c) { return c.id === focus; });
      }
      renderFocusBar('focus-bar', focus ? ((list[0] && list[0].name) || 'No matching category') : '', function () {
        self.load();
      });
      var tbody = document.querySelector('#cats-table tbody');
      tbody.innerHTML = list.map(function (c) {
        return '<tr class="' + (focus && c.id === focus ? 'row-focus' : '') + '">' +
          '<td>' + (c.banner
            ? '<img class="table-thumb" src="' + esc(c.banner) + '" alt="">'
            : '<span class="muted">None</span>') + '</td>' +
          '<td><strong>' + esc(c.name) + '</strong></td>' +
          '<td>' + esc(c.slug) + '</td>' +
          '<td>' + esc(c.seo_title || '') + '</td>' +
          '<td>' + (c.sort_order || 0) + '</td>' +
          '<td>' + (c.enabled ? '<span class="badge green">Enabled</span>' : '<span class="badge red">Disabled</span>') + '</td>' +
          '<td><button class="btn btn-sm btn-outline" data-edit="' + c.id + '">Edit</button> ' +
          '<button class="btn btn-sm btn-outline" data-toggle="' + c.id + '">' + (c.enabled ? 'Disable' : 'Enable') + '</button></td></tr>';
      }).join('') || '<tr><td colspan="7">' + (focus ? 'No matching category found.' : 'No categories') + '</td></tr>';
      tbody.querySelectorAll('[data-edit]').forEach(function (btn) {
        btn.onclick = function () {
          self.openForm(cats.find(function (x) { return x.id === btn.getAttribute('data-edit'); }));
        };
      });
      tbody.querySelectorAll('[data-toggle]').forEach(function (btn) {
        btn.onclick = async function () {
          var c = cats.find(function (x) { return x.id === btn.getAttribute('data-toggle'); });
          await api('/api/admin/categories/' + c.id, {
            method: 'PUT',
            body: JSON.stringify({ enabled: !c.enabled })
          });
          toast('Category updated');
          self.load();
        };
      });
    },
    openForm: function (c) {
      c = c || {};
      document.getElementById('cat-modal-title').textContent = c.id ? 'Edit Category' : 'Add Category';
      document.getElementById('cat-id').value = c.id || '';
      document.getElementById('cat-name').value = c.name || '';
      document.getElementById('cat-slug').value = c.slug || '';
      document.getElementById('cat-order').value = c.sort_order != null ? c.sort_order : 99;
      document.getElementById('cat-enabled').value = String(c.enabled !== false);
      document.getElementById('cat-seo-title').value = c.seo_title || '';
      document.getElementById('cat-seo-desc').value = c.seo_description || '';
      document.getElementById('cat-banner').value = c.banner || '';
      renderParameterEditor('cat-parameters', c.parameters || []);
      this.renderImage(c.banner || '');
      openModal('cat-modal');
    },
    save: async function () {
      var id = document.getElementById('cat-id').value;
      var body = {
        name: document.getElementById('cat-name').value,
        slug: document.getElementById('cat-slug').value,
        sort_order: Number(document.getElementById('cat-order').value || 99),
        enabled: document.getElementById('cat-enabled').value === 'true',
        seo_title: document.getElementById('cat-seo-title').value,
        seo_description: document.getElementById('cat-seo-desc').value,
        banner: document.getElementById('cat-banner').value,
        parameters: readParameters('cat-parameters')
      };
      if (id) await api('/api/admin/categories/' + id, { method: 'PUT', body: JSON.stringify(body) });
      else await api('/api/admin/categories', { method: 'POST', body: JSON.stringify(body) });
      closeModal('cat-modal');
      toast('Category saved');
      this.load();
    }
  };

  // -------- Products --------
  var AdminProducts = {
    stores: [],
    categories: [],
    products: [],
    loadToken: 0,
    abortCtrl: null,
    afterSave: null,
    formBound: false,
    bindForm: function () {
      var self = this;
      if (this.formBound) return;
      var form = document.getElementById('product-form');
      if (!form) return;
      this.formBound = true;
      var cancel = document.getElementById('product-cancel');
      if (cancel) cancel.onclick = function () { closeModal('product-modal'); };
      form.onsubmit = function (e) {
        e.preventDefault();
        self.save(false);
      };
      var genBtn = document.getElementById('product-generate-qr');
      if (genBtn) {
        genBtn.style.display = AdminShell.admin.isSuper ? '' : 'none';
        genBtn.onclick = function () { self.save(true); };
      }
      var qrWrap = document.getElementById('p-qr-wrap');
      if (qrWrap) qrWrap.style.display = AdminShell.admin.isSuper ? '' : 'none';
      var addParam = document.getElementById('p-add-parameter');
      if (addParam) {
        addParam.onclick = function () { addParameterRow('p-parameters'); };
      }
    },
    prepareCatalog: async function () {
      var results = await Promise.all([
        api('/api/admin/stores'),
        api('/api/admin/categories'),
        api('/api/admin/products')
      ]);
      this.stores = results[0];
      this.categories = results[1];
      this.products = results[2];
      this.bindForm();
    },
    init: async function () {
      var self = this;
      await this.prepareCatalog();
      var addBtn = document.getElementById('btn-add-product');
      if (addBtn) addBtn.onclick = function () { self.openForm(); };
      var viewAll = document.getElementById('btn-view-all-qrs');
      if (viewAll) {
        viewAll.onclick = function () { self.openAllProductQrPicker(); };
      }
      var qrClose = document.getElementById('product-qr-units-close');
      if (qrClose) qrClose.onclick = function () { closeModal('product-qr-units-modal'); };
      var qrSearch = document.getElementById('product-qr-units-search');
      if (qrSearch) {
        qrSearch.oninput = function () {
          if (self.qrUnitsProduct) self.renderProductQrUnits();
          else self.openAllProductQrPicker();
        };
      }
      var qrStore = document.getElementById('product-qr-units-store');
      if (qrStore) {
        qrStore.onchange = function () {
          if (self.qrUnitsProduct) self.loadProductQrUnits();
        };
      }
      this.load();
    },
    load: async function () {
      var token = ++this.loadToken;
      if (this.abortCtrl) this.abortCtrl.abort();
      this.abortCtrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      try {
        this.products = await api('/api/admin/products', {
          signal: this.abortCtrl ? this.abortCtrl.signal : undefined
        });
        if (token !== this.loadToken) return;
      } catch (e) {
        if (isAbortError(e) || token !== this.loadToken) return;
        toast(e.message || 'Could not load products', true);
        return;
      }
      var tbody = document.querySelector('#products-table tbody');
      if (!tbody) return;
      var self = this;
      var focus = getQueryParam('focus');
      var list = this.products;
      if (focus) {
        list = this.products.filter(function (p) { return p.id === focus; });
      }
      var focusLabel = focus
        ? ((list[0] && list[0].name) || 'No matching product')
        : '';
      renderFocusBar('focus-bar', focusLabel, function () { self.load(); });

      tbody.innerHTML = list.map(function (p) {
        var tags = [];
        if (p.featured) tags.push('<span class="badge gold">Featured</span>');
        if (p.bestseller) tags.push('<span class="badge gold">Bestseller</span>');
        return '<tr class="' + (focus && p.id === focus ? 'row-focus' : '') + '">' +
          '<td><strong>' + esc(p.name) + '</strong></td>' +
          '<td>' + esc(p.sku) + '</td>' +
          '<td>' + esc(p.category_name || '') + '</td>' +
          '<td>' + statusBadge(p.status) + '</td>' +
          '<td>' + (tags.join(' ') || '—') + '</td>' +
          '<td>' + ((p.variants || []).length) + '</td>' +
          '<td class="actions-cell">' +
          '<button class="btn btn-sm btn-outline" data-view-qr="' + p.id + '">View QRs</button> ' +
          '<button class="btn btn-sm btn-outline" data-edit="' + p.id + '">Edit</button> ' +
          '<button class="btn btn-sm btn-outline" data-del="' + p.id + '">Delete</button></td></tr>';
      }).join('') || '<tr><td colspan="7">' + (focus ? 'No matching product found.' : 'No products') + '</td></tr>';
      tbody.querySelectorAll('[data-view-qr]').forEach(function (btn) {
        btn.onclick = function () {
          var product = self.products.find(function (x) { return x.id === btn.getAttribute('data-view-qr'); });
          self.openProductQrUnits(product);
        };
      });
      tbody.querySelectorAll('[data-edit]').forEach(function (btn) {
        btn.onclick = function () {
          self.openForm(self.products.find(function (x) { return x.id === btn.getAttribute('data-edit'); }));
        };
      });
      tbody.querySelectorAll('[data-del]').forEach(function (btn) {
        btn.onclick = async function () {
          if (!confirm('Delete this product and its inventory rows?')) return;
          await api('/api/admin/products/' + btn.getAttribute('data-del'), { method: 'DELETE' });
          toast('Product deleted');
          self.load();
        };
      });
    },
    openAllProductQrPicker: function () {
      var self = this;
      this.qrUnitsProduct = null;
      this.qrUnits = [];
      this.qrUnitsCanDelete = AdminShell.admin.canManageQrUnits;
      document.getElementById('product-qr-units-title').textContent = 'All products — pick one';
      document.getElementById('product-qr-units-copy').textContent =
        'Select a product to see its unique unit QR entries (one per physical stock / pending code).';
      var storeSel = document.getElementById('product-qr-units-store');
      if (storeSel) {
        storeSel.style.display = AdminShell.admin.isSuper ? '' : 'none';
        storeSel.innerHTML = '<option value="">All stores</option>' +
          (this.stores || []).map(function (s) {
            return '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>';
          }).join('');
      }
      var tbody = document.querySelector('#product-qr-units-table tbody');
      var q = (document.getElementById('product-qr-units-search').value || '').trim().toLowerCase();
      var rows = (this.products || []).filter(function (p) {
        if (!q) return true;
        return (p.name || '').toLowerCase().indexOf(q) !== -1 ||
          (p.sku || '').toLowerCase().indexOf(q) !== -1 ||
          (p.category_name || '').toLowerCase().indexOf(q) !== -1;
      });
      tbody.innerHTML = rows.map(function (p) {
        return '<tr>' +
          '<td colspan="5"><strong>' + esc(p.name) + '</strong>' +
          '<div class="muted">' + esc(p.sku || '') +
          (p.category_name ? ' · ' + esc(p.category_name) : '') + '</div></td>' +
          '<td><button type="button" class="btn btn-sm btn-gold" data-pick-product="' +
          esc(p.id) + '">Open QRs</button></td></tr>';
      }).join('') || '<tr><td colspan="6">No products found.</td></tr>';
      tbody.querySelectorAll('[data-pick-product]').forEach(function (btn) {
        btn.onclick = function () {
          var product = self.products.find(function (x) {
            return x.id === btn.getAttribute('data-pick-product');
          });
          self.openProductQrUnits(product);
        };
      });
      openModal('product-qr-units-modal');
    },
    openProductQrUnits: async function (product) {
      if (!product || !product.id) {
        toast('Product not found', true);
        return;
      }
      this.qrUnitsProduct = product;
      document.getElementById('product-qr-units-title').textContent =
        (product.name || 'Product') + ' — QR units';
      document.getElementById('product-qr-units-copy').textContent =
        'Each row is one unique physical unit. Delete removes the QR and syncs inventory if it was in stock.';
      var storeSel = document.getElementById('product-qr-units-store');
      if (storeSel) {
        storeSel.style.display = AdminShell.admin.isSuper ? '' : 'none';
        if (!storeSel.options.length || storeSel.options.length === 1) {
          storeSel.innerHTML = '<option value="">All stores</option>' +
            (this.stores || []).map(function (s) {
              return '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>';
            }).join('');
        }
        if (!AdminShell.admin.isSuper && AdminShell.admin.storeId) {
          storeSel.value = AdminShell.admin.storeId;
        }
      }
      openModal('product-qr-units-modal');
      await this.loadProductQrUnits();
    },
    loadProductQrUnits: async function () {
      var product = this.qrUnitsProduct;
      if (!product) return;
      var tbody = document.querySelector('#product-qr-units-table tbody');
      tbody.innerHTML = '<tr><td colspan="6">Loading…</td></tr>';
      try {
        var storeId = (document.getElementById('product-qr-units-store') || {}).value || '';
        var qs = storeId ? ('?store_id=' + encodeURIComponent(storeId)) : '';
        var data = await api('/api/admin/products/' + encodeURIComponent(product.id) + '/qr-units' + qs);
        this.qrUnits = data.items || data.units || [];
        this.qrUnitsCanDelete = !!(data.can_delete || AdminShell.admin.canManageQrUnits);
        this.renderProductQrUnits();
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="6" class="form-error">' + esc(e.message || 'Failed') + '</td></tr>';
      }
    },
    renderProductQrUnits: function () {
      var self = this;
      var tbody = document.querySelector('#product-qr-units-table tbody');
      var q = (document.getElementById('product-qr-units-search').value || '').trim().toLowerCase();
      var rows = (this.qrUnits || []).filter(function (u) {
        if (!q) return true;
        return (u.unit_serial || '').toLowerCase().indexOf(q) !== -1 ||
          (u.qr_code || '').toLowerCase().indexOf(q) !== -1 ||
          (u.store_name || '').toLowerCase().indexOf(q) !== -1 ||
          (u.variant_label || '').toLowerCase().indexOf(q) !== -1 ||
          (u.status || '').toLowerCase().indexOf(q) !== -1;
      });
      tbody.innerHTML = rows.map(function (u) {
        var st = (u.unit_status || u.status || '').toLowerCase();
        var badgeCls = st === 'in_stock' ? 'green' : (st === 'pending' ? 'gold' : 'red');
        var badgeLabel = st === 'in_stock' ? 'In inventory' : (st === 'pending' ? 'Pending punch' : st || '—');
        var delBtn = self.qrUnitsCanDelete
          ? '<button type="button" class="btn btn-sm btn-outline" data-del-unit="' +
            esc(u.unit_id || u.id) + '">Delete</button>'
          : '';
        return '<tr>' +
          '<td><span class="qr-unique-code">' + esc((u.unit_serial || u.qr_uid || '—').toString().slice(-3).toUpperCase()) +
          '</span><div class="code muted">' + esc(u.qr_code || '') + '</div></td>' +
          '<td>' + esc(u.store_name || '—') + '</td>' +
          '<td>' + esc(u.variant_label || '—') + '</td>' +
          '<td><span class="badge ' + badgeCls + '">' + esc(badgeLabel) + '</span></td>' +
          '<td>' + money(u.price) + '</td>' +
          '<td>' + delBtn + '</td></tr>';
      }).join('') || '<tr><td colspan="6">No unique QR units for this product yet. Generate or punch first.</td></tr>';
      tbody.querySelectorAll('[data-del-unit]').forEach(function (btn) {
        btn.onclick = async function () {
          if (!AdminShell.admin.canManageQrUnits) {
            toast('Only Super Admin or Store Admin can delete QR units', true);
            return;
          }
          if (!confirm('Delete this unique QR unit? If it is in inventory, stock will decrease by 1.')) return;
          try {
            await api('/api/admin/qr-codes/unit/' + encodeURIComponent(btn.getAttribute('data-del-unit')), {
              method: 'DELETE'
            });
            toast('QR unit deleted · inventory synced');
            await self.loadProductQrUnits();
            if (window.AdminShell && AdminShell.refreshBadges) AdminShell.refreshBadges();
          } catch (e) {
            toast(e.message || 'Could not delete', true);
          }
        };
      });
    },
    openForm: function (p) {
      p = p || {};
      var self = this;
      var isEdit = !!p.id;
      document.getElementById('product-modal-title').textContent = isEdit
        ? 'Edit Product'
        : (document.body && document.body.getAttribute('data-page-qr') === '1'
          ? 'Add Product & Generate QR'
          : 'Add Product');
      document.getElementById('product-id').value = p.id || '';
      document.getElementById('p-name').value = p.name || '';
      document.getElementById('p-sku').value = p.sku || '';
      document.getElementById('p-desc').value = p.description || '';
      document.getElementById('p-status').value = p.status || 'available';
      document.getElementById('p-inv-model').value = p.inventory_model || 'variant';
      document.getElementById('p-featured').value = String(!!p.featured);
      document.getElementById('p-bestseller').value = String(!!p.bestseller);
      document.getElementById('p-expiry').value = p.expiry_info || '';
      document.getElementById('p-nutrition').value = p.nutritional_info || '';
      document.getElementById('p-seo-title').value = p.seo_title || '';
      document.getElementById('p-seo-desc').value = p.seo_description || '';
      document.getElementById('p-default-price').value = 0;
      document.getElementById('p-gst').value = p.gst_percent != null ? p.gst_percent : 0;
      document.getElementById('p-image-wrap').style.display = 'block';
      document.getElementById('p-image').value = '';
      var selectedCategory = this.categories.find(function (c) {
        return c.id === (p.category_id || (this.categories[0] && this.categories[0].id));
      }, this);
      renderParameterEditor(
        'p-parameters',
        p.parameters || (!isEdit && selectedCategory && selectedCategory.parameters) || []
      );

      var catSel = document.getElementById('p-category');
      catSel.innerHTML = this.categories.map(function (c) {
        return '<option value="' + c.id + '"' + (p.category_id === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>';
      }).join('');
      catSel.onchange = function () {
        if (isEdit || readParameters('p-parameters').length) return;
        var category = self.categories.find(function (c) { return c.id === catSel.value; });
        renderParameterEditor('p-parameters', (category && category.parameters) || []);
      };

      var lines = (p.variants || []).map(function (v) {
        return (v.label || '') + ' | ' + (v.unit || '');
      });
      document.getElementById('p-variants').value = lines.join('\n') || '500 gm | 500g\n1 kg | 1kg';

      var avail = p.store_availability || this.stores.map(function (s) { return s.id; });
      document.getElementById('p-stores').innerHTML = this.stores.map(function (s) {
        var checked = avail.indexOf(s.id) >= 0 ? ' checked' : '';
        return '<label><input type="checkbox" value="' + s.id + '"' + checked + ' /> ' + esc(s.name) + '</label>';
      }).join('');

      var prev = document.getElementById('p-images-preview');
      function renderImages(images) {
        prev.innerHTML = (images || []).map(function (u) {
          return '<div class="img-thumb"><img src="' + u + '" alt="" />' +
            '<button type="button" class="img-remove" data-url="' + esc(u) + '" title="Remove image">&times;</button></div>';
        }).join('');
        prev.querySelectorAll('.img-remove').forEach(function (btn) {
          btn.onclick = async function () {
            if (!isEdit || !confirm('Remove this image?')) return;
            try {
              var res = await fetch('/api/admin/products/' + p.id + '/image?url=' + encodeURIComponent(btn.getAttribute('data-url')), {
                method: 'DELETE', credentials: 'same-origin'
              });
              var data = await res.json();
              if (!res.ok) throw new Error(data.error || 'Could not remove image');
              renderImages(data.images);
              toast('Image removed');
              self.load();
            } catch (e) {
              toast(e.message || 'Could not remove image', true);
            }
          };
        });
      }
      renderImages(p.images);

      var qrStore = document.getElementById('p-qr-store');
      if (qrStore) {
        qrStore.innerHTML = this.stores.map(function (s) {
          return '<option value="' + s.id + '">' + esc(s.name) + '</option>';
        }).join('');
        var preferredStore = (window.AdminQR && AdminQR.selectedStoreId) || AdminShell.storeId || avail[0];
        if (preferredStore && this.stores.some(function (s) { return s.id === preferredStore; })) {
          qrStore.value = preferredStore;
        } else if (avail[0]) {
          qrStore.value = avail[0];
        }
      }
      var qrStock = document.getElementById('p-qr-stock');
      if (qrStock) qrStock.value = 0;
      var qrCurrent = document.getElementById('p-qr-current');
      if (qrCurrent) {
        qrCurrent.textContent = p.qr_code
          ? ('Current QR: ' + p.qr_code + (p.qr_serial || p.qr_uid ? ' · Unique ' + (p.qr_serial || String(p.qr_uid).slice(-3)) : ''))
          : 'No QR yet — Generate QR will create one and sync Products, QR Section, inventory, and storefront.';
      }

      openModal('product-modal');

      var fileInput = document.getElementById('p-image');
      if (isEdit) {
        fileInput.onchange = async function () {
          if (!fileInput.files[0]) return;
          var fd = new FormData();
          fd.append('image', fileInput.files[0]);
          var res = await fetch('/api/admin/products/' + p.id + '/image', {
            method: 'POST', body: fd, credentials: 'same-origin'
          });
          var data = await res.json();
          if (!res.ok) { toast(data.error || 'Upload failed', true); return; }
          toast('Image uploaded');
          renderImages(data.images);
          self.load();
        };
      } else {
        fileInput.onchange = null;
      }
    },
    save: async function (alsoGenerateQr) {
      var id = document.getElementById('product-id').value;
      var imageWarning = false;
      var variantLines = document.getElementById('p-variants').value.split('\n').filter(Boolean);
      var variants = variantLines.map(function (line, i) {
        var parts = line.split('|').map(function (x) { return x.trim(); });
        return {
          id: 'v' + (i + 1),
          label: parts[0] || ('Variant ' + (i + 1)),
          unit: parts[1] || 'unit',
          sku_suffix: (parts[0] || 'V').toUpperCase().replace(/\s+/g, '-').slice(0, 12)
        };
      });
      var storeChecks = Array.from(document.querySelectorAll('#p-stores input:checked')).map(function (c) {
        return c.value;
      });
      var body = {
        name: document.getElementById('p-name').value,
        sku: document.getElementById('p-sku').value,
        description: document.getElementById('p-desc').value,
        category_id: document.getElementById('p-category').value,
        status: document.getElementById('p-status').value,
        inventory_model: document.getElementById('p-inv-model').value,
        featured: document.getElementById('p-featured').value === 'true',
        bestseller: document.getElementById('p-bestseller').value === 'true',
        expiry_info: document.getElementById('p-expiry').value,
        nutritional_info: document.getElementById('p-nutrition').value,
        parameters: readParameters('p-parameters'),
        seo_title: document.getElementById('p-seo-title').value,
        seo_description: document.getElementById('p-seo-desc').value,
        variants: variants,
        store_availability: storeChecks,
        default_price: Number(document.getElementById('p-default-price').value || 0),
        gst_percent: Number(document.getElementById('p-gst').value || 0)
      };
      var saved;
      var existing = id ? this.products.find(function (x) { return x.id === id; }) : null;
      try {
        if (id) {
          // preserve existing variant ids when labels match
          if (existing && existing.variants) {
            body.variants = variants.map(function (v, i) {
              var old = existing.variants[i];
              if (old) v.id = old.id;
              return v;
            });
          }
          saved = await api('/api/admin/products/' + id, { method: 'PUT', body: JSON.stringify(body) });
        } else {
          saved = await api('/api/admin/products', { method: 'POST', body: JSON.stringify(body) });
          var pendingImage = document.getElementById('p-image').files[0];
          if (pendingImage && saved && saved.id) {
            var fd = new FormData();
            fd.append('image', pendingImage);
            var uploadRes = await fetch('/api/admin/products/' + saved.id + '/image', {
              method: 'POST', body: fd, credentials: 'same-origin'
            });
            if (!uploadRes.ok) imageWarning = true;
          }
        }

        if (alsoGenerateQr && saved && saved.id) {
          if (!AdminShell.admin.isSuper) {
            toast('Only Super Admin can generate QR codes', true);
          } else {
            var storeId = (document.getElementById('p-qr-store') || {}).value || storeChecks[0] || '';
            if (!storeId) {
              toast('Select a store for QR / stock sync', true);
              return;
            }
            var hasQr = !!(saved.qr_code || (existing && existing.qr_code));
            var qrResult = await api('/api/admin/qr-codes/generate', {
              method: 'POST',
              body: JSON.stringify({
                product_id: saved.id,
                category_id: body.category_id,
                store_id: storeId,
                price: Number(document.getElementById('p-default-price').value || 0),
                stock: Number((document.getElementById('p-qr-stock') || {}).value || 0),
                variant_label: (variants[0] && variants[0].label) || '1 kg',
                variant_id: (body.variants[0] && body.variants[0].id) || (variants[0] && variants[0].id) || 'v1',
                regenerate: !hasQr
              })
            });
            closeModal('product-modal');
            var unitsN = (qrResult && qrResult.units_created) || 0;
            toast(
              imageWarning
                ? 'QR generated (image upload failed)'
                : (unitsN
                    ? (unitsN + ' unique unit QR(s) created · synced to Products, QR Section & website')
                    : ('QR template synced · ' + ((qrResult.product && qrResult.product.qr_code) || ''))),
              imageWarning
            );
            this.load();
            if (typeof this.afterSave === 'function') this.afterSave(qrResult);
            return;
          }
        }

        closeModal('product-modal');
        toast(imageWarning ? 'Product saved, but the image upload failed' : 'Product saved', imageWarning);
        this.load();
        if (typeof this.afterSave === 'function') this.afterSave(saved);
      } catch (e) {
        toast(e.message || 'Could not save product', true);
      }
    }
  };

  // -------- Inventory --------
  var AdminInventory = {
    stores: [],
    categories: [],
    products: [],
    rows: [],
    loadToken: 0,
    abortCtrl: null,
    init: async function () {
      var self = this;
      var initial = await Promise.all([
        api('/api/admin/stores'),
        api('/api/admin/categories'),
        api('/api/admin/products')
      ]);
      this.stores = initial[0];
      this.categories = initial[1];
      this.products = initial[2];
      var sel = document.getElementById('inv-store-filter');
      sel.innerHTML = '<option value="">All stores</option>' + this.stores.map(function (s) {
        return '<option value="' + s.id + '">' + esc(s.name) + '</option>';
      }).join('');
      if (AdminShell.storeId && this.stores.some(function (s) { return s.id === AdminShell.storeId; })) {
        sel.value = AdminShell.storeId;
      }
      sel.onchange = function () {
        AdminShell.storeId = sel.value;
        localStorage.setItem('fam_admin_store', sel.value);
        var globalSel = document.getElementById('global-store-filter');
        if (globalSel && !globalSel.disabled) globalSel.value = sel.value;
        self.load();
      };
      document.getElementById('btn-add-stock').onclick = function () { self.openStockForm(); };
      document.getElementById('stock-cancel').onclick = function () { closeModal('stock-modal'); };
      document.getElementById('stock-form').onsubmit = function (e) {
        e.preventDefault();
        self.addStock();
      };
      document.getElementById('stock-store').onchange = function () { self.refreshStockProducts(); };
      document.getElementById('stock-product').onchange = function () {
        if (this.value === '__new__') {
          closeModal('stock-modal');
          self.openProductForm();
          return;
        }
        self.refreshStockVariants();
      };
      document.getElementById('stock-variant').onchange = function () { self.renderStockSummary(); };
      document.getElementById('inventory-product-cancel').onclick = function () { closeModal('inventory-product-modal'); };
      document.getElementById('inventory-product-form').onsubmit = function (e) {
        e.preventDefault();
        self.createProduct();
      };
      document.getElementById('ip-add-parameter').onclick = function () { addParameterRow('ip-parameters'); };
      document.getElementById('ip-cat-add-parameter').onclick = function () { addParameterRow('ip-cat-parameters'); };
      document.getElementById('ip-category').onchange = function () { self.onProductCategoryChange(); };
      this.load();
    },
    load: async function () {
      var self = this;
      var token = ++this.loadToken;
      if (this.abortCtrl) this.abortCtrl.abort();
      this.abortCtrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var storeId = document.getElementById('inv-store-filter').value;
      var url = '/api/admin/inventory' + (storeId ? ('?store_id=' + storeId) : '');
      var tbody = document.querySelector('#inv-table tbody');
      try {
        var rows = await api(url, { signal: this.abortCtrl ? this.abortCtrl.signal : undefined });
        if (token !== this.loadToken) return;
        this.rows = rows;
        tbody.innerHTML = rows.map(function (r) {
          return '<tr data-id="' + r.id + '">' +
            '<td><strong>' + (r.low_stock ? '<span class="alert-dot" title="Low stock"></span>' : '') +
            esc(r.product_name) + '</strong>' +
            (r.low_stock ? '<div class="low-stock-note">Low stock</div>' : '') + '</td>' +
            '<td>' + esc(r.variant_label) + '</td>' +
            '<td>' + esc(r.sku) + '</td>' +
            '<td>' + esc(r.store_name) + '</td>' +
            '<td><input class="inline-edit" type="number" data-field="price" value="' + r.price + '" /></td>' +
            '<td><input class="inline-edit" type="number" data-field="stock" value="' + r.stock + '" /></td>' +
            '<td><button class="btn btn-sm btn-dark" data-save="' + r.id + '">Save</button></td></tr>';
        }).join('') || '<tr><td colspan="7">No inventory rows</td></tr>';
        tbody.querySelectorAll('[data-save]').forEach(function (btn) {
          btn.onclick = async function () {
            var tr = btn.closest('tr');
            var price = tr.querySelector('[data-field="price"]').value;
            var stock = tr.querySelector('[data-field="stock"]').value;
            await api('/api/admin/inventory/' + btn.getAttribute('data-save'), {
              method: 'PUT',
              body: JSON.stringify({ price: Number(price), stock: Number(stock) })
            });
            toast('Inventory updated');
            await self.load();
            AdminShell.refreshBadges();
          };
        });
      } catch (e) {
        if (isAbortError(e) || token !== this.loadToken) return;
        toast(e.message || 'Could not load inventory', true);
      }
    },
    openStockForm: async function () {
      this.rows = await api('/api/admin/inventory');
      var selectedStore = document.getElementById('inv-store-filter').value;
      var storeSel = document.getElementById('stock-store');
      storeSel.innerHTML = this.stores.map(function (s) {
        return '<option value="' + s.id + '"' + (s.id === selectedStore ? ' selected' : '') + '>' + esc(s.name) + '</option>';
      }).join('');
      document.getElementById('stock-quantity').value = 1;
      this.refreshStockProducts();
      openModal('stock-modal');
    },
    refreshStockProducts: function () {
      var storeId = document.getElementById('stock-store').value;
      var availableIds = {};
      this.rows.forEach(function (r) {
        if (r.store_id === storeId) availableIds[r.product_id] = true;
      });
      var options = ['<option value="">Select a product…</option>'];
      options = options.concat(this.products.filter(function (p) { return availableIds[p.id]; }).map(function (p) {
        return '<option value="' + p.id + '">' + esc(p.name) + ' · ' + esc(p.sku) + '</option>';
      }));
      options.push('<option value="__new__">+ Add a new product…</option>');
      document.getElementById('stock-product').innerHTML = options.join('');
      this.refreshStockVariants();
    },
    refreshStockVariants: function () {
      var storeId = document.getElementById('stock-store').value;
      var productId = document.getElementById('stock-product').value;
      var matching = this.rows.filter(function (r) {
        return r.store_id === storeId && r.product_id === productId;
      });
      document.getElementById('stock-variant').innerHTML = matching.map(function (r) {
        return '<option value="' + r.id + '">' + esc(r.variant_label || 'Default') + ' · current stock ' + r.stock + '</option>';
      }).join('');
      this.renderStockSummary();
    },
    renderStockSummary: function () {
      var rowId = document.getElementById('stock-variant').value;
      var row = this.rows.find(function (r) { return r.id === rowId; });
      var product = row && this.products.find(function (p) { return p.id === row.product_id; });
      var category = product && this.categories.find(function (c) { return c.id === product.category_id; });
      var host = document.getElementById('stock-product-summary');
      if (!row || !product) {
        host.innerHTML = '<span class="muted">Choose a product and variant.</span>';
        return;
      }
      var image = product.images && product.images[0]
        ? '<img src="' + esc(product.images[0]) + '" alt="">'
        : '<div class="stock-summary-placeholder">No image</div>';
      host.innerHTML = image + '<div><strong>' + esc(product.name) + '</strong>' +
        '<span>' + esc((category && category.name) || '') + ' · ' + esc(row.variant_label) + '</span>' +
        '<span>Price ' + money(row.price) + ' · Current stock <b>' + row.stock + '</b></span></div>';
    },
    addStock: async function () {
      var inventoryId = document.getElementById('stock-variant').value;
      if (!inventoryId) { toast('Choose a product variant', true); return; }
      var quantity = Number(document.getElementById('stock-quantity').value);
      await api('/api/admin/inventory', {
        method: 'POST',
        body: JSON.stringify({ inventory_id: inventoryId, quantity: quantity })
      });
      closeModal('stock-modal');
      toast(quantity + ' units added to stock');
      await this.load();
      AdminShell.refreshBadges();
    },
    openProductForm: function () {
      document.getElementById('inventory-product-form').reset();
      document.getElementById('ip-variants').value = '500 gm | 500g\n1 kg | 1kg';
      document.getElementById('ip-category').innerHTML = this.categories.map(function (c) {
        return '<option value="' + c.id + '">' + esc(c.name) + '</option>';
      }).join('') + '<option value="__new__">+ Add a new category…</option>';
      document.getElementById('ip-stores').innerHTML = this.stores.map(function (s) {
        return '<label><input type="checkbox" value="' + s.id + '" checked /> ' + esc(s.name) + '</label>';
      }).join('');
      renderParameterEditor('ip-cat-parameters', []);
      this.onProductCategoryChange();
      openModal('inventory-product-modal');
    },
    onProductCategoryChange: function () {
      var categoryId = document.getElementById('ip-category').value;
      var isNew = categoryId === '__new__';
      document.getElementById('ip-new-category').classList.toggle('hidden', !isNew);
      document.getElementById('ip-cat-name').required = isNew;
      var category = this.categories.find(function (c) { return c.id === categoryId; });
      renderParameterEditor('ip-parameters', (category && category.parameters) || []);
    },
    uploadImage: async function (url, file) {
      if (!file) return null;
      var fd = new FormData();
      fd.append('image', file);
      var res = await fetch(url, { method: 'POST', body: fd, credentials: 'same-origin' });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Image upload failed');
      return data;
    },
    createProduct: async function () {
      var categoryId = document.getElementById('ip-category').value;
      if (categoryId === '__new__') {
        var categoryImage = await this.uploadImage(
          '/api/admin/content-image',
          document.getElementById('ip-cat-image').files[0]
        );
        var category = await api('/api/admin/categories', {
          method: 'POST',
          body: JSON.stringify({
            name: document.getElementById('ip-cat-name').value,
            slug: document.getElementById('ip-cat-slug').value,
            sort_order: Number(document.getElementById('ip-cat-order').value || 99),
            enabled: document.getElementById('ip-cat-enabled').value === 'true',
            seo_title: document.getElementById('ip-cat-seo-title').value,
            seo_description: document.getElementById('ip-cat-seo-desc').value,
            banner: categoryImage ? categoryImage.url : '',
            parameters: readParameters('ip-cat-parameters')
          })
        });
        categoryId = category.id;
        this.categories.push(category);
      }
      var variants = document.getElementById('ip-variants').value.split('\n').filter(Boolean).map(function (line, i) {
        var parts = line.split('|').map(function (x) { return x.trim(); });
        return {
          id: 'v' + (i + 1),
          label: parts[0] || ('Variant ' + (i + 1)),
          unit: parts[1] || 'unit',
          sku_suffix: (parts[0] || 'V').toUpperCase().replace(/\s+/g, '-').slice(0, 12)
        };
      });
      var stores = Array.from(document.querySelectorAll('#ip-stores input:checked')).map(function (el) { return el.value; });
      var product = await api('/api/admin/products', {
        method: 'POST',
        body: JSON.stringify({
          name: document.getElementById('ip-name').value,
          sku: document.getElementById('ip-sku').value,
          category_id: categoryId,
          status: document.getElementById('ip-status').value,
          description: document.getElementById('ip-desc').value,
          parameters: readParameters('ip-parameters'),
          gst_percent: Number(document.getElementById('ip-gst').value || 0),
          featured: document.getElementById('ip-featured').value === 'true',
          bestseller: document.getElementById('ip-bestseller').value === 'true',
          expiry_info: document.getElementById('ip-expiry').value,
          nutritional_info: document.getElementById('ip-nutrition').value,
          variants: variants,
          store_availability: stores,
          default_price: Number(document.getElementById('ip-price').value || 0),
          default_stock: Number(document.getElementById('ip-stock').value || 0)
        })
      });
      var imageWarning = false;
      try {
        await this.uploadImage('/api/admin/products/' + product.id + '/image', document.getElementById('ip-image').files[0]);
      } catch (e) {
        imageWarning = true;
      }
      this.products = await api('/api/admin/products');
      closeModal('inventory-product-modal');
      toast(
        imageWarning ? 'Product and stock created, but the image upload failed' : 'Product, images and stock created',
        imageWarning
      );
      await this.load();
      AdminShell.refreshBadges();
    }
  };

  // -------- Orders --------
  var AdminOrders = {
    page: 1,
    orders: [],
    editOrder: null,
    editItems: [],
    storeProducts: [],
    loadToken: 0,
    abortCtrl: null,
    init: async function () {
      var self = this;
      var stores = await api('/api/admin/stores');
      var sel = document.getElementById('order-store-filter');
      sel.innerHTML = '<option value="">All stores</option>' + stores.map(function (s) {
        return '<option value="' + s.id + '">' + esc(s.name) + '</option>';
      }).join('');
      document.getElementById('order-status-filter').onchange = function () { self.page = 1; self.load(); };
      sel.onchange = function () { self.page = 1; self.load(); };
      document.getElementById('order-cancel').onclick = function () { closeModal('order-modal'); };
      document.getElementById('order-save').onclick = function () { self.save(); };
      document.getElementById('order-delete').onclick = function () { self.remove(); };
      document.getElementById('order-add-product').onchange = function () { self.renderAddVariants(); };
      document.getElementById('order-add-item').onclick = function () { self.addItem(); };
      this.load();
    },
    load: async function () {
      var token = ++this.loadToken;
      if (this.abortCtrl) this.abortCtrl.abort();
      this.abortCtrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var status = document.getElementById('order-status-filter').value;
      var storeId = document.getElementById('order-store-filter').value;
      var focus = getQueryParam('focus');
      var qs = '?page=' + this.page + '&per_page=15';
      if (status) qs += '&status=' + status;
      if (storeId) qs += '&store_id=' + storeId;
      if (focus) qs += '&focus=' + encodeURIComponent(focus);
      var data;
      try {
        data = await api('/api/admin/orders' + qs, {
          signal: this.abortCtrl ? this.abortCtrl.signal : undefined
        });
        if (token !== this.loadToken) return;
      } catch (e) {
        if (isAbortError(e) || token !== this.loadToken) return;
        toast(e.message || 'Could not load orders', true);
        return;
      }
      var self = this;
      this.orders = data.items || [];

      // Populate configurable status lists once
      var statuses = data.statuses || ['new', 'confirmed', 'ready', 'out_for_delivery', 'delivered', 'cancelled'];
      var filterSel = document.getElementById('order-status-filter');
      if (filterSel.options.length <= 1) {
        statuses.forEach(function (st) {
          var opt = document.createElement('option');
          opt.value = st;
          opt.textContent = st.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
          filterSel.appendChild(opt);
        });
      }
      var editSel = document.getElementById('order-edit-status');
      editSel.innerHTML = statuses.map(function (st) {
        return '<option value="' + st + '">' + st.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }) + '</option>';
      }).join('');

      var focusLabel = '';
      if (focus) {
        focusLabel = (this.orders[0] && this.orders[0].order_id) || 'No matching order';
      }
      renderFocusBar('focus-bar', focusLabel, function () {
        self.page = 1;
        self.load();
      });

      var tbody = document.querySelector('#orders-table tbody');
      tbody.innerHTML = this.orders.map(function (o) {
        var items = (o.items || []).map(function (i) { return i.name + ' ×' + i.qty; }).join(', ');
        var mode = o.delivery_mode === 'pickup' ? 'Pickup' :
          (o.delivery_mode === 'in_store' ? 'In-Store' : 'Delivery');
        var isFocus = focus && (o.order_id === focus || o.id === focus);
        return '<tr class="' + (isFocus ? 'row-focus' : '') + '">' +
          '<td><strong>' + esc(o.order_id) + '</strong></td>' +
          '<td>' + esc((o.created_at || '').slice(0, 16).replace('T', ' ')) + '</td>' +
          '<td>' + esc(o.customer_name) + '<br><span class="muted">' + esc(o.customer_phone) + '</span></td>' +
          '<td>' + esc(o.store_name) + '</td>' +
          '<td>' + mode + '</td>' +
          '<td>' + esc(items) + '</td>' +
          '<td>' + money(o.total) + (o.discount ? '<br><span class="muted">-' + money(o.discount) + ' (' + esc(o.coupon_code || 'coupon') + ')</span>' : '') + '</td>' +
          '<td>' + statusBadge(o.status) + '</td>' +
          '<td><button class="btn btn-sm btn-outline" data-edit="' + esc(o.id) + '">Edit</button></td></tr>';
      }).join('') || '<tr><td colspan="9">' + (focus ? 'No matching order found.' : 'No orders') + '</td></tr>';
      tbody.querySelectorAll('[data-edit]').forEach(function (btn) {
        btn.onclick = function () {
          var o = self.orders.find(function (row) { return row.id === btn.getAttribute('data-edit'); });
          if (o) self.openOrder(o);
        };
      });
      var pages = Math.max(1, Math.ceil(data.total / data.per_page));
      this.renderPager(pages, data.total);
    },
    renderPager: function (pages, total) {
      var self = this;
      var pager = document.getElementById('orders-pager');
      if (pages <= 1) {
        pager.innerHTML = total ? '<span class="pager-info">' + total + ' orders</span>' : '';
        return;
      }
      var numbers = [1, pages, this.page - 2, this.page - 1, this.page, this.page + 1, this.page + 2]
        .filter(function (n) { return n >= 1 && n <= pages; })
        .filter(function (n, i, arr) { return arr.indexOf(n) === i; })
        .sort(function (a, b) { return a - b; });
      var html = '<span class="pager-info">Page ' + this.page + ' of ' + pages + ' · ' + total + ' orders</span>' +
        '<button type="button" class="pager-btn" data-page="' + (this.page - 1) + '"' +
        (this.page === 1 ? ' disabled' : '') + '>‹ Previous</button>';
      numbers.forEach(function (n, i) {
        if (i && n - numbers[i - 1] > 1) html += '<span class="pager-gap">…</span>';
        html += '<button type="button" class="pager-btn' + (n === self.page ? ' active' : '') +
          '" data-page="' + n + '">' + n + '</button>';
      });
      html += '<button type="button" class="pager-btn" data-page="' + (this.page + 1) + '"' +
        (this.page === pages ? ' disabled' : '') + '>Next ›</button>';
      pager.innerHTML = html;
      pager.querySelectorAll('[data-page]:not([disabled])').forEach(function (btn) {
        btn.onclick = function () {
          self.page = Number(btn.getAttribute('data-page'));
          self.load();
          document.getElementById('orders-table').scrollIntoView({ block: 'start' });
        };
      });
    },
    openOrder: async function (o) {
      this.editOrder = o;
      this.editItems = (o.items || []).map(function (item) { return Object.assign({}, item); });
      document.getElementById('order-edit-id').value = o.order_id;
      document.getElementById('order-edit-customer').value = o.customer_name || '';
      document.getElementById('order-edit-phone').value = o.customer_phone || '';
      document.getElementById('order-edit-status').value = o.status;
      document.getElementById('order-edit-payment').value = o.payment_method || 'cod';
      document.getElementById('order-edit-address').value = o.address || '';
      document.getElementById('order-edit-discount').value = Number(o.discount || 0);
      document.getElementById('order-edit-delivery').value = Number(o.delivery_fee || 0);
      document.getElementById('order-edit-notes').value = o.notes || '';
      document.getElementById('order-invoice-link').href = '/api/admin/orders/' + o.order_id + '/invoice';
      document.getElementById('order-edit-summary').textContent =
        'Current total: ' + money(o.total) + ' · Inventory is updated automatically when saved.';
      this.renderItems();
      openModal('order-modal');
      try {
        this.storeProducts = await api('/api/products?store_id=' + encodeURIComponent(o.store_id));
      } catch (e) {
        this.storeProducts = [];
      }
      var productSelect = document.getElementById('order-add-product');
      productSelect.innerHTML = this.storeProducts.map(function (p) {
        return '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>';
      }).join('') || '<option value="">No products available</option>';
      this.renderAddVariants();
    },
    renderItems: function () {
      var self = this;
      var host = document.getElementById('order-items-editor');
      host.innerHTML = this.editItems.map(function (item, index) {
        return '<div class="order-item-row" data-index="' + index + '">' +
          '<div><strong>' + esc(item.name) + '</strong><div class="muted">' +
          esc(item.variant_label || item.variant_id || '') + '</div></div>' +
          '<label>Qty<input type="number" min="1" max="500" data-item-qty value="' + Number(item.qty || 1) + '"></label>' +
          '<label>Price ₹<input type="number" min="0" step="0.01" data-item-price value="' + Number(item.price || 0) + '"></label>' +
          '<button type="button" class="order-item-remove" title="Remove item">&times;</button>' +
        '</div>';
      }).join('');
      host.querySelectorAll('.order-item-row').forEach(function (row) {
        var index = Number(row.getAttribute('data-index'));
        row.querySelector('[data-item-qty]').oninput = function (e) {
          self.editItems[index].qty = Number(e.target.value);
        };
        row.querySelector('[data-item-price]').oninput = function (e) {
          self.editItems[index].price = Number(e.target.value);
        };
        row.querySelector('.order-item-remove').onclick = function () {
          if (self.editItems.length === 1) {
            toast('An order must keep at least one item', true);
            return;
          }
          self.editItems.splice(index, 1);
          self.renderItems();
        };
      });
    },
    renderAddVariants: function () {
      var productId = document.getElementById('order-add-product').value;
      var product = this.storeProducts.find(function (p) { return p.id === productId; });
      var inventory = product ? (product.store_inventory || []).filter(function (row) { return row.stock > 0; }) : [];
      document.getElementById('order-add-variant').innerHTML = inventory.map(function (row) {
        var variant = (product.variants || []).find(function (v) { return v.id === row.variant_id; }) || {};
        return '<option value="' + esc(row.variant_id) + '">' + esc(variant.label || row.variant_id) +
          ' · ' + money(row.price) + ' · ' + row.stock + ' in stock</option>';
      }).join('') || '<option value="">No stocked variants</option>';
    },
    addItem: function () {
      var productId = document.getElementById('order-add-product').value;
      var variantId = document.getElementById('order-add-variant').value;
      var product = this.storeProducts.find(function (p) { return p.id === productId; });
      if (!product || !variantId) return toast('Select an available product and variant', true);
      var inventory = (product.store_inventory || []).find(function (row) { return row.variant_id === variantId; });
      var variant = (product.variants || []).find(function (v) { return v.id === variantId; }) || {};
      var existing = this.editItems.find(function (item) {
        return item.product_id === productId && item.variant_id === variantId;
      });
      if (existing) existing.qty = Number(existing.qty || 0) + 1;
      else this.editItems.push({
        product_id: productId, variant_id: variantId, name: product.name,
        variant_label: variant.label || '', qty: 1, price: Number(inventory.price || 0)
      });
      this.renderItems();
    },
    save: async function () {
      var id = document.getElementById('order-edit-id').value;
      try {
        await api('/api/admin/orders/' + id, {
          method: 'PUT',
          body: JSON.stringify({
            customer_name: document.getElementById('order-edit-customer').value,
            customer_phone: document.getElementById('order-edit-phone').value,
            status: document.getElementById('order-edit-status').value,
            payment_method: document.getElementById('order-edit-payment').value,
            address: document.getElementById('order-edit-address').value,
            discount: Number(document.getElementById('order-edit-discount').value || 0),
            delivery_fee: Number(document.getElementById('order-edit-delivery').value || 0),
            notes: document.getElementById('order-edit-notes').value,
            items: this.editItems
          })
        });
        closeModal('order-modal');
        toast('Order, customer history and inventory updated');
        this.load();
        AdminShell.refreshBadges();
      } catch (e) {
        toast(e.message || 'Could not update order', true);
      }
    },
    remove: async function () {
      if (!this.editOrder || !confirm(
        'Delete order ' + this.editOrder.order_id + '? Any deducted stock will be restored.'
      )) return;
      try {
        await api('/api/admin/orders/' + this.editOrder.order_id, { method: 'DELETE' });
        closeModal('order-modal');
        toast('Order deleted and inventory restored');
        this.page = 1;
        this.load();
        AdminShell.refreshBadges();
      } catch (e) {
        toast(e.message || 'Could not delete order', true);
      }
    }
  };

  // -------- Customers --------
  var AdminCustomers = {
    page: 1,
    timer: null,
    stores: [],
    loadToken: 0,
    abortCtrl: null,
    init: function () {
      var self = this;
      document.getElementById('customer-search').oninput = function () {
        clearTimeout(self.timer);
        self.timer = setTimeout(function () { self.page = 1; self.load(); }, 220);
      };
      document.getElementById('customer-close').onclick = function () { closeModal('customer-modal'); };
      var editCancel = document.getElementById('customer-edit-cancel');
      var editSave = document.getElementById('customer-edit-save');
      if (editCancel) editCancel.onclick = function () { closeModal('customer-edit-modal'); };
      if (editSave) editSave.onclick = function () { self.saveEdit(); };
      this.load();
    },
    load: async function () {
      var token = ++this.loadToken;
      if (this.abortCtrl) this.abortCtrl.abort();
      this.abortCtrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var q = document.getElementById('customer-search').value.trim();
      var focus = getQueryParam('focus');
      var qs = '?page=' + this.page + '&per_page=15';
      if (AdminShell.storeId) qs += '&store_id=' + encodeURIComponent(AdminShell.storeId);
      if (focus) qs += '&focus=' + encodeURIComponent(focus);
      else if (q) qs += '&q=' + encodeURIComponent(q);
      var data;
      try {
        data = await api('/api/admin/customers' + qs, {
          signal: this.abortCtrl ? this.abortCtrl.signal : undefined
        });
        if (token !== this.loadToken) return;
      } catch (e) {
        if (isAbortError(e) || token !== this.loadToken) return;
        toast(e.message || 'Could not load customers', true);
        return;
      }
      var self = this;
      var focusLabel = '';
      if (focus) {
        focusLabel = (data.items[0] && data.items[0].name) || 'No matching customer';
      } else if (q) {
        focusLabel = 'Search: ' + q;
      }
      renderFocusBar('focus-bar', focusLabel, function () {
        var search = document.getElementById('customer-search');
        if (search) search.value = '';
        self.page = 1;
        self.load();
      });
      var canEdit = AdminShell.admin.isSuper;
      var tbody = document.querySelector('#customers-table tbody');
      tbody.innerHTML = data.items.map(function (c) {
        var actions = '<button type="button" class="btn btn-sm btn-outline" data-view=\'' + encodeURIComponent(JSON.stringify(c)) + '\'>History</button>';
        if (canEdit) {
          actions += '<button type="button" class="btn btn-sm btn-gold" data-edit=\'' + encodeURIComponent(JSON.stringify(c)) + '\'>Edit</button>';
          actions += '<button type="button" class="btn btn-sm btn-danger" data-remove="' + encodeURIComponent(c.id) +
            '" data-name="' + encodeURIComponent(c.name) + '">Remove</button>';
        }
        return '<tr class="' + (focus && c.id === focus ? 'row-focus' : '') + '">' +
          '<td><strong>' + esc(c.name) + '</strong></td>' +
          '<td>' + esc(c.phone) + '</td>' +
          '<td>' + esc(c.email || '—') + '</td>' +
          '<td>' + (c.has_account
            ? '<span class="badge green">Signed up</span>'
            : '<span class="badge">Guest / COD</span>') + '</td>' +
          '<td>' + c.order_count + '</td>' +
          '<td>' + money(c.lifetime_value) + '</td>' +
          '<td>' + esc((c.created_at || '').slice(0, 10)) + '</td>' +
          '<td><div class="table-actions">' + actions + '</div></td></tr>';
      }).join('') || '<tr><td colspan="8">' + ((focus || q) ? 'No matching customers.' : 'No customers') + '</td></tr>';
      tbody.querySelectorAll('[data-view]').forEach(function (btn) {
        btn.onclick = function () {
          var c = JSON.parse(decodeURIComponent(btn.getAttribute('data-view')));
          document.getElementById('customer-modal-title').textContent = c.name;
          var html = '<p class="muted">' + esc(c.phone) + ' · ' + esc(c.email || 'no email') + '<br>' + esc(c.address || '') + '</p>';
          html += '<h3 style="margin:16px 0 10px;font-size:16px;">Order History</h3>';
          html += '<div class="table-wrap"><table class="data-table"><thead><tr><th>Order</th><th>Date</th><th>Items / Unique QR</th><th>Status</th><th>Total</th></tr></thead><tbody>';
          html += (c.orders || []).map(function (o) {
            var itemBits = (o.items || []).map(function (it) {
              var serials = it.unit_serials || [];
              if (!serials.length && it.qr_units) {
                serials = (it.qr_units || []).map(function (u) { return u.unit_serial || ''; }).filter(Boolean);
              }
              var line = esc(it.name || 'Item') + ' ×' + (it.qty || 1);
              if (serials.length) {
                line += '<div class="muted" style="font-family:ui-monospace,monospace;font-size:11px">Unique: ' +
                  esc(serials.join(', ')) + '</div>';
              } else if ((it.qr_codes || []).length) {
                line += '<div class="muted" style="font-family:ui-monospace,monospace;font-size:11px">' +
                  esc((it.qr_codes || []).join(', ')) + '</div>';
              }
              return line;
            }).join('<hr style="border:0;border-top:1px solid #e8e8e0;margin:6px 0">') || '—';
            return '<tr><td>' + esc(o.order_id) +
              (o.channel ? '<div class="muted">' + esc(o.channel) + '</div>' : '') +
              '</td><td>' + esc((o.created_at || '').slice(0, 10)) +
              '</td><td>' + itemBits +
              '</td><td>' + statusBadge(o.status) + '</td><td>' + money(o.total) + '</td></tr>';
          }).join('') || '<tr><td colspan="5">No orders</td></tr>';
          html += '</tbody></table></div>';
          document.getElementById('customer-detail').innerHTML = html;
          openModal('customer-modal');
        };
      });
      tbody.querySelectorAll('[data-edit]').forEach(function (btn) {
        btn.onclick = function () {
          self.openEdit(JSON.parse(decodeURIComponent(btn.getAttribute('data-edit'))));
        };
      });
      tbody.querySelectorAll('[data-remove]').forEach(function (btn) {
        btn.onclick = function () {
          self.remove(
            decodeURIComponent(btn.getAttribute('data-remove')),
            decodeURIComponent(btn.getAttribute('data-name'))
          );
        };
      });
      var pages = Math.max(1, Math.ceil(data.total / data.per_page));
      var pager = document.getElementById('customers-pager');
      if (pages <= 1) {
        pager.innerHTML = data.total ? '<span class="pager-info">' + data.total + ' customers</span>' : '';
        return;
      }
      var numbers = [1, pages, self.page - 1, self.page, self.page + 1]
        .filter(function (n) { return n >= 1 && n <= pages; })
        .filter(function (n, i, arr) { return arr.indexOf(n) === i; })
        .sort(function (a, b) { return a - b; });
      var html = '<span class="pager-info">Page ' + self.page + ' of ' + pages + ' · ' + data.total + ' customers</span>' +
        '<button type="button" class="pager-btn" data-page="' + (self.page - 1) + '"' +
        (self.page === 1 ? ' disabled' : '') + '>‹ Previous</button>';
      numbers.forEach(function (n, i) {
        if (i && n - numbers[i - 1] > 1) html += '<span class="pager-gap">…</span>';
        html += '<button type="button" class="pager-btn' + (n === self.page ? ' active' : '') +
          '" data-page="' + n + '">' + n + '</button>';
      });
      html += '<button type="button" class="pager-btn" data-page="' + (self.page + 1) + '"' +
        (self.page === pages ? ' disabled' : '') + '>Next ›</button>';
      pager.innerHTML = html;
      pager.querySelectorAll('[data-page]:not([disabled])').forEach(function (btn) {
        btn.onclick = function () {
          self.page = Number(btn.getAttribute('data-page'));
          self.load();
        };
      });
    },
    openEdit: async function (customer) {
      if (!AdminShell.admin.isSuper) {
        toast('Only Super Admin (abhi) can edit customers', true);
        return;
      }
      if (!this.stores.length) {
        try { this.stores = await api('/api/admin/stores'); } catch (e) { this.stores = []; }
      }
      document.getElementById('cust-edit-id').value = customer.id || '';
      document.getElementById('cust-edit-name').value = customer.name || '';
      document.getElementById('cust-edit-phone').value = customer.phone || '';
      document.getElementById('cust-edit-email').value = customer.email || '';
      document.getElementById('cust-edit-address').value = customer.address || '';
      var storeSel = document.getElementById('cust-edit-store');
      storeSel.innerHTML = '<option value="">— None —</option>' + this.stores.map(function (s) {
        return '<option value="' + esc(s.id) + '"' +
          (s.id === (customer.preferred_store_id || '') ? ' selected' : '') + '>' + esc(s.name) + '</option>';
      }).join('');
      openModal('customer-edit-modal');
    },
    saveEdit: async function () {
      if (!AdminShell.admin.isSuper) {
        toast('Only Super Admin (abhi) can edit customers', true);
        return;
      }
      var id = document.getElementById('cust-edit-id').value;
      var payload = {
        name: document.getElementById('cust-edit-name').value.trim(),
        phone: document.getElementById('cust-edit-phone').value.trim(),
        email: document.getElementById('cust-edit-email').value.trim(),
        address: document.getElementById('cust-edit-address').value.trim(),
        preferred_store_id: document.getElementById('cust-edit-store').value
      };
      if (!payload.name || !payload.phone) {
        toast('Name and phone are required', true);
        return;
      }
      try {
        await api('/api/admin/customers/' + encodeURIComponent(id), {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        toast('Customer saved to MongoDB');
        closeModal('customer-edit-modal');
        this.load();
      } catch (e) {
        toast(e.message || 'Could not save customer', true);
      }
    },
    remove: async function (customerId, customerName) {
      if (!AdminShell.admin.isSuper) {
        toast('Only Super Admin (abhi) can remove customers', true);
        return;
      }
      if (!confirm(
        'Remove ' + customerName + '\'s customer details and account? Existing order records will be kept.'
      )) return;
      try {
        await api('/api/admin/customers/' + encodeURIComponent(customerId), { method: 'DELETE' });
        toast('Customer details removed');
        this.page = 1;
        this.load();
      } catch (e) {
        toast(e.message || 'Could not remove customer details', true);
      }
    }
  };

  // -------- Reports --------
  var reportStoreChart, reportSalesChart;
  var AdminReports = {
    period: 'month',
    anchor: '',
    stores: [],
    selectedStoreIds: [],
    loadToken: 0,
    loadTimer: null,
    abortCtrl: null,
    init: async function () {
      var self = this;
      this.stores = await api('/api/admin/stores');
      if (!AdminShell.admin.isSuper && AdminShell.admin.storeId) {
        this.selectedStoreIds = [AdminShell.admin.storeId];
      } else {
        this.selectedStoreIds = [];
      }
      this.renderStoreFilter();
      this.anchor = this.defaultAnchor(this.period);
      this.renderAnchorControl();
      document.querySelectorAll('.panel-head .seg-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          document.querySelectorAll('.panel-head .seg-btn').forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          self.period = btn.getAttribute('data-period');
          self.anchor = self.defaultAnchor(self.period);
          self.renderAnchorControl();
          syncLinks();
          self.scheduleLoad();
        });
      });
      var syncLinks = function () {
        var params = self.queryParams();
        var q = params.toString() ? ('?' + params.toString()) : '';
        document.getElementById('dl-xlsx').href = '/api/admin/reports/xlsx' + q;
        document.getElementById('dl-pdf').href = '/api/admin/reports/pdf' + q;
      };
      this.syncLinks = syncLinks;
      syncLinks();
      this.load();
    },
    scheduleLoad: function () {
      var self = this;
      clearTimeout(this.loadTimer);
      this.loadTimer = setTimeout(function () { self.load(); }, 40);
    },
    renderStoreFilter: function () {
      var self = this;
      var panel = document.getElementById('report-store-panel');
      var toggle = document.getElementById('report-store-toggle');
      var labelEl = document.getElementById('report-store-label');
      if (!panel || !toggle || !labelEl) return;

      var locked = !AdminShell.admin.isSuper;
      var stores = this.stores || [];
      if (locked) {
        stores = stores.filter(function (s) { return s.id === AdminShell.admin.storeId; });
        if (!stores.length && AdminShell.admin.storeId) {
          stores = [{ id: AdminShell.admin.storeId, name: 'Assigned Store' }];
        }
      }

      var rows = '';
      if (!locked) {
        rows += '<label class="is-all"><input type="checkbox" data-all="1"' +
          (this.selectedStoreIds.length === 0 ? ' checked' : '') + '> All Stores</label>';
      }
      rows += stores.map(function (s) {
        var checked = locked || self.selectedStoreIds.indexOf(s.id) !== -1;
        return '<label><input type="checkbox" value="' + esc(s.id) + '"' +
          (checked ? ' checked' : '') + (locked ? ' disabled' : '') + '> ' + esc(s.name) + '</label>';
      }).join('');
      panel.innerHTML = rows;
      this.updateStoreLabel();

      if (locked) {
        toggle.disabled = true;
        panel.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
        return;
      }

      toggle.disabled = false;
      toggle.onclick = function (e) {
        e.stopPropagation();
        var open = panel.hidden;
        panel.hidden = !open;
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      };

      if (!this._storeOutsideBound) {
        this._storeOutsideBound = true;
        document.addEventListener('click', function (e) {
          var root = document.getElementById('report-store-multi');
          if (!root || root.contains(e.target)) return;
          panel.hidden = true;
          toggle.setAttribute('aria-expanded', 'false');
        });
      }

      panel.querySelectorAll('input[type="checkbox"]').forEach(function (box) {
        box.onchange = function () {
          if (box.getAttribute('data-all') === '1') {
            self.selectedStoreIds = [];
            panel.querySelectorAll('input[type="checkbox"]:not([data-all])').forEach(function (b) {
              b.checked = false;
            });
            box.checked = true;
          } else {
            var ids = [];
            panel.querySelectorAll('input[type="checkbox"]:not([data-all])').forEach(function (b) {
              if (b.checked) ids.push(b.value);
            });
            self.selectedStoreIds = ids;
            var allBox = panel.querySelector('input[data-all]');
            if (allBox) allBox.checked = ids.length === 0;
          }
          self.updateStoreLabel();
          if (self.syncLinks) self.syncLinks();
          self.scheduleLoad();
        };
      });
    },
    updateStoreLabel: function () {
      var labelEl = document.getElementById('report-store-label');
      if (!labelEl) return;
      if (!AdminShell.admin.isSuper) {
        var locked = (this.stores || []).find(function (s) { return s.id === AdminShell.admin.storeId; });
        labelEl.textContent = locked ? locked.name : 'Assigned Store';
        return;
      }
      var ids = this.selectedStoreIds || [];
      if (!ids.length) {
        labelEl.textContent = 'All Stores';
        return;
      }
      if (ids.length === 1) {
        var one = (this.stores || []).find(function (s) { return s.id === ids[0]; });
        labelEl.textContent = one ? one.name : '1 store';
        return;
      }
      labelEl.textContent = ids.length + ' stores';
    },
    defaultAnchor: function (period) {
      var now = new Date();
      var y = now.getFullYear();
      var m = String(now.getMonth() + 1).padStart(2, '0');
      var d = String(now.getDate()).padStart(2, '0');
      if (period === 'day') return y + '-' + m + '-' + d;
      if (period === 'month') return y + '-' + m;
      if (period === 'quarter') return y + '-Q' + (Math.floor(now.getMonth() / 3) + 1);
      if (period === 'year') return String(y);
      return y + '-' + m;
    },
    queryParams: function () {
      var params = new URLSearchParams();
      params.set('period', this.period);
      if (this.anchor) params.set('anchor', this.anchor);
      var ids = this.selectedStoreIds || [];
      if (!AdminShell.admin.isSuper && AdminShell.admin.storeId) {
        ids = [AdminShell.admin.storeId];
      }
      if (ids.length) params.set('store_ids', ids.join(','));
      return params;
    },
    renderAnchorControl: function () {
      var self = this;
      var wrap = document.getElementById('report-anchor-wrap');
      if (!wrap) return;
      var html = '';
      if (this.period === 'day') {
        html = '<label for="report-anchor">Date</label>' +
          '<input type="date" id="report-anchor" value="' + esc(this.anchor) + '" />';
      } else if (this.period === 'month') {
        html = '<label for="report-anchor">Month</label>' +
          '<input type="month" id="report-anchor" value="' + esc(this.anchor) + '" />';
      } else if (this.period === 'quarter') {
        var parts = String(this.anchor || '').split('-Q');
        var year = parts[0] || String(new Date().getFullYear());
        var q = parts[1] || '1';
        html = '<label for="report-anchor-year">Year</label>' +
          '<input type="number" id="report-anchor-year" min="2000" max="2100" value="' + esc(year) + '" />' +
          '<label for="report-anchor-quarter">Quarter</label>' +
          '<select id="report-anchor-quarter">' +
            [1, 2, 3, 4].map(function (n) {
              return '<option value="' + n + '"' + (String(n) === String(q) ? ' selected' : '') + '>Q' + n + '</option>';
            }).join('') +
          '</select>';
      } else {
        html = '<label for="report-anchor">Year</label>' +
          '<input type="number" id="report-anchor" min="2000" max="2100" value="' + esc(this.anchor) + '" />';
      }
      wrap.innerHTML = html;
      var syncAnchor = function () {
        if (self.period === 'quarter') {
          var y = document.getElementById('report-anchor-year').value;
          var qq = document.getElementById('report-anchor-quarter').value;
          self.anchor = y + '-Q' + qq;
        } else {
          self.anchor = document.getElementById('report-anchor').value;
        }
        if (self.syncLinks) self.syncLinks();
        self.scheduleLoad();
      };
      wrap.querySelectorAll('input, select').forEach(function (el) {
        el.onchange = syncAnchor;
      });
    },
    load: async function () {
      var token = ++this.loadToken;
      if (this.abortCtrl) this.abortCtrl.abort();
      this.abortCtrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      setSlicerBusy(true);
      try {
        var data = await api('/api/admin/stats?' + this.queryParams().toString(), {
          signal: this.abortCtrl ? this.abortCtrl.signal : undefined
        });
        if (token !== this.loadToken) return;
        var k = data.kpis;
        var caption = data.period_caption || '';
        var captionEl = document.getElementById('report-selection-caption');
        if (captionEl) captionEl.textContent = caption + ' · KPIs and charts update from the selected store and period filters.';
        var periodLabel = data.selection_label || PERIOD_KPI_LABELS[this.period] || 'Period Sales';
        var salesValue = (k.sales_selected != null) ? money(k.sales_selected) : periodSalesKpi(this.period, k);
        document.getElementById('report-kpis').innerHTML = [
          kpi(periodLabel, salesValue, 'gold'),
          kpi('Sales in View', money(k.sales_period)),
          kpi('Orders in Period', k.orders_selected != null ? k.orders_selected : k.orders_total),
          kpi('Customers in Period', k.customers_selected != null ? k.customers_selected : k.customers_total)
        ].join('');

        var drawCharts = function () {
          if (typeof Chart === 'undefined') {
            window.setTimeout(drawCharts, 40);
            return;
          }
          reportStoreChart = upsertChart(reportStoreChart, 'reportStoreChart', {
            type: 'bar',
            data: {
              labels: data.store_sales.map(function (s) { return s.name; }),
              datasets: [{
                label: 'Sales (₹)',
                data: data.store_sales.map(function (s) { return s.sales; }),
                backgroundColor: '#1E3A22'
              }]
            },
            options: { responsive: true, maintainAspectRatio: false, animation: { duration: 0 }, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
          });
          reportSalesChart = upsertChart(reportSalesChart, 'reportSalesChart', {
            type: 'line',
            data: {
              labels: data.timeline.map(function (t) { return t.label; }),
              datasets: [{
                label: 'Sales',
                data: data.timeline.map(function (t) { return t.sales; }),
                borderColor: '#A5342A',
                backgroundColor: 'rgba(165,52,42,.1)',
                fill: true,
                tension: .3
              }]
            },
            options: { responsive: true, maintainAspectRatio: false, animation: { duration: 0 }, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
          });
        };
        drawCharts();
      } catch (e) {
        if (isAbortError(e) || token !== this.loadToken) return;
        toast(e.message || 'Could not load report snapshot', true);
      } finally {
        if (token === this.loadToken) setSlicerBusy(false);
      }
    }
  };

  // -------- Settings --------
  var AdminSettings = {
    init: async function () {
      var self = this;
      var s = await api('/api/admin/settings');
      var map = this.fieldMap();
      Object.keys(map).forEach(function (key) {
        var el = document.getElementById(map[key]);
        if (!el) return;
        var v = s[key];
        if (key === 'order_statuses') v = (v || []).join(', ');
        if (typeof v === 'boolean') v = String(v);
        el.value = v != null ? v : '';
      });
      document.getElementById('settings-form').onsubmit = function (e) {
        e.preventDefault();
        self.save();
      };
    },
    fieldMap: function () {
      return {
        low_stock_threshold: 's-low-stock',
        order_statuses: 's-statuses',
        min_order_value: 's-min-order',
        delivery_fee_below_min: 's-delivery-fee',
        free_delivery_above: 's-free-above',
        default_delivery_radius_km: 's-radius',
        same_day_delivery: 's-same-day',
        cod_enabled: 's-cod',
        whatsapp_payment_link: 's-wa-pay',
        seo_site_title: 's-seo-title',
        seo_site_description: 's-seo-desc',
        seo_canonical_base: 's-canonical',
        ga_measurement_id: 's-ga',
        meta_pixel_id: 's-pixel',
        whatsapp_number: 's-wa-num',
        whatsapp_click_tracking: 's-wa-track',
        gst_number: 's-gst-num',
        gst_enabled: 's-gst-on',
        fssai_number: 's-fssai',
        halal_certified: 's-halal',
        privacy_policy: 's-privacy',
        terms_conditions: 's-terms'
      };
    },
    save: async function () {
      var map = this.fieldMap();
      var body = {};
      var bools = ['same_day_delivery', 'cod_enabled', 'whatsapp_click_tracking', 'gst_enabled', 'halal_certified'];
      Object.keys(map).forEach(function (key) {
        var el = document.getElementById(map[key]);
        if (!el) return;
        var v = el.value;
        if (bools.indexOf(key) !== -1) v = (v === 'true');
        body[key] = v;
      });
      await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(body) });
      toast('Settings saved');
    }
  };

  // -------- Coupons --------
  var AdminCoupons = {
    init: function () {
      var self = this;
      document.getElementById('btn-add-coupon').onclick = function () { self.openForm(); };
      document.getElementById('coupon-cancel').onclick = function () { closeModal('coupon-modal'); };
      document.getElementById('coupon-form').onsubmit = function (e) {
        e.preventDefault();
        self.save();
      };
      this.load();
    },
    load: async function () {
      var coupons = await api('/api/admin/coupons');
      var self = this;
      var tbody = document.querySelector('#coupons-table tbody');
      tbody.innerHTML = coupons.map(function (c) {
        var value = c.type === 'percent'
          ? c.value + '%' + (c.max_discount ? ' (max ' + money(c.max_discount) + ')' : '')
          : money(c.value);
        return '<tr>' +
          '<td><strong>' + esc(c.code) + '</strong></td>' +
          '<td>' + (c.type === 'percent' ? 'Percent' : 'Flat') + '</td>' +
          '<td>' + value + '</td>' +
          '<td>' + money(c.min_subtotal || 0) + '</td>' +
          '<td>' + esc(c.expires_at || '—') + '</td>' +
          '<td>' + (c.active ? '<span class="badge green">Active</span>' : '<span class="badge red">Inactive</span>') + '</td>' +
          '<td><button class="btn btn-sm btn-outline" data-edit="' + c.id + '">Edit</button> ' +
          '<button class="btn btn-sm btn-outline" data-toggle="' + c.id + '">' + (c.active ? 'Deactivate' : 'Activate') + '</button> ' +
          '<button class="btn btn-sm btn-outline" data-del="' + c.id + '">Delete</button></td></tr>';
      }).join('') || '<tr><td colspan="7">No coupons yet</td></tr>';
      tbody.querySelectorAll('[data-edit]').forEach(function (btn) {
        btn.onclick = function () {
          self.openForm(coupons.find(function (x) { return x.id === btn.getAttribute('data-edit'); }));
        };
      });
      tbody.querySelectorAll('[data-toggle]').forEach(function (btn) {
        btn.onclick = async function () {
          var c = coupons.find(function (x) { return x.id === btn.getAttribute('data-toggle'); });
          await api('/api/admin/coupons/' + c.id, { method: 'PUT', body: JSON.stringify({ active: !c.active }) });
          toast('Coupon updated');
          self.load();
        };
      });
      tbody.querySelectorAll('[data-del]').forEach(function (btn) {
        btn.onclick = async function () {
          if (!confirm('Delete this coupon?')) return;
          await api('/api/admin/coupons/' + btn.getAttribute('data-del'), { method: 'DELETE' });
          toast('Coupon deleted');
          self.load();
        };
      });
    },
    openForm: function (c) {
      c = c || {};
      document.getElementById('coupon-modal-title').textContent = c.id ? 'Edit Coupon' : 'Add Coupon';
      document.getElementById('coupon-id').value = c.id || '';
      var codeEl = document.getElementById('cpn-code');
      codeEl.value = c.code || '';
      codeEl.disabled = !!c.id;
      document.getElementById('cpn-type').value = c.type || 'percent';
      document.getElementById('cpn-value').value = c.value != null ? c.value : '';
      document.getElementById('cpn-max').value = c.max_discount || '';
      document.getElementById('cpn-min').value = c.min_subtotal || 0;
      document.getElementById('cpn-expiry').value = c.expires_at || '';
      document.getElementById('cpn-active').value = String(c.active !== false);
      openModal('coupon-modal');
    },
    save: async function () {
      var id = document.getElementById('coupon-id').value;
      var body = {
        code: document.getElementById('cpn-code').value,
        type: document.getElementById('cpn-type').value,
        value: Number(document.getElementById('cpn-value').value || 0),
        max_discount: Number(document.getElementById('cpn-max').value || 0) || null,
        min_subtotal: Number(document.getElementById('cpn-min').value || 0),
        expires_at: document.getElementById('cpn-expiry').value,
        active: document.getElementById('cpn-active').value === 'true'
      };
      if (id) await api('/api/admin/coupons/' + id, { method: 'PUT', body: JSON.stringify(body) });
      else await api('/api/admin/coupons', { method: 'POST', body: JSON.stringify(body) });
      closeModal('coupon-modal');
      toast('Coupon saved');
      this.load();
    }
  };

  // -------- Staff --------
  var AdminStaff = {
    roles: [],
    stores: [],
    canManage: document.body.getAttribute('data-admin-super') === '1',
    init: async function () {
      var self = this;
      this.stores = await api('/api/admin/stores');
      var addBtn = document.getElementById('btn-add-staff');
      if (addBtn) addBtn.onclick = function () { self.openForm(); };
      var cancel = document.getElementById('staff-cancel');
      if (cancel) cancel.onclick = function () { closeModal('staff-modal'); };
      var form = document.getElementById('staff-form');
      if (form) form.onsubmit = function (e) {
        e.preventDefault();
        self.save();
      };
      this.load();
    },
    load: async function () {
      var data = await api('/api/admin/staff');
      this.roles = data.roles || [];
      var staff = data.items || [];
      var self = this;
      var focus = getQueryParam('focus');
      var list = staff;
      if (focus) {
        list = staff.filter(function (m) { return m.id === focus; });
      }
      renderFocusBar('focus-bar', focus ? ((list[0] && list[0].name) || 'No matching staff') : '', function () {
        self.load();
      });
      var tbody = document.querySelector('#staff-table tbody');
      tbody.innerHTML = list.map(function (m) {
        var actions = '';
        if (self.canManage) {
          actions = '<button class="btn btn-sm btn-outline" data-edit="' + m.id + '">Edit</button> ' +
            '<button class="btn btn-sm btn-outline" data-del="' + m.id + '">Remove</button>';
        } else {
          actions = '<button class="btn btn-sm btn-outline" data-duty="' + m.id + '" data-on="' + (m.on_duty ? '0' : '1') + '">' +
            (m.on_duty ? 'Mark Off Duty' : 'Mark On Duty') + '</button>';
        }
        return '<tr class="' + (focus && m.id === focus ? 'row-focus' : '') + '">' +
          '<td><strong>' + esc(m.name) + '</strong></td>' +
          '<td>' + esc(m.username || '—') + '</td>' +
          '<td>' + esc(m.role) + '</td>' +
          '<td>' + esc(m.store_name || 'All Stores') + '</td>' +
          '<td>' + esc(m.phone || '—') + '</td>' +
          '<td>' + (m.on_duty ? '<span class="badge green">On duty</span>' : '<span class="badge">Off duty</span>') + '</td>' +
          '<td>' + actions + '</td></tr>';
      }).join('') || '<tr><td colspan="7">' + (focus ? 'No matching staff found.' : 'No staff yet') + '</td></tr>';
      tbody.querySelectorAll('[data-edit]').forEach(function (btn) {
        btn.onclick = function () {
          self.openForm(staff.find(function (x) { return x.id === btn.getAttribute('data-edit'); }));
        };
      });
      tbody.querySelectorAll('[data-del]').forEach(function (btn) {
        btn.onclick = async function () {
          if (!confirm('Remove this staff member?')) return;
          await api('/api/admin/staff/' + btn.getAttribute('data-del'), { method: 'DELETE' });
          toast('Staff removed');
          self.load();
        };
      });
      tbody.querySelectorAll('[data-duty]').forEach(function (btn) {
        btn.onclick = async function () {
          await api('/api/admin/staff/' + btn.getAttribute('data-duty'), {
            method: 'PUT',
            body: JSON.stringify({ on_duty: btn.getAttribute('data-on') === '1' })
          });
          toast('Duty status updated');
          self.load();
        };
      });
    },
    syncStoreForRole: function () {
      var roleEl = document.getElementById('stf-role');
      var storeEl = document.getElementById('stf-store');
      if (!roleEl || !storeEl) return;
      var isSuper = roleEl.value === 'Super Admin';
      if (isSuper) {
        storeEl.value = '';
        storeEl.disabled = true;
      } else {
        storeEl.disabled = false;
        // If still on All Stores with a non-super role, pick the first real store.
        if (!storeEl.value && storeEl.options.length > 1) {
          storeEl.selectedIndex = 1;
        }
      }
    },
    openForm: function (m) {
      var self = this;
      m = m || {};
      document.getElementById('staff-modal-title').textContent = m.id ? 'Edit Staff' : 'Add Staff Login';
      document.getElementById('staff-id').value = m.id || '';
      document.getElementById('stf-name').value = m.name || '';
      document.getElementById('stf-username').value = m.username || '';
      document.getElementById('stf-password').value = '';
      document.getElementById('stf-password').required = !m.id;
      document.getElementById('stf-role').innerHTML = this.roles.map(function (r) {
        return '<option value="' + esc(r) + '"' + (r === (m.role || 'Store Admin') ? ' selected' : '') + '>' + esc(r) + '</option>';
      }).join('');
      document.getElementById('stf-store').innerHTML = '<option value="">All Stores</option>' + this.stores.map(function (s) {
        return '<option value="' + s.id + '"' + (s.id === m.store_id ? ' selected' : '') + '>' + esc(s.name) + '</option>';
      }).join('');
      document.getElementById('stf-phone').value = m.phone || '';
      document.getElementById('stf-duty').value = String(m.on_duty !== false);
      var active = document.getElementById('stf-active');
      if (active) active.value = String(m.active !== false);
      var roleEl = document.getElementById('stf-role');
      roleEl.onchange = function () { self.syncStoreForRole(); };
      this.syncStoreForRole();
      openModal('staff-modal');
    },
    save: async function () {
      this.syncStoreForRole();
      var id = document.getElementById('staff-id').value;
      var role = document.getElementById('stf-role').value;
      var storeId = document.getElementById('stf-store').value;
      if (role === 'Super Admin') storeId = '';
      if (role !== 'Super Admin' && !storeId) {
        toast('Store Admin and Billing Staff must be assigned to a store', true);
        return;
      }
      var body = {
        name: document.getElementById('stf-name').value,
        username: document.getElementById('stf-username').value,
        role: role,
        store_id: storeId,
        phone: document.getElementById('stf-phone').value,
        on_duty: document.getElementById('stf-duty').value === 'true',
        active: document.getElementById('stf-active').value === 'true'
      };
      var password = document.getElementById('stf-password').value;
      if (password) body.password = password;
      if (!id && !password) {
        toast('Password is required for new staff logins', true);
        return;
      }
      if (id) await api('/api/admin/staff/' + id, { method: 'PUT', body: JSON.stringify(body) });
      else await api('/api/admin/staff', { method: 'POST', body: JSON.stringify(body) });
      closeModal('staff-modal');
      toast('Staff saved');
      this.load();
    }
  };

  // -------- Storefront CMS --------
  var AdminStorefront = {
    content: null,
    categories: [],
    products: [],
    dirty: false,
    setDirty: function (dirty) {
      this.dirty = dirty !== false;
    },
    init: async function () {
      var self = this;
      var results = await Promise.all([
        api('/api/admin/storefront-content'),
        api('/api/admin/categories'),
        api('/api/admin/products')
      ]);
      this.content = results[0];
      this.categories = results[1];
      this.products = results[2];
      this.render();
      var form = document.getElementById('storefront-form');
      form.addEventListener('input', function () { self.setDirty(true); });
      form.addEventListener('change', function () { self.setDirty(true); });
      form.onsubmit = function (e) {
        e.preventDefault();
        self.save();
      };
      document.getElementById('cms-add-section').onclick = function () {
        self.addCustomSection();
      };
      window.addEventListener('beforeunload', function (e) {
        if (!self.dirty) return;
        e.preventDefault();
        e.returnValue = '';
      });
    },
    uploadImage: async function (file) {
      var fd = new FormData();
      fd.append('image', file);
      var res = await fetch('/api/admin/content-image', { method: 'POST', body: fd, credentials: 'same-origin' });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      return data.url;
    },
    wireImagePicker: function (pickerEl, initialUrl) {
      var self = this;
      if (!pickerEl) return;
      var hidden = pickerEl.querySelector('.cms-image-url');
      var preview = pickerEl.querySelector('.cms-image-preview');
      var fileInput = pickerEl.querySelector('.cms-image-file');
      hidden.value = initialUrl || '';

      function renderPreview() {
        var url = hidden.value;
        if (!url) {
          preview.innerHTML = '<span class="muted">No image selected</span>';
          return;
        }
        preview.innerHTML = '<div class="cms-image-thumb"><img src="' + esc(url) + '" alt="">' +
          '<button type="button" class="cms-image-remove" title="Remove image">&times;</button></div>';
        preview.querySelector('.cms-image-remove').onclick = function () {
          hidden.value = '';
          self.setDirty(true);
          renderPreview();
        };
      }
      renderPreview();

      fileInput.onchange = async function () {
        if (!fileInput.files[0]) return;
        try {
          var url = await self.uploadImage(fileInput.files[0]);
          hidden.value = url;
          self.setDirty(true);
          renderPreview();
          toast('Image uploaded');
        } catch (e) {
          toast(e.message || 'Upload failed', true);
        }
        fileInput.value = '';
      };
    },
    customSectionHtml: function (section) {
      section = section || {};
      var id = section.id || ('cs_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
      return '' +
        '<section class="panel cms-panel cms-custom" data-cms-section="custom:' + id + '" data-cms-custom="' + id + '">' +
          '<div class="panel-head"><h2>Custom Section</h2><div class="cms-controls">' +
            '<label>Style <select class="cs-style">' +
              '<option value="light"' + (section.style !== 'dark' ? ' selected' : '') + '>Light</option>' +
              '<option value="dark"' + (section.style === 'dark' ? ' selected' : '') + '>Dark</option>' +
            '</select></label>' +
            '<label>Position <input class="cms-order" type="number" min="1" max="20"></label>' +
            '<label>Visible <select class="cms-enabled"><option value="true">Yes</option><option value="false">No</option></select></label>' +
            '<button type="button" class="btn btn-sm btn-danger cms-remove-custom">Remove Section</button>' +
          '</div></div>' +
          '<div class="form-grid">' +
            '<div class="field"><label>Eyebrow</label><input class="cs-eyebrow" value="' + esc(section.eyebrow || '') + '"></div>' +
            '<div class="field"><label>Title</label><input class="cs-title" value="' + esc(section.title || '') + '"></div>' +
            '<div class="field full"><label>Description</label><textarea class="cs-description" rows="2">' + esc(section.description || '') + '</textarea></div>' +
            '<div class="field"><label>Button Text</label><input class="cs-button-text" value="' + esc(section.button_text || '') + '"></div>' +
            '<div class="field"><label>Button Link</label><input class="cs-button-link" value="' + esc(section.button_link || '') + '" placeholder="/ or https://…"></div>' +
            '<div class="field full">' +
              '<label>Section Photo</label>' +
              '<div class="cms-image-picker"><input type="hidden" class="cms-image-url"><div class="cms-image-preview"></div>' +
              '<label class="btn btn-outline btn-sm cms-upload-btn">Upload Image<input type="file" accept="image/*" class="cms-image-file" hidden></label></div>' +
            '</div>' +
          '</div>' +
        '</section>';
    },
    addCustomSection: function (section, skipToast) {
      var self = this;
      var host = document.getElementById('cms-custom-sections');
      var wrap = document.createElement('div');
      wrap.innerHTML = this.customSectionHtml(section);
      var panel = wrap.firstElementChild;
      host.appendChild(panel);
      panel.querySelector('.cms-enabled').value = String(!section || section.enabled !== false);
      var totalPanels = document.querySelectorAll('[data-cms-section]').length;
      panel.querySelector('.cms-order').value = (section && this.orderIndexOf(panel.getAttribute('data-cms-section'))) || totalPanels;
      panel.querySelector('.cms-remove-custom').onclick = function () {
        if (!confirm('Remove this section from the storefront?')) return;
        panel.remove();
        self.setDirty(true);
      };
      this.wireImagePicker(panel.querySelector('.cms-image-picker'), section && section.image);
      if (!skipToast) {
        this.setDirty(true);
        toast('Section added — fill it in and click Save');
        panel.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      return panel;
    },
    orderIndexOf: function (key) {
      var order = (this.content && this.content.section_order) || [];
      var idx = order.indexOf(key);
      return idx >= 0 ? idx + 1 : 0;
    },
    lines: function (value) {
      return (value || '').split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean);
    },
    pairs: function (value) {
      return this.lines(value).map(function (line) {
        var parts = line.split('|');
        return {
          title: (parts.shift() || '').trim(),
          description: parts.join('|').trim()
        };
      }).filter(function (x) { return x.title; });
    },
    render: function () {
      var self = this;
      var c = this.content;
      var order = c.section_order || [];
      document.getElementById('cms-custom-sections').innerHTML = '';
      (c.custom_sections || []).forEach(function (section) {
        self.addCustomSection(section, true);
      });
      document.querySelectorAll('[data-cms-section]').forEach(function (panel) {
        var key = panel.getAttribute('data-cms-section');
        var isCustom = key.indexOf('custom:') === 0;
        if (isCustom) return; // already set in addCustomSection
        panel.querySelector('.cms-enabled').value = String(!c[key] || c[key].enabled !== false);
        panel.querySelector('.cms-order').value = Math.max(1, order.indexOf(key) + 1);
      });
      function set(id, value) {
        var el = document.getElementById(id);
        if (el) el.value = value == null ? '' : value;
      }
      set('cms-hero-pill', c.hero.pill);
      set('cms-hero-line1', c.hero.title_line_1);
      set('cms-hero-accent', c.hero.title_accent);
      set('cms-hero-line3', c.hero.title_line_3);
      set('cms-hero-description', c.hero.description);
      set('cms-hero-primary', c.hero.primary_button);
      set('cms-hero-secondary', c.hero.secondary_button);
      set('cms-trust-items', (c.trust.items || []).join('\n'));
      set('cms-why-eyebrow', c.why_us.eyebrow);
      set('cms-why-title', c.why_us.title);
      set('cms-why-description', c.why_us.description);
      set('cms-why-features', (c.why_us.features || []).map(function (x) {
        return x.title + ' | ' + x.description;
      }).join('\n'));
      set('cms-range-eyebrow', c.product_range.eyebrow);
      set('cms-range-title', c.product_range.title);
      set('cms-range-description', c.product_range.description);
      set('cms-fav-eyebrow', c.favourites.eyebrow);
      set('cms-fav-title', c.favourites.title);
      set('cms-fav-link', c.favourites.link_text);
      set('cms-fav-limit', c.favourites.limit || 6);
      set('cms-promise-eyebrow', c.promise.eyebrow);
      set('cms-promise-title', c.promise.title);
      set('cms-promise-steps', (c.promise.steps || []).map(function (x) {
        return x.title + ' | ' + x.description;
      }).join('\n'));
      set('cms-promise-badge', c.promise.badge);
      set('cms-locations-eyebrow', c.locations.eyebrow);
      set('cms-locations-title', c.locations.title);
      set('cms-cta-title', c.cta.title);
      set('cms-cta-description', c.cta.description);
      set('cms-cta-button', c.cta.button);
      set('cms-footer-description', c.footer.description);
      set('cms-footer-compliance', c.footer.compliance_text);

      this.wireImagePicker(document.querySelector('[data-cms-section="hero"] .cms-image-picker'), c.hero.image);
      this.wireImagePicker(document.querySelector('[data-cms-section="why_us"] .cms-image-picker'), c.why_us.image);

      var selectedCats = c.product_range.category_ids || [];
      document.getElementById('cms-range-categories').innerHTML = this.categories.map(function (cat) {
        return '<label><input type="checkbox" value="' + cat.id + '"' +
          (selectedCats.indexOf(cat.id) !== -1 ? ' checked' : '') + '> ' + esc(cat.name) + '</label>';
      }).join('');
      var selectedProducts = c.favourites.product_ids || [];
      document.getElementById('cms-fav-products').innerHTML = this.products.map(function (p) {
        return '<label><input type="checkbox" value="' + p.id + '"' +
          (selectedProducts.indexOf(p.id) !== -1 ? ' checked' : '') + '> ' + esc(p.name) + '</label>';
      }).join('');
    },
    save: async function () {
      var self = this;
      function val(id) { return document.getElementById(id).value.trim(); }
      function checked(id) {
        return Array.from(document.querySelectorAll('#' + id + ' input:checked')).map(function (x) { return x.value; });
      }
      var ordered = Array.from(document.querySelectorAll('[data-cms-section]')).map(function (panel) {
        return {
          key: panel.getAttribute('data-cms-section'),
          order: Number(panel.querySelector('.cms-order').value || 99),
          enabled: panel.querySelector('.cms-enabled').value === 'true'
        };
      }).sort(function (a, b) { return a.order - b.order; });
      var enabled = {};
      ordered.forEach(function (x) { enabled[x.key] = x.enabled; });
      function imageVal(selector) {
        var el = document.querySelector(selector);
        return el ? el.value : '';
      }
      var customSections = Array.from(document.querySelectorAll('[data-cms-custom]')).map(function (panel) {
        var id = panel.getAttribute('data-cms-custom');
        return {
          id: id,
          enabled: enabled['custom:' + id] !== false,
          style: panel.querySelector('.cs-style').value,
          eyebrow: panel.querySelector('.cs-eyebrow').value.trim(),
          title: panel.querySelector('.cs-title').value.trim(),
          description: panel.querySelector('.cs-description').value.trim(),
          button_text: panel.querySelector('.cs-button-text').value.trim(),
          button_link: panel.querySelector('.cs-button-link').value.trim(),
          image: panel.querySelector('.cms-image-url').value
        };
      });
      var body = {
        section_order: ordered.map(function (x) { return x.key; }),
        custom_sections: customSections,
        hero: {
          enabled: enabled.hero, pill: val('cms-hero-pill'),
          title_line_1: val('cms-hero-line1'), title_accent: val('cms-hero-accent'),
          title_line_3: val('cms-hero-line3'), description: val('cms-hero-description'),
          primary_button: val('cms-hero-primary'), secondary_button: val('cms-hero-secondary'),
          image: imageVal('[data-cms-section="hero"] .cms-image-url')
        },
        trust: { enabled: enabled.trust, items: this.lines(val('cms-trust-items')) },
        why_us: {
          enabled: enabled.why_us, eyebrow: val('cms-why-eyebrow'),
          title: val('cms-why-title'), description: val('cms-why-description'),
          features: this.pairs(val('cms-why-features')),
          image: imageVal('[data-cms-section="why_us"] .cms-image-url')
        },
        product_range: {
          enabled: enabled.product_range, eyebrow: val('cms-range-eyebrow'),
          title: val('cms-range-title'), description: val('cms-range-description'),
          category_ids: checked('cms-range-categories')
        },
        favourites: {
          enabled: enabled.favourites, eyebrow: val('cms-fav-eyebrow'),
          title: val('cms-fav-title'), link_text: val('cms-fav-link'),
          product_ids: checked('cms-fav-products'),
          limit: Math.max(1, Math.min(20, Number(val('cms-fav-limit') || 6)))
        },
        promise: {
          enabled: enabled.promise, eyebrow: val('cms-promise-eyebrow'),
          title: val('cms-promise-title'), steps: this.pairs(val('cms-promise-steps')),
          badge: val('cms-promise-badge')
        },
        locations: {
          enabled: enabled.locations, eyebrow: val('cms-locations-eyebrow'),
          title: val('cms-locations-title')
        },
        cta: {
          enabled: enabled.cta, title: val('cms-cta-title'),
          description: val('cms-cta-description'), button: val('cms-cta-button')
        },
        footer: {
          description: val('cms-footer-description'),
          compliance_text: val('cms-footer-compliance')
        }
      };
      try {
        self.content = await api('/api/admin/storefront-content', {
          method: 'PUT', body: JSON.stringify(body)
        });
        self.setDirty(false);
        toast('Storefront content saved');
      } catch (e) {
        toast(e.message || 'Could not save storefront', true);
      }
    }
  };

  // -------- In-store POS --------
  var AdminPOS = {
    stores: [],
    categories: [],
    products: [],
    cart: {},
    draftKey: function () {
      var store = document.getElementById('pos-store');
      var sid = store ? store.value : (AdminShell.storeId || 'default');
      return 'fam_pos_draft_' + sid;
    },
    saveDraft: function () {
      try {
        var payload = {
          cart: this.cart,
          customer_name: document.getElementById('pos-customer-name').value,
          customer_phone: document.getElementById('pos-customer-phone').value,
          payment: document.getElementById('pos-payment').value,
          discount: document.getElementById('pos-discount').value,
          notes: document.getElementById('pos-notes').value,
          updated_at: Date.now()
        };
        sessionStorage.setItem(this.draftKey(), JSON.stringify(payload));
      } catch (e) { /* ignore quota */ }
    },
    loadDraft: function () {
      try {
        var raw = sessionStorage.getItem(this.draftKey());
        if (!raw) return;
        var payload = JSON.parse(raw);
        this.cart = payload.cart || {};
        if (payload.customer_name != null) document.getElementById('pos-customer-name').value = payload.customer_name;
        if (payload.customer_phone != null) document.getElementById('pos-customer-phone').value = payload.customer_phone;
        if (payload.payment) document.getElementById('pos-payment').value = payload.payment;
        if (payload.discount != null) document.getElementById('pos-discount').value = payload.discount;
        if (payload.notes != null) document.getElementById('pos-notes').value = payload.notes;
      } catch (e) { /* ignore */ }
    },
    clearDraft: function () {
      try { sessionStorage.removeItem(this.draftKey()); } catch (e) { /* ignore */ }
    },
    init: async function () {
      var self = this;
      var results = await Promise.all([
        api('/api/admin/stores'),
        api('/api/admin/categories')
      ]);
      this.stores = results[0].filter(function (s) { return s.status === 'active'; });
      this.categories = results[1].filter(function (c) { return c.enabled; });
      var store = document.getElementById('pos-store');
      store.innerHTML = this.stores.map(function (s) {
        return '<option value="' + s.id + '">' + esc(s.name) + '</option>';
      }).join('');
      if (AdminShell.storeId && this.stores.some(function (s) { return s.id === AdminShell.storeId; })) {
        store.value = AdminShell.storeId;
      }
      if (!AdminShell.admin.isSuper) {
        store.disabled = true;
      }
      var staffName = document.getElementById('pos-staff-name');
      if (staffName && !staffName.value) staffName.value = AdminShell.admin.name || '';
      document.getElementById('pos-category').innerHTML = '<option value="">All categories</option>' +
        this.categories.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + '</option>'; }).join('');
      store.onchange = function () {
        self.saveDraft();
        self.cart = {};
        self.loadDraft();
        self.loadProducts();
        self.loadRecent();
      };
      document.getElementById('pos-search').oninput = function () { self.renderProducts(); };
      document.getElementById('pos-category').onchange = function () { self.renderProducts(); };
      document.getElementById('pos-discount').oninput = function () { self.renderCart(); self.saveDraft(); };
      var qrInput = document.getElementById('pos-qr-input');
      var qrBtn = document.getElementById('pos-qr-add');
      if (qrBtn) qrBtn.onclick = function () { self.addByQr(); };
      if (qrInput) {
        qrInput.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            self.addByQr();
          }
        });
      }
      ['pos-customer-name', 'pos-customer-phone', 'pos-payment', 'pos-notes'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('change', function () { self.saveDraft(); });
        if (el) el.addEventListener('input', function () { self.saveDraft(); });
      });
      document.getElementById('pos-clear').onclick = function () {
        self.cart = {};
        document.getElementById('pos-customer-name').value = '';
        document.getElementById('pos-customer-phone').value = '';
        document.getElementById('pos-discount').value = 0;
        document.getElementById('pos-notes').value = '';
        self.clearDraft();
        self.renderCart();
      };
      document.getElementById('pos-checkout').onclick = function () { self.checkout(); };
      document.getElementById('pos-success-close').onclick = function () { closeModal('pos-success-modal'); };
      this.loadDraft();
      await this.loadProducts();
      this.loadRecent();
    },
    loadProducts: async function () {
      var storeId = document.getElementById('pos-store').value;
      this.products = await api('/api/products?store_id=' + encodeURIComponent(storeId));
      this.renderProducts();
      this.renderCart();
    },
    variantFor: function (product, variantId) {
      return (product.variants || []).find(function (v) { return v.id === variantId; }) || {};
    },
    inventoryFor: function (product, variantId) {
      return (product.store_inventory || []).find(function (i) { return i.variant_id === variantId; });
    },
    renderProducts: function () {
      var self = this;
      var q = document.getElementById('pos-search').value.trim().toLowerCase();
      var category = document.getElementById('pos-category').value;
      var rows = this.products.filter(function (p) {
        return (!category || p.category_id === category) &&
          (!q || (p.name || '').toLowerCase().indexOf(q) !== -1 || (p.sku || '').toLowerCase().indexOf(q) !== -1);
      });
      var el = document.getElementById('pos-products');
      el.innerHTML = rows.map(function (p) {
        var invs = (p.store_inventory || []).filter(function (i) { return i.stock > 0; });
        var options = invs.map(function (inv) {
          var v = self.variantFor(p, inv.variant_id);
          return '<option value="' + inv.variant_id + '">' + esc(v.label || inv.variant_id) +
            ' · ' + money(inv.price) + ' · ' + inv.stock + ' left</option>';
        }).join('');
        return '<article class="pos-product-card" data-product="' + p.id + '">' +
          '<div class="pos-product-name">' + esc(p.name) + '</div>' +
          '<div class="muted">' + esc(p.sku || '') + '</div>' +
          (options ? '<select class="pos-variant">' + options + '</select>' +
            '<button class="btn btn-dark btn-sm pos-add" type="button">Add to Bill</button>'
            : '<span class="badge red">Out of stock</span>') +
          '</article>';
      }).join('') || '<p class="muted">No matching products.</p>';
      el.querySelectorAll('.pos-add').forEach(function (btn) {
        btn.onclick = function () {
          var card = btn.closest('[data-product]');
          var p = self.products.find(function (x) { return x.id === card.getAttribute('data-product'); });
          self.add(p, card.querySelector('.pos-variant').value);
        };
      });
    },
    add: function (product, variantId, opts) {
      opts = opts || {};
      var inv = this.inventoryFor(product, variantId);
      var unitId = opts.unit_id || '';
      var key = unitId ? ('unit|' + unitId) : (product.id + '|' + variantId);
      var current = this.cart[key] ? this.cart[key].qty : 0;
      if (unitId && current >= 1) {
        toast('This unique unit is already on the bill', true);
        return;
      }
      if (!inv || current >= inv.stock) {
        toast('No more stock available', true);
        return;
      }
      this.cart[key] = {
        product_id: product.id,
        variant_id: variantId,
        name: product.name,
        variant_label: this.variantFor(product, variantId).label || '',
        price: inv.price,
        stock: unitId ? 1 : inv.stock,
        qty: unitId ? 1 : (current + 1),
        unit_id: unitId || '',
        qr_code: opts.qr_code || product.qr_code || (this.cart[key] && this.cart[key].qr_code) || '',
        qr_uid: opts.qr_uid || product.qr_uid || (this.cart[key] && this.cart[key].qr_uid) || ''
      };
      this.renderCart();
      this.saveDraft();
    },
    addByQr: async function () {
      var input = document.getElementById('pos-qr-input');
      var code = (input.value || '').trim();
      if (!code) {
        toast('Enter or scan a QR code', true);
        return;
      }
      var storeId = document.getElementById('pos-store').value;
      try {
        var row = await api('/api/admin/qr-codes/lookup?code=' + encodeURIComponent(code) +
          '&store_id=' + encodeURIComponent(storeId));
        var product = this.products.find(function (p) { return p.id === row.id; });
        if (!product) {
          await this.loadProducts();
          product = this.products.find(function (p) { return p.id === row.id; });
        }
        if (!product) {
          toast('Product found but not available at this store', true);
          return;
        }
        product.qr_code = row.qr_code || product.qr_code;
        product.qr_uid = row.qr_uid || product.qr_uid;
        var variantId = row.preferred_variant_id;
        if (!variantId) {
          toast('No variant found for this QR', true);
          return;
        }
        this.add(product, variantId, {
          unit_id: row.unit_id || '',
          qr_code: row.qr_code || '',
          qr_uid: row.qr_uid || row.qr_serial || ''
        });
        input.value = '';
        input.focus();
        toast('Added ' + (row.name || 'item') +
          (row.qr_uid || row.qr_serial ? ' · ' + (row.qr_uid || row.qr_serial) : '') + ' via QR');
      } catch (e) {
        toast(e.message || 'QR code not found', true);
      }
    },
    changeQty: function (key, delta) {
      var row = this.cart[key];
      if (!row) return;
      if (row.unit_id && delta > 0) {
        toast('Each unique unit QR is qty 1 — scan another unit to add more', true);
        return;
      }
      row.qty += delta;
      if (row.qty <= 0) delete this.cart[key];
      else if (row.qty > row.stock) {
        row.qty = row.stock;
        toast('Maximum available stock reached', true);
      }
      this.renderCart();
      this.saveDraft();
    },
    renderCart: function () {
      var self = this;
      var rows = Object.keys(this.cart).map(function (key) { return { key: key, row: self.cart[key] }; });
      var el = document.getElementById('pos-cart');
      el.innerHTML = rows.map(function (entry) {
        var r = entry.row;
        return '<div class="pos-cart-line">' +
          '<div><strong>' + esc(r.name) + '</strong><div class="muted">' + esc(r.variant_label) + ' · ' + money(r.price) +
          (r.qr_uid ? '<div class="muted">UID ' + esc(r.qr_uid) + '</div>' : '') +
          (r.qr_code ? '<div class="muted" style="font-family:ui-monospace,monospace;font-size:11px">' + esc(r.qr_code) + '</div>' : '') +
          '</div></div>' +
          '<div class="pos-qty"><button type="button" data-minus="' + esc(entry.key) + '">−</button><span>' + r.qty + '</span><button type="button" data-plus="' + esc(entry.key) + '">+</button></div>' +
          '<strong>' + money(r.price * r.qty) + '</strong></div>';
      }).join('') || '<div class="pos-empty">Select products to start a bill.</div>';
      el.querySelectorAll('[data-minus]').forEach(function (b) { b.onclick = function () { self.changeQty(b.getAttribute('data-minus'), -1); }; });
      el.querySelectorAll('[data-plus]').forEach(function (b) { b.onclick = function () { self.changeQty(b.getAttribute('data-plus'), 1); }; });
      var subtotal = rows.reduce(function (n, x) { return n + x.row.price * x.row.qty; }, 0);
      var discount = Math.max(0, Math.min(subtotal, Number(document.getElementById('pos-discount').value || 0)));
      document.getElementById('pos-subtotal').textContent = money(subtotal);
      document.getElementById('pos-discount-total').textContent = '−' + money(discount);
      document.getElementById('pos-total').textContent = money(subtotal - discount);
    },
    checkout: async function () {
      var self = this;
      var rows = Object.keys(this.cart).map(function (key) { return self.cart[key]; });
      var error = document.getElementById('pos-error');
      if (!rows.length) { error.textContent = 'Add at least one product to the bill.'; return; }
      error.textContent = '';
      var button = document.getElementById('pos-checkout');
      button.disabled = true;
      button.textContent = 'Processing Sale…';
      try {
        var result = await api('/api/admin/pos/orders', {
          method: 'POST',
          body: JSON.stringify({
            store_id: document.getElementById('pos-store').value,
            customer_name: document.getElementById('pos-customer-name').value,
            customer_phone: document.getElementById('pos-customer-phone').value,
            staff_name: document.getElementById('pos-staff-name').value,
            payment_method: document.getElementById('pos-payment').value,
            discount: Number(document.getElementById('pos-discount').value || 0),
            notes: document.getElementById('pos-notes').value,
            items: rows.map(function (r) {
              return {
                product_id: r.product_id,
                variant_id: r.variant_id,
                qty: r.qty,
                unit_id: r.unit_id || '',
                unit_ids: r.unit_id ? [r.unit_id] : []
              };
            })
          })
        });
        var order = result.order;
        self.cart = {};
        self.clearDraft();
        document.getElementById('pos-discount').value = 0;
        document.getElementById('pos-customer-name').value = '';
        document.getElementById('pos-customer-phone').value = '';
        document.getElementById('pos-notes').value = '';
        document.getElementById('pos-success-copy').textContent =
          'Bill ' + order.order_id + ' · ' + money(order.total) + ' · ' +
          (order.payment_method || '').toUpperCase() + ' · by ' + (order.staff_name || AdminShell.admin.name);
        document.getElementById('pos-invoice').href = '/api/admin/orders/' + order.order_id + '/invoice';
        openModal('pos-success-modal');
        await self.loadProducts();
        self.loadRecent();
        AdminShell.refreshBadges();
      } catch (e) {
        error.textContent = e.message || 'Could not complete sale.';
      } finally {
        button.disabled = false;
        button.textContent = 'Complete Sale & Create Bill';
      }
    },
    loadRecent: async function () {
      var storeId = document.getElementById('pos-store').value;
      var rows = await api('/api/admin/pos/orders?limit=20&store_id=' + encodeURIComponent(storeId));
      document.querySelector('#pos-recent tbody').innerHTML = rows.map(function (o) {
        return '<tr><td><strong>' + esc(o.order_id) + '</strong></td><td>' +
          esc((o.created_at || '').slice(0, 16).replace('T', ' ')) + '</td><td>' +
          esc(o.store_name) + '</td><td>' + esc(o.customer_name) +
          (o.staff_name ? '<div class="muted">by ' + esc(o.staff_name) + '</div>' : '') +
          '</td><td>' +
          esc((o.payment_method || '').toUpperCase()) + '</td><td>' + money(o.total) +
          '</td><td><a class="btn btn-sm btn-outline" target="_blank" href="/api/admin/orders/' +
          encodeURIComponent(o.order_id) + '/invoice">Invoice</a></td></tr>';
      }).join('') || '<tr><td colspan="7">No in-store bills yet for this store.</td></tr>';
    }
  };

  var AdminQR = {
    rows: [],
    products: [],
    lineItems: [],
    categories: [],
    stores: [],
    selectedStoreId: '',
    previewRow: null,
    printSelected: {},
    init: async function () {
      var self = this;
      if (!AdminShell.admin.isSuper) {
        toast('Only Super Admin can manage QR codes', true);
        return;
      }
      document.body.setAttribute('data-page-qr', '1');
      document.getElementById('btn-generate-qr').onclick = function () { self.openGeneratePrint(); };
      document.getElementById('btn-print-qr').onclick = function () { self.openPrint(); };
      document.getElementById('qr-preview-close').onclick = function () { closeModal('qr-preview-modal'); };
      document.getElementById('qr-preview-print').onclick = function () { window.print(); };
      document.getElementById('qr-search').oninput = function () { self.render(); };
      document.getElementById('qr-filter-category').onchange = function () { self.render(); };
      document.getElementById('qr-filter-product').onchange = function () { self.render(); };
      document.getElementById('qr-print-cancel').onclick = function () { closeModal('qr-print-modal'); };
      document.getElementById('qr-print-search').oninput = function () { self.renderPrintList(); };
      document.getElementById('qr-print-select-all').onclick = function () { self.selectVisiblePrint(true); };
      document.getElementById('qr-print-clear').onclick = function () { self.selectVisiblePrint(false); };
      document.getElementById('qr-print-download').onclick = function () { self.downloadPrintPdf(); };

      document.getElementById('qg-cancel').onclick = function () { closeModal('qr-generate-modal'); };
      document.getElementById('qg-category').onchange = function () { self.fillGenerateProducts(); };
      document.getElementById('qr-generate-form').onsubmit = function (e) {
        e.preventDefault();
        self.submitGeneratePrint();
      };

      await this.load();
    },
    uniqueLast3: function (row) {
      var serial = (row.unit_serial || row.qr_serial || '').trim().toUpperCase();
      if (serial.length >= 3) return serial.slice(-3);
      var uid = (row.qr_uid || '').trim().toUpperCase();
      if (uid.length >= 3) return uid.slice(-3);
      var code = (row.qr_code || '').trim().toUpperCase();
      return code.length >= 3 ? code.slice(-3) : '—';
    },
    load: async function () {
      var self = this;
      // Catalog loads independently so a QR-units error never blanks store/category/product dropdowns
      try {
        var catalog = await Promise.all([
          api('/api/admin/categories'),
          api('/api/admin/stores'),
          api('/api/admin/products')
        ]);
        this.categories = catalog[0] || [];
        this.stores = (catalog[1] || []).filter(function (s) { return s.status === 'active'; });
        this.products = catalog[2] || [];
        this.rows = this.products;
        if (!this.selectedStoreId || !this.stores.some(function (s) { return s.id === self.selectedStoreId; })) {
          this.selectedStoreId = (AdminShell.storeId && this.stores.some(function (s) {
            return s.id === AdminShell.storeId;
          }) ? AdminShell.storeId : '') || (this.stores[0] && this.stores[0].id) || '';
        }
      } catch (e) {
        toast(e.message || 'Could not load stores / categories / products', true);
      }

      try {
        // All stores — no store slicer filter on the main QR table
        var qrPayload = await api('/api/admin/qr-codes');
        this.lineItems = Array.isArray(qrPayload)
          ? qrPayload
          : (qrPayload.units || qrPayload.items || []);
        this.lineItems.sort(function (a, b) {
          return String(b.qr_generated_at || '').localeCompare(String(a.qr_generated_at || ''));
        });
        if (qrPayload && qrPayload.products && qrPayload.products.length && !this.products.length) {
          this.products = qrPayload.products;
          this.rows = this.products;
        }
        if (qrPayload && qrPayload.backfilled) {
          toast('Synced ' + qrPayload.backfilled + ' unique unit QR(s) from stock');
        }
      } catch (e) {
        this.lineItems = this.lineItems || [];
        toast(e.message || 'Could not load QR units', true);
      }

      this.renderFilters();
      this.render();
    },
    renderFilters: function () {
      var productsInStore = {};
      this.lineItems.forEach(function (line) {
        productsInStore[line.product_id] = line.name;
      });
      (this.products || []).forEach(function (p) {
        productsInStore[p.id] = p.name;
      });
      document.getElementById('qr-filter-product').innerHTML =
        '<option value="">All products</option>' +
        Object.keys(productsInStore).sort(function (a, b) {
          return String(productsInStore[a]).localeCompare(String(productsInStore[b]));
        }).map(function (id) {
          return '<option value="' + id + '">' + esc(productsInStore[id]) + '</option>';
        }).join('');
      document.getElementById('qr-filter-category').innerHTML =
        '<option value="">All categories</option>' +
        this.categories.map(function (c) {
          return '<option value="' + c.id + '">' + esc(c.name) +
            (c.code ? ' (' + esc(c.code) + ')' : '') + '</option>';
        }).join('');
    },
    refreshCatalog: async function () {
      var results = await Promise.all([
        api('/api/admin/categories'),
        api('/api/admin/stores'),
        api('/api/admin/products')
      ]);
      this.categories = results[0] || [];
      this.stores = (results[1] || []).filter(function (s) { return s.status === 'active'; });
      this.products = results[2] || [];
      this.rows = this.products;
    },
    openGeneratePrint: async function () {
      var err = document.getElementById('qg-error');
      if (err) {
        err.hidden = true;
        err.textContent = '';
      }
      try {
        await this.refreshCatalog();
      } catch (e) {
        toast(e.message || 'Could not load catalog for Generate QR', true);
        return;
      }
      if (!this.stores.length) {
        toast('No active stores found. Add a store first.', true);
        return;
      }
      if (!this.categories.length) {
        toast('No categories found. Add a category first.', true);
        return;
      }
      if (!this.products.length) {
        toast('No products found. Add products first.', true);
        return;
      }
      var storeSel = document.getElementById('qg-store');
      storeSel.innerHTML = '<option value="">Select store</option>' + this.stores.map(function (s) {
        return '<option value="' + esc(s.id) + '"' +
          (s.id === this.selectedStoreId ? ' selected' : '') + '>' + esc(s.name) + '</option>';
      }, this).join('');
      document.getElementById('qg-category').innerHTML =
        '<option value="">Select category</option>' +
        this.categories.map(function (c) {
          return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>';
        }).join('');
      document.getElementById('qg-product').innerHTML = '<option value="">Select category first</option>';
      document.getElementById('qg-qty').value = '1';
      openModal('qr-generate-modal');
    },
    fillGenerateProducts: function () {
      var catId = document.getElementById('qg-category').value;
      var sel = document.getElementById('qg-product');
      if (!catId) {
        sel.innerHTML = '<option value="">Select category first</option>';
        return;
      }
      var list = (this.products || []).filter(function (p) {
        return p.category_id === catId && (p.status || 'available') !== 'disabled';
      }).slice().sort(function (a, b) {
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
      sel.innerHTML = '<option value="">Select product</option>' + list.map(function (p) {
        return '<option value="' + esc(p.id) + '">' + esc(p.name) +
          (p.sku ? ' · ' + esc(p.sku) : '') + '</option>';
      }).join('') || '<option value="">No products in this category</option>';
    },
    resolveProductPrice: function (product, storeId, variantId) {
      var details = product.store_inventory || product.store_details || [];
      var match = details.find(function (d) {
        return d.store_id === storeId && (!variantId || d.variant_id === variantId) && Number(d.price || 0) > 0;
      }) || details.find(function (d) {
        return d.store_id === storeId && Number(d.price || 0) > 0;
      });
      if (match) return Number(match.price || 0);
      if (product.price_min) return Number(product.price_min || 0);
      return 0;
    },
    submitGeneratePrint: async function () {
      var self = this;
      var err = document.getElementById('qg-error');
      var btn = document.getElementById('qg-submit');
      var storeId = document.getElementById('qg-store').value;
      var categoryId = document.getElementById('qg-category').value;
      var productId = document.getElementById('qg-product').value;
      var qty = Number(document.getElementById('qg-qty').value || 0);
      function showErr(msg) {
        if (!err) return;
        err.hidden = false;
        err.textContent = msg;
      }
      if (!storeId || !categoryId || !productId) {
        showErr('Store, category and product are all required.');
        return;
      }
      if (!qty || qty < 1 || qty > 100000 || Math.floor(qty) !== qty) {
        showErr('Enter a valid quantity (whole number, at least 1).');
        return;
      }
      var product = (this.products || []).find(function (p) { return p.id === productId; });
      if (!product) {
        showErr('Selected product was not found.');
        return;
      }
      var variants = product.variants || [];
      var variantId = (variants[0] && variants[0].id) || 'v1';
      var price = this.resolveProductPrice(product, storeId, variantId);
      btn.disabled = true;
      btn.textContent = 'Generating…';
      showErr('');
      if (err) err.hidden = true;
      try {
        var result = await api('/api/admin/qr-codes/generate', {
          method: 'POST',
          body: JSON.stringify({
            product_id: productId,
            category_id: categoryId,
            store_id: storeId,
            stock: qty,
            price: price,
            variant_id: variantId,
            set_stock: false
          })
        });
        var unitIds = (result && result.created_unit_ids) || [];
        var createdN = unitIds.length || (result && result.units_created) || qty;
        this.selectedStoreId = storeId;
        closeModal('qr-generate-modal');
        toast(createdN + ' unique QR(s) generated (pending — punch to add stock)');
        await this.load();
        if (unitIds.length) {
          await this.downloadUnitPdf(unitIds, 'fam_generated_qr.pdf');
        } else {
          toast('Codes generated — use Print QR to download PDF', true);
        }
      } catch (e) {
        showErr(e.message || 'Could not generate QR codes');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Generate & Print';
      }
    },
    downloadUnitPdf: async function (unitIds, filename) {
      if (!unitIds || !unitIds.length) return;
      var res = await fetch('/api/admin/qr-codes/print', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
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
    },
    openPrint: function () {
      this.printSelected = {};
      document.getElementById('qr-print-search').value = '';
      this.renderPrintList();
      openModal('qr-print-modal');
    },
    printableRows: function () {
      var self = this;
      var q = (document.getElementById('qr-print-search').value || '').trim().toLowerCase();
      var rows = this.filteredLines().filter(function (r) { return !!r.qr_code; }).slice();
      rows.sort(function (a, b) {
        return String(b.qr_generated_at || b.updated_at || '').localeCompare(
          String(a.qr_generated_at || a.updated_at || '')
        );
      });
      if (!q) return rows;
      return rows.filter(function (r) {
        return (r.name || '').toLowerCase().indexOf(q) !== -1 ||
          (r.sku || '').toLowerCase().indexOf(q) !== -1 ||
          (r.category_name || '').toLowerCase().indexOf(q) !== -1 ||
          self.uniqueLast3(r).toLowerCase().indexOf(q) !== -1 ||
          (r.qr_code || '').toLowerCase().indexOf(q) !== -1;
      });
    },
    renderPrintList: function () {
      var self = this;
      var rows = this.printableRows();
      var el = document.getElementById('qr-print-list');
      el.innerHTML = rows.map(function (r) {
        var id = r.unit_id || r.id;
        var checked = self.printSelected[id] ? ' checked' : '';
        return '<label class="qr-print-item">' +
          '<input type="checkbox" data-print-id="' + esc(id) + '"' + checked + ' />' +
          '<span><strong>' + esc(r.name) + '</strong>' +
          '<div class="muted">Unique ' + esc(self.uniqueLast3(r)) +
          (r.variant_label ? ' · ' + esc(r.variant_label) : '') +
          (r.qr_generated_at ? ' · ' + esc(String(r.qr_generated_at).slice(0, 19).replace('T', ' ')) : '') +
          '</div></span></label>';
      }).join('') || '<p class="muted">No unit QR codes match your search.</p>';
      el.querySelectorAll('[data-print-id]').forEach(function (cb) {
        cb.onchange = function () {
          var id = cb.getAttribute('data-print-id');
          if (cb.checked) self.printSelected[id] = true;
          else delete self.printSelected[id];
        };
      });
    },
    selectVisiblePrint: function (on) {
      var self = this;
      this.printableRows().forEach(function (r) {
        var id = r.unit_id || r.id;
        if (on) self.printSelected[id] = true;
        else delete self.printSelected[id];
      });
      this.renderPrintList();
    },
    downloadPrintPdf: async function () {
      var ids = Object.keys(this.printSelected);
      if (!ids.length) {
        toast('Select at least one QR unit', true);
        return;
      }
      var btn = document.getElementById('qr-print-download');
      btn.disabled = true;
      btn.textContent = 'Building PDF…';
      try {
        await this.downloadUnitPdf(ids, 'fam_qr_codes.pdf');
        closeModal('qr-print-modal');
      } catch (e) {
        toast(e.message || 'Could not download PDF', true);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Download PDF';
      }
    },
    filteredLines: function () {
      var self = this;
      var q = (document.getElementById('qr-search').value || '').trim().toLowerCase();
      var cat = document.getElementById('qr-filter-category').value;
      var productId = document.getElementById('qr-filter-product').value;
      var rows = this.lineItems.filter(function (line) {
        if (cat && line.category_id !== cat) return false;
        if (productId && line.product_id !== productId) return false;
        if (!q) return true;
        var unique = self.uniqueLast3(line).toLowerCase();
        return (line.name || '').toLowerCase().indexOf(q) !== -1 ||
          (line.sku || '').toLowerCase().indexOf(q) !== -1 ||
          (line.variant_label || '').toLowerCase().indexOf(q) !== -1 ||
          unique.indexOf(q) !== -1 ||
          (line.qr_code || '').toLowerCase().indexOf(q) !== -1 ||
          (line.category_name || '').toLowerCase().indexOf(q) !== -1 ||
          (line.store_name || '').toLowerCase().indexOf(q) !== -1;
      });
      rows.sort(function (a, b) {
        return String(b.qr_generated_at || '').localeCompare(String(a.qr_generated_at || ''));
      });
      return rows;
    },
    render: function () {
      var self = this;
      var rows = this.filteredLines();
      var tbody = document.querySelector('#qr-table tbody');
      tbody.innerHTML = rows.map(function (r) {
        var unique = self.uniqueLast3(r);
        var unitKey = r.unit_id || r.id;
        var st = (r.unit_status || r.status || '').toLowerCase();
        var badgeCls = st === 'in_stock' ? 'green' : (st === 'pending' ? 'gold' : 'green');
        var badgeLabel = st === 'in_stock' ? 'In inventory' : (st === 'pending' ? 'Pending punch' : 'QR Generated');
        var status = r.qr_generated || r.qr_code
          ? '<button type="button" class="qr-status-btn" data-qr="' + esc(unitKey) + '">' +
            '<span class="badge ' + badgeCls + '">' + badgeLabel + '</span></button>'
          : '<span class="badge red">QR Not Generated</span>';
        return '<tr>' +
          '<td><span class="qr-unique-code">' + esc(unique) + '</span></td>' +
          '<td><strong>' + esc(r.name) + '</strong><div class="muted">' + esc(r.sku || '') + '</div></td>' +
          '<td>' + esc(r.store_name || '—') + '</td>' +
          '<td>' + esc(r.variant_label || '—') + '</td>' +
          '<td>' + esc(r.category_name || '—') + '</td>' +
          '<td>1</td>' +
          '<td>' + money(r.price) + '</td>' +
          '<td>' + status + '</td>' +
          '<td>' + ((r.qr_generated || r.qr_code)
            ? '<button type="button" class="btn btn-sm btn-outline" data-qr="' + esc(unitKey) + '">View QR</button>'
            : '') + '</td></tr>';
      }).join('') || '<tr><td colspan="9">No unit QRs yet. Use Generate &amp; Print QR first.</td></tr>';
      tbody.querySelectorAll('[data-qr]').forEach(function (btn) {
        btn.onclick = function () {
          var id = btn.getAttribute('data-qr');
          var row = self.lineItems.find(function (x) {
            return (x.unit_id || x.id) === id;
          });
          if (row) self.showPreview(row);
        };
      });
      var countEl = document.getElementById('qr-count-bar');
      if (countEl) {
        var productIds = {};
        var storeIds = {};
        rows.forEach(function (r) {
          if (r.product_id) productIds[r.product_id] = true;
          if (r.store_id) storeIds[r.store_id] = true;
        });
        var productCount = Object.keys(productIds).length;
        var storeCount = Object.keys(storeIds).length;
        countEl.textContent = 'Showing ' + rows.length + ' unique unit' + (rows.length === 1 ? '' : 's') +
          ' (newest first) · ' + storeCount + ' store' + (storeCount === 1 ? '' : 's') +
          ' · ' + productCount + ' product' + (productCount === 1 ? '' : 's');
      }
    },
    showPreview: function (row) {
      this.previewRow = row;
      var img = document.getElementById('qr-preview-img');
      var nameEl = document.getElementById('qr-preview-name');
      if (nameEl) nameEl.textContent = row.name || '';
      document.getElementById('qr-preview-code').textContent = row.qr_code || '';
      document.getElementById('qr-preview-meta').textContent =
        'Unique ' + this.uniqueLast3(row) +
        (row.category_name ? ' · ' + row.category_name : '') +
        (row.sku ? ' · ' + row.sku : '') +
        (row.store_name ? ' · ' + row.store_name : '');
      var imageId = row.unit_id || row.id;
      if (img && imageId && (row.qr_generated || row.qr_code)) {
        img.src = '/api/admin/qr-codes/' + encodeURIComponent(imageId) + '/image?t=' + Date.now();
        img.alt = 'QR for ' + (row.name || row.qr_code || 'unit');
        img.onerror = function () { toast('Could not load QR image', true); };
      } else if (img) {
        img.removeAttribute('src');
        img.alt = 'No QR';
      }
      openModal('qr-preview-modal');
    }
  };

  global.AdminShell = AdminShell;
  global.AdminDashboard = AdminDashboard;
  global.AdminStores = AdminStores;
  global.AdminCategories = AdminCategories;
  global.AdminProducts = AdminProducts;
  global.AdminInventory = AdminInventory;
  global.AdminOrders = AdminOrders;
  global.AdminCustomers = AdminCustomers;
  global.AdminReports = AdminReports;
  global.AdminSettings = AdminSettings;
  global.AdminCoupons = AdminCoupons;
  global.AdminStaff = AdminStaff;
  global.AdminStorefront = AdminStorefront;
  global.AdminPOS = AdminPOS;
  global.AdminQR = AdminQR;
})(window);
