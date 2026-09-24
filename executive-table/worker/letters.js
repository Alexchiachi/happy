/**
 * 大道至簡品牌站「連繫」表單（connect.html）的收信處。取代原本的 Google Apps Script。
 *
 *   POST /api/letter                        公開：收一封來信（FormData 或 JSON），存進 D1，寄兩封信
 *   GET  /api/admin/letters                 管理：全部來信
 *   POST /api/admin/letters/<id>/status     管理：改處理狀態
 *   GET  /api/admin/letters.csv             管理：匯出 CSV
 *
 * 寄信：
 *   ・新來信通知 → LETTER_NOTIFY_EMAIL（預設 dadaoissimple@gmail.com），回覆鍵直接回給寫信的人
 *   ・收信確認   → 寫信的人，回覆會回到 LETTER_NOTIFY_EMAIL
 * 預設用幸福餐桌那組 Gmail 寄出（寄件人名稱「大道至簡 · Dao is simple」）。
 * 若另外設定 Secret LETTER_GMAIL_APP_PASSWORD（dadaoissimple@gmail.com 的應用程式密碼），
 * 就改由 dadaoissimple@gmail.com 本身寄出。
 */
import { sendMail } from './mail.js';
import { json, hashIp, formatTaipei } from './util.js';

export const LETTER_STATUSES = ['新進', '已回覆', '已結案'];
const LIMITS = { name: 60, email: 120, subject: 100, message: 4000, page: 200 };
const RATE_WINDOW_MIN = 10;
const RATE_MAX = 5;
const DEFAULT_NOTIFY = 'dadaoissimple@gmail.com';
const DEFAULT_SITE = 'https://alexchiachi.github.io/happy/';

/* ---------------- 公開：收信 ---------------- */

export async function handleLetter(request, env, ctx, url) {
  if (Number(request.headers.get('Content-Length') || 0) > 32 * 1024) return json({ ok: false, code: 'too_large' }, 413);
  let data;
  try {
    const type = request.headers.get('Content-Type') || '';
    data = type.includes('application/json')
      ? await request.json()
      : Object.fromEntries(await request.formData());
  } catch (e) {
    return json({ ok: false, code: 'bad_body' }, 400);
  }
  // 蜜罐欄位：真人看不到也不會填，有值就是機器人。回成功，不讓它換方式再試。
  if (data && data.website) return json({ ok: true });

  const f = clean(data || {});
  const missing = [];
  if (!f.name) missing.push('name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) missing.push('email');
  if (!f.message) missing.push('message');
  if (missing.length) return json({ ok: false, code: 'invalid', fields: missing }, 400);

  await ensureLetterSchema(env);
  const ipHash = await hashIp(request.headers.get('CF-Connecting-IP') || '');
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM letters WHERE ip_hash = ? AND created_at > datetime('now', ?)"
  ).bind(ipHash, `-${RATE_WINDOW_MIN} minutes`).first();
  if (recent && recent.n >= RATE_MAX) return json({ ok: false, code: 'rate_limited' }, 429);

  const row = await env.DB.prepare(
    `INSERT INTO letters (created_at, name, email, subject, message, page, lang, ip_hash)
     VALUES (datetime('now'), ?, ?, ?, ?, ?, ?, ?) RETURNING id, created_at`
  ).bind(f.name, f.email, f.subject, f.message, f.page, f.lang, ipHash).first();

  f.id = row.id;
  f.submittedAt = formatTaipei(row.created_at);
  f.adminUrl = url.origin + '/admin#letters';
  // 資料已經存好；寄信放到回應之後，不讓寫信的人等
  ctx.waitUntil(sendLetterMails(env, f));
  return json({ ok: true });
}

function clean(d) {
  const s = (v, max) => String(v == null ? '' : v)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
  return {
    name: s(d.name, LIMITS.name),
    email: s(d.email, LIMITS.email).toLowerCase(),
    subject: s(d.subject, LIMITS.subject),
    message: s(d.message, LIMITS.message),
    page: s(d.page, LIMITS.page),
    lang: d.lang === 'zh-Hans' ? 'zh-Hans' : 'zh-Hant'
  };
}

async function sendLetterMails(env, f) {
  const notify = env.LETTER_NOTIFY_EMAIL || DEFAULT_NOTIFY;
  const site = (env.BRAND_SITE_URL || DEFAULT_SITE).replace(/\/?$/, '/');
  const common = {
    fromName: env.LETTER_FROM_NAME || '大道至簡 · Dao is simple',
    gmail: env.LETTER_GMAIL_APP_PASSWORD ? { user: notify, pass: env.LETTER_GMAIL_APP_PASSWORD } : null
  };
  const results = [];
  results.push('owner ' + await sendMail(env, {
    ...common,
    to: notify,
    replyTo: f.email,
    subject: '[大道至簡] 新的來信 — ' + (f.subject || f.name),
    html: ownerHtml(f),
    text: ownerText(f)
  }));
  const t = f.lang === 'zh-Hans' ? CN : TW;
  const home = site + (f.lang === 'zh-Hans' ? 'zh-cn/' : '');
  results.push('guest ' + await sendMail(env, {
    ...common,
    to: f.email,
    replyTo: notify,
    subject: t.subject,
    html: guestHtml(f, t, home),
    text: guestText(f, t, home)
  }));
  await env.DB.prepare('UPDATE letters SET mail_status = ? WHERE id = ?').bind(results.join('; '), f.id).run();
}

