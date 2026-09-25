/**
 * 管理頁：幸福餐桌預約清單、大道至簡來信、雲南好物訂單、安寧幸福之家預約（改處理狀態、匯出 CSV）與幻燈片照片（上傳、說明、排序、上下架）。
 * 只有輸入管理頁密碼、或通過 Cloudflare Access 登入的人看得到（見 index.js adminIdentity）。
 */

const STYLE = `
  :root { --paper:#FAF6EF; --card:#FFFDF8; --ink:#2A2520; --soft:#4A423A; --mist:#736C63; --line:#D9D1C2; --moss:#547050; --moss-soft:rgba(84,112,80,.1); --seal:#A8543A; }
  @media (prefers-color-scheme: dark) { :root { color-scheme: dark; --paper:#191714; --card:#24211C; --ink:#ECE5D8; --soft:#CFC6B6; --mist:#A39A8C; --line:#3A352E; --moss:#93B38A; --moss-soft:rgba(147,179,138,.12); --seal:#D98A6E; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--paper); color: var(--ink); font: 15px/1.7 "Noto Serif TC","Songti TC","PingFang TC","Microsoft JhengHei",serif; }
  .wrap { max-width: 1100px; margin: 0 auto; padding: 2rem clamp(1rem, 4vw, 2.5rem) 4rem; }
  h1 { font-weight: 400; font-size: 1.5rem; letter-spacing: .06em; margin: 0; }
  .who { color: var(--mist); font-size: .85rem; }
  .bar { display: flex; flex-wrap: wrap; gap: .8rem 1.2rem; align-items: center; justify-content: space-between; margin: 1.6rem 0 1rem; }
  .filters { display: flex; flex-wrap: wrap; gap: .6rem; }
  select, input { font: inherit; color: inherit; background: transparent; border: 1px solid var(--line); border-radius: 4px; padding: .35rem .6rem; }
  a.btn { color: var(--moss); border: 1px solid var(--moss); border-radius: 999px; padding: .35rem 1rem; text-decoration: none; font-size: .9rem; }
  a.btn:hover { background: var(--moss); color: var(--paper); }
  .count { color: var(--mist); font-size: .85rem; margin-bottom: .6rem; }
  .item { border-top: 1px solid var(--line); padding: 1rem 0; display: grid; gap: .3rem; }
  .item:last-child { border-bottom: 1px solid var(--line); }
  .top { display: flex; flex-wrap: wrap; gap: .4rem 1rem; align-items: baseline; justify-content: space-between; }
  .name { font-size: 1.05rem; letter-spacing: .04em; }
  .name small { color: var(--soft); margin-left: .5em; font-size: .9rem; }
  .meta { color: var(--mist); font-size: .85rem; }
  .meta a { color: var(--moss); }
  .msg { color: var(--soft); white-space: pre-wrap; border-left: 2px solid var(--seal); padding-left: .8rem; margin: .3rem 0; }
  .chip { display: inline-block; border: 1px solid var(--moss); color: var(--moss); border-radius: 999px; padding: 0 .7rem; font-size: .82rem; margin-right: .4rem; }
  .mail { font-size: .8rem; color: var(--mist); }
  .mail.bad { color: var(--seal); }
  select.status[data-v="新進"] { border-color: var(--seal); color: var(--seal); }
  .empty, .err { padding: 2rem 0; color: var(--mist); }
  .err { color: var(--seal); }
  .tabs { display: flex; gap: 1.6rem; margin-top: 1.4rem; border-bottom: 1px solid var(--line); }
  .tabs button { font: inherit; background: none; border: 0; border-bottom: 2px solid transparent; margin-bottom: -1px; padding: .5rem 0; color: var(--mist); cursor: pointer; letter-spacing: .06em; }
  .tabs button[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--moss); }
  .drop { display: block; margin: 1.6rem 0 1rem; border: 1px dashed var(--line); border-radius: 6px; padding: 1.6rem; text-align: center; color: var(--mist); cursor: pointer; transition: border-color .15s, background .15s; }
  .drop.over, .drop:hover { border-color: var(--moss); background: var(--moss-soft); color: var(--ink); }
  .drop b { color: var(--moss); font-weight: 500; }
  .up-status { font-size: .88rem; color: var(--mist); min-height: 1.4em; margin-bottom: .6rem; }
  .up-status.bad { color: var(--seal); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1.4rem; }
  .ph { display: grid; gap: .5rem; align-content: start; }
  .ph img { width: 100%; aspect-ratio: 3 / 2; object-fit: cover; border-radius: 4px; background: var(--card); }
  .ph.off img { opacity: .35; }
  .ph input[type=text] { width: 100%; font-size: .9rem; }
  .ph .row { display: flex; align-items: center; justify-content: space-between; gap: .4rem; font-size: .85rem; color: var(--mist); }
  .ph .row button { font: inherit; font-size: .82rem; color: var(--soft); background: none; border: 1px solid var(--line); border-radius: 999px; padding: .15rem .6rem; cursor: pointer; }
  .ph .row button:hover { border-color: var(--moss); color: var(--moss); }
  .ph .row button.del:hover { border-color: var(--seal); color: var(--seal); }
  .ph label { display: inline-flex; gap: .35rem; align-items: center; cursor: pointer; }
  .hint { font-size: .85rem; color: var(--mist); margin-top: 1.4rem; }
  .hint a { color: var(--moss); }
  .badge { display: inline-block; min-width: 1.3em; margin-left: .35em; padding: 0 .4em; border-radius: 999px; background: var(--seal); color: var(--paper); font-size: .72rem; line-height: 1.5; text-align: center; vertical-align: .1em; }
  .badge:empty { display: none; }
  .lines { margin: .3rem 0; padding: 0; list-style: none; font-size: .92rem; }
  .lines li { display: flex; justify-content: space-between; gap: 1rem; border-bottom: 1px dashed var(--line); padding: .2rem 0; }
  .lines li:last-child { border-bottom: 0; }
  .sum { font-size: .92rem; color: var(--soft); }
  .sum b { color: var(--ink); font-size: 1.05rem; }
  .flag { color: var(--seal); font-size: .88rem; }
  select.status[data-v="待付款"] { border-color: var(--seal); color: var(--seal); }
  select.status[data-v="取消"] { color: var(--mist); }
  .gift { border-left: 2px solid var(--moss); padding-left: .8rem; margin: .3rem 0; font-size: .92rem; color: var(--soft); white-space: pre-wrap; }
  .gift b { color: var(--seal); font-weight: 500; }
  .ship { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; margin-top: .3rem; font-size: .9rem; }
  .ship input { width: 12rem; }
  .ship button { font: inherit; font-size: .85rem; color: var(--moss); background: none; border: 1px solid var(--moss); border-radius: 999px; padding: .2rem .8rem; cursor: pointer; }
  .ship button:disabled { opacity: .5; cursor: default; }
  .notify-opt { display: inline-flex; gap: .4rem; align-items: center; font-size: .9rem; color: var(--soft); cursor: pointer; }
  select.status[data-v="待確認"] { border-color: var(--seal); color: var(--seal); }
  .ship input.total { width: 8rem; }
`;

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function adminPage(email, statuses, planLabels, letterStatuses, orderStatuses, stayStatuses) {
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>管理後台｜幸福餐桌・大道至簡</title>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
  <h1>管理後台</h1>
  <div class="who">已登入：${esc(email)}</div>
  <div class="tabs" role="tablist">
    <button type="button" role="tab" id="tabBtnInq" aria-selected="true" data-tab="inq">幸福餐桌預約</button>
    <button type="button" role="tab" id="tabBtnLet" aria-selected="false" data-tab="let">大道至簡來信<span class="badge" id="letBadge"></span></button>
    <button type="button" role="tab" id="tabBtnOrd" aria-selected="false" data-tab="ord">雲南訂單<span class="badge" id="ordBadge"></span></button>
    <button type="button" role="tab" id="tabBtnStay" aria-selected="false" data-tab="stay">幸福之家預約<span class="badge" id="stayBadge"></span></button>
    <button type="button" role="tab" id="tabBtnPh" aria-selected="false" data-tab="ph">幻燈片照片</button>
  </div>
  <section id="tab-inq">
  <div class="bar">
    <div class="filters">
      <select id="fStatus" aria-label="依處理狀態篩選"><option value="">全部狀態</option>${statuses.map(s => `<option>${esc(s)}</option>`).join('')}</select>
      <select id="fPlan" aria-label="依方案篩選"><option value="">全部方案</option>${Object.entries(planLabels).map(([k, v]) => `<option value="${esc(k)}">${esc(v)}</option>`).join('')}</select>
      <input id="fText" type="search" placeholder="搜尋姓名、公司、Email" aria-label="搜尋">
    </div>
    <a class="btn" href="/api/admin/export.csv">匯出 CSV</a>
  </div>
  <div class="count" id="count"></div>
  <div id="list"><p class="empty">載入中…</p></div>
  </section>
  <section id="tab-let" hidden>
  <div class="bar">
    <div class="filters">
      <select id="lStatus" aria-label="依處理狀態篩選"><option value="">全部狀態</option>${letterStatuses.map(s => `<option>${esc(s)}</option>`).join('')}</select>
      <input id="lText" type="search" placeholder="搜尋稱呼、Email、主題、內容" aria-label="搜尋來信">
    </div>
    <a class="btn" href="/api/admin/letters.csv">匯出 CSV</a>
  </div>
  <div class="count" id="lCount"></div>
  <div id="lList"><p class="empty">載入中…</p></div>
  <p class="hint">來信來自大道至簡品牌站的「連繫」頁。每封信都會寄通知到大道至簡信箱，並寄一封收信確認給對方；回覆後把狀態改成「已回覆」。</p>
  </section>
  <section id="tab-ord" hidden>
  <div class="bar">
    <div class="filters">
      <select id="oStatus" aria-label="依狀態篩選"><option value="">全部狀態</option>${orderStatuses.map(s => `<option>${esc(s)}</option>`).join('')}</select>
      <input id="oText" type="search" placeholder="搜尋訂單編號、姓名、電話、商品、追蹤號碼" aria-label="搜尋訂單">
      <label class="notify-opt"><input type="checkbox" id="oNotify" checked> 改成已付款／已出貨時寄信通知客人</label>
    </div>
    <a class="btn" href="/api/admin/orders.csv">匯出 CSV</a>
  </div>
  <div class="count" id="oCount"></div>
  <div id="oList"><p class="empty">載入中…</p></div>
  <p class="hint">訂單來自大道至簡品牌站的雲南好物選購頁（shop/）。每張訂單都會寄通知給你們，並寄訂單確認與付款資訊給客人。
  收到款項改「已付款」（客人會收到款項確認信）；寄出後先填物流與追蹤號碼，再改「已出貨」（客人會收到附追蹤號碼的出貨通知）。
  送禮訂單會標出收件人、卡片內容與「不附價格明細」。金額由系統依商品表重算；同一支電話在同一檔重複下單會標出來，方便合併寄送。</p>
  </section>
  <section id="tab-stay" hidden>
  <div class="bar">
    <div class="filters">
      <select id="sStatus" aria-label="依狀態篩選"><option value="">全部狀態</option>${stayStatuses.map(s => `<option>${esc(s)}</option>`).join('')}</select>
      <input id="sText" type="search" placeholder="搜尋預約編號、姓名、電話、微信／LINE、房型、日期" aria-label="搜尋預約">
      <label class="notify-opt"><input type="checkbox" id="sNotify" checked> 改成已確認／已付款時寄信通知客人</label>
    </div>
    <a class="btn" href="/api/admin/stays.csv">匯出 CSV</a>
  </div>
  <div class="count" id="sCount"></div>
  <div id="sList"><p class="empty">載入中…</p></div>
  <p class="hint">預約來自大道至簡品牌站的安寧幸福之家頁（anning/）。客人送出時不付款；每筆預約都會寄通知給你們，並寄預約確認給客人。
  先用微信或 LINE 跟客人對好日期，填上「入住日期」（需要時調整金額），再改「已確認」——客人會收到付款資訊。收到款項改「已付款」（客人會收到收款確認）。
  一次只接一組，同一個月已有其他預約時會標出來。</p>
  </section>
  <section id="tab-ph" hidden>
    <label class="drop" id="drop" for="files">把照片拖到這裡，或<b>點這裡選擇照片</b>（可一次選多張）
      <input type="file" id="files" accept="image/*" multiple hidden>
    </label>
    <div class="up-status" id="upStatus" aria-live="polite"></div>
    <div class="grid" id="grid"></div>
    <p class="hint">照片會自動縮小成網頁用的大小再上傳，原檔不用先處理。能清楚認出臉的照片，請先確認當事人同意公開。
    勾掉「顯示」就會從網頁上的幻燈片撤下（照片仍保留）。<a href="/#gallery" target="_blank" rel="noopener">看網頁上的幻燈片</a></p>
  </section>
</div>
<script>
const STATUSES = ${JSON.stringify(statuses)};
const LSTATUSES = ${JSON.stringify(letterStatuses)};
const OSTATUSES = ${JSON.stringify(orderStatuses)};
const SSTATUSES = ${JSON.stringify(stayStatuses)};
const PLAN = ${JSON.stringify(planLabels)};
let rows = [];
const $ = s => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const fmt = s => { const d = new Date(String(s).replace(' ', 'T') + 'Z'); return d.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }); };

