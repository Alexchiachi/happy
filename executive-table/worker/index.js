/**
 * 幸福餐桌｜課程網站的 Cloudflare Worker
 *
 * 網站本身是靜態檔案（executive-table/），只有下面這些路徑會先進到這支程式
 * （wrangler.jsonc 的 run_worker_first）：
 *
 *   POST /api/inquiry            預約表單：存進 D1、寄兩封 HTML 信（Gmail，選用 Resend）
 *   GET  /admin                  管理頁（管理頁密碼；選用 Cloudflare Access）
 *   GET  /api/admin/inquiries    管理頁資料
 *   POST /api/admin/inquiries/:id/status   改處理狀態
 *   GET  /api/admin/export.csv   匯出 CSV（Excel 可直接開）
 *   GET  /api/photos、/photos/*  幻燈片照片（管理頁上傳；見 photos.js）
 *   POST /api/letter             大道至簡品牌站「連繫」表單（見 letters.js）
 *
 * 需要的設定（Cloudflare 專案 → Settings → Variables and Secrets）：
 *   NOTIFY_EMAIL         Secret，你的 Gmail：新預約通知寄到這裡，也是寄件人
 *   GMAIL_APP_PASSWORD   Secret，Gmail 應用程式密碼（用 Gmail 寄信，最簡單）
 *   ADMIN_PASSWORD       Secret，管理頁密碼（至少 12 個字元）
 * 選用（進階）：
 *   RESEND_API_KEY       改用 Resend 寄信（需驗證網域；有設 GMAIL_APP_PASSWORD 時優先用 Gmail）
 *   ACCESS_TEAM_DOMAIN、ACCESS_AUD   改用 Cloudflare Access 保護管理頁（有設時優先於密碼）
 * 寄件人名稱與允許跨站送出的網域寫在 wrangler.jsonc 的 vars。
 */
import { PLAN_LABEL, configure, guestEmailHtml, guestEmailText, ownerEmailHtml, ownerEmailText } from './emails.js';
import { verifyAccess } from './access.js';
import { sendMail } from './mail.js';
import { json, hashIp, formatTaipei } from './util.js';
import { handleLetter, handleAdminLetters, LETTER_STATUSES } from './letters.js';
import { listPublic, servePhoto, handleAdminPhotos } from './photos.js';
import { adminPage, adminSetupPage } from './admin.js';

const STATUSES = ['新進', '已聯繫', '已安排', '已完成', '不適合'];
const LIMITS = { name: 60, title: 60, company: 100, email: 120, phone: 40, heads: 20, message: 2000, source: 200 };
const RATE_WINDOW_MIN = 10;
const RATE_MAX = 5;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path === '/api/inquiry') {
        if (request.method === 'OPTIONS') return cors(request, env, new Response(null, { status: 204 }));
        if (request.method !== 'POST') return json({ ok: false, code: 'method_not_allowed' }, 405);
        return cors(request, env, await handleInquiry(request, env, ctx, url));
      }
      if (path === '/api/letter') {
        if (request.method === 'OPTIONS') return cors(request, env, new Response(null, { status: 204 }));
        if (request.method !== 'POST') return json({ ok: false, code: 'method_not_allowed' }, 405);
        return cors(request, env, await handleLetter(request, env, ctx, url));
      }
      if (path === '/api/photos') {
        if (request.method === 'OPTIONS') return cors(request, env, new Response(null, { status: 204 }));
        if (request.method !== 'GET') return json({ ok: false, code: 'method_not_allowed' }, 405);
        return cors(request, env, await listPublic(env));
      }
      if (path.startsWith('/photos/')) {
        return (await servePhoto(request, env, ctx, path)) || env.ASSETS.fetch(request);
      }
      if (path === '/admin' || path === '/admin/' || path.startsWith('/api/admin/')) {
        return await handleAdmin(request, env, url, path);
      }
      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error('unhandled', err && err.stack || err);
      return json({ ok: false, code: 'server_error' }, 500);
    }
  }
};

/* ---------------- 預約表單 ---------------- */