/* ---------------- 信件 ---------------- */

const C = { paper: '#FAF6EF', card: '#FFFDF8', ink: '#2A2520', soft: '#4A423A', mist: '#8A8175', line: '#E4DCCD', tea: '#8B6F47', moss: '#5C7A5A' };
const SERIF = '"Noto Serif TC","Songti TC","PMingLiU",serif';
const LATIN = '"Cormorant Garamond",Georgia,serif';

const TW = {
  subject: '收到您的來信了｜大道至簡',
  preheader: '我們會在三個工作日內親自回覆。',
  hello: n => n + '，您的信我們收到了。',
  body: '謝謝您寫信來。我們會在三個工作日內親自回覆；想補充什麼，直接回覆這封信就好。',
  yours: '您寫的內容',
  topic: '主題',
  sign: '簡家旗｜大道至簡',
  motto: '做幸福的事，讓幸福變成有價值的事。',
  visit: '回到大道至簡'
};
const CN = {
  subject: '收到您的来信了｜大道至简',
  preheader: '我们会在三个工作日内亲自回复。',
  hello: n => n + '，您的信我们收到了。',
  body: '谢谢您写信来。我们会在三个工作日内亲自回复；想补充什么，直接回复这封信就好。',
  yours: '您写的内容',
  topic: '主题',
  sign: '简家旗｜大道至简',
  motto: '做幸福的事，让幸福变成有价值的事。',
  visit: '回到大道至简'
};

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const para = s => esc(s).replace(/\r?\n/g, '<br>');

function shell(lang, preheader, inner, footer) {
  return '<!DOCTYPE html><html lang="' + lang + '"><head><meta charset="UTF-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light">'
    + '<title>大道至簡</title></head>'
    + '<body style="margin:0;padding:0;background:' + C.paper + ';">'
    + '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">' + esc(preheader) + '</div>'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + C.paper + ';">'
    + '<tr><td align="center" style="padding:36px 12px;">'
    + '<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background:' + C.card + ';border:1px solid ' + C.line + ';">'
    + '<tr><td style="padding:34px 40px 0;font-family:' + LATIN + ';font-size:13px;letter-spacing:3px;color:' + C.tea + ';text-transform:uppercase;">Dao is simple · 大道至簡</td></tr>'
    + inner
    + '</table>'
    + '<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">'
    + '<tr><td align="center" style="padding:20px 24px 0;font-family:' + SERIF + ';font-size:12px;line-height:1.9;color:' + C.mist + ';letter-spacing:1px;">' + footer + '</td></tr>'
    + '</table></td></tr></table></body></html>';
}

function quote(label, subject, message) {
  return '<tr><td style="padding:0 40px;">'
    + '<div style="font-family:' + SERIF + ';font-size:12px;letter-spacing:2px;color:' + C.mist + ';margin-bottom:8px;">' + esc(label) + '</div>'
    + '<div style="border-left:2px solid ' + C.tea + ';padding:4px 0 4px 16px;font-family:' + SERIF + ';font-size:15px;line-height:1.9;color:' + C.soft + ';">'
    + (subject ? '<div style="color:' + C.ink + ';margin-bottom:6px;">' + esc(subject) + '</div>' : '')
    + para(message) + '</div></td></tr>';
}

function guestHtml(f, t, home) {
  const inner = '<tr><td style="padding:18px 40px 0;font-family:' + SERIF + ';font-size:22px;line-height:1.6;color:' + C.ink + ';letter-spacing:1px;">' + esc(t.hello(f.name)) + '</td></tr>'
    + '<tr><td style="padding:14px 40px 26px;font-family:' + SERIF + ';font-size:15px;line-height:1.9;color:' + C.soft + ';">' + esc(t.body) + '</td></tr>'
    + quote(t.yours, f.subject, f.message)
    + '<tr><td style="padding:30px 40px 36px;font-family:' + SERIF + ';font-size:15px;line-height:1.8;color:' + C.ink + ';letter-spacing:2px;">'
    + '<div style="height:1px;background:' + C.line + ';line-height:1px;font-size:1px;margin-bottom:22px;">&nbsp;</div>'
    + esc(t.sign) + '</td></tr>';
  const footer = esc(t.motto) + '<br><a href="' + esc(home) + '" style="color:' + C.moss + ';text-decoration:none;">' + esc(t.visit) + ' →</a>';
  return shell(f.lang, t.preheader, inner, footer);
}

