/**
 * 管理頁：幸福餐桌預約清單、大道至簡來信（改處理狀態、匯出 CSV）與幻燈片照片（上傳、說明、排序、上下架）。
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
`;

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function adminPage(email, statuses, planLabels, letterStatuses) {
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
const HASH = { inq: '#', let: '#letters', ph: '#photos' };
function showTab(t) {
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  $('#tab-inq').hidden = t !== 'inq'; $('#tab-let').hidden = t !== 'let'; $('#tab-ph').hidden = t !== 'ph';
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

['#fStatus', '#fPlan'].forEach(s => $(s).addEventListener('change', render));
$('#fText').addEventListener('input', render);
load();
loadLetters();
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
