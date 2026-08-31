/* ============================================================
   永恆之子整椎中心 · 線上預約系統  |  app logic
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- state ---------------- */
  const STORE_KEY = 'ecc_bookings_v1';

  const state = {
    lang: 'zh',
    visit: 'first',
    service: null,
    duration: CONFIG.durations[0],
    pkg: null,          // index into CONFIG.pickService.packages, for the pick-a-part service
    parts: [],          // selected part keys, for the pick-a-part service
    date: null,          // 'YYYY-MM-DD'
    time: null,          // 'HH:MM'
    step: 1,
    calYear: 0,
    calMonth: 0,         // 0-based
    contact: { name: '', phone: '', email: '', lang: '', last5: '', notes: '' },
    ref: ''
  };

  /* Slots already booked by other clients, read back from the endpoint.
     Empty until the first successful fetch, so the page still works offline
     or on a deployment without a slots API. */
  let serverTaken = {};
  let takenFetchedAt = 0;

  const $  = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* ---------------- i18n ---------------- */
  function t(key, vars) {
    const dict = I18N[state.lang] || I18N.zh;
    let s = dict[key] != null ? dict[key] : (I18N.zh[key] != null ? I18N.zh[key] : key);
    if (vars) Object.keys(vars).forEach(k => { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }

  function currentLangMeta() {
    return LANGS.find(l => l.code === state.lang) || LANGS[0];
  }

  function applyI18n() {
    const meta = currentLangMeta();
    document.documentElement.lang = meta.htmlLang;
    document.title = t('meta.title');

    $$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    $$('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });

    $$('#langSwitch button').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.lang === state.lang));
    });

    renderVisitOptions();
    renderServiceOptions();
    renderDurationOptions();
    renderPartsOptions();
    renderLangSelect();
    renderCalendar();
    renderSlots();
    renderStepper();
    if (state.step === 4) renderSummary();
    if (state.step === 5) renderDone();
  }

  /* ---------------- date helpers ---------------- */
  const pad = n => String(n).padStart(2, '0');
  const key = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const fromKey = k => { const p = k.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };

  function addMonths(d, n) {
    const day = d.getDate();
    const x = new Date(d.getFullYear(), d.getMonth() + n, 1);
    const lastDay = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
    x.setDate(Math.min(day, lastDay));
    return x;
  }

  const toMin = hhmm => { const p = hhmm.split(':').map(Number); return p[0] * 60 + p[1]; };
  const toHHMM = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);

  function minDate() { return addMonths(startOfToday(), CONFIG.leadMonths); }
  function maxDate() { return addMonths(startOfToday(), CONFIG.windowMonths); }
  function startOfToday() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }

  function formatDate(k) {
    const d = fromKey(k);
    const meta = currentLangMeta();
    try {
      return new Intl.DateTimeFormat(meta.locale, {
        year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
      }).format(d);
    } catch (e) {
      return k + ' (' + t('weekday.' + d.getDay()) + ')';
    }
  }

  function monthTitle(y, m) {
    const meta = currentLangMeta();
    if (state.lang === 'en') {
      let name;
      try {
        name = new Intl.DateTimeFormat(meta.locale, { month: 'long' }).format(new Date(y, m, 1));
      } catch (e) { name = String(m + 1); }
      return t('month.format', { y: y, m: m + 1, monthName: name });
    }
    return t('month.format', { y: y, m: m + 1, monthName: String(m + 1) });
  }

  /* ---------------- availability ---------------- */
  function dayRule(dateKey) {
    if (CONFIG.closedDates.indexOf(dateKey) !== -1) return null;
    return CONFIG.hours[fromKey(dateKey).getDay()] || null;
  }

  function dateInWindow(d) {
    return d >= minDate() && d <= maxDate();
  }

  /** Reason a date cannot be picked, or '' when it is open. */
  function dateBlockReason(dateKey) {
    const rule = dayRule(dateKey);
    if (!rule) return 'closed';
    if (rule.firstVisitOnly && state.visit !== 'first') return 'firstVisitOnly';
    return '';
  }

  function takenIntervals(dateKey) {
    let all = {};
    try { all = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch (e) { all = {}; }
    const mine = all[dateKey] || [];
    const theirs = (serverTaken[dateKey] || []).filter(
      iv => Array.isArray(iv) && typeof iv[0] === 'number' && typeof iv[1] === 'number'
    );
    return mine.concat(theirs);
  }

  function saveBooking(dateKey, start, end) {
    let all = {};
    try { all = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch (e) { all = {}; }
    (all[dateKey] = all[dateKey] || []).push([start, end]);
    try { localStorage.setItem(STORE_KEY, JSON.stringify(all)); } catch (e) { /* private mode */ }
  }

  function slotsUrl() {
    if (!CONFIG.endpoint) return '';
    return CONFIG.endpoint + (CONFIG.endpoint.indexOf('?') === -1 ? '?' : '&') + 'action=slots';
  }

  /** Refresh the booked-slot list; failures leave the page on local data. */
  function fetchTakenSlots() {
    const url = slotsUrl();
    if (!url) return;
    if (Date.now() - takenFetchedAt < 30000) return;   // don't hammer it while stepping back and forth
    takenFetchedAt = Date.now();

    fetch(url)
      .then(r => (r.ok ? r.json() : null))
      .then(res => {
        if (!res || !res.taken || typeof res.taken !== 'object') return;
        serverTaken = res.taken;
        if (state.step === 2) { renderCalendar(); renderSlots(); }
      })
      .catch(() => { /* offline, or an endpoint with no slots API — local data only */ });
  }

  function slotsFor(dateKey) {
    const rule = dayRule(dateKey);
    if (!rule || dateBlockReason(dateKey)) return [];
    const open = toMin(rule.open), close = toMin(rule.close);
    const dur = state.duration;
    const taken = takenIntervals(dateKey);
    const out = [];
    for (let s = open; s + dur <= close; s += CONFIG.slotStep) {
      const busy = taken.some(iv => s < iv[1] && (s + dur) > iv[0]);
      out.push({ start: s, label: toHHMM(s), disabled: busy });
    }
    return out;
  }

  /* ---------------- render : language switch ---------------- */
  function renderLangSwitch() {
    const nav = $('#langSwitch');
    nav.innerHTML = '';
    LANGS.forEach(l => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.lang = l.code;
      b.textContent = l.label;
      b.setAttribute('aria-pressed', String(l.code === state.lang));
      b.addEventListener('click', () => setLang(l.code));
      nav.appendChild(b);
    });
  }

  function setLang(code) {
    state.lang = code;
    try { localStorage.setItem('ecc_lang', code); } catch (e) {}
    applyI18n();
  }

  function detectLang() {
    let saved = null;
    try { saved = localStorage.getItem('ecc_lang'); } catch (e) {}
    const url = new URLSearchParams(location.search).get('lang');
    const nav = (navigator.language || 'zh').toLowerCase();
    const guess = nav.startsWith('ja') ? 'ja'
                : nav.startsWith('ko') ? 'ko'
                : nav.startsWith('zh') ? 'zh'
                : 'en';
    const pick = url || saved || guess;
    return LANGS.some(l => l.code === pick) ? pick : 'zh';
  }

  /* ---------------- render : options ---------------- */
  function optionButton(opts) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'opt';
    b.setAttribute('aria-pressed', String(!!opts.selected));
    b.innerHTML = '<div class="opt-title"></div>' +
                  (opts.desc ? '<div class="opt-desc"></div>' : '') +
                  (opts.price ? '<div class="opt-price"></div>' : '');
    $('.opt-title', b).textContent = opts.title;
    if (opts.desc) $('.opt-desc', b).textContent = opts.desc;
    if (opts.price) $('.opt-price', b).textContent = opts.price;
    b.addEventListener('click', opts.onClick);
    return b;
  }

  function renderVisitOptions() {
    const box = $('#visitOptions');
    box.innerHTML = '';
    [['first', 'visit.first'], ['return', 'visit.return']].forEach(pair => {
      box.appendChild(optionButton({
        title: t(pair[1]),
        desc: t(pair[1] + '.desc'),
        selected: state.visit === pair[0],
        onClick: () => {
          state.visit = pair[0];
          // Sunday is first-visit only — drop an incompatible selection.
          if (state.date && dateBlockReason(state.date)) { state.date = null; state.time = null; }
          applyI18n();
        }
      }));
    });
  }

  /* zh/ja list items with a full-width enumeration comma; en/ko use a plain one */
  function listSep() {
    return (state.lang === 'zh' || state.lang === 'ja') ? '、' : ', ';
  }

  function money(n) {
    return CONFIG.currency + ' ' + n.toLocaleString('en-US');
  }

  /* The pick-a-part service ("醫美整骨") is priced by how many areas the client
     chooses, not by session length. */
  function isPickService() {
    return !!CONFIG.pickService && state.service === CONFIG.pickService.key;
  }

  function currentPackage() {
    if (!isPickService() || state.pkg == null) return null;
    return CONFIG.pickService.packages[state.pkg];
  }

  function currentPrice() {
    const p = currentPackage();
    return p ? p.price : CONFIG.prices[state.duration];
  }

  function partsLimit() {
    const p = currentPackage();
    return p ? p.pick : 0;
  }

  function renderServiceOptions() {
    const box = $('#serviceOptions');
    box.innerHTML = '';
    CONFIG.services.forEach(s => {
      box.appendChild(optionButton({
        title: t('service.' + s),
        desc: t('service.' + s + '.desc'),
        selected: state.service === s,
        onClick: () => {
          state.service = s;
          if (isPickService()) {
            if (state.pkg == null) state.pkg = 0;
            state.duration = CONFIG.pickService.packages[state.pkg].minutes;
          } else {
            state.pkg = null;
            state.parts = [];
          }
          state.time = null;
          hideError(1);
          applyI18n();
        }
      }));
    });
  }

  function renderDurationOptions() {
    const box = $('#durationOptions');
    const label = $('#durationLabel');
    box.innerHTML = '';

    if (isPickService()) {
      label.textContent = t('pkg.title');
      CONFIG.pickService.packages.forEach((p, i) => {
        box.appendChild(optionButton({
          title: t('pkg.' + p.pick),
          desc: t('pkg.pick', { n: p.pick }),
          price: money(p.price),
          selected: state.pkg === i,
          onClick: () => {
            state.pkg = i;
            state.duration = p.minutes;
            state.time = null;                       // slot length changed
            state.parts = state.parts.slice(0, p.pick);  // a smaller package trims the list
            applyI18n();
          }
        }));
      });
      return;
    }

    label.textContent = t('duration.title');
    CONFIG.durations.forEach(d => {
      box.appendChild(optionButton({
        title: t('duration.' + d),
        price: money(CONFIG.prices[d]),
        selected: state.duration === d,
        onClick: () => {
          state.duration = d;
          state.time = null;         // slot length changed
          applyI18n();
        }
      }));
    });
  }

  function renderPartsOptions() {
    const section = $('#partsSection');
    if (!isPickService()) { section.hidden = true; return; }
    section.hidden = false;

    const max = partsLimit();
    const full = state.parts.length >= max;
    const counter = $('#partsCount');
    counter.textContent = t('parts.count', { n: state.parts.length, max: max });
    counter.classList.toggle('full', full);

    const box = $('#partsOptions');
    box.innerHTML = '';
    CONFIG.pickService.parts.forEach(key => {
      const on = state.parts.indexOf(key) !== -1;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'part';
      b.setAttribute('aria-pressed', String(on));
      b.innerHTML = '<span class="box" aria-hidden="true">\u2713</span><span class="txt"></span>';
      $('.txt', b).textContent = t('part.' + key);
      if (!on && full) { b.disabled = true; b.title = t('parts.full', { max: max }); }
      b.addEventListener('click', () => {
        const i = state.parts.indexOf(key);
        if (i === -1) { if (state.parts.length >= max) return; state.parts.push(key); }
        else state.parts.splice(i, 1);
        hideError(1);
        renderPartsOptions();
      });
      box.appendChild(b);
    });
  }

  function renderLangSelect() {
    const sel = $('#fLang');
    const chosen = state.contact.lang || state.lang;
    sel.innerHTML = '';
    LANGS.forEach(l => {
      const o = document.createElement('option');
      o.value = l.code;
      o.textContent = l.label;
      if (l.code === chosen) o.selected = true;
      sel.appendChild(o);
    });
    state.contact.lang = chosen;
  }

  /* ---------------- render : calendar ---------------- */
  function renderCalendar() {
    const grid = $('#calGrid');
    grid.innerHTML = '';
    $('#calTitle').textContent = monthTitle(state.calYear, state.calMonth);
    $('#calHint').textContent = t('date.hint', { date: formatDate(key(minDate())) });

    for (let i = 0; i < 7; i++) {
      const h = document.createElement('div');
      h.className = 'cal-dow';
      h.textContent = t('weekday.' + i);
      grid.appendChild(h);
    }

    const first = new Date(state.calYear, state.calMonth, 1);
    const days = new Date(state.calYear, state.calMonth + 1, 0).getDate();
    for (let i = 0; i < first.getDay(); i++) {
      const e = document.createElement('div');
      e.className = 'cal-cell empty';
      grid.appendChild(e);
    }

    for (let d = 1; d <= days; d++) {
      const dt = new Date(state.calYear, state.calMonth, d);
      const k = key(dt);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cal-cell';
      btn.textContent = d;

      const open = dateInWindow(dt) && !dateBlockReason(k) && slotsFor(k).some(s => !s.disabled);
      if (!open) btn.disabled = true;
      if (state.date === k) btn.classList.add('selected');

      const rule = CONFIG.hours[dt.getDay()];
      if (rule && rule.firstVisitOnly && dateInWindow(dt)) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = t('am');
        btn.appendChild(tag);
      }

      btn.addEventListener('click', () => {
        state.date = k;
        state.time = null;
        hideError(2);
        renderCalendar();
        renderSlots();
      });
      grid.appendChild(btn);
    }

    const cur = new Date(state.calYear, state.calMonth, 1);
    const lo = new Date(minDate().getFullYear(), minDate().getMonth(), 1);
    const hi = new Date(maxDate().getFullYear(), maxDate().getMonth(), 1);
    $('#calPrev').disabled = cur <= lo;
    $('#calNext').disabled = cur >= hi;
  }

  function shiftMonth(delta) {
    const d = new Date(state.calYear, state.calMonth + delta, 1);
    state.calYear = d.getFullYear();
    state.calMonth = d.getMonth();
    renderCalendar();
  }

  /* ---------------- render : slots ---------------- */
  function renderSlots() {
    const area = $('#slotArea');
    area.innerHTML = '';

    if (!state.date) {
      area.innerHTML = '<div class="empty-note"></div>';
      $('.empty-note', area).textContent = t('time.pickdate');
      return;
    }

    const block = dateBlockReason(state.date);
    if (block === 'firstVisitOnly') {
      area.innerHTML = '<div class="empty-note"></div>';
      $('.empty-note', area).textContent = t('time.sunday.block');
      return;
    }

    const slots = slotsFor(state.date);
    if (!slots.length) {
      area.innerHTML = '<div class="empty-note"></div>';
      $('.empty-note', area).textContent = t('time.none');
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'slot-grid';
    let period = null;
    slots.forEach(s => {
      const p = s.start < 12 * 60 ? 'am' : 'pm';
      if (p !== period) {
        period = p;
        const h = document.createElement('div');
        h.className = 'slot-period';
        h.textContent = t(p);
        grid.appendChild(h);
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'slot';
      b.textContent = s.label;
      b.disabled = s.disabled;
      if (s.disabled) b.title = t('time.taken');
      b.setAttribute('aria-pressed', String(state.time === s.label));
      b.addEventListener('click', () => {
        state.time = s.label;
        hideError(2);
        renderSlots();
      });
      grid.appendChild(b);
    });
    area.appendChild(grid);
  }

  /* ---------------- steps ---------------- */
  function renderStepper() {
    $$('#stepper .node').forEach(n => {
      const s = Number(n.dataset.step);
      n.classList.toggle('active', s === state.step);
      n.classList.toggle('done', s < state.step || state.step === 5);
    });
  }

  function goto(step) {
    state.step = step;
    $$('.panel').forEach(p => p.classList.remove('active'));
    $('#panel-' + step).classList.add('active');
    renderStepper();
    if (step === 2) fetchTakenSlots();
    if (step === 4) renderSummary();
    if (step === 5) renderDone();
    const top = $('#booking').getBoundingClientRect().top + window.scrollY - 70;
    window.scrollTo({ top: top, behavior: 'smooth' });
  }

  function showError(step, msg) {
    const el = $('#err' + step);
    el.textContent = msg;
    el.classList.add('show');
  }
  function hideError(step) { $('#err' + step).classList.remove('show'); }

  function validateStep(step) {
    if (step === 1) {
      if (!state.service) { showError(1, t('err.service')); return false; }
      if (isPickService()) {
        if (state.pkg == null) { showError(1, t('err.pkg')); return false; }
        const short = partsLimit() - state.parts.length;
        if (short > 0) { showError(1, t('parts.more', { n: short })); return false; }
      }
      hideError(1); return true;
    }
    if (step === 2) {
      if (!state.date || !state.time) { showError(2, t('err.slot')); return false; }
      hideError(2); return true;
    }
    if (step === 3) return validateContact();
    return true;
  }

  function setFieldValid(name, ok) {
    const f = $('[data-field="' + name + '"]');
    if (f) f.classList.toggle('invalid', !ok);
  }

  function validateContact() {
    const c = state.contact;
    c.name  = $('#fName').value.trim();
    c.phone = $('#fPhone').value.trim();
    c.email = $('#fEmail').value.trim();
    c.lang  = $('#fLang').value;
    c.last5 = $('#fLast5').value.trim();
    c.notes = $('#fNotes').value.trim();

    const okName  = c.name.length >= 1;
    const okPhone = /^[0-9+()\-\s.]{6,24}$/.test(c.phone);
    const okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email);
    // optional: the client may not have transferred yet when booking
    const okLast5 = c.last5 === '' || /^\d{5}$/.test(c.last5);
    const okAgree = $('#fAgree').checked;

    setFieldValid('name', okName);
    setFieldValid('phone', okPhone);
    setFieldValid('email', okEmail);
    setFieldValid('last5', okLast5);
    $('#agreeWrap').classList.toggle('invalid', !okAgree);

    if (!okName)  { showError(3, t('err.name'));  return false; }
    if (!okPhone) { showError(3, t('err.phone')); return false; }
    if (!okEmail) { showError(3, t('err.email')); return false; }
    if (!okLast5) { showError(3, t('err.last5')); return false; }
    if (!okAgree) { showError(3, t('err.agree')); return false; }
    hideError(3);
    return true;
  }

  /* ---------------- summary ---------------- */
  function endTime() {
    return toHHMM(toMin(state.time) + state.duration);
  }

  function summaryRows() {
    const c = state.contact;
    const langLabel = (LANGS.find(l => l.code === c.lang) || currentLangMeta()).label;
    const rows = [
      [t('review.service'),  t('service.' + state.service)],
      [t('review.visit'),    t(state.visit === 'first' ? 'visit.first' : 'visit.return')],
      [t('review.datetime'), formatDate(state.date) + '  ' + state.time + ' – ' + endTime()],
      [t('review.duration'), t('duration.' + state.duration)],
      [t('review.name'),     c.name],
      [t('review.phone'),    c.phone],
      [t('review.email'),    c.email],
      [t('review.lang'),     langLabel],
      [t('review.last5'),    c.last5 || t('review.none')],
      [t('review.notes'),    c.notes || t('review.none')],
      [t('review.price'),    money(currentPrice()), 'total']
    ];
    if (isPickService()) {
      rows.splice(1, 0, [t('review.parts'), state.parts.map(k => t('part.' + k)).join(listSep())]);
    }
    return rows;
  }

  function renderSummary() {
    const dl = $('#summary');
    dl.innerHTML = '';
    summaryRows().forEach(row => {
      const wrap = document.createElement('div');
      wrap.className = 'summary-row' + (row[2] ? ' ' + row[2] : '');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = row[0];
      dd.textContent = row[1];
      wrap.appendChild(dt); wrap.appendChild(dd);
      dl.appendChild(wrap);
    });
  }

  /* ---------------- submit ---------------- */
  function makeRef() {
    const d = new Date();
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return 'ECC-' + String(d.getFullYear()).slice(2) + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + rand;
  }

  function bookingPayload() {
    const c = state.contact;
    return {
      ref: state.ref,
      service: state.service,
      serviceLabel: I18N.zh['service.' + state.service],
      visit: state.visit,
      date: state.date,
      startTime: state.time,
      endTime: endTime(),
      durationMinutes: state.duration,
      parts: isPickService() ? state.parts.slice() : [],
      partsLabels: isPickService() ? state.parts.map(k => I18N.zh['part.' + k]) : [],
      price: currentPrice(),
      currency: CONFIG.currency,
      timezone: CONFIG.tzName,
      name: c.name,
      phone: c.phone,
      email: c.email,
      preferredLanguage: c.lang,
      transferLast5: c.last5,
      notes: c.notes,
      submittedAt: new Date().toISOString()
    };
  }

  function bookingText() {
    const p = bookingPayload();
    const L = [
      t('done.code') + ': ' + p.ref,
      '',
      t('review.service')  + ': ' + t('service.' + p.service) +
        (t('service.' + p.service) === p.serviceLabel ? '' : ' / ' + p.serviceLabel),
      t('review.visit')    + ': ' + t(p.visit === 'first' ? 'visit.first' : 'visit.return'),
      p.parts.length
        ? t('review.parts') + ': ' + p.parts.map(k => t('part.' + k)).join(listSep()) +
          (state.lang === 'zh' ? '' : ' / ' + p.partsLabels.join('、'))
        : null,
      t('review.datetime') + ': ' + p.date + ' ' + p.startTime + '-' + p.endTime + ' (' + p.timezone + ')',
      t('review.duration') + ': ' + p.durationMinutes + ' ' + t('duration.minutes'),
      t('review.price')    + ': ' + money(p.price),
      '',
      t('review.name')  + ': ' + p.name,
      t('review.phone') + ': ' + p.phone,
      t('review.email') + ': ' + p.email,
      t('review.lang')  + ': ' +
        ((LANGS.find(l => l.code === p.preferredLanguage) || {}).label || p.preferredLanguage),
      t('review.last5') + ': ' + (p.transferLast5 || '-'),
      t('review.notes') + ': ' + (p.notes || '-'),
      '',
      t('pay.title'),
      t('pay.bank') + ': ' + t('pay.bank.value'),
      t('pay.acct') + ': ' + CONFIG.bank.account
    ];
    return L.filter(line => line !== null).join('\n');
  }

  /* Google Apps Script web apps answer no CORS preflight, so an
     application/json POST is blocked before it ever reaches the script.
     text/plain keeps the request "simple" and the script reads the body
     the same way. */
  function endpointContentType() {
    if (CONFIG.endpointContentType) return CONFIG.endpointContentType;
    return /script\.google\.com/.test(CONFIG.endpoint)
      ? 'text/plain;charset=utf-8'
      : 'application/json';
  }

  /* The centre reads its notifications in Chinese regardless of which
     language the client filled the form in. */
  function bookingTextZh() {
    const keep = state.lang;
    state.lang = 'zh';
    try { return bookingText(); } finally { state.lang = keep; }
  }

  function mailtoUrl() {
    const subject = '[' + state.ref + '] ' + t('brand.name') + ' — ' +
                    state.date + ' ' + state.time + ' ' + t('service.' + state.service);
    return 'mailto:' + CONFIG.email +
           '?subject=' + encodeURIComponent(subject) +
           '&body=' + encodeURIComponent(bookingText());
  }

  function icsContent() {
    const p = bookingPayload();
    const d = fromKey(p.date);
    const toUTC = hhmm => {
      const m = toMin(hhmm) - CONFIG.tzOffsetHours * 60;
      const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0));
      dt.setUTCMinutes(dt.getUTCMinutes() + m);
      return dt.getUTCFullYear() + pad(dt.getUTCMonth() + 1) + pad(dt.getUTCDate()) + 'T' +
             pad(dt.getUTCHours()) + pad(dt.getUTCMinutes()) + '00Z';
    };
    const esc = s => String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
    return [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Eternitys Child Chiropractic//Booking//EN',
      'BEGIN:VEVENT',
      'UID:' + p.ref + '@eternitys-child',
      'DTSTAMP:' + toUTC('00:00'),
      'DTSTART:' + toUTC(p.startTime),
      'DTEND:'   + toUTC(p.endTime),
      'SUMMARY:' + esc(t('brand.name') + ' — ' + t('service.' + p.service)),
      'DESCRIPTION:' + esc(bookingText()),
      'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n');
  }

  function download(name, text, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  function copyText(text, msg) {
    const done = () => toast(msg);
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, () => fallback());
    } else { fallback(); }
    function fallback() {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) {}
      document.body.removeChild(ta);
    }
  }

  function submitBooking() {
    if (!validateStep(1) || !validateStep(2) || !validateStep(3)) return;
    state.ref = makeRef();
    saveBooking(state.date, toMin(state.time), toMin(state.time) + state.duration);

    if (!CONFIG.endpoint) {
      try { window.location.href = mailtoUrl(); } catch (e) {}
      goto(5);
      return;
    }

    const btn = $('#submitBtn');
    btn.disabled = true;
    fetch(CONFIG.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': endpointContentType() },
      body: JSON.stringify(Object.assign(
        {},
        CONFIG.endpointFields || {},
        bookingPayload(),
        // a Chinese-keyed readable block, so a generic form service's
        // notification email is legible without any template setup
        { '預約明細': bookingTextZh() }
      ))
    })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json().catch(() => ({})); })
      .then(res => {
        // our PHP answers {ok:…}; FormSubmit and Web3Forms answer {success:…},
        // and FormSubmit reports failure as the string "false"
        const ok = res.ok !== false &&
                   res.success !== false && res.success !== 'false';
        if (!ok) throw new Error(res.error || res.message || 'rejected');
        takenFetchedAt = 0;   // this booking is now on the server too
        goto(5);
      })
      .catch(() => {
        // the endpoint is unreachable or refused the booking: fall back to email
        // so the request still reaches the centre
        try { window.location.href = mailtoUrl(); } catch (e) {}
        goto(5);
      })
      .then(() => { btn.disabled = false; });
  }

  function renderDone() {
    $('#refCode').textContent = state.ref;
    $('#mailNote').textContent = t('done.mailnote', { email: CONFIG.email });
  }

  function resetAll() {
    state.service = null;
    state.pkg = null;
    state.parts = [];
    state.date = null;
    state.time = null;
    state.ref = '';
    state.contact = { name: '', phone: '', email: '', lang: state.lang, last5: '', notes: '' };
    ['fName', 'fPhone', 'fEmail', 'fLast5', 'fNotes'].forEach(id => { $('#' + id).value = ''; });
    $('#fAgree').checked = false;
    $$('.field').forEach(f => f.classList.remove('invalid'));
    $('#agreeWrap').classList.remove('invalid');
    [1, 2, 3, 4].forEach(hideError);
    const m = minDate();
    state.calYear = m.getFullYear();
    state.calMonth = m.getMonth();
    applyI18n();
    goto(1);
  }

  /* ---------------- wiring ---------------- */
  function init() {
    state.lang = detectLang();
    const m = minDate();
    state.calYear = m.getFullYear();
    state.calMonth = m.getMonth();
    state.contact.lang = state.lang;

    $('#year').textContent = new Date().getFullYear();
    $('#acctNo').textContent = CONFIG.bank.account;

    renderLangSwitch();
    fetchTakenSlots();
    applyI18n();
    goto(1);
    window.scrollTo({ top: 0 });

    $$('[data-next]').forEach(b => b.addEventListener('click', () => {
      const next = Number(b.dataset.next);
      if (validateStep(next - 1)) goto(next);
    }));
    $$('[data-back]').forEach(b => b.addEventListener('click', () => goto(Number(b.dataset.back))));

    $('#calPrev').addEventListener('click', () => shiftMonth(-1));
    $('#calNext').addEventListener('click', () => shiftMonth(1));

    $('#submitBtn').addEventListener('click', submitBooking);
    $('#copyAcct').addEventListener('click', () => copyText(CONFIG.bank.account, t('pay.copied')));
    $('#copyBtn').addEventListener('click', () => copyText(bookingText(), t('pay.copied')));
    $('#mailBtn').addEventListener('click', () => { window.location.href = mailtoUrl(); });
    const icsBtn = $('#icsBtn');
    if (icsBtn) icsBtn.addEventListener('click', () => download(state.ref + '.ics', icsContent(), 'text/calendar'));
    $('#restartBtn').addEventListener('click', resetAll);

    ['fName', 'fPhone', 'fEmail', 'fLast5'].forEach(id => {
      $('#' + id).addEventListener('input', () => hideError(3));
    });
    $('#fLang').addEventListener('change', e => { state.contact.lang = e.target.value; });

    if (CONFIG.qrImage) {
      const qrImg = $('#qrImg');
      qrImg.addEventListener('load', () => { qrImg.hidden = false; });
      qrImg.src = CONFIG.qrImage;
    }
  }

  /* When embedded in an iframe (e.g. a WordPress page), tell the parent how
     tall we are so it can size the frame — see wordpress/README. */
  function reportHeight() {
    if (window.parent === window) return;
    const h = Math.ceil(document.documentElement.scrollHeight);
    try { window.parent.postMessage({ eccBookingHeight: h }, '*'); } catch (e) {}
  }

  document.addEventListener('DOMContentLoaded', () => {
    init();
    reportHeight();
    window.addEventListener('resize', reportHeight);
    if (window.ResizeObserver) new ResizeObserver(reportHeight).observe(document.body);
  });
})();