async function load() {
  try {
    const res = await fetch('/api/admin/inquiries', { cache: 'no-store' });
    const out = await res.json();
    if (!out.ok) throw new Error(out.code);
    rows = out.inquiries; render();
  } catch (e) {
    $('#list').innerHTML = ''; $('#list').append(el('p', 'err', '讀不到資料（' + e.message + '）。重新整理頁面再試一次。'));
  }
}

function render() {
  const st = $('#fStatus').value, pl = $('#fPlan').value, q = $('#fText').value.trim().toLowerCase();
  const shown = rows.filter(r => (!st || r.status === st) && (!pl || r.plan === pl) &&
    (!q || [r.name, r.company, r.email, r.title].join(' ').toLowerCase().includes(q)));
  $('#count').textContent = '共 ' + rows.length + ' 筆，顯示 ' + shown.length + ' 筆';
  const list = $('#list'); list.innerHTML = '';
  if (!shown.length) { list.append(el('p', 'empty', rows.length ? '沒有符合條件的預約。' : '目前還沒有人送出預約。')); return; }
  for (const r of shown) {
    const item = el('div', 'item');
    const top = el('div', 'top');
    const name = el('div', 'name', r.name); if (r.title) name.append(el('small', '', r.title));
    const sel = el('select', 'status'); sel.setAttribute('aria-label', r.name + ' 的處理狀態');
    for (const s of STATUSES) { const o = el('option', '', s); if (s === r.status) o.selected = true; sel.append(o); }
    sel.dataset.v = r.status;
    sel.addEventListener('change', () => save(r, sel));
    top.append(name, sel);
    const chips = el('div');
    chips.append(el('span', 'chip', PLAN[r.plan] || r.plan)); if (r.heads) chips.append(el('span', 'chip', r.heads));
    const meta = el('div', 'meta');
    meta.append('#' + r.id + '・' + fmt(r.created_at) + '・' + r.company + '・');
    const mail = el('a', '', r.email); mail.href = 'mailto:' + r.email; meta.append(mail);
    if (r.phone) meta.append('・' + r.phone);
    if (r.lang === 'zh-Hans') meta.append('・簡體頁');
    item.append(top, meta, chips);
    if (r.message) item.append(el('div', 'msg', r.message));
    const ms = r.mail_status || '';
    const zh = ms ? ms.replace(/owner/g, '通知信').replace(/guest/g, '確認信').replace(/ sent/g, ' 已寄出')
      .replace(/ skipped:?/g, ' 未寄出：').replace(/ failed:?/g, ' 失敗：').replace(/; /g, '，') : '寄送中或尚無紀錄';
    item.append(el('div', 'mail' + (/failed|skipped/.test(ms) ? ' bad' : ''), '寄信：' + zh));
    list.append(item);
  }
}

