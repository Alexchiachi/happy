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
    var c = data.contact;
    if (c) {
      document.querySelectorAll('[data-contact-line]').forEach(function (el) { el.textContent = c.line; el.href = c.lineUrl; });
      document.querySelectorAll('[data-contact-fb]').forEach(function (el) { el.href = c.facebook; });
    }

    var days = Math.ceil((new Date(data.season.deadline) - new Date()) / 86400000);
    var closed = days <= 0;
    $('[data-countdown]').textContent = closed ? '本檔已截止，下一檔籌備中' : '還有 ' + days + ' 天收單';

    document.querySelectorAll('[data-shelf]').forEach(function (el) {
      var shelf = el.dataset.shelf;
      el.innerHTML = PRODUCTS.filter(function (p) { return p.shelf === shelf; })
        .map(function (p) { return cardHTML(p, closed && shelf === 'season'); }).join('');
    });
    syncDelivery();
    syncGift();
    initCover(data.cover || []);
  }

  // ---------- 封面輪播：照片清單在 products.json 的 cover ----------
  function initCover(list) {
    var box = $('[data-cover]');
    if (!box || !list.length) return;
    var track = box.querySelector('[data-cover-track]'), dots = box.querySelector('[data-cover-dots]');
    var pauseBtn = box.querySelector('[data-cover-pause]');
    track.innerHTML = list.map(function (c, i) {
      return '<figure class="cover-slide' + (i === 0 ? ' on' : '') + '" role="group" aria-roledescription="投影片" aria-label="第 ' + (i + 1) + ' 張，共 ' + list.length + ' 張"' + (i ? ' aria-hidden="true"' : '') + '>' +
        '<img src="' + c.img + '" alt="' + esc(c.alt || '') + '" width="900" height="1200" decoding="async"' + (i ? ' loading="lazy"' : ' fetchpriority="high"') + '></figure>';
    }).join('');
    dots.innerHTML = list.length < 2 ? '' : list.map(function (c, i) {
      return '<button type="button" aria-label="看第 ' + (i + 1) + ' 張"' + (i === 0 ? ' aria-current="true"' : '') + '></button>';
    }).join('');
    pauseBtn.hidden = list.length < 2;
    var note = box.querySelector('[data-cover-note]');
    if (DATA.coverNote) {
      var c = DATA.contact || {};
      note.innerHTML = esc(DATA.coverNote) + (c.line ? ' <a href="' + c.lineUrl + '" target="_blank" rel="noopener">LINE ' + esc(c.line) + '</a>' : '');
      note.hidden = false;
    }
    box.hidden = false;
    box.closest('.hero-grid').classList.add('has-cover');
    if (list.length < 2) return;

    var slides = track.children, now = 0, timer = null, paused = false;
    function show(i) {
      now = (i + slides.length) % slides.length;
      Array.prototype.forEach.call(slides, function (el, k) {
        el.classList.toggle('on', k === now);
        if (k === now) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', 'true');
      });
      Array.prototype.forEach.call(dots.children, function (b, k) {
        if (k === now) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
      });
    }
    function play() { clearInterval(timer); timer = paused || document.hidden ? null : setInterval(function () { show(now + 1); }, 5500); }
    dots.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      show(Array.prototype.indexOf.call(dots.children, b)); play();
    });
    pauseBtn.addEventListener('click', function () {
      paused = !paused;
      pauseBtn.classList.toggle('paused', paused);
      pauseBtn.setAttribute('aria-label', paused ? '繼續輪播' : '暫停輪播');
      play();
    });
    // 手機左右滑動換張
    var x0 = null;
    track.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    track.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 40) { show(now + (dx < 0 ? 1 : -1)); play(); }
    }, { passive: true });
    document.addEventListener('visibilitychange', play);
    play();
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
      var before = cart[key] || 0;
      if (n) cart[key] = n; else delete cart[key];
      save(); render();
      if (n > before) bumpCount();
      if (b.disabled) b.parentNode.querySelector('[data-step="1"]').focus(); // 按到 0 時焦點不要掉
      return;
    }
    var a = e.target.closest('[data-add]');
    if (a) { cart[a.dataset.add] = (cart[a.dataset.add] || 0) + 1; save(); render(); bumpCount(); }
  });

  function bumpCount() {
    document.querySelectorAll('[data-count]').forEach(function (el) {
      el.classList.remove('bump');
      void el.offsetWidth; // 重新觸發動畫
      el.classList.add('bump');
    });
  }

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
      s.querySelector('[data-step="-1"]').disabled = n === 0;
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
  form.addEventListener('change', function (e) {
    if (e.target.name === 'delivery') syncDelivery();
    if (e.target.name === 'gift') syncGift();
  });

  // ---------- 送禮：訂購人與收件人分開 ----------
  function syncGift() {
    var on = form.querySelector('[data-gift]').checked;
    form.querySelector('[data-gift-box]').hidden = !on;
    ['to_name', 'to_phone'].forEach(function (n) {
      var input = form.querySelector('input[name=' + n + ']');
      input.required = on;
      if (!on) checkField(input, false);
    });
    form.querySelectorAll('[data-gift-alt]').forEach(function (el) {
      if (!el.dataset.orig) el.dataset.orig = el.textContent;
      el.textContent = on ? el.dataset.giftAlt : el.dataset.orig;
    });
  }

  // ---------- 欄位即時驗證（離開欄位時檢查，不等到送出） ----------
  var FIELD_HINT = {
    name: '請填收件人姓名',
    phone: '手機格式是 09 開頭共 10 碼，例如 0912-345-678',
    email: 'Email 格式好像不對，確認信會寄到這裡',
    address: '請填宅配地址',
    to_name: '請填收件人姓名',
    to_phone: '收件人手機格式是 09 開頭共 10 碼，物流會用這支電話聯絡',
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
  // 按下送出時先不跑離開欄位的檢查：錯誤提示若這時插進來，按鈕會被推走，這一下就按不到了
  var pressingSubmit = false;
  form.addEventListener('pointerdown', function (e) { pressingSubmit = !!e.target.closest('button[type=submit]'); });
  form.addEventListener('focusout', function (e) {
    if (pressingSubmit) { pressingSubmit = false; return; }
    if (e.target.matches('.field input') && e.target.value !== '') checkField(e.target, true);
  });
  form.addEventListener('input', function (e) {
    if (e.target.closest('.field.invalid')) checkField(e.target, true);
  });

  // ---------- 送出訂單 ----------
  var FIELD_LABEL = { to_name: '收件人姓名', to_phone: '收件人手機', name: '姓名', phone: '手機', email: 'Email', address: '宅配地址', store: '門市名稱', delivery: '取貨方式', pay: '付款方式' };
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
    var bad = Array.prototype.filter.call(form.querySelectorAll('input[required]'), function (i) { return !checkField(i, true); });
    if (bad.length) {
      msg.textContent = '還有 ' + bad.length + ' 個欄位要確認：' + bad.map(function (i) { return FIELD_LABEL[i.name] || i.name; }).join('、');
      bad[0].focus();
      return;
    }

    var fd = new FormData(form);
    var body = {
      items: Object.keys(cart).map(function (k) { var p = k.split('|'); return { id: p[0], variant: p[1], qty: cart[k] }; }),
      name: fd.get('name'), phone: fd.get('phone'), email: fd.get('email'), line: fd.get('line'),
      delivery: fd.get('delivery'), address: fd.get('address'), store: fd.get('store'),
      pay: fd.get('pay'), note: fd.get('note'), website: fd.get('website')
    };
    if (fd.get('gift')) {
      body.gift = true; body.to_name = fd.get('to_name'); body.to_phone = fd.get('to_phone');
      body.card = fd.get('card'); body.hide_price = !!fd.get('hide_price');
    }
    msg.textContent = '';
    btn.disabled = true;
    btn.textContent = '送出中…';
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
          : '沒有連上訂單系統，這張訂單還沒有送出。請稍後再按一次「送出訂單」；一直失敗的話，請用 LINE 官方帳號 ' + ((DATA.contact && DATA.contact.line) || '@617aipgs') + ' 告訴我們。';
      })
      .then(function () { clearTimeout(timer); btn.disabled = false; btn.textContent = '送出訂單'; });
  });

  function showDone(out, pay) {
    $('[data-order-no]').textContent = out.orderNo;
    $('[data-order-total]').textContent = money(out.total);
    var p = out.payment || DATA.payment;
    $('[data-pay-bank]').textContent = p.bank;
    $('[data-pay-linepay]').textContent = p.linepay;
    var qr = $('[data-pay-qr]');
    if (p.linepayImage) { qr.src = p.linepayImage; qr.hidden = false; }
    var link = $('[data-pay-link]');
    if (p.linepayUrl) { link.href = p.linepayUrl; link.hidden = false; }
    document.querySelectorAll('[data-pay-box]').forEach(function (el) {
      el.classList.toggle('chosen', el.dataset.payBox === pay);
    });
    var done = $('[data-done]');
    done.hidden = false;
    $('#checkout').hidden = true;
    cart = {}; save(); render();
    form.reset();
    syncDelivery(); syncGift();
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