function guestText(f, t, home) {
  return [
    t.hello(f.name), '', t.body, '',
    '— ' + t.yours + ' —',
    f.subject ? t.topic + '：' + f.subject : '',
    f.message, '',
    t.sign, t.motto, home
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
}

function ownerHtml(f) {
  const row = (k, v) => '<tr><td style="padding:3px 16px 3px 0;color:' + C.mist + ';white-space:nowrap;vertical-align:top;">' + k + '</td><td style="padding:3px 0;color:' + C.ink + ';">' + v + '</td></tr>';
  const inner = '<tr><td style="padding:18px 40px 4px;font-family:' + SERIF + ';font-size:22px;line-height:1.6;color:' + C.ink + ';letter-spacing:1px;">' + esc(f.name) + ' 寫了一封信來</td></tr>'
    + '<tr><td style="padding:10px 40px 24px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:' + SERIF + ';font-size:14px;line-height:1.7;">'
    + row('信箱', '<a href="mailto:' + esc(f.email) + '" style="color:' + C.moss + ';">' + esc(f.email) + '</a>')
    + row('主題', esc(f.subject || '（未填）'))
    + row('時間', esc(f.submittedAt) + (f.lang === 'zh-Hans' ? '・簡體頁' : ''))
    + (f.page ? row('頁面', esc(f.page)) : '')
    + '</table></td></tr>'
    + quote('內容', '', f.message)
    + '<tr><td style="padding:28px 40px 36px;font-family:' + SERIF + ';font-size:14px;line-height:1.8;color:' + C.soft + ';">'
    + '直接按「回覆」就會寄到對方的信箱。處理完可到 <a href="' + esc(f.adminUrl) + '" style="color:' + C.moss + ';">管理頁</a> 標記「已回覆」。</td></tr>';
  return shell('zh-Hant', f.name + '：' + f.message.slice(0, 60), inner, '#' + f.id + ' · 已存進來信紀錄；對方同時收到一封收信確認。');
}

function ownerText(f) {
  return [
    '稱呼：' + f.name,
    '信箱：' + f.email,
    '主題：' + (f.subject || '（未填）'),
    '時間：' + f.submittedAt,
    f.page ? '頁面：' + f.page : '',
    '',
    f.message,
    '',
    '— 直接回覆這封信就會回到對方的信箱。管理頁：' + f.adminUrl
  ].join('\n');
}

/* ---------------- 管理 ---------------- */

export async function handleAdminLetters(request, env, url, path) {
  if (!path.startsWith('/api/admin/letters')) return null;
  await ensureLetterSchema(env);

  if (path === '/api/admin/letters' && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT id, created_at, name, email, subject, message, page, lang, status, mail_status FROM letters ORDER BY id DESC LIMIT 1000'
    ).all();
    return json({ ok: true, letters: results });
  }

  if (path === '/api/admin/letters.csv' && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM letters ORDER BY id').all();
    return new Response(toCsv(results), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="daoissimple-letters.csv"',
        'Cache-Control': 'no-store'
      }
    });
  }

  const m = path.match(/^\/api\/admin\/letters\/(\d+)\/status$/);
  if (m && request.method === 'POST') {
    // 只接受同源請求，避免被別的網站借用登入狀態改資料
    if (request.headers.get('Origin') !== url.origin) return json({ ok: false, code: 'bad_origin' }, 403);
    let body;
    try { body = await request.json(); } catch (e) { return json({ ok: false, code: 'bad_json' }, 400); }
    if (!LETTER_STATUSES.includes(body.status)) return json({ ok: false, code: 'invalid_status' }, 400);
    await env.DB.prepare('UPDATE letters SET status = ? WHERE id = ?').bind(body.status, Number(m[1])).run();
    return json({ ok: true });
  }
  return json({ ok: false, code: 'not_found' }, 404);
}

function toCsv(rows) {
  const cols = [
    ['id', '編號'], ['created_at', '送出時間'], ['name', '稱呼'], ['email', 'Email'], ['subject', '主題'],
    ['message', '內容'], ['page', '來源頁面'], ['lang', '語言'], ['status', '處理狀態'], ['mail_status', '寄信結果']
  ];
  const cell = (v) => {
    let t = v == null ? '' : String(v);
    if (/^[=+\-@]/.test(t)) t = "'" + t; // 防止試算表公式注入
    return '"' + t.replace(/"/g, '""') + '"';
  };
  const lines = [cols.map(c => cell(c[1])).join(',')];
  for (const r of rows) {
    lines.push(cols.map(([k]) => cell(k === 'created_at' ? formatTaipei(r[k]) : r[k])).join(','));
  }
  return '﻿' + lines.join('\r\n'); // BOM 讓 Excel 正確顯示中文
}

let ready = null;
export function ensureLetterSchema(env) {
  if (!ready) {
    ready = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS letters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        subject TEXT,
        message TEXT NOT NULL,
        page TEXT,
        lang TEXT,
        status TEXT NOT NULL DEFAULT '新進',
        ip_hash TEXT,
        mail_status TEXT
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS letters_ip_time ON letters (ip_hash, created_at)')
    ]).catch(err => { ready = null; throw err; });
  }
  return ready;
}
