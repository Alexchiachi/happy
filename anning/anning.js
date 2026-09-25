// 雲南安寧幸福之家：月份、人數與套房、預估金額與送出預約
// 價格、月份、付款資訊都在 stay.json（Worker 也讀同一份，金額以 Worker 重算為準）
(function () {
  'use strict';

  var STAY_ENDPOINT = 'https://executive-table.jianchiachi.workers.dev/api/stay';

  var DATA = null, guests = 2, rooms = 1;

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
    var plan = data.plan, c = data.contact || {};
    document.querySelectorAll('[data-period-name]').forEach(function (el) { el.textContent = data.period.name; });
    document.querySelectorAll('[data-price]').forEach(function (el) { el.textContent = money(plan.price); });
    document.querySelectorAll('[data-stay-label]').forEach(function (el) { el.textContent = data.stay.label; });
    document.querySelectorAll('[data-max-guests]').forEach(function (el) { el.textContent = data.stay.maxGuests; });
    document.querySelectorAll('[data-wish]').forEach(function (el) { el.textContent = plan.wish; });
    document.querySelectorAll('[data-plan-note]').forEach(function (el) { el.textContent = money(plan.price) + '／' + plan.unit + '／' + plan.perRoom + ' 人'; });
    document.querySelectorAll('[data-contact-line]').forEach(function (el) { el.textContent = c.line; el.href = c.lineUrl; });
    document.querySelectorAll('[data-contact-fb]').forEach(function (el) { el.href = c.facebook; });
    document.querySelectorAll('[data-wechat-link]').forEach(function (el) { el.textContent = c.wechatName; el.href = c.wechatUrl; });
    document.querySelectorAll('[data-wechat-name]').forEach(function (el) { el.textContent = c.wechatName; });

    var months = data.months.filter(function (m) { return m.open !== false; });
    var box = $('[data-months]');
    if (!months.length) {
      box.insertAdjacentHTML('beforeend', '<p class="hint">目前沒有開放預約的月份，下一期籌備中。歡迎先用 LINE 或微信跟我們聊聊。</p>');
      form.querySelector('button[type=submit]').disabled = true;
    }
    box.insertAdjacentHTML('beforeend', months.map(function (m, i) {
      return '<label><input type="radio" name="month" value="' + esc(m.key) + '"' + (i === 0 ? ' checked' : '') + '> ' + esc(m.label) + '</label>';
    }).join(''));
    $('[data-wishes]').insertAdjacentHTML('beforeend', (data.wishes || []).map(function (w) {
      return '<label><input type="checkbox" name="wishes" value="' + esc(w) + '"> ' + esc(w) + '</label>';
    }).join(''));

    // 希望入住日：限在開放的月份內
    var checkin = form.querySelector('input[name=checkin]');
    if (months.length) {
      var first = months[0].key, last = months[months.length - 1].key;
      var today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10); // 台北日期
      var min = first + '-01';
      checkin.min = min < today ? today : min;
      var y = Number(last.slice(0, 4)), mo = Number(last.slice(5, 7));
      checkin.max = last + '-' + String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0');
    }

    initCover(data.cover || []);
    render();
  }

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

  // ---------- 人數與套房：每間 2 人，套房數至少要住得下 ----------
  function minRooms() { return Math.ceil(guests / DATA.plan.perRoom); }
  document.addEventListener('click', function (e) {
    if (!DATA) return;
    var g = e.target.closest('[data-guests]'), r = e.target.closest('[data-rooms]');
    if (g) {
      guests = Math.max(1, Math.min(DATA.stay.maxGuests, guests + Number(g.dataset.guests)));
      rooms = Math.max(rooms, minRooms());
      render();
    }
    if (r) {
      rooms = Math.max(minRooms(), Math.min(DATA.plan.maxRooms, rooms + Number(r.dataset.rooms)));
      render();
    }
  });

  function monthLabel() {
    var r = form.querySelector('input[name=month]:checked');
    if (!r) return '';
    var m = DATA.months.filter(function (x) { return x.key === r.value; })[0];
    return m ? m.label : '';
  }

  function render() {
    if (!DATA) return;
    var plan = DATA.plan, total = plan.price * rooms;
    $('[data-guests-out]').textContent = guests;
    $('[data-rooms-out]').textContent = rooms;
    $('[data-guests-stepper] [data-guests="-1"]').disabled = guests <= 1;
    $('[data-guests-stepper] [data-guests="1"]').disabled = guests >= DATA.stay.maxGuests;
    $('[data-rooms-stepper] [data-rooms="-1"]').disabled = rooms <= minRooms();
    $('[data-rooms-stepper] [data-rooms="1"]').disabled = rooms >= plan.maxRooms;
    $('[data-guests-hint]').textContent = guests >= DATA.stay.maxGuests
      ? '一次最多接待 ' + DATA.stay.maxGuests + ' 位朋友。'
      : (rooms > minRooms() ? '想住得寬一點也可以多訂一間。' : '');

    $('[data-lines]').innerHTML =
      '<li><span>' + esc(DATA.name) + '<small>' + esc(monthLabel()) + '・' + esc(DATA.stay.label) + '</small></span><b></b></li>' +
      '<li><span>' + esc(plan.name) + ' × ' + rooms + '<small>' + guests + ' 位入住</small></span><b>' + money(total) + '</b></li>';
    $('[data-total]').textContent = money(total);
    $('[data-dock-total]').textContent = money(total);
    $('[data-dock-hint]').textContent = DATA.stay.label + '・' + guests + ' 位';
    dockVisible();
  }
  form.addEventListener('change', function (e) { if (e.target.name === 'month') render(); });

  // ---------- 欄位即時驗證 ----------
  var FIELD_HINT = {
    name: '請填你的姓名',
    phone: '手機號碼好像不對，台灣號碼例如 0912-345-678，大陸號碼可加 +86',
    email: 'Email 格式好像不對，確認信會寄到這裡',
    im: '請填微信或 LINE ID，我們用它跟你確認日期'
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
  var FIELD_LABEL = { name: '姓名', phone: '手機', email: 'Email', im: '微信或 LINE ID', month: '入住月份', guests: '人數', rooms: '套房數', pay: '付款方式', checkin: '希望入住日' };
  var ERRORS = {
    month_closed: '這個月份已經不開放預約了，請重新整理頁面再選一次。',
    too_many: '一次最多接待 5 位朋友。',
    rate_limited: '短時間內送出太多次了，請十分鐘後再試。'
  };

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!DATA) return;
    var msg = $('[data-form-msg]');
    var btn = form.querySelector('button[type=submit]');
    var fd = new FormData(form);
    if (!fd.get('month')) { msg.textContent = '請選想入住的月份。'; return; }
    var bad = Array.prototype.filter.call(form.querySelectorAll('input[required]'), function (i) { return !checkField(i, true); });
    if (bad.length) {
      msg.textContent = '還有 ' + bad.length + ' 個欄位要確認：' + bad.map(function (i) { return FIELD_LABEL[i.name] || i.name; }).join('、');
      bad[0].focus();
      return;
    }

    var body = {
      month: fd.get('month'), checkin: fd.get('checkin'), guests: guests, rooms: rooms,
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
    $('[data-booking-month]').textContent = out.monthLabel;
    $('[data-booking-rooms]').textContent = out.guests + ' 位・' + out.rooms + ' 間' + DATA.plan.unit;
    $('[data-booking-total]').textContent = money(out.total);
    var done = $('[data-done]');
    done.hidden = false;
    $('#book').hidden = true;
    form.reset();
    guests = 2; rooms = 1; render();
    done.focus();
    done.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  // ---------- 手機底部預約列：看不到預約區時才出現 ----------
  var dock = $('[data-dock]'), bookInView = false;
  function dockVisible() { dock.hidden = !DATA || bookInView || !$('[data-done]').hidden; }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { bookInView = es[0].isIntersecting; dockVisible(); }, { threshold: 0.05 })
      .observe($('#book'));
  }
})();