async function save(r, sel) {
  const prev = r.status; sel.disabled = true;
  try {
    const res = await fetch('/api/admin/inquiries/' + r.id + '/status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: sel.value })
    });
    const out = await res.json(); if (!out.ok) throw new Error(out.code);
    r.status = sel.value; sel.dataset.v = sel.value;
  } catch (e) {
    sel.value = prev; alert('沒有存到（' + e.message + '），請再試一次。');
  } finally { sel.disabled = false; }
}

/* ---------------- 分頁 ---------------- */
const HASH = { inq: '#', let: '#letters', ord: '#orders', stay: '#stays', ph: '#photos' };
function showTab(t) {
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  $('#tab-inq').hidden = t !== 'inq'; $('#tab-let').hidden = t !== 'let'; $('#tab-ord').hidden = t !== 'ord'; $('#tab-stay').hidden = t !== 'stay'; $('#tab-ph').hidden = t !== 'ph';
  history.replaceState(null, '', HASH[t]);
  if (t === 'ph' && !photosLoaded) loadPhotos();
}

/* ---------------- 大道至簡來信 ---------------- */
let letters = [];
async function loadLetters() {
  try {
    const res = await fetch('/api/admin/letters', { cache: 'no-store' });
    const out = await res.json();
    if (!out.ok) throw new Error(out.code);
    letters = out.letters; renderLetters();
  } catch (e) {
    $('#lList').innerHTML = ''; $('#lList').append(el('p', 'err', '讀不到來信（' + e.message + '）。重新整理頁面再試一次。'));
  }
}
function renderLetters() {
  const st = $('#lStatus').value, q = $('#lText').value.trim().toLowerCase();
  const shown = letters.filter(r => (!st || r.status === st) &&
    (!q || [r.name, r.email, r.subject, r.message].join(' ').toLowerCase().includes(q)));
  const fresh = letters.filter(r => r.status === '新進').length;
  $('#letBadge').textContent = fresh ? String(fresh) : '';
  $('#lCount').textContent = '共 ' + letters.length + ' 封，顯示 ' + shown.length + ' 封' + (fresh ? '，' + fresh + ' 封待回覆' : '');
  const list = $('#lList'); list.innerHTML = '';
  if (!shown.length) { list.append(el('p', 'empty', letters.length ? '沒有符合條件的來信。' : '目前還沒有來信。')); return; }
  for (const r of shown) {
    const item = el('div', 'item');
    const top = el('div', 'top');
    const name = el('div', 'name', r.name); if (r.subject) name.append(el('small', '', r.subject));
    const sel = el('select', 'status'); sel.setAttribute('aria-label', r.name + ' 的處理狀態');
    for (const s of LSTATUSES) { const o = el('option', '', s); if (s === r.status) o.selected = true; sel.append(o); }
    sel.dataset.v = r.status;
    sel.addEventListener('change', () => saveLetter(r, sel));
    top.append(name, sel);
    const meta = el('div', 'meta');
    meta.append('#' + r.id + '・' + fmt(r.created_at) + '・');
    const mail = el('a', '', r.email);
    mail.href = 'mailto:' + r.email + '?subject=' + encodeURIComponent('Re: ' + (r.subject || '您寫給大道至簡的信'));
    meta.append(mail);
    if (r.lang === 'zh-Hans') meta.append('・簡體頁');
    if (r.page) meta.append('・' + r.page);
    item.append(top, meta, el('div', 'msg', r.message));
    const ms = r.mail_status || '';
    const zh = ms ? ms.replace(/owner/g, '通知信').replace(/guest/g, '確認信').replace(/ sent/g, ' 已寄出')
      .replace(/ skipped:?/g, ' 未寄出：').replace(/ failed:?/g, ' 失敗：').replace(/; /g, '，') : '寄送中或尚無紀錄';
    item.append(el('div', 'mail' + (/failed|skipped/.test(ms) ? ' bad' : ''), '寄信：' + zh));
    list.append(item);
  }
}
async function saveLetter(r, sel) {
  const prev = r.status; sel.disabled = true;
  try {
    const res = await fetch('/api/admin/letters/' + r.id + '/status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: sel.value })
    });
    const out = await res.json(); if (!out.ok) throw new Error(out.code);
    r.status = sel.value; sel.dataset.v = sel.value; renderLetters();
  } catch (e) {
    sel.value = prev; alert('沒有存到（' + e.message + '），請再試一次。');
  } finally { sel.disabled = false; }
}
$('#lStatus').addEventListener('change', renderLetters);
$('#lText').addEventListener('input', renderLetters);
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

