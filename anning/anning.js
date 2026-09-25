// 雲南安寧幸福之家：房型、入住日期、人數、金額與送出預約
// 房型價格、開放月份、付款資訊都在 stay.json（Worker 也讀同一份，金額以 Worker 重算為準）
(function () {
  'use strict';

  var STAY_ENDPOINT = 'https://executive-table.jianchiachi.workers.dev/api/stay';

  var DATA = null, ROOMS = [], guests = 1;

  function $(sel) { return document.querySelector(sel); }
  function money(n) { return 'NT$' + Number(n).toLocaleString('en-US'); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var form = $('[data-form]');

  fetch('stay.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(start)
    .catch(function () {
      $('[data-form-msg]').textContent = '預約資料暫時讀不到，請重新整理頁面。';
    });

  function start(data) {
    DATA = data;
    ROOMS = data.rooms.filter(function (r) { return r.active !== false; });
    var c = data.contact || {};
    document.querySelectorAll('[data-period-name]').forEach(function (el) { el.textContent = data.period.name; });
    document.querySelectorAll('[data-stay-label]').forEach(function (el) { el.textContent = data.stay.label; });
    document.querySelectorAll('[data-max-guests]').forEach(function (el) { el.textContent = data.stay.maxGuests; });
    document.querySelectorAll('[data-contact-line]').forEach(function (el) { el.textContent = c.line; el.href = c.lineUrl; });
    document.querySelectorAll('[data-contact-fb]').forEach(function (el) { el.href = c.facebook; });
    document.querySelectorAll('[data-wechat-actions]').forEach(function (el) { el.innerHTML = wechatActions(c); });
    document.querySelectorAll('[data-wechat-name]').forEach(function (el) { el.textContent = c.wechatName; });
    // 開場的房型列：點了直接帶到預約區並勾好這個房型（少一步）
    $('[data-room-prices]').innerHTML = ROOMS.map(function (r) {
      return '<li><a class="room-row" href="#book" data-pick="' + esc(r.id) + '"><span>' + esc(r.name) + '<small>' + who(r.people) + '</small></span><b>' + money(r.price) + '</b></a></li>';
    }).join('');
    $('[data-rooms-note]').textContent = data.roomsNote || '';

    // 房型卡：照選購頁的商品卡精神，一張卡一個房型，可複選
    $('[data-rooms]').insertAdjacentHTML('beforeend', ROOMS.map(function (r) {
      return '<label class="room-card"><input type="checkbox" name="rooms" value="' + esc(r.id) + '">' +
        '<span class="room-tick" aria-hidden="true">✓</span>' +
        '<span class="room-name">' + esc(r.name) + '</span>' +
        '<span class="room-price"><small>$</small>' + Number(r.price).toLocaleString('en-US') + '</span>' +
        '<span class="room-meta">' + who(r.people) + '／' + esc(data.stay.label) + '</span>' +
        (r.bath ? '<span class="room-bath">' + esc(r.bath) + '</span>' : '') + '</label>';
    }).join(''));
    $('[data-wishes]').insertAdjacentHTML('beforeend', (data.wishes || []).map(function (w) {
      return '<label><input type="checkbox" name="wishes" value="' + esc(w) + '"> ' + esc(w) + '</label>';
    }).join(''));

    // 入住日期：只能選開放月份內、今天以後的日期
    var months = data.months.filter(function (m) { return m.open !== false; }).map(function (m) { return m.key; }).sort();
    var checkin = form.querySelector('input[name=checkin]');
    if (!months.length || !ROOMS.length) {
      $('[data-form-msg]').textContent = '目前沒有開放預約，下一期籌備中。歡迎先用 LINE 或微信跟我們聊聊。';
      form.querySelector('button[type=submit]').disabled = true;
    } else {
      var first = months[0], last = months[months.length - 1];
      var today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10); // 台北日期
      var min = first + '-01';
      var y = Number(last.slice(0, 4)), mo = Number(last.slice(5, 7));
      checkin.min = min < today ? today : min;
      checkin.max = last + '-' + String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0');
      $('[data-open-range]').textContent = checkin.min.replace(/-/g, '/') + '–' + checkin.max.slice(5).replace('-', '/') + ' 可選';
    }

    initCover(data.cover || []);
    render();
  }
  // ---------- 加微信 ----------
  // 微信個人 QR Code 只能在微信 App 裡掃，瀏覽器沒有「點一下加好友」的連結，所以提供：
  // 複製微信號（有填 wechatId 才出現）、儲存 QR Code 圖片（手機掃不到自己的螢幕）、手機上打開微信
  var TOUCH = matchMedia('(pointer: coarse)').matches;
  document.documentElement.classList.toggle('touch', TOUCH); // 步驟說明與按鈕用同一個判斷
  function wechatActions(c) {
    var h = '';
    if (c.wechatId) h += '<button type="button" class="btn btn-solid" data-copy-wechat="' + esc(c.wechatId) + '">複製微信號 ' + esc(c.wechatId) + '</button>';
    h += '<a class="btn btn-ghost" href="' + esc(c.wechatImage) + '" download="wechat-' + esc(String(c.wechatName).replace(/\s+/g, '-')) + '.jpg">儲存 QR Code 圖片</a>';
    if (TOUCH) h += '<a class="btn btn-ghost" href="weixin://">打開微信</a>';
    return h;
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-copy-wechat]');
    if (!b) return;
    var id = b.dataset.copyWechat;
    copyText(id).then(function () {
      b.textContent = '已複製，到微信搜尋框貼上';
      b.classList.add('copied');
    }, function () {
      b.textContent = '微信號：' + id + '（請手動複製）';
    });
  });
  function copyText(t) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t);
    return new Promise(function (ok, fail) {
      var ta = document.createElement('textarea');
      ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var done = false;
      try { done = document.execCommand('copy'); } catch (err) { /* 舊瀏覽器 */ }
      ta.remove();
      if (done) ok(); else fail();
    });
  }

  function who(n) { return n === 1 ? '一人' : n === 2 ? '兩人' : n + ' 人'; }

  // ---------- 封面輪播（與選購頁同一套） ----------
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

  // ---------- 房型與人數：人數不超過所選房間住得下的人數，也不超過一次接待的上限 ----------
  function picked() {
    return Array.prototype.filter.call(form.querySelectorAll('input[name=rooms]'), function (i) { return i.checked; })
      .map(function (i) { return ROOMS.filter(function (r) { return r.id === i.value; })[0]; });
  }
  function capacity(list) {
    return Math.min(DATA.stay.maxGuests, list.reduce(function (a, r) { return a + r.people; }, 0));
  }
  document.addEventListener('click', function (e) {
    var pick = e.target.closest('[data-pick]');
    if (pick && DATA) {
      var box = form.querySelector('input[name=rooms][value="' + pick.dataset.pick + '"]');
      if (box && !box.checked) { box.checked = true; roomsChanged(); }
      return; // 捲動交給連結本身（#book）
    }
    var g = e.target.closest('[data-guests]');
    if (!g || !DATA) return;
    var cap = capacity(picked()) || DATA.stay.maxGuests;
    guests = Math.max(1, Math.min(cap, guests + Number(g.dataset.guests)));
    render();
  });

  function render() {
    if (!DATA) return;
    var list = picked(), cap = capacity(list);
    if (list.length && guests > cap) guests = cap;
    var total = list.reduce(function (a, r) { return a + r.price; }, 0);
    $('[data-guests-out]').textContent = guests;
    $('[data-guests-stepper] [data-guests="-1"]').disabled = guests <= 1;
    $('[data-guests-stepper] [data-guests="1"]').disabled = guests >= (list.length ? cap : DATA.stay.maxGuests);
    $('[data-guests-hint]').textContent = !list.length ? ''
      : guests >= cap ? (cap >= DATA.stay.maxGuests ? '一次最多接待 ' + DATA.stay.maxGuests + ' 位朋友。' : '所選房間最多住 ' + cap + ' 位；人更多的話，再多選一間。')
      : '';

    $('[data-lines]').innerHTML = list.map(function (r) {
      return '<li><span>' + esc(r.name) + '<small>' + who(r.people) + '・' + esc(DATA.stay.label) + '</small></span><b>' + money(r.price) + '</b></li>';
    }).join('');
    $('[data-empty]').hidden = list.length > 0;
    $('[data-total]').textContent = money(total);
    $('[data-form-total-amt]').textContent = money(total);
    var cheapest = Math.min.apply(null, ROOMS.map(function (r) { return r.price; }));
    $('[data-dock-total]').textContent = list.length ? money(total) : money(cheapest) + ' 起';
    $('[data-dock-hint]').textContent = DATA.stay.label + (list.length ? '・' + guests + ' 位' : '');
    dockVisible();
  }
  function roomsChanged() {
    var msg = $('[data-form-msg]');
    if (msg.textContent === ERRORS.no_rooms || msg.textContent === ERRORS.too_many) msg.textContent = '';
    showRoomsError(false);
    render();
  }
  form.addEventListener('change', function (e) { if (e.target.name === 'rooms') roomsChanged(); });

  // 房型沒選：錯誤就寫在房型卡片旁邊，並把畫面帶回那裡（不是只在按鈕下方說）
  function showRoomsError(on) {
    $('[data-rooms-err]').hidden = !on;
    $('[data-rooms]').classList.toggle('invalid', on);
  }
  function reduceMotion() { return matchMedia('(prefers-reduced-motion: reduce)').matches; }

  // ---------- 欄位即時驗證 ----------
  var FIELD_HINT = {
    name: '請填你的姓名',
    phone: '手機號碼好像不對，台灣號碼例如 0912-345-678，大陸號碼可加 +86',
    email: 'Email 格式好像不對，確認信會寄到這裡',
    im: '請填微信或 LINE ID，我們用它跟你確認日期',
    checkin: '請選開放期間內的入住日期'
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
  form.addEventListener('input', function (e) {
    if (e.target.closest('.field.invalid')) checkField(e.target, true);
  });

  // ---------- 送出預約 ----------
  var FIELD_LABEL = { name: '姓名', phone: '手機', email: 'Email', im: '微信或 LINE ID', guests: '同行人數', rooms: '入住房型', pay: '付款方式', checkin: '入住日期' };
  var ERRORS = {
    no_rooms: '請先選入住房型。',
    month_closed: '這個月份已經不開放預約了，請重新整理頁面再選一次。',
    room_closed: '有房型暫停預約了，請重新整理頁面再選一次。',
    too_many: '人數超過所選房間住得下的人數，請再多選一間房。',
    rate_limited: '短時間內送出太多次了，請十分鐘後再試。'
  };

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!DATA) return;
    var msg = $('[data-form-msg]');
    var btn = form.querySelector('button[type=submit]');
    var fd = new FormData(form);
    if (!picked().length) {
      msg.textContent = ERRORS.no_rooms;
      showRoomsError(true);
      $('[data-rooms]').scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' });
      $('[data-rooms] input').focus({ preventScroll: true });
      return;
    }
    var bad = Array.prototype.filter.call(form.querySelectorAll('input[required]'), function (i) { return !checkField(i, true); });
    if (bad.length) {
      msg.textContent = '還有 ' + bad.length + ' 個欄位要確認：' + bad.map(function (i) { return FIELD_LABEL[i.name] || i.name; }).join('、');
      bad[0].focus();
      return;
    }

    var body = {
      rooms: fd.getAll('rooms'), checkin: fd.get('checkin'), guests: guests,
      name: fd.get('name'), phone: fd.get('phone'), email: fd.get('email'), im: fd.get('im'),
      companions: fd.get('companions'), wishes: fd.getAll('wishes'), story: fd.get('story'),
      pay: fd.get('pay'), website: fd.get('website')
    };
    msg.textContent = '';
    btn.disabled = true;
    btn.textContent = '送出中…';
    var ctrl = 'AbortController' in window ? new AbortController() : null;
    var timer = ctrl && setTimeout(function () { ctrl.abort(); }, 20000);
    fetch(STAY_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.json().catch(function () { return { ok: false, code: 'http_' + r.status }; }); })
      .then(function (out) {
        if (!out.ok) {
          var text = ERRORS[out.code];
          if (out.code === 'invalid' && out.fields) text = '請確認：' + out.fields.map(function (f) { return FIELD_LABEL[f] || f; }).join('、');
          var err = new Error(text || '沒有送出成功（' + out.code + '），請稍後再試，或用 LINE 告訴我們。');
          err.shown = true;
          throw err;
        }
        showDone(out);
      })
      .catch(function (err) {
        msg.textContent = err && err.shown ? err.message
          : '沒有連上預約系統，這筆預約還沒有送出。請稍後再按一次「送出預約」；一直失敗的話，請用 LINE 官方帳號 ' + ((DATA.contact && DATA.contact.line) || '@617aipgs') + ' 或微信告訴我們。';
      })
      .then(function () { clearTimeout(timer); btn.disabled = false; btn.textContent = '送出預約'; });
  });

  function showDone(out) {
    $('[data-booking-no]').textContent = out.bookingNo;
    $('[data-booking-date]').textContent = out.checkin.replace(/-/g, '/');
    $('[data-booking-rooms]').textContent = out.roomNames + '・' + out.guests + ' 位';
    $('[data-booking-total]').textContent = money(out.total);
    var done = $('[data-done]');
    done.hidden = false;
    done.classList.add('arrive');
    $('#book').hidden = true;
    form.reset();
    guests = 1; render();
    done.focus();
    done.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth' });
  }

  // ---------- 手機底部預約列：開場的價格卡與預約區都看不到時才出現（不跟畫面上的按鈕重複） ----------
  var dock = $('[data-dock]'), inView = {};
  function dockVisible() { dock.hidden = !DATA || inView.book || inView.hero || !$('[data-done]').hidden; }
  if ('IntersectionObserver' in window) {
    var watch = function (el, key) {
      new IntersectionObserver(function (es) { inView[key] = es[0].isIntersecting; dockVisible(); }, { threshold: 0.05 }).observe(el);
    };
    watch($('#book'), 'book');
    watch($('.season-card'), 'hero');
  }
})();