async function handleInquiry(request, env, ctx, url) {
  let data;
  try {
    data = JSON.parse(await request.text());
  } catch (e) {
    return json({ ok: false, code: 'bad_json' }, 400);
  }
  // 蜜罐欄位：真人看不到，機器人會填。回成功，不讓機器人知道被擋。
  if (data && data.website) return json({ ok: true });

  const f = clean(data || {});
  const missing = [];
  if (!f.name) missing.push('name');
  if (!f.company) missing.push('company');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) missing.push('email');
  if (missing.length) return json({ ok: false, code: 'invalid', fields: missing }, 400);

  await ensureSchema(env);
  const ipHash = await hashIp(request.headers.get('CF-Connecting-IP') || '');
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM inquiries WHERE ip_hash = ? AND created_at > datetime('now', ?)"
  ).bind(ipHash, `-${RATE_WINDOW_MIN} minutes`).first();
  if (recent && recent.n >= RATE_MAX) return json({ ok: false, code: 'rate_limited' }, 429);

  const row = await env.DB.prepare(
    `INSERT INTO inquiries (created_at, name, title, company, email, phone, plan, heads, message, source, lang, ip_hash)
     VALUES (datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, created_at`
  ).bind(f.name, f.title, f.company, f.email, f.phone, f.plan, f.heads, f.message, f.source, f.lang, ipHash).first();

  const site = url.origin + '/';
  f.id = row.id;
  f.submittedAt = formatTaipei(row.created_at);
  f.adminUrl = site + 'admin';
  // 資料已經存好；寄信放到回應之後，不讓預約者等 Resend
  ctx.waitUntil(sendBoth(env, site, f));
  return json({ ok: true });
}

function clean(d) {
  const s = (v, max) => String(v == null ? '' : v)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
  const plan = s(d.plan, 20);
  return {
    name: s(d.name, LIMITS.name),
    title: s(d.title, LIMITS.title),
    company: s(d.company, LIMITS.company),
    email: s(d.email, LIMITS.email).toLowerCase(),
    phone: s(d.phone, LIMITS.phone),
    plan: PLAN_LABEL[plan] ? plan : 'taster',
    heads: s(d.heads, LIMITS.heads),
    message: s(d.message, LIMITS.message),
    source: s(d.source, LIMITS.source),
    lang: d.lang === 'zh-Hans' ? 'zh-Hans' : 'zh-Hant'
  };
}

async function sendBoth(env, site, f) {
  configure(site);
  const label = PLAN_LABEL[f.plan] || '';
  const results = [];
  if (env.NOTIFY_EMAIL) {
    results.push('owner ' + await sendMail(env, {
      to: env.NOTIFY_EMAIL,
      replyTo: f.email,
      subject: (f.plan === 'notify' ? '日期通知登記｜' : '新預約｜') + f.name + '・' + f.company + '（' + label + '）',
      html: ownerEmailHtml(f),
      text: ownerEmailText(f)
    }));
  } else {
    results.push('owner skipped: NOTIFY_EMAIL not set');
  }
  results.push('guest ' + await sendMail(env, {
    to: f.email,
    replyTo: env.NOTIFY_EMAIL,
    subject: f.plan === 'notify' ? '已登記首期日期通知｜幸福餐桌' : '已收到你的預約意向｜幸福餐桌',
    html: guestEmailHtml(f),
    text: guestEmailText(f)
  }));
  await env.DB.prepare('UPDATE inquiries SET mail_status = ? WHERE id = ?').bind(results.join('; '), f.id).run();
}

/* ---------------- 管理頁 ---------------- */