/* ---------------- 雲南訂單 ---------------- */
let orders = [], DELIVERY = {}, PAY = {}, CARRIERS = [];
const DEFAULT_CARRIER = { '711': '7-11 交貨便', family: '全家店到店' };
const money = n => 'NT$' + Number(n).toLocaleString('en-US');
async function loadOrders() {
  try {
    const res = await fetch('/api/admin/orders', { cache: 'no-store' });
    const out = await res.json();
    if (!out.ok) throw new Error(out.code);
    orders = out.orders; DELIVERY = out.delivery; PAY = out.pay; CARRIERS = out.carriers || []; renderOrders();
  } catch (e) {
    $('#oList').innerHTML = ''; $('#oList').append(el('p', 'err', '讀不到訂單（' + e.message + '）。重新整理頁面再試一次。'));
  }
}
function itemsOf(r) { try { return JSON.parse(r.items); } catch (e) { return []; } }
function renderOrders() {
  const st = $('#oStatus').value, q = $('#oText').value.trim().toLowerCase();
  const shown = orders.filter(r => (!st || r.status === st) &&
    (!q || [r.order_no, r.name, r.phone, r.email, r.items, r.to_name, r.to_phone, r.tracking_no].join(' ').toLowerCase().includes(q)));
  const unpaid = orders.filter(r => r.status === '待付款').length;
  $('#ordBadge').textContent = unpaid ? String(unpaid) : '';
  const open = orders.filter(r => r.status !== '取消');
  $('#oCount').textContent = '共 ' + orders.length + ' 張，顯示 ' + shown.length + ' 張' + (unpaid ? '，' + unpaid + ' 張待付款' : '')
    + '・未取消合計 ' + money(open.reduce((a, r) => a + r.total, 0));
  const list = $('#oList'); list.innerHTML = '';
  if (!shown.length) { list.append(el('p', 'empty', orders.length ? '沒有符合條件的訂單。' : '目前還沒有訂單。')); return; }
  for (const r of shown) {
    const item = el('div', 'item');
    const top = el('div', 'top');
    const name = el('div', 'name', r.order_no || ('#' + r.id)); name.append(el('small', '', r.name));
    const sel = el('select', 'status'); sel.setAttribute('aria-label', (r.order_no || r.id) + ' 的狀態');
    for (const s of OSTATUSES) { const o = el('option', '', s); if (s === r.status) o.selected = true; sel.append(o); }
    sel.dataset.v = r.status;
    top.append(name, sel);
    const meta = el('div', 'meta');
    meta.append(fmt(r.created_at) + '・' + (r.season || '') + '・' + r.phone + '・');
    const mail = el('a', '', r.email); mail.href = 'mailto:' + r.email + '?subject=' + encodeURIComponent('你的訂單 ' + (r.order_no || '')); meta.append(mail);
    if (r.line) meta.append('・LINE ' + r.line);
    const chips = el('div');
    chips.append(el('span', 'chip', PAY[r.pay] || r.pay), el('span', 'chip', DELIVERY[r.delivery] || r.delivery));
    if (r.gift) chips.append(el('span', 'chip', '送禮'));
    const where = r.delivery === 'home' ? r.address : r.delivery === 'meet' ? '另外約時間地點' : r.store;
    const ul = el('ul', 'lines');
    for (const l of itemsOf(r)) { const li = el('li'); li.append(el('span', '', l.name + '（' + l.label + '）× ' + l.qty), el('span', '', money(l.amount))); ul.append(li); }
    const sum = el('div', 'sum'); sum.append('小計 ' + money(r.subtotal) + '・運費 ' + (r.shipping ? money(r.shipping) : '免運') + '・合計 ');
    sum.append(el('b', '', money(r.total)));
    item.append(top, meta, chips, el('div', 'meta', '寄送：' + (r.gift ? r.to_name + '・' + r.to_phone + '・' : '') + (where || '')), ul, sum);
    if (r.gift) {
      const g = el('div', 'gift');
      if (r.hide_price) g.append(el('b', '', '不附價格明細（包裹裡不要放明細、出貨單不寫金額）'), '\\n');
      g.append(r.card ? '卡片：' + r.card : '不附卡片');
      item.append(g);
    }
    // 物流與追蹤號碼
    const ship = el('div', 'ship');
    const car = el('select'); car.setAttribute('aria-label', (r.order_no || r.id) + ' 的物流');
    car.append(el('option', '', '選物流'));
    car.options[0].value = '';
    const carNow = r.carrier || (r.status !== '已出貨' && DEFAULT_CARRIER[r.delivery]) || '';
    for (const c of CARRIERS) { const o = el('option', '', c); if (c === carNow) o.selected = true; car.append(o); }
    const trk = el('input'); trk.placeholder = r.delivery === 'meet' ? '面交不用填' : '追蹤號碼'; trk.value = r.tracking_no || '';
    trk.setAttribute('aria-label', (r.order_no || r.id) + ' 的追蹤號碼');
    const saveBtn = el('button', '', '儲存物流'); saveBtn.type = 'button';
    saveBtn.addEventListener('click', () => saveOrder(r, { status: r.status, carrier: car.value, tracking: trk.value.trim(), notify: false }, saveBtn));
    ship.append('出貨：', car, trk, saveBtn);
    if (r.status === '已出貨') {
      const again = el('button', '', '重寄出貨通知'); again.type = 'button';
      again.addEventListener('click', () => {
        if (confirm('用目前的物流與追蹤號碼，再寄一次出貨通知給 ' + r.email + '？'))
          saveOrder(r, { status: r.status, carrier: car.value, tracking: trk.value.trim(), notify: true, resend: true }, again);
      });
      ship.append(again);
    }
    if (r.shipped_at) ship.append(el('span', 'meta', '出貨時間 ' + fmt(r.shipped_at)));
    item.append(ship);
    sel.addEventListener('change', () => {
      const notify = $('#oNotify').checked;
      if (sel.value === '已出貨' && notify && r.delivery !== 'meet' && !trk.value.trim()) {
        sel.value = r.status; trk.focus();
        alert('先填追蹤號碼，再改成「已出貨」——出貨通知信會附上這個號碼。\\n（不想寄信的話，把上方「寄信通知客人」取消勾選。）');
        return;
      }
      saveOrder(r, { status: sel.value, carrier: car.value, tracking: trk.value.trim(), notify }, sel);
    });
    if (r.same_phone) item.append(el('div', 'flag', '同一支電話本檔已有訂單：' + r.same_phone + '（可合併寄送，運費請手動調整）'));
    if (r.note) item.append(el('div', 'msg', r.note));
    const ms = r.mail_status || '';
    const zh = ms ? ms.replace(/owner/g, '通知信').replace(/guest/g, '確認信').replace(/paid/g, '款項確認信').replace(/shipped/g, '出貨通知').replace(/ sent/g, ' 已寄出')
      .replace(/ skipped:?/g, ' 未寄出：').replace(/ failed:?/g, ' 失敗：').replace(/; /g, '，') : '寄送中或尚無紀錄';
    item.append(el('div', 'mail' + (/failed|skipped/.test(ms) ? ' bad' : ''), '寄信：' + zh));
    list.append(item);
  }
}
const SAVE_ERR = { need_tracking: '要寄出貨通知，請先填追蹤號碼。', invalid_carrier: '物流選項不對，請重新整理頁面。' };
async function saveOrder(r, body, ctl) {
  const prev = r.status; ctl.disabled = true;
  try {
    const res = await fetch('/api/admin/orders/' + r.id + '/status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const out = await res.json(); if (!out.ok) throw new Error(SAVE_ERR[out.code] || out.code);
    r.status = body.status; r.carrier = body.carrier; r.tracking_no = body.tracking;
    if (body.status === '已出貨' && !r.shipped_at) r.shipped_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const tag = body.status === '已出貨' ? 'shipped ' : 'paid ';
    if (out.mail) r.mail_status = [r.mail_status, tag + out.mail].filter(Boolean).join('; ');
    renderOrders();
    if (out.mail && out.mail !== 'sent') alert('狀態已存，但通知信沒有寄出（' + out.mail + '）。');
  } catch (e) {
    if (ctl.tagName === 'SELECT') ctl.value = prev;
    alert('沒有存到（' + e.message + '），請再試一次。');
  } finally { ctl.disabled = false; }
}
$('#oStatus').addEventListener('change', renderOrders);
$('#oText').addEventListener('input', renderOrders);

/* ---------------- 安寧幸福之家預約 ---------------- */
let stays = [], SPAY = {};
async function loadStays() {
  try {
    const res = await fetch('/api/admin/stays', { cache: 'no-store' });
    const out = await res.json();
    if (!out.ok) throw new Error(out.code);
    stays = out.stays; SPAY = out.pay; renderStays();
  } catch (e) {
    $('#sList').innerHTML = ''; $('#sList').append(el('p', 'err', '讀不到預約（' + e.message + '）。重新整理頁面再試一次。'));
  }
}
function renderStays() {
  const st = $('#sStatus').value, q = $('#sText').value.trim().toLowerCase();
  const shown = stays.filter(r => (!st || r.status === st) &&
    (!q || [r.booking_no, r.name, r.phone, r.email, r.im, r.companions, r.rooms, r.checkin].join(' ').toLowerCase().includes(q)));
  const waiting = stays.filter(r => r.status === '待確認').length;
  $('#stayBadge').textContent = waiting ? String(waiting) : '';
  $('#sCount').textContent = '共 ' + stays.length + ' 筆，顯示 ' + shown.length + ' 筆' + (waiting ? '，' + waiting + ' 筆待確認' : '');
  const list = $('#sList'); list.innerHTML = '';
  if (!shown.length) { list.append(el('p', 'empty', stays.length ? '沒有符合條件的預約。' : '目前還沒有預約。')); return; }
  for (const r of shown) {
    const item = el('div', 'item');
    const top = el('div', 'top');
    const name = el('div', 'name', r.booking_no || ('#' + r.id)); name.append(el('small', '', r.name));
    const sel = el('select', 'status'); sel.setAttribute('aria-label', (r.booking_no || r.id) + ' 的狀態');
    for (const s of SSTATUSES) { const o = el('option', '', s); if (s === r.status) o.selected = true; sel.append(o); }
    sel.dataset.v = r.status;
    top.append(name, sel);
    const meta = el('div', 'meta');
    meta.append(fmt(r.created_at) + '・' + r.phone + '・');
    const mail = el('a', '', r.email); mail.href = 'mailto:' + r.email + '?subject=' + encodeURIComponent('你的幸福之家預約 ' + (r.booking_no || '')); meta.append(mail);
    if (r.im) meta.append('・微信／LINE ' + r.im);
    const chips = el('div');
    chips.append(el('span', 'chip', r.checkin + ' 入住'), el('span', 'chip', r.rooms), el('span', 'chip', r.guests + ' 位'), el('span', 'chip', SPAY[r.pay] || r.pay));
    const sum = el('div', 'sum');
    sum.append((r.dates ? '確認日期 ' + r.dates + '・' : '') + '金額 ');
    sum.append(el('b', '', money(r.total)));
    item.append(top, meta, chips, sum);
    if (r.companions) item.append(el('div', 'meta', '同行：' + r.companions));
    if (r.wishes) item.append(el('div', 'meta', '想要的：' + r.wishes));
    if (r.story) item.append(el('div', 'msg', r.story));
    // 入住日期與金額：改「已確認」時會寫進付款資訊信
    const box = el('div', 'ship');
    const dates = el('input'); dates.placeholder = '入住日期，例：10/12（一）～10/18（日）'; dates.value = r.dates || ''; dates.maxLength = 60;
    dates.setAttribute('aria-label', (r.booking_no || r.id) + ' 的入住日期');
    const total = el('input', 'total'); total.type = 'number'; total.min = '0'; total.step = '1'; total.value = r.total;
    total.setAttribute('aria-label', (r.booking_no || r.id) + ' 的金額');
    const saveBtn = el('button', '', '儲存'); saveBtn.type = 'button';
    saveBtn.addEventListener('click', () => saveStay(r, { status: r.status, dates: dates.value.trim(), total: total.value, notify: false }, saveBtn));
    box.append('入住：', dates, '金額：', total, saveBtn);
    if (r.status === '已確認' || r.status === '已付款') {
      const again = el('button', '', r.status === '已確認' ? '重寄付款資訊' : '重寄收款確認'); again.type = 'button';
      again.addEventListener('click', () => {
        if (confirm('用目前的入住日期與金額，再寄一次給 ' + r.email + '？'))
          saveStay(r, { status: r.status, dates: dates.value.trim(), total: total.value, notify: true, resend: true }, again);
      });
      box.append(again);
    }
    item.append(box);
    sel.addEventListener('change', () => {
      const notify = $('#sNotify').checked;
      if ((sel.value === '已確認' || sel.value === '已付款') && notify && !dates.value.trim()) {
        sel.value = r.status; dates.focus();
        alert('先填入住日期，再改狀態——通知信會寫上這個日期。\\n（不想寄信的話，把上方「寄信通知客人」取消勾選。）');
        return;
      }
      saveStay(r, { status: sel.value, dates: dates.value.trim(), total: total.value, notify }, sel);
    });
    if (r.same_month) item.append(el('div', 'flag', '同一個月已有其他預約：' + r.same_month + '（一次只接一組，排日期時留意）'));
    const ms = r.mail_status || '';
    const zh = ms ? ms.replace(/owner/g, '通知信').replace(/guest/g, '確認信').replace(/confirmed/g, '付款資訊信').replace(/paid/g, '收款確認信').replace(/ sent/g, ' 已寄出')
      .replace(/ skipped:?/g, ' 未寄出：').replace(/ failed:?/g, ' 失敗：').replace(/; /g, '，') : '寄送中或尚無紀錄';
    item.append(el('div', 'mail' + (/failed|skipped/.test(ms) ? ' bad' : ''), '寄信：' + zh));
    list.append(item);
  }
}
const STAY_ERR = { need_dates: '要寄通知信，請先填入住日期。', invalid_total: '金額要是整數。' };
async function saveStay(r, body, ctl) {
  const prev = r.status; ctl.disabled = true;
  try {
    const res = await fetch('/api/admin/stays/' + r.id + '/status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const out = await res.json(); if (!out.ok) throw new Error(STAY_ERR[out.code] || out.code);
    r.status = body.status; r.dates = body.dates; if (body.total !== '') r.total = Number(body.total);
    const tag = body.status === '已確認' ? 'confirmed ' : 'paid ';
    if (out.mail) r.mail_status = [r.mail_status, tag + out.mail].filter(Boolean).join('; ');
    renderStays();
    if (out.mail && out.mail !== 'sent') alert('狀態已存，但通知信沒有寄出（' + out.mail + '）。');
  } catch (e) {
    if (ctl.tagName === 'SELECT') ctl.value = prev;
    alert('沒有存到（' + e.message + '），請再試一次。');
  } finally { ctl.disabled = false; }
}
$('#sStatus').addEventListener('change', renderStays);
$('#sText').addEventListener('input', renderStays);

/* ---------------- 幻燈片照片 ---------------- */
let photos = [], photosLoaded = false;
async function api(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const out = await res.json(); if (!out.ok) throw new Error(out.code); return out;
}
async function loadPhotos() {
  try {
    const res = await fetch('/api/admin/photos', { cache: 'no-store' }); const out = await res.json();
    if (!out.ok) throw new Error(out.code);
    photos = out.photos; photosLoaded = true; renderPhotos();
  } catch (e) { setStatus('讀不到照片（' + e.message + '）。重新整理頁面再試一次。', true); }
}
function setStatus(t, bad) { const s = $('#upStatus'); s.textContent = t; s.className = 'up-status' + (bad ? ' bad' : ''); }
function renderPhotos() {
  const g = $('#grid'); g.innerHTML = '';
  if (!photos.length) { g.append(el('p', 'empty', '還沒有照片。上傳後，網頁上「幸福餐桌」幻燈片就會出現。')); return; }
  photos.forEach((p, i) => {
    const card = el('div', 'ph' + (p.visible ? '' : ' off'));
    const img = el('img'); img.src = p.src; img.alt = p.caption || ''; img.loading = 'lazy';
    const cap = el('input'); cap.type = 'text'; cap.value = p.caption || ''; cap.placeholder = '一句說明，例如：南投・秋天的長桌'; cap.maxLength = 80;
    cap.setAttribute('aria-label', '第 ' + (i + 1) + ' 張的說明');
    cap.addEventListener('change', async () => { try { await api('/api/admin/photos/' + p.id, { caption: cap.value }); p.caption = cap.value; setStatus('已存說明。'); } catch (e) { setStatus('說明沒有存到（' + e.message + '）。', true); } });
    const row = el('div', 'row');
    const vis = el('label'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!p.visible; vis.append(cb, '顯示');
    cb.addEventListener('change', async () => { try { await api('/api/admin/photos/' + p.id, { visible: cb.checked }); p.visible = cb.checked ? 1 : 0; card.classList.toggle('off', !cb.checked); } catch (e) { cb.checked = !cb.checked; setStatus('沒有存到（' + e.message + '）。', true); } });
    const moves = el('span');
    const up = el('button', '', '↑'); up.type = 'button'; up.title = '往前'; up.disabled = i === 0; up.addEventListener('click', () => move(i, -1));
    const dn = el('button', '', '↓'); dn.type = 'button'; dn.title = '往後'; dn.disabled = i === photos.length - 1; dn.addEventListener('click', () => move(i, 1));
    const del = el('button', 'del', '刪除'); del.type = 'button';
    del.addEventListener('click', async () => { if (!confirm('確定刪除這張照片？刪除後無法復原（只想撤下請改用「顯示」）。')) return; try { await api('/api/admin/photos/' + p.id + '/delete', {}); photos.splice(photos.indexOf(p), 1); renderPhotos(); setStatus('已刪除。'); } catch (e) { setStatus('沒有刪除（' + e.message + '）。', true); } });
    moves.append(up, ' ', dn, ' ', del);
    row.append(vis, moves);
    card.append(img, cap, row); g.append(card);
  });
}
async function move(i, d) {
  const j = i + d; if (j < 0 || j >= photos.length) return;
  [photos[i], photos[j]] = [photos[j], photos[i]]; renderPhotos();
  try { await api('/api/admin/photos/order', { ids: photos.map(p => p.id) }); } catch (e) { setStatus('順序沒有存到（' + e.message + '），請重新整理。', true); }
}
// 在瀏覽器裡先縮成最長邊 1600px 再上傳：WebP，不支援的瀏覽器改用 JPEG
async function shrink(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch (e) { throw new Error('讀不到這張照片（' + file.name + '），iPhone 的 HEIC 請先轉成 JPG'); }
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  let blob = await new Promise(r => c.toBlob(r, 'image/webp', 0.82));
  if (!blob || blob.type !== 'image/webp') blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
  return { blob, w, h };
}
async function uploadFiles(list) {
  const files = [...list].filter(f => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
  if (!files.length) return;
  let done = 0, failed = [];
  for (const f of files) {
    setStatus('上傳中 ' + (done + failed.length + 1) + ' / ' + files.length + '：' + f.name);
    try {
      const { blob, w, h } = await shrink(f);
      const res = await fetch('/api/admin/photos', { method: 'POST', headers: { 'Content-Type': blob.type, 'X-Width': w, 'X-Height': h, 'X-Caption': '' }, body: blob });
      const out = await res.json(); if (!out.ok) throw new Error(out.code);
      done++;
    } catch (e) { failed.push(f.name + '：' + e.message); }
  }
  await loadPhotos();
  setStatus('完成：上傳 ' + done + ' 張' + (failed.length ? '；未上傳 ' + failed.length + ' 張（' + failed.join('；') + '）' : '。接著可以替每張寫一句說明。'), failed.length > 0);
}
$('#files').addEventListener('change', e => { uploadFiles(e.target.files); e.target.value = ''; });
const drop = $('#drop');
['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => uploadFiles(e.dataTransfer.files));
if (location.hash === '#photos') showTab('ph');
if (location.hash === '#letters') showTab('let');
if (location.hash === '#orders') showTab('ord');
if (location.hash === '#stays') showTab('stay');

['#fStatus', '#fPlan'].forEach(s => $(s).addEventListener('change', render));
$('#fText').addEventListener('input', render);
load();
loadLetters();
loadOrders();
loadStays();
</script>
</body>
</html>`;
}

export function adminSetupPage() {
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>管理頁尚未啟用</title>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
  <h1>管理頁尚未啟用</h1>
  <p class="who">為了保護預約資料，要先設定管理頁密碼才會開放。</p>
  <p>到 Cloudflare → Workers &amp; Pages → executive-table → Settings → Variables and Secrets，
  新增一個 Secret：名稱 <code>ADMIN_PASSWORD</code>，值是至少 12 個字元的密碼。存檔後重新整理這一頁即可。</p>
  <p class="who">預約與來信在這之前仍然會正常存進資料庫，也會照常寄出通知信。</p>
</div>
</body>
</html>`;
}
