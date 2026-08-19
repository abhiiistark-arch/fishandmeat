/* Fish and Meat — 80mm thermal receipt auto-print (Essae PR-55 and similar) */
(function (global) {
  'use strict';

  var RECEIPT_FOOTER = [
    'Thank you. Please visit again.'
  ];
  var RECEIPT_FINE = [
    'Frozen items: keep at -18°C.',
    'No return on perishable goods.'
  ];

  function esc(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function money(n) {
    return Number(n || 0).toFixed(2);
  }

  function formatPhone(phone) {
    var digits = String(phone || '').replace(/\D/g, '');
    if (digits.length === 10) return digits.slice(0, 5) + ' ' + digits.slice(5);
    return phone || '—';
  }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso).slice(0, 16).replace('T', ' ');
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function itemLabel(item) {
    var name = item.name || '';
    var variant = item.variant_label || '';
    if (variant && name.indexOf(variant) === -1) {
      return name + ' (' + variant + ')';
    }
    return name;
  }

  function paymentLine(method) {
    var map = { cash: 'Cash', card: 'Card', upi: 'UPI', cod: 'Cash on Delivery' };
    var label = map[String(method || 'cash').toLowerCase()] || String(method || 'Cash').toUpperCase();
    return 'Paid by ' + label;
  }

  function buildReceiptFromOrder(order, meta) {
    meta = meta || {};
    var gst = Number(order.gst_amount || 0);
    var halfGst = gst > 0 ? (gst / 2) : 0;
    var items = (order.items || []).map(function (it) {
      return {
        name: itemLabel(it),
        qty: it.qty,
        rate: money(it.price),
        amount: money((it.line_total != null ? it.line_total : it.price * it.qty))
      };
    });
    return {
      business_name: meta.business_name || 'FISH AND MEAT',
      title: 'TAX INVOICE',
      address: meta.address || order.address || '',
      gstin: meta.gstin || '',
      fssai: meta.fssai || '',
      invoice: order.order_id || order.id || '',
      date: formatDate(order.created_at),
      customer: order.customer_name || 'Walk-in Customer',
      mobile: formatPhone(order.customer_phone),
      order_type: order.channel === 'in_store' || order.delivery_mode === 'in_store'
        ? 'In-Store' : 'Delivery',
      items: items,
      subtotal: money(order.subtotal),
      discount: Number(order.discount || 0) > 0 ? money(order.discount) : '',
      cgst: halfGst > 0 ? money(halfGst) : '',
      sgst: halfGst > 0 ? money(halfGst) : '',
      delivery: money(order.delivery_fee || 0),
      total: money(order.total),
      payment_line: paymentLine(order.payment_method),
      footer_lines: RECEIPT_FOOTER.slice(),
      fine_print: RECEIPT_FINE.slice()
    };
  }

  function renderReceiptHtml(receipt) {
    var rows = (receipt.items || []).map(function (it) {
      return '<tr><td class="item-name">' + esc(it.name) + '</td>' +
        '<td class="num">' + esc(it.qty) + '</td>' +
        '<td class="num">' + esc(it.rate) + '</td>' +
        '<td class="num">' + esc(it.amount) + '</td></tr>';
    }).join('');

    var discountRow = receipt.discount
      ? '<tr><td class="label">Discount:</td><td class="value">−' + esc(receipt.discount) + '</td></tr>'
      : '';
    var gstRows = receipt.cgst
      ? '<tr><td class="label">CGST:</td><td class="value">' + esc(receipt.cgst) + '</td></tr>' +
        '<tr><td class="label">SGST:</td><td class="value">' + esc(receipt.sgst) + '</td></tr>'
      : '';
    var footer = (receipt.footer_lines || []).map(function (line) {
      return '<p>' + esc(line) + '</p>';
    }).join('');
    var fine = (receipt.fine_print || []).map(function (line) {
      return '<div>' + esc(line) + '</div>';
    }).join('');

    return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Receipt ' + esc(receipt.invoice) +
      '</title><style>' +
      '*{box-sizing:border-box;margin:0;padding:0}' +
      'html,body{width:80mm;max-width:80mm;margin:0 auto;background:#fff;color:#000;' +
      'font-family:"Courier New",Courier,monospace;font-size:11px;line-height:1.35}' +
      '.receipt{width:72mm;max-width:72mm;margin:0 auto;padding:4mm 2mm 6mm}' +
      '.center{text-align:center}.bold{font-weight:700}' +
      '.title{font-size:14px;letter-spacing:.5px;margin-bottom:2px}' +
      '.subtitle{font-size:11px;margin-bottom:6px}' +
      '.address{font-size:10px;margin-bottom:4px;word-break:break-word}' +
      '.meta-line{font-size:10px;margin-bottom:2px}' +
      '.rule{border:none;border-top:1px dashed #000;margin:6px 0}' +
      '.rule-thick{border:none;border-top:2px solid #000;margin:6px 0}' +
      '.kv{width:100%;font-size:10px;margin-bottom:2px}' +
      '.kv td{vertical-align:top;padding:1px 0}' +
      '.kv .k{white-space:nowrap;padding-right:6px}' +
      '.kv .v{text-align:right;width:100%}' +
      '.items{width:100%;border-collapse:collapse;font-size:10px;margin:4px 0}' +
      '.items th{text-align:left;font-weight:700;padding:2px 0;border-bottom:1px dashed #000}' +
      '.items th.num,.items td.num{text-align:right;white-space:nowrap}' +
      '.items td{padding:3px 0;vertical-align:top}' +
      '.items .item-name{word-break:break-word;padding-right:4px}' +
      '.totals{width:100%;font-size:10px;margin-top:4px}' +
      '.totals td{padding:2px 0}.totals .label{text-align:left}' +
      '.totals .value{text-align:right;white-space:nowrap}' +
      '.grand{font-size:13px;font-weight:700}' +
      '.footer{font-size:10px;margin-top:8px}.footer p{margin-bottom:4px}' +
      '.fine{font-size:9px;margin-top:6px;line-height:1.3}' +
      '@media print{@page{size:80mm auto;margin:2mm}html,body{width:80mm}.receipt{width:72mm;padding:0}}' +
      '</style></head><body><div class="receipt">' +
      '<div class="center title bold">' + esc(receipt.business_name) + '</div>' +
      '<div class="center subtitle bold">' + esc(receipt.title) + '</div>' +
      (receipt.address ? '<div class="center address">' + esc(receipt.address) + '</div>' : '') +
      (receipt.gstin ? '<div class="center meta-line">GSTIN: ' + esc(receipt.gstin) + '</div>' : '') +
      (receipt.fssai ? '<div class="center meta-line">FSSAI: ' + esc(receipt.fssai) + '</div>' : '') +
      '<hr class="rule">' +
      '<table class="kv">' +
      '<tr><td class="k">Invoice:</td><td class="v">' + esc(receipt.invoice) + '</td></tr>' +
      '<tr><td class="k">Date:</td><td class="v">' + esc(receipt.date) + '</td></tr>' +
      '<tr><td class="k">Customer:</td><td class="v">' + esc(receipt.customer) + '</td></tr>' +
      '<tr><td class="k">Mobile:</td><td class="v">' + esc(receipt.mobile) + '</td></tr>' +
      '<tr><td class="k">Order type:</td><td class="v">' + esc(receipt.order_type) + '</td></tr>' +
      '</table><hr class="rule">' +
      '<table class="items"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead><tbody>' +
      rows + '</tbody></table><hr class="rule">' +
      '<table class="totals">' +
      '<tr><td class="label">Subtotal:</td><td class="value">' + esc(receipt.subtotal) + '</td></tr>' +
      discountRow + gstRows +
      '<tr><td class="label">Delivery:</td><td class="value">' + esc(receipt.delivery) + '</td></tr>' +
      '</table><hr class="rule-thick">' +
      '<table class="totals grand"><tr><td class="label">TOTAL:</td><td class="value">' + esc(receipt.total) + '</td></tr></table>' +
      '<hr class="rule"><div class="footer center"><p class="bold">' + esc(receipt.payment_line) + '</p>' + footer + '</div>' +
      '<div class="center fine">' + fine + '</div></div></body></html>';
  }

  function printHtml(html) {
    var iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
    document.body.appendChild(iframe);
    var doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
    var done = false;
    var cleanup = function () {
      if (done) return;
      done = true;
      setTimeout(function () {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 1500);
    };
    iframe.onload = function () {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (e) { /* ignore */ }
      cleanup();
    };
    setTimeout(cleanup, 8000);
  }

  function printReceipt(receiptOrOrder, meta) {
    var receipt = receiptOrOrder && receiptOrOrder.items && receiptOrOrder.invoice
      ? receiptOrOrder
      : buildReceiptFromOrder(receiptOrOrder || {}, meta);
    printHtml(renderReceiptHtml(receipt));
  }

  function printByUrl(url) {
    var iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
    iframe.src = url;
    document.body.appendChild(iframe);
    iframe.onload = function () {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (e) { /* ignore */ }
      setTimeout(function () {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 2000);
    };
  }

  global.ThermalReceipt = {
    buildReceiptFromOrder: buildReceiptFromOrder,
    renderReceiptHtml: renderReceiptHtml,
    printReceipt: printReceipt,
    printByUrl: printByUrl
  };
})(typeof window !== 'undefined' ? window : this);
