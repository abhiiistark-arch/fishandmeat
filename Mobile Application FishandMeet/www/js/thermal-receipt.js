/* Fish and Meat — 80mm thermal receipt (client Sample Bill format) */
(function (global) {
  'use strict';

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
    if (digits.length > 10) digits = digits.slice(-10);
    if (digits.length === 10) return digits.slice(0, 5) + ' ' + digits.slice(5);
    return phone || '—';
  }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(String(iso).replace('Z', '+00:00'));
    if (isNaN(d.getTime())) return String(iso).slice(0, 16).replace('T', ' ');
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function paymentLabel(method) {
    var map = { cash: 'Cash', card: 'Card', upi: 'UPI', cod: 'Cash on Delivery' };
    return map[String(method || 'cash').toLowerCase()] || String(method || 'Cash').toUpperCase();
  }

  function buildReceiptFromOrder(order, meta) {
    meta = meta || {};
    var taxableByRate = {};
    var gstTotal = 0;
    var items = (order.items || []).map(function (it) {
      var qty = Number(it.qty || 0);
      var rate = Number(it.price || 0);
      var gross = Number(it.line_total != null ? it.line_total : rate * qty);
      var gstPct = Number(it.gst_percent || 0);
      var taxable = gstPct > 0 ? +(gross / (1 + gstPct / 100)).toFixed(2) : +gross.toFixed(2);
      var lineGst = +(gross - taxable).toFixed(2);
      gstTotal += lineGst;
      taxableByRate[gstPct] = +((taxableByRate[gstPct] || 0) + taxable).toFixed(2);
      var detailParts = [];
      if (it.variant_label) detailParts.push(it.variant_label);
      detailParts.push('GST ' + gstPct + '%');
      return {
        name: it.name || 'Item',
        detail: detailParts.join(' | '),
        qty_rate: qty + ' x ' + money(rate),
        amount: money(gross)
      };
    });
    var discount = Number(order.discount || 0);
    var delivery = Number(order.delivery_fee || 0);
    var cgst = gstTotal > 0 ? +(gstTotal / 2).toFixed(2) : 0;
    var sgst = gstTotal > 0 ? +(gstTotal - cgst).toFixed(2) : 0;
    var taxRows = [];
    Object.keys(taxableByRate).sort(function (a, b) { return Number(a) - Number(b); }).forEach(function (rate) {
      taxRows.push({ label: 'Taxable Value (' + Number(rate) + '%)', value: money(taxableByRate[rate]) });
    });
    if (discount > 0) taxRows.push({ label: 'Discount', value: '-' + money(discount) });
    if (delivery > 0) taxRows.push({ label: 'Delivery', value: money(delivery) });
    if (gstTotal > 0) {
      taxRows.push({ label: 'CGST', value: money(cgst) });
      taxRows.push({ label: 'SGST', value: money(sgst) });
    }
    var billTotal = Number(order.total || 0);
    var preRound = 0;
    Object.keys(taxableByRate).forEach(function (r) { preRound += taxableByRate[r]; });
    preRound = +(preRound - discount + delivery + cgst + sgst).toFixed(2);
    var roundOff = +(billTotal - preRound).toFixed(2);
    if (Math.abs(roundOff) >= 0.005) {
      taxRows.push({
        label: 'Round Off',
        value: roundOff >= 0 ? money(roundOff) : '-' + money(Math.abs(roundOff))
      });
    }
    var address = meta.address || order.address || '';
    var addressLines = address ? address.split(',').map(function (p) { return p.trim(); }).filter(Boolean) : [];
    return {
      business_name: meta.business_name || 'FISH AND MEAT',
      tagline: 'FRESHLY CUT . FRESHLY SERVED . EVERY DAY',
      title: 'TAX INVOICE',
      logo_url: meta.logo_url || order.logo_url || '/assets/bill-logo-thermal.png?v=1',
      address_lines: addressLines,
      phone_line: meta.phone_line || '',
      gstin: meta.gstin || '',
      fssai: meta.fssai || '',
      invoice: order.order_id || order.id || '',
      date: formatDate(order.created_at),
      customer: order.customer_name || 'Walk-in Customer',
      mobile: formatPhone(order.customer_phone),
      order_type: order.channel === 'in_store' || order.delivery_mode === 'in_store' ? 'In-Store' : 'Delivery',
      place_of_supply: '27 - Maharashtra',
      items: items,
      tax_rows: taxRows,
      total: money(billTotal),
      paid_by: paymentLabel(order.payment_method),
      total_gst_note: gstTotal > 0 ? ('Total GST on this bill: Rs ' + money(gstTotal)) : '',
      fine_print: [
        'All prices inclusive of GST.',
        'Frozen items: keep at -18 C.',
        'No return on perishable goods.'
      ],
      thanks: 'Thank you. Please visit again!',
      website: 'www.fishandmeat.co.in'
    };
  }

  function renderReceiptHtml(receipt) {
    var addr = (receipt.address_lines || []).map(function (line, i, arr) {
      return '<div class="c addr">' + esc(line) + (i < arr.length - 1 ? ',' : '') + '</div>';
    }).join('');
    var items = (receipt.items || []).map(function (it) {
      return '<div class="item-name">' + esc(it.name) + '</div>' +
        (it.detail ? '<div class="item-sub">' + esc(it.detail) + '</div>' : '') +
        '<table><tr><td class="item-line">' + esc(it.qty_rate) +
        '</td><td class="r item-line">' + esc(it.amount) + '</td></tr></table>';
    }).join('');
    var taxRows = (receipt.tax_rows || []).map(function (row) {
      return '<tr><td>' + esc(row.label) + '</td><td>' + esc(row.value) + '</td></tr>';
    }).join('');
    var fine = (receipt.fine_print || []).map(function (line, i, arr) {
      return esc(line) + (i < arr.length - 1 ? '<br>' : '');
    }).join('');

    return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Tax Invoice ' + esc(receipt.invoice) +
      '</title><style>' +
      '@page{size:80mm auto;margin:0}' +
      '*{box-sizing:border-box}' +
      'html,body{margin:0;padding:0;width:80mm;background:#fff}' +
      '.receipt{width:72mm;margin:0 auto;padding:3mm 0 6mm;color:#000;' +
      'font-family:"DejaVu Sans Mono","Courier New",monospace;font-size:12px;font-weight:700;' +
      'line-height:1.45;-webkit-font-smoothing:none;text-rendering:geometricPrecision}' +
      '.c{text-align:center}.r{text-align:right}' +
      '.logo{display:block;margin:0 auto 3px;width:34mm;max-width:34mm;height:auto;' +
      'image-rendering:pixelated;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      '.shop{font-size:21px;letter-spacing:1px;margin-bottom:2px}' +
      '.tag{font-size:9px;font-weight:600;letter-spacing:.5px}' +
      '.addr{font-size:11px;font-weight:600}.gstin{font-size:12px;margin-top:3px}' +
      '.title{font-size:15px;letter-spacing:2px;margin:3px 0}' +
      'hr.solid{border:0;border-top:2px solid #000;margin:5px 0}' +
      'hr.dashed{border:0;border-top:2px dashed #000;margin:5px 0}' +
      'table{width:100%;border-collapse:collapse}td{padding:0;vertical-align:top}' +
      '.meta td{font-size:12px;font-weight:600}.meta td:last-child{text-align:right;font-weight:700}' +
      '.item-name{font-size:13px;margin-top:4px}.item-sub{font-size:10px;font-weight:600;padding-left:2mm}' +
      '.item-line{font-size:12px;padding-left:2mm}' +
      '.tot td{font-size:12px;font-weight:600}.tot td:last-child{text-align:right;font-weight:700}' +
      '.grand td{font-size:19px;font-weight:700;padding:2px 0}.grand td:last-child{text-align:right}' +
      '.foot{font-size:10px;font-weight:600}.ty{font-size:13px;margin-top:4px}' +
      '</style></head><body><div class="receipt">' +
      '<img class="logo" alt="' + esc(receipt.business_name) + '" src="' +
      esc(receipt.logo_url || '/assets/bill-logo-thermal.png?v=1') + '" width="128" height="90">' +
      '<div class="c shop">' + esc(receipt.business_name) + '</div>' +
      (receipt.tagline ? '<div class="c tag">' + esc(receipt.tagline) + '</div>' : '') +
      addr +
      (receipt.phone_line ? '<div class="c addr">Ph: ' + esc(receipt.phone_line) + '</div>' : '') +
      (receipt.gstin ? '<div class="c gstin">GSTIN: ' + esc(receipt.gstin) + '</div>' : '') +
      '<hr class="solid"><div class="c title">' + esc(receipt.title || 'TAX INVOICE') + '</div><hr class="dashed">' +
      '<table class="meta">' +
      '<tr><td>Invoice No.</td><td>' + esc(receipt.invoice) + '</td></tr>' +
      '<tr><td>Date</td><td>' + esc(receipt.date) + '</td></tr>' +
      '<tr><td>Customer</td><td>' + esc(receipt.customer) + '</td></tr>' +
      '<tr><td>Mobile</td><td>' + esc(receipt.mobile) + '</td></tr>' +
      '<tr><td>Order Type</td><td>' + esc(receipt.order_type) + '</td></tr>' +
      '<tr><td>Place of Supply</td><td>' + esc(receipt.place_of_supply || '27 - Maharashtra') + '</td></tr>' +
      '</table><hr class="dashed">' +
      '<table class="meta"><tr><td>ITEM / QTY x RATE</td><td>AMOUNT</td></tr></table><hr class="dashed">' +
      items +
      '<hr class="dashed"><table class="tot">' + taxRows + '</table>' +
      '<hr class="solid"><table class="grand"><tr><td>TOTAL</td><td>' + esc(receipt.total) + '</td></tr></table><hr class="solid">' +
      '<table class="meta"><tr><td>Paid by</td><td>' + esc(receipt.paid_by || '') + '</td></tr></table>' +
      (receipt.total_gst_note ? '<div class="c foot">' + esc(receipt.total_gst_note) + '</div>' : '') +
      '<hr class="dashed"><div class="c foot">' + fine + '</div>' +
      '<div class="c ty">' + esc(receipt.thanks || 'Thank you. Please visit again!') + '</div>' +
      (receipt.website ? '<div class="c foot">' + esc(receipt.website) + '</div>' : '') +
      '</div></body></html>';
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
    var printed = false;
    var cleanup = function () {
      if (done) return;
      done = true;
      setTimeout(function () {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 1500);
    };
    var doPrint = function () {
      if (printed) return;
      printed = true;
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (e) { /* ignore */ }
      cleanup();
    };
    var waitForImagesThenPrint = function () {
      var imgs = doc.images || [];
      if (!imgs.length) {
        doPrint();
        return;
      }
      var pending = imgs.length;
      var settle = function () {
        pending -= 1;
        if (pending <= 0) doPrint();
      };
      for (var i = 0; i < imgs.length; i++) {
        if (imgs[i].complete) settle();
        else {
          imgs[i].addEventListener('load', settle);
          imgs[i].addEventListener('error', settle);
        }
      }
      setTimeout(doPrint, 2500);
    };
    iframe.onload = waitForImagesThenPrint;
    setTimeout(waitForImagesThenPrint, 100);
    setTimeout(cleanup, 10000);
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
