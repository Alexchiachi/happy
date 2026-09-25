// 雲南好物：商品卡、購物車、運費與送出訂單
// 商品、價格、運費、檔期都在 products.json（Worker 也讀同一份，金額以 Worker 重算為準）
(function () {
  'use strict';

  var ORDER_ENDPOINT = 'https://executive-table.jianchiachi.workers.dev/api/order';
  var STORE_KEY = 'yunnan-shop-cart';
  var DELIVERY_FEE = { home: 'home', '711': 'cvs', family: 'cvs', meet: 'meet' };

  var DATA = null, PRODUCTS = [], byId = {}, cart = {};

  function $(sel) { return document.querySelector(sel); }
  function money(n) { return 'NT$' + Number(n).toLocaleString('en-US'); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  fetch('products.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(start)
    .catch(function () {
      document.querySelectorAll('[data-shelf]').forEach(function (el) {
        el.innerHTML = '<p class="load-err">商品資料暫時讀不到，請重新整理頁面。</p>';
      });
    });

  function start(data) {
    DATA = data;
    PRODUCTS = data.products.filter(function (p) { return p.active !== false; });
    PRODUCTS.forEach(function (p) { byId[p.id] = p; });
    try { cart = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { cart = {}; }
    Object.keys(cart).forEach(function (k) { if (!find(k) || !(cart[k] > 0)) delete cart[k]; });

    // 檔期資訊
    document.querySelectorAll('[data-season-name]').forEach(function (el) { el.textContent = data.season.name; });
    document.querySelectorAll('[data-deadline-text]').forEach(function (el) { el.textContent = data.season.deadlineText; });
    document.querySelectorAll('[data-ship-text]').forEach(function (el) { el.textContent = data.season.ship; });
    document.querySelectorAll('[data-season-note]').forEach(function (el) { if (data.season.note) el.textContent = data.season.note; });
    var s = data.shipping;
    document.querySelectorAll('[data-free]').forEach(function (el) { el.textContent = money(s.free); });
    document.querySelectorAll('[data-fee-home]').forEach(function (el) { el.textContent = s.home; });
    document.querySelectorAll('[data-fee-cvs]').forEach(function (el) { el.textContent = s.cvs; });

    var days = Math.ceil((new Date(data.season.deadline) - new Date()) / 86400000);
    var closed = days <= 0;
    $('[data-countdown]').textContent = closed ? '本檔已截止，下一檔籌備中' : '還有 ' + days + ' 天收單';

    document.querySelectorAll('[data-shelf]').forEach(function (el) {
      var shelf = el.dataset.shelf;
      el.innerHTML = PRODUCTS.filter(function (p) { return p.shelf === shelf; })
        .map(function (p) { return cardHTML(p, closed && shelf === 'season'); }).join('');
    });
    syncDelivery();
  }

  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(cart)); } catch (e) { /* 無痕模式等情況：不記也沒關係 */ } }

  function find(key) {
    var parts = key.split('|'), p = byId[parts[0]];
    if (!p) return null;
    for (var i = 0; i < p.variants.length; i++) if (p.variants[i].key === parts[1]) return { p: p, v: p.variants[i] };
    return null;
  }

  // ---------- 商品卡 ----------
  function cardHTML(p, closed) {
    var visual = p.img
      ? '<img src="' + p.img + '" alt="' + esc(p.imgAlt || p.name) + '" loading="lazy" decoding="async" width="800" height="1000">'
      : '<div class="ph tone-' + p.tone + '" role="img" aria-label="' + esc(p.name) + '（照片準備中）"><span class="ph-han">' + p.han + '</span><span class="ph-note">照片準備中</span></div>';
    var from = Math.min.apply(null, p.variants.map(function (v) { return v.price; }));
    var rows = p.variants.map(function (v) {
      var k = p.id + '|' + v.key;
      return '<li class="variant">' +
        '<span class="v-label">' + esc(v.label) + '</span>' +
        '<span class="v-price">' + money(v.price) + '<small>／' + v.unit + '</small></span>' +
        (closed ? '<span class="v-closed">已截止</span>' :
        '<span class="stepper" data-key="' + k + '">' +
          '<button type="button" data-step="-1" aria-label="' + esc(p.name + ' ' + v.label) + ' 減一">−</button>' +
          '<output aria-live="polite">0</output>' +
          '<button type="button" data-step="1" aria-label="' + esc(p.name + ' ' + v.label) + ' 加一">＋</button>' +
        '</span>') + '</li>';
    }).join('');
    var specs = p.specs.map(function (s) { return '<div><dt>' + esc(s[0]) + '</dt><dd>' + esc(s[1]) + '</dd></div>'; }).join('');
    return '<article class="card' + (p.featured ? ' card-featured' : '') + '" id="p-' + p.id + '">' +
      '<div class="card-media">' + visual + (p.badge ? '<span class="badge">' + esc(p.badge) + '</span>' : '') + '</div>' +
      '<div class="card-body">' +
        '<p class="card-cat">' + esc(p.cat) + '</p>' +
        '<h3 class="card-name">' + esc(p.name) + '</h3>' +
        '<p class="card-price">' + (p.variants.length > 1 ? '<small>自</small> ' : '') + money(from) + '</p>' +
        '<p class="card-intro">' + esc(p.intro) + '</p>' +
        '<details class="card-more"><summary>介紹與規格</summary>' +
          (p.story ? '<p>' + esc(p.story) + '</p>' : '') + '<dl class="specs">' + specs + '</dl>' +
          (p.read ? '<a class="read" href="' + p.read.href + '">' + esc(p.read.text) + ' →</a>' : '') +
        '</details>' +
        '<ul class="variants">' + rows + '</ul>' +
      '</div></article>';
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-step]');
    if (b) {
      var key = b.parentNode.dataset.key;
      var n = Math.max(0, Math.min(99, (cart[key] || 0) + Number(b.dataset.step)));
      if (n) cart[key] = n; else delete cart[key];
      save(); render();
      return;
    }
    var a = e.target.closest('[data-add]');
    if (a) { cart[a.dataset.add] = (cart[a.dataset.add] || 0) + 1; save(); render(); }
  });

  // ---------- 金額（顯示用；實際金額以 Worker 回傳為準） ----------
  var form = $('[data-form]');
  function delivery() { var r = form.querySelector('input[name=delivery]:checked'); return r ? r.value : 'home'; }
  function calc() {
    var sub = 0, count = 0;
    Object.keys(cart).forEach(function (k) { var f = find(k); sub += f.v.price * cart[k]; count += cart[k]; });
    var s = DATA.shipping, d = delivery();
    var ship = sub === 0 || sub >= s.free ? 0 : s[DELIVERY_FEE[d]];
    return { sub: sub, ship: ship, total: sub + ship, count: count, free: s.free };
  }

  function render() {
    if (!DATA) return;
    var t = calc();
    document.querySelectorAll('.stepper').forEach(function (s) {
      var n = cart[s.dataset.key] || 0;
      s.querySelector('output').textContent = n;
      s.classList.toggle('on', n > 0);
      s.closest('.variant').classList.toggle('picked', n > 0);
    });
    document.querySelectorAll('[data-count]').forEach(function (el) { el.textContent = t.count; });

    $('[data-lines]').innerHTML = Object.keys(cart).map(function (k) {
      var f = find(k);
      return '<li><span>' + esc(f.p.name) + '<small>' + esc(f.v.label) + ' × ' + cart[k] + '</small></span><b>' + money(f.v.price * cart[k]) + '</b></li>';
    }).join('');
    $('[data-empty]').hidden = t.count > 0;
    $('[data-subtotal]').textContent = money(t.sub);
    $('[data-shipping]').textContent = t.sub === 0 ? '—' : (t.ship === 0 ? '免運' : money(t.ship));
    $('[data-total]').textContent = money(t.total);

    var gap = t.free - t.sub;
    $('[data-meter]').style.width = Math.min(100, t.sub / t.free * 100) + '%';
    $('[data-freeship]').classList.toggle('reached', gap <= 0 && t.sub > 0);
    $('[data-freeship-text]').textContent = t.sub === 0 ? '滿 ' + money(t.free) + ' 免運'
      : gap > 0 ? '再 ' + money(gap) + ' 就免運' : '已達免運門檻';

    // 還差一點免運時，推薦幾樣常備小品
    var addons = $('[data-addons]');
    if (gap > 0 && t.sub > 0) {
      var picks = PRODUCTS.filter(function (p) {
        return p.shelf === 'always' && p.variants[0].price <= 500 && !Object.keys(cart).some(function (k) { return k.indexOf(p.id + '|') === 0; });
      }).slice(0, 3);
      addons.innerHTML = picks.length ? '<p>順手帶一樣：</p>' + picks.map(function (p) {
        var v = p.variants[0];
        return '<button type="button" data-add="' + p.id + '|' + v.key + '">' + esc(p.name) + ' <small>' + money(v.price) + '</small></button>';
      }).join('') : '';
      addons.hidden = !picks.length;
    } else { addons.hidden = true; }

    $('[data-dock-total]').textContent = money(t.total);
    $('[data-dock-hint]').textContent = t.count ? (gap > 0 ? '再 ' + money(gap) + ' 免運' : '已免運') : '';
    dockVisible();
  }

  // ---------- 取貨方式：只顯示需要的欄位 ----------
  function syncDelivery() {
    var d = delivery();
    form.querySelectorAll('[data-when]').forEach(function (el) {
      var on = el.dataset.when.split(' ').indexOf(d) > -1;
      el.hidden = !on;
      var input = el.querySelector('input');
      if (input) input.required = on;
    });
    render();
  }
  form.addEventListener('change', function (e) { if (e.target.name === 'delivery') syncDelivery(); });

  // ---------- 送出訂單 ----------
  var FIELD_LABEL = { name: '姓名', phone: '手機', email: 'Email', address: '宅配地址', store: '門市名稱', delivery: '取貨方式', pay: '付款方式' };
  var ERRORS = {
    empty_cart: '還沒有選商品喔。',
    unknown_item: '有商品已經下架，請重新整理頁面再選一次。',
    bad_qty: '數量有誤，請重新整理頁面再試一次。',
    season_closed: '本檔預購已經截止，請把預購商品移除後再送出。',
    rate_limited: '短時間內送出太多次了，請十分鐘後再試。'
  };

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!DATA) return;
    var msg = $('[data-form-msg]');
    var btn = form.querySelector('button[type=submit]');
    var t = calc();
    if (!t.count) { msg.textContent = ERRORS.empty_cart; return; }
    var bad = Array.prototype.filter.call(form.querySelectorAll('input[required]'), function (i) { return !i.checkValidity(); })[0];
    if (bad) { msg.textContent = '請確認「' + (FIELD_LABEL[bad.name] || bad.name) + '」'; bad.focus(); return; }

    var fd = new FormData(form);
    var body = {
      items: Object.keys(cart).map(function (k) { var p = k.split('|'); return { id: p[0], variant: p[1], qty: cart[k] }; }),
      name: fd.get('name'), phone: fd.get('phone'), email: fd.get('email'), line: fd.get('line'),
      delivery: fd.get('delivery'), address: fd.get('address'), store: fd.get('store'),
      pay: fd.get('pay'), note: fd.get('note'), website: fd.get('website')
    };
    msg.textContent = '送出中…';
    btn.disabled = true;
    // 20 秒沒回應就放棄，免得按鈕一直卡在送出中
    var ctrl = 'AbortController' in window ? new AbortController() : null;
    var timer = ctrl && setTimeout(function () { ctrl.abort(); }, 20000);
    fetch(ORDER_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.json().catch(function () { return { ok: false, code: 'http_' + r.status }; }); })
      .then(function (out) {
        if (!out.ok) {
          var text = ERRORS[out.code];
          if (out.code === 'invalid' && out.fields) text = '請確認：' + out.fields.map(function (f) { return FIELD_LABEL[f] || f; }).join('、');
          if (out.code === 'season_closed' && out.item) text = '「' + out.item + '」' + ERRORS.season_closed.replace('本檔', '所屬的本檔');
          var e = new Error(text || '沒有送出成功（' + out.code + '），請稍後再試，或寫信給我們。');
          e.shown = true;
          throw e;
        }
        showDone(out, fd.get('pay'));
      })
      .catch(function (err) {
        // 瀏覽器的連線錯誤（Chrome「Failed to fetch」、Safari「Load failed」、逾時）一律換成中文說明
        msg.textContent = err && err.shown ? err.message
          : '沒有連上訂單系統，這張訂單還沒有送出。請稍後再按一次「送出訂單」；一直失敗的話，請寫信或用 LINE 告訴我們。';
      })
      .then(function () { clearTimeout(timer); btn.disabled = false; });
  });

  function showDone(out, pay) {
    $('[data-order-no]').textContent = out.orderNo;
    $('[data-order-total]').textContent = money(out.total);
    var p = out.payment || DATA.payment;
    $('[data-pay-bank]').textContent = p.bank;
    $('[data-pay-linepay]').textContent = p.linepay;
    var qr = $('[data-pay-qr]');
    if (p.linepayImage) { qr.src = p.linepayImage; qr.hidden = false; }
    document.querySelectorAll('[data-pay-box]').forEach(function (el) {
      el.classList.toggle('chosen', el.dataset.payBox === pay);
    });
    var done = $('[data-done]');
    done.hidden = false;
    $('#checkout').hidden = true;
    cart = {}; save(); render();
    form.reset();
    done.focus();
    done.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  // ---------- 手機底部小計列：看不到結帳區時才出現 ----------
  var dock = $('[data-dock]'), checkoutInView = false;
  function dockVisible() { dock.hidden = !DATA || !calc().count || checkoutInView || !$('[data-done]').hidden; }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { checkoutInView = es[0].isIntersecting; dockVisible(); }, { threshold: 0.05 })
      .observe($('#checkout'));
  }
})();
