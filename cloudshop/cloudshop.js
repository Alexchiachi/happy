// 無人商店雲端小舖：商品卡、購物車、運費與送出訂單
// 商品、價格、運費、門市都在 products.json。寫法照 shop/shop.js（雲南好物）。
// 目前還沒接 Worker：送出後在前端產生訂單編號，請客人用 LINE 把訂單內容傳給官方帳號，訂單才算成立。
// 之後要接後台時，比照 shop/shop.js 的送出流程與 executive-table/worker/orders.js（Worker 重算金額、存 D1、寄信）。
(function () {
  'use strict';

  var STORE_KEY = 'cloudshop-cart';
  var DELIVERY_FEE = { pickup: 'pickup', home: 'home', '711': 'cvs', family: 'cvs' };
  var DELIVERY_LABEL = { pickup: '到店自取', home: '宅配', '711': '7-11', family: '全家' };
  var PAY_LABEL = { linepay: 'LINE Pay', bank: '匯款' };

  var DATA = null, PRODUCTS = [], byId = {}, cart = {};

  function $(sel) { return document.querySelector(sel); }
  function all(sel, fn) { document.querySelectorAll(sel).forEach(fn); }
  function money(n) { return 'NT$' + Number(n).toLocaleString('en-US'); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  fetch('products.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(start)
    .catch(function () {
      all('[data-shelf]', function (el) { el.innerHTML = '<p class="load-err">商品資料暫時讀不到，請重新整理頁面。</p>'; });
    });

  // 'YYYY-MM-DDTHH:mm:ss+08:00' → '10 月 23 日'，一律以台灣時間換算
  function shortDate(iso) {
    var o = {};
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric' })
      .formatToParts(new Date(iso)).forEach(function (x) { o[x.type] = x.value; });
    return o.month + ' 月 ' + o.day + ' 日';
  }

  function start(data) {
    DATA = data;
    PRODUCTS = data.products.filter(function (p) { return p.active !== false; });
    PRODUCTS.forEach(function (p) { byId[p.id] = p; });
    try { cart = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { cart = {}; }
    Object.keys(cart).forEach(function (k) { if (!find(k) || !(cart[k] > 0)) delete cart[k]; });

    var demo = $('[data-demo-note]');
    demo.hidden = !data.demo;
    if (data.demoNote) demo.textContent = data.demoNote;
    var w = data.week;
    all('[data-week-name]', function (el) { el.textContent = w.name; });
    all('[data-week-note]', function (el) { el.textContent = w.note.replace('{deadline}', shortDate(w.deadline)); });
    var st = data.store;
    all('[data-store-name]', function (el) { el.textContent = st.name; });
    all('[data-store-address]', function (el) { el.textContent = st.address; });
    all('[data-store-hours]', function (el) { el.textContent = st.hours; });
    all('[data-store-pickup]', function (el) { el.textContent = st.pickup + '。'; });
    var s = data.shipping;
    all('[data-free]', function (el) { el.textContent = money(s.free); });
    all('[data-fee-home]', function (el) { el.textContent = s.home; });
    all('[data-fee-cvs]', function (el) { el.textContent = s.cvs; });
    var c = data.contact;
    all('[data-contact-line]', function (el) { el.textContent = c.line; el.href = c.lineUrl; });
    all('[data-contact-fb]', function (el) { el.href = c.facebook; });

    var ms = new Date(w.deadline) - new Date();
    var closed = ms <= 0;
    var days = Math.ceil(ms / 86400000);
    $('[data-countdown]').textContent = closed ? '本週已截止，下週商品準備中' : (days <= 1 ? '今天截止' : '還有 ' + days + ' 天收單');

    all('[data-shelf]', function (el) {
      var shelf = el.dataset.shelf;
      var list = PRODUCTS.filter(function (p) { return p.shelf === shelf; });
      // 商品有 group（例：盲盒系列、玩具系列）時，同組排在一起，組名當小標題，跨滿整排
      var lastGroup = null;
      el.innerHTML = list.map(function (p) {
        var head = '';
        if (p.group && p.group !== lastGroup) { head = '<h3 class="group-title" id="g-' + esc(p.groupId || '') + '">' + esc(p.group) + '</h3>'; lastGroup = p.group; }
        return head + cardHTML(p, closed && shelf === 'week');
      }).join('');
      // 這一區還沒有商品：整區收起來，開場連到這一區的按鈕也一起收
      el.closest('.shelf').hidden = !list.length;
      // 分類跳轉列：店內常備裡有兩組以上時才出現
      var nav = el.closest('.shelf').querySelector('[data-group-nav]');
      if (nav) {
        var groups = [];
        list.forEach(function (p) { if (p.group && groups.every(function (g) { return g.id !== p.groupId; })) groups.push({ id: p.groupId, name: p.group }); });
        nav.innerHTML = groups.map(function (g) { return '<a href="#g-' + esc(g.id) + '">' + esc(g.name) + '</a>'; }).join('');
        nav.hidden = groups.length < 2;
      }
      if (!list.length) all('a[href="#' + el.closest('.shelf').id + '"]', function (a) { a.hidden = true; });
    });
    // 截止後購物車裡的本週商品也拿掉
    if (closed) Object.keys(cart).forEach(function (k) { if (find(k).p.shelf === 'week') delete cart[k]; });
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
      ? '<picture><source type="image/webp" srcset="' + p.img.replace(/\.jpg$/, '.webp') + '"><img src="' + p.img + '" alt="' + esc(p.imgAlt || p.name) + '" loading="lazy" decoding="async" width="800" height="1000"></picture>'
      : '<div class="ph tone-' + p.tone + '" role="img" aria-label="' + esc(p.name) + '（照片準備中）"><span class="ph-han">' + esc(p.han) + '</span><span class="ph-note">照片準備中</span></div>';
    // 價格還沒定（資料表價格欄空白）的商品：variants 留空，卡片顯示「價格確認中」並請客人用 LINE 詢問，不能放進購物車
    var priced = p.variants.length > 0;
    var from = priced ? Math.min.apply(null, p.variants.map(function (v) { return v.price; })) : 0;
    var rows = !priced ? '<li class="variant variant-ask"><span class="v-label">' + esc(p.priceNote || '價格確認中') + '</span>' +
        '<a class="ask" href="' + DATA.contact.lineUrl + '" target="_blank" rel="noopener">LINE 詢問 →</a></li>' :
      p.variants.map(function (v) {
      var k = p.id + '|' + v.key;
      return '<li class="variant">' +
        '<span class="v-label">' + esc(v.label) + '</span>' +
        '<span class="v-price">' + money(v.price) + '<small>／' + esc(v.unit) + '</small></span>' +
        (closed ? '<span class="v-closed">已截止</span>' :
        '<span class="stepper" data-key="' + k + '">' +
          '<button type="button" data-step="-1" aria-label="' + esc(p.name + ' ' + v.label) + ' 減一">−</button>' +
          '<output aria-live="polite">0</output>' +
          '<button type="button" data-step="1" aria-label="' + esc(p.name + ' ' + v.label) + ' 加一">＋</button>' +
        '</span>') + '</li>';
    }).join('');
    var specs = (p.specs || []).map(function (s) { return '<div><dt>' + esc(s[0]) + '</dt><dd>' + esc(s[1]) + '</dd></div>'; }).join('');
    return '<article class="card" id="p-' + p.id + '">' +
      '<div class="card-media">' + visual + (p.badge ? '<span class="badge">' + esc(p.badge) + '</span>' : '') + '</div>' +
      '<div class="card-body">' +
        '<p class="card-cat">' + esc(p.cat) + '</p>' +
        '<h3 class="card-name">' + esc(p.name) + '</h3>' +
        (priced ? '<p class="card-price">' + (p.variants.some(function (v) { return v.price !== from; }) ? '<small>自</small> ' : '') + money(from) + '</p>' : '') +
        '<p class="card-intro">' + esc(p.intro) + '</p>' +
        '<details class="card-more"><summary>介紹與規格</summary>' +
          (p.story ? '<p>' + esc(p.story) + '</p>' : '') + '<dl class="specs">' + specs + '</dl>' +
        '</details>' +
        '<ul class="variants">' + rows + '</ul>' +
      '</div></article>';
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-step]');
    if (!b) return;
    var key = b.parentNode.dataset.key;
    var before = cart[key] || 0;
    var n = Math.max(0, Math.min(99, before + Number(b.dataset.step)));
    if (n) cart[key] = n; else delete cart[key];
    save(); render();
    if (n > before) bumpCount();
    if (b.disabled) b.parentNode.querySelector('[data-step="1"]').focus(); // 按到 0 時焦點不要掉
  });

  function bumpCount() {
    all('[data-count]', function (el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); });
  }

  // ---------- 金額 ----------
  var form = $('[data-form]');
  function delivery() { var r = form.querySelector('input[name=delivery]:checked'); return r ? r.value : 'pickup'; }
  function calc() {
    var sub = 0, count = 0;
    Object.keys(cart).forEach(function (k) { var f = find(k); sub += f.v.price * cart[k]; count += cart[k]; });
    var s = DATA.shipping, d = delivery();
    var ship = sub === 0 || sub >= s.free ? 0 : s[DELIVERY_FEE[d]];
    return { sub: sub, ship: ship, total: sub + ship, count: count, free: s.free, d: d };
  }

  function render() {
    if (!DATA) return;
    var t = calc();
    all('.stepper', function (s) {
      var n = cart[s.dataset.key] || 0;
      s.querySelector('output').textContent = n;
      s.querySelector('[data-step="-1"]').disabled = n === 0;
      s.classList.toggle('on', n > 0);
      s.closest('.variant').classList.toggle('picked', n > 0);
    });
    all('[data-count]', function (el) { el.textContent = t.count; });

    $('[data-lines]').innerHTML = Object.keys(cart).map(function (k) {
      var f = find(k);
      return '<li><span>' + esc(f.p.name) + '<small>' + esc(f.v.label) + ' × ' + cart[k] + '</small></span><b>' + money(f.v.price * cart[k]) + '</b></li>';
    }).join('');
    $('[data-empty]').hidden = t.count > 0;
    $('[data-subtotal]').textContent = money(t.sub);
    $('[data-shipping]').textContent = t.sub === 0 ? '—' : (t.ship === 0 ? '免運' : money(t.ship));
    $('[data-total]').textContent = money(t.total);

    // 到店自取一律免運；寄送才顯示免運進度
    var gap = t.free - t.sub, pickup = t.d === 'pickup';
    $('[data-meter]').style.width = (pickup ? 100 : Math.min(100, t.sub / t.free * 100)) + '%';
    $('[data-freeship]').classList.toggle('reached', pickup || (gap <= 0 && t.sub > 0));
    $('[data-freeship-text]').textContent = pickup ? '到店自取免運'
      : t.sub === 0 ? '滿 ' + money(t.free) + ' 免運'
      : gap > 0 ? '再 ' + money(gap) + ' 就免運' : '已達免運門檻';

    $('[data-dock-total]').textContent = money(t.total);
    $('[data-dock-hint]').textContent = !t.count ? '' : pickup ? '到店自取' : (gap > 0 ? '再 ' + money(gap) + ' 免運' : '已免運');
    dockVisible();
  }

  // ---------- 取貨方式：只顯示需要的欄位 ----------
  function syncDelivery() {
    var d = delivery();
    form.querySelectorAll('[data-when]').forEach(function (el) {
      var on = el.dataset.when.split(' ').indexOf(d) > -1;
      el.hidden = !on;
      var input = el.querySelector('input');
      if (input) { input.required = on; if (!on) checkField(input, false); }
    });
    render();
  }
  form.addEventListener('change', function (e) { if (e.target.name === 'delivery') syncDelivery(); });

  // ---------- 欄位即時驗證 ----------
  var FIELD_HINT = {
    name: '請填姓名',
    phone: '手機格式是 09 開頭共 10 碼，例如 0912-345-678',
    address: '請填宅配地址',
    store: '請填門市名稱，例如 7-11 龍辰門市'
  };
  function checkField(input, show) {
    var field = input.closest('.field');
    if (!field || field.closest('[hidden]')) return true;
    var ok = input.checkValidity();
    var err = field.querySelector('.field-err');
    if (ok || !show) {
      field.classList.remove('invalid');
      input.removeAttribute('aria-invalid');
      if (err) err.remove();
      return ok;
    }
    field.classList.add('invalid');
    input.setAttribute('aria-invalid', 'true');
    if (!err) {
      err = document.createElement('span');
      err.className = 'field-err';
      err.id = 'err-' + input.name;
      input.setAttribute('aria-describedby', err.id);
      field.appendChild(err);
    }
    err.textContent = FIELD_HINT[input.name] || '請確認這一欄';
    return false;
  }
  var pressingSubmit = false;
  form.addEventListener('pointerdown', function (e) { pressingSubmit = !!e.target.closest('button[type=submit]'); });
  form.addEventListener('focusout', function (e) {
    if (pressingSubmit) { pressingSubmit = false; return; }
    if (e.target.matches('.field input') && e.target.value !== '') checkField(e.target, true);
  });
  form.addEventListener('input', function (e) { if (e.target.closest('.field.invalid')) checkField(e.target, true); });

  // ---------- 送出訂單 ----------
  var FIELD_LABEL = { name: '姓名', phone: '手機', address: '宅配地址', store: '門市名稱' };

  // 訂單編號：CS + 台北日期 + 4 位亂數（沒有後台時由前端產生；接上 Worker 後改用 Worker 回傳的編號）
  function orderNo() {
    var o = {};
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date()).forEach(function (x) { o[x.type] = x.value; });
    return 'CS' + o.year + o.month + o.day + '-' + String(Math.floor(1000 + Math.random() * 9000));
  }

  function orderText(no, fd, t) {
    var lines = ['【雲端小舖訂單】' + no, ''];
    Object.keys(cart).forEach(function (k) {
      var f = find(k);
      lines.push('・' + f.p.name + '（' + f.v.label + '）× ' + cart[k] + '　' + money(f.v.price * cart[k]));
    });
    lines.push('', '小計 ' + money(t.sub) + '　運費 ' + (t.ship ? money(t.ship) : '免運'), '合計 ' + money(t.total), '');
    lines.push('姓名：' + fd.get('name'), '手機：' + fd.get('phone'), '取貨：' + DELIVERY_LABEL[t.d]);
    if (t.d === 'home') lines.push('地址：' + fd.get('address'));
    if (t.d === '711' || t.d === 'family') lines.push('門市：' + fd.get('store'));
    lines.push('付款：' + PAY_LABEL[fd.get('pay')]);
    if (fd.get('note')) lines.push('備註：' + fd.get('note'));
    return lines.join('\n');
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!DATA) return;
    var msg = $('[data-form-msg]');
    var t = calc();
    if (!t.count) { msg.textContent = '還沒有選商品喔。'; return; }
    var bad = Array.prototype.filter.call(form.querySelectorAll('input[required]'), function (i) { return !checkField(i, true); });
    if (bad.length) {
      msg.textContent = '還有 ' + bad.length + ' 個欄位要確認：' + bad.map(function (i) { return FIELD_LABEL[i.name] || i.name; }).join('、');
      bad[0].focus();
      return;
    }
    var fd = new FormData(form);
    if (fd.get('website')) return; // 機器人
    msg.textContent = '';
    var no = orderNo();
    showDone(no, t, fd.get('pay'), orderText(no, fd, t));
  });

  function showDone(no, t, pay, text) {
    $('[data-order-no]').textContent = no;
    $('[data-order-total]').textContent = money(t.total);
    $('[data-send-line]').href = DATA.contact.lineMessage + encodeURIComponent(text);
    var copyBtn = $('[data-copy]'), copyMsg = $('[data-copy-msg]');
    copyMsg.textContent = '';
    copyBtn.onclick = function () {
      var ok = function () { copyMsg.textContent = '已複製，貼到 LINE 傳給 ' + DATA.contact.line + ' 即可。'; };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(ok, function () { copyMsg.textContent = text; });
      else copyMsg.textContent = text;
    };
    var p = DATA.payment;
    $('[data-pay-bank]').textContent = p.bank;
    $('[data-pay-linepay]').textContent = p.linepay;
    var qr = $('[data-pay-qr]');
    if (p.linepayImage) { qr.src = p.linepayImage; qr.hidden = false; }
    var link = $('[data-pay-link]');
    if (p.linepayUrl) { link.href = p.linepayUrl; link.hidden = false; }
    all('[data-pay-box]', function (el) { el.classList.toggle('chosen', el.dataset.payBox === pay); });

    var done = $('[data-done]');
    done.hidden = false;
    $('#checkout').hidden = true;
    cart = {}; save(); render();
    form.reset();
    syncDelivery();
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
