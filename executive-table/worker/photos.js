/**
 * 幻燈片照片：存在 D1（不另外開 R2），由管理頁上傳、排序、上下架。
 *
 *   GET  /api/photos                      公開：顯示中的照片清單（依順序）
 *   GET  /photos/<id>-<版本>.<webp|jpg>   公開：照片本身（邊緣快取一年）
 *   GET  /api/admin/photos                管理：全部照片（含隱藏）
 *   POST /api/admin/photos                管理：上傳一張（本文是圖片，說明放在 X-Caption 標頭）
 *   POST /api/admin/photos/<id>           管理：改說明或顯示狀態 {caption, visible}
 *   POST /api/admin/photos/order          管理：排序 {ids: [...]}
 *   POST /api/admin/photos/<id>/delete    管理：刪除
 *
 * 照片在管理頁的瀏覽器裡先縮成最長邊 1600px（WebP，舊瀏覽器用 JPEG）再上傳，
 * 每張約 200–400 KB。D1 單格上限 2 MB，這裡限制 1.8 MB。
 */

const MAX_BYTES = 1.8 * 1024 * 1024;
const MAX_CAPTION = 80;

let ready = null;
export function ensurePhotoSchema(env) {
  if (!ready) {
    ready = env.DB.prepare(`CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      mime TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      bytes INTEGER,
      caption TEXT NOT NULL DEFAULT '',
      sort INTEGER NOT NULL DEFAULT 0,
      visible INTEGER NOT NULL DEFAULT 1,
      version INTEGER NOT NULL DEFAULT 1,
      data BLOB NOT NULL
    )`).run().catch(err => { ready = null; throw err; });
  }
  return ready;
}

const ext = mime => (mime === 'image/webp' ? 'webp' : 'jpg');
const photoUrl = r => `/photos/${r.id}-${r.version}.${ext(r.mime)}`;

/* ---------------- 公開 ---------------- */

export async function listPublic(env) {
  await ensurePhotoSchema(env);
  const { results } = await env.DB.prepare(
    'SELECT id, mime, width, height, caption, version FROM photos WHERE visible = 1 ORDER BY sort, id'
  ).all();
  return new Response(JSON.stringify({
    ok: true,
    photos: results.map(r => ({ src: photoUrl(r), w: r.width, h: r.height, caption: r.caption }))
  }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' }
  });
}

export async function servePhoto(request, env, ctx, path) {
  const m = path.match(/^\/photos\/(\d+)-(\d+)\.(webp|jpg)$/);
  if (!m) return null;
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) return cached;
  await ensurePhotoSchema(env);
  const row = await env.DB.prepare('SELECT mime, data, version, visible FROM photos WHERE id = ?').bind(Number(m[1])).first();
  // 版本不符（照片已更新）或已刪除：不快取，讓頁面重新取得清單
  if (!row || String(row.version) !== m[2]) return new Response('Not found', { status: 404 });
  const res = new Response(new Uint8Array(row.data), {
    headers: {
      'Content-Type': row.mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff'
    }
  });
  ctx.waitUntil(cache.put(request, res.clone()));
  return res;
}

/* ---------------- 管理 ---------------- */

export async function handleAdminPhotos(request, env, url, path) {
  if (!path.startsWith('/api/admin/photos')) return null;
  await ensurePhotoSchema(env);

  if (path === '/api/admin/photos' && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT id, created_at, mime, width, height, bytes, caption, sort, visible, version FROM photos ORDER BY sort, id'
    ).all();
    return json({ ok: true, photos: results.map(r => ({ ...r, src: photoUrl(r) })) });
  }

  if (request.method !== 'POST') return json({ ok: false, code: 'method_not_allowed' }, 405);
  // 只接受同源請求，避免被別的網站借用登入狀態
  if (request.headers.get('Origin') !== url.origin) return json({ ok: false, code: 'bad_origin' }, 403);

  if (path === '/api/admin/photos') {
    const buf = new Uint8Array(await request.arrayBuffer());
    if (!buf.length) return json({ ok: false, code: 'empty' }, 400);
    if (buf.length > MAX_BYTES) return json({ ok: false, code: 'too_large' }, 413);
    const mime = sniff(buf);
    if (!mime) return json({ ok: false, code: 'not_an_image' }, 415);
    const width = clampInt(request.headers.get('X-Width'));
    const height = clampInt(request.headers.get('X-Height'));
    const caption = decodeCaption(request.headers.get('X-Caption'));
    const max = await env.DB.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM photos').first();
    const row = await env.DB.prepare(
      `INSERT INTO photos (created_at, mime, width, height, bytes, caption, sort, data)
       VALUES (datetime('now'), ?, ?, ?, ?, ?, ?, ?) RETURNING id, version, mime`
    ).bind(mime, width, height, buf.length, caption, (max ? max.m : 0) + 1, buf).first();
    return json({ ok: true, id: row.id, src: photoUrl(row) });
  }

  if (path === '/api/admin/photos/order') {
    const body = await request.json().catch(() => null);
    const ids = body && Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isInteger) : null;
    if (!ids || !ids.length) return json({ ok: false, code: 'invalid' }, 400);
    await env.DB.batch(ids.map((id, i) => env.DB.prepare('UPDATE photos SET sort = ? WHERE id = ?').bind(i + 1, id)));
    return json({ ok: true });
  }

  const del = path.match(/^\/api\/admin\/photos\/(\d+)\/delete$/);
  if (del) {
    await env.DB.prepare('DELETE FROM photos WHERE id = ?').bind(Number(del[1])).run();
    return json({ ok: true });
  }

  const upd = path.match(/^\/api\/admin\/photos\/(\d+)$/);
  if (upd) {
    const body = await request.json().catch(() => null);
    if (!body) return json({ ok: false, code: 'bad_json' }, 400);
    const sets = [], args = [];
    if (typeof body.caption === 'string') { sets.push('caption = ?'); args.push(body.caption.trim().slice(0, MAX_CAPTION)); }
    if (typeof body.visible === 'boolean') { sets.push('visible = ?'); args.push(body.visible ? 1 : 0); }
    if (!sets.length) return json({ ok: false, code: 'invalid' }, 400);
    await env.DB.prepare(`UPDATE photos SET ${sets.join(', ')} WHERE id = ?`).bind(...args, Number(upd[1])).run();
    return json({ ok: true });
  }

  return json({ ok: false, code: 'not_found' }, 404);
}

// 看檔頭判斷格式，不信任瀏覽器送來的 Content-Type
function sniff(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

function clampInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n < 20000 ? n : null;
}

function decodeCaption(v) {
  if (!v) return '';
  try { return decodeURIComponent(v).trim().slice(0, MAX_CAPTION); } catch (e) { return ''; }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