async function handleAdmin(request, env, url, path) {
  const who = await adminIdentity(request, env);
  if (who.error === 'not_configured') {
    return path.startsWith('/api/')
      ? json({ ok: false, code: 'admin_not_configured' }, 503)
      : html(adminSetupPage(), 503);
  }
  if (who.error === 'password') {
    // 瀏覽器會跳出帳號密碼視窗；帳號隨意，密碼是 ADMIN_PASSWORD
    return new Response('需要管理頁密碼', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="executive-table admin", charset="UTF-8"', 'Cache-Control': 'no-store' }
    });
  }
  if (who.error) return json({ ok: false, code: 'unauthorized' }, 401);

  await ensureSchema(env);
  if (path === '/admin' || path === '/admin/') return html(adminPage(who.email, STATUSES, PLAN_LABEL, LETTER_STATUSES));

  const letterRes = await handleAdminLetters(request, env, url, path);
  if (letterRes) return letterRes;

  const photoRes = await handleAdminPhotos(request, env, url, path);
  if (photoRes) return photoRes;

  if (path === '/api/admin/inquiries' && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT id, created_at, name, title, company, email, phone, plan, heads, message, source, lang, status, mail_status FROM inquiries ORDER BY id DESC LIMIT 1000'
    ).all();
    return json({ ok: true, inquiries: results });
  }

  const m = path.match(/^\/api\/admin\/inquiries\/(\d+)\/status$/);
  if (m && request.method === 'POST') {
    // 只接受同源請求，避免被別的網站借用登入狀態改資料
    if (request.headers.get('Origin') !== url.origin) return json({ ok: false, code: 'bad_origin' }, 403);
    let body;
    try { body = await request.json(); } catch (e) { return json({ ok: false, code: 'bad_json' }, 400); }
    if (!STATUSES.includes(body.status)) return json({ ok: false, code: 'invalid_status' }, 400);
    await env.DB.prepare('UPDATE inquiries SET status = ? WHERE id = ?').bind(body.status, Number(m[1])).run();
    return json({ ok: true });
  }

  if (path === '/api/admin/export.csv' && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM inquiries ORDER BY id').all();
    return new Response(toCsv(results), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="executive-table-inquiries.csv"',
        'Cache-Control': 'no-store'
      }
    });
  }
  return json({ ok: false, code: 'not_found' }, 404);
}

function toCsv(rows) {
  const cols = [
    ['id', '編號'], ['created_at', '送出時間'], ['name', '姓名'], ['title', '職稱'], ['company', '公司'],
    ['email', 'Email'], ['phone', '電話'], ['plan', '方案'], ['heads', '人數'], ['message', '備註'],
    ['source', '來源頁面'], ['lang', '語言'], ['status', '處理狀態'], ['mail_status', '寄信結果']
  ];
  const cell = (v) => {
    let t = v == null ? '' : String(v);
    if (/^[=+\-@]/.test(t)) t = "'" + t; // 防止試算表公式注入
    return '"' + t.replace(/"/g, '""') + '"';
  };
  const lines = [cols.map(c => cell(c[1])).join(',')];
  for (const r of rows) {
    lines.push(cols.map(([k]) => {
      if (k === 'plan') return cell(PLAN_LABEL[r.plan] || r.plan);
      if (k === 'created_at') return cell(formatTaipei(r.created_at));
      return cell(r[k]);
    }).join(','));
  }
  return '﻿' + lines.join('\r\n'); // BOM 讓 Excel 正確顯示中文
}

// 管理頁登入：有設 Cloudflare Access 就用 Access；否則用 ADMIN_PASSWORD（瀏覽器內建的密碼視窗）
async function adminIdentity(request, env) {
  if (env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD) return verifyAccess(request, env);
  const pw = String(env.ADMIN_PASSWORD || '');
  if (pw.length < 12) return { error: 'not_configured' };
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Basic ')) return { error: 'password' };
  let given = '';
  try { given = new TextDecoder().decode(Uint8Array.from(atob(auth.slice(6)), c => c.charCodeAt(0))); } catch (e) { return { error: 'password' }; }
  const password = given.slice(given.indexOf(':') + 1);
  return (await sameSecret(password, pw)) ? { email: '管理者' } : { error: 'password' };
}

// 比對雜湊值，避免逐字比對洩漏密碼長度與內容
async function sameSecret(a, b) {
  const h = async s => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [x, y] = await Promise.all([h(a), h(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/* ---------------- 共用 ---------------- */

let schemaReady = null;
function ensureSchema(env) {
  if (!schemaReady) {
    schemaReady = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS inquiries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        name TEXT NOT NULL,
        title TEXT,
        company TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        plan TEXT NOT NULL,
        heads TEXT,
        message TEXT,
        source TEXT,
        lang TEXT,
        status TEXT NOT NULL DEFAULT '新進',
        ip_hash TEXT,
        mail_status TEXT
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS inquiries_ip_time ON inquiries (ip_hash, created_at)')
    ]).catch(err => { schemaReady = null; throw err; });
  }
  return schemaReady;
}

function cors(request, env, response) {
  const origin = request.headers.get('Origin');
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) {
    const r = new Response(response.body, response);
    r.headers.set('Access-Control-Allow-Origin', origin);
    r.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    r.headers.set('Access-Control-Allow-Headers', 'Content-Type');
    r.headers.set('Vary', 'Origin');
    return r;
  }
  return response;
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer'
    }
  });
}
