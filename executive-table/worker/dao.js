/**
 * 大道至簡門戶（Alexchiachi/daoissimple）的「問道之鏡」與「花瓣預約」收件處。
 *
 *   POST /api/dao   公開：收一筆問道之鏡或花瓣預約（JSON），伺服端產生通關碼，存進 D1，寄通知信
 *
 * 為了不另開管理頁：直接寫進「大道至簡來信」的 letters 資料表，
 * 在 /admin 的「大道至簡來信」分頁就看得到，狀態、搜尋、CSV 匯出都沿用（見 letters.js）。
 *   ・subject  [問道之鏡] DAO-123456 意向項目   或   [花瓣預約] DAO-123456 信物名稱
 *   ・message  三題回答，或姓名與聯絡方式
 *   ・email    留空（這兩個表單不收 email，客人用 LINE 或微信回傳通關碼）
 * 通知寄到 LETTER_NOTIFY_EMAIL（預設 dadaoissimple@gmail.com）。因為沒有客人的 email，不寄確認信。
 * 通關碼由這裡產生並回傳給網頁，客人憑碼從 LINE、信箱或微信聯繫，管理頁搜尋通關碼即可對照。
 */
import { sendMail } from './mail.js';
import { json, hashIp, formatTaipei } from './util.js';
import { ensureLetterSchema } from './letters.js';

const LIMITS = { intent: 80, answer: 2000, name: 60, contact: 100, petal: 80 };
const RATE_WINDOW_MIN = 10;
const RATE_MAX = 5;
const DEFAULT_NOTIFY = 'dadaoissimple@gmail.com';

function newCode() {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return 'DAO-' + String(100000 + (n[0] % 900000));
}

function clean(d) {
  const s = (v, max) => String(v == null ? '' : v)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
  const one = (v, max) => s(v, max).replace(/\s+/g, ' ');
  return {
    type: d.type === 'petal' ? 'petal' : d.type === 'mirror' ? 'mirror' : '',
    lang: d.lang === 'zh-cn' ? 'zh-Hans' : 'zh-Hant',
    intent: one(d.intent, LIMITS.intent),
    q1: s(d.q1, LIMITS.answer), q2: s(d.q2, LIMITS.answer), q3: s(d.q3, LIMITS.answer),
    petalTitle: one(d.petalTitle, LIMITS.petal),
    name: one(d.name, LIMITS.name),
    contact: one(d.contact, LIMITS.contact)
  };
}

export async function handleDao(request, env, ctx, url) {
  if (Number(request.headers.get('Content-Length') || 0) > 32 * 1024) return json({ ok: false, code: 'too_large' }, 413);
  let data;
  try { data = await request.json(); } catch (e) { return json({ ok: false, code: 'bad_json' }, 400); }
  // 蜜罐欄位：真人看不到也不會填。回成功，不讓機器人換方式再試；不存也不寄。
  if (data && data.website) return json({ ok: true, code: newCode() });

  const f = clean(data || {});
  const missing = [];
  if (!f.type) missing.push('type');
  if (f.type === 'mirror') {
    for (const k of ['q1', 'q2', 'q3']) if (!f[k]) missing.push(k);
  } else if (f.type === 'petal') {
    for (const k of ['petalTitle', 'name', 'contact']) if (!f[k]) missing.push(k);
  }
  if (missing.length) return json({ ok: false, code: 'invalid', fields: missing }, 400);

  await ensureLetterSchema(env);
  const ipHash = await hashIp(request.headers.get('CF-Connecting-IP') || '');
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM letters WHERE ip_hash = ? AND created_at > datetime('now', ?)"
  ).bind(ipHash, `-${RATE_WINDOW_MIN} minutes`).first();
  if (recent && recent.n >= RATE_MAX) return json({ ok: false, code: 'rate_limited' }, 429);

  const code = newCode();
  const isMirror = f.type === 'mirror';
  const subject = (isMirror ? '[問道之鏡] ' : '[花瓣預約] ') + code + ' ' + (isMirror ? (f.intent || '未指定意向') : f.petalTitle);
  const message = isMirror
    ? ['一、最渴望轉化的病灶', f.q1, '', '二、未解開的最大消耗', f.q2, '', '三、對承諾的準備', f.q3].join('\n')
    : ['信物：' + f.petalTitle, '稱呼：' + f.name, '聯絡方式：' + f.contact].join('\n');

  const row = await env.DB.prepare(
    `INSERT INTO letters (created_at, name, email, subject, message, page, lang, ip_hash)
     VALUES (datetime('now'), ?, '', ?, ?, ?, ?, ?) RETURNING id, created_at`
  ).bind(isMirror ? '問道之鏡訪客' : f.name, subject, message, 'daoissimple:' + f.type, f.lang, ipHash).first();

  // 資料已經存好；寄信放到回應之後，不讓客人等
  ctx.waitUntil(notify(env, url, { id: row.id, at: formatTaipei(row.created_at), code, subject, message, f }));
  return json({ ok: true, code });
}

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function notify(env, url, n) {
  const to = env.LETTER_NOTIFY_EMAIL || DEFAULT_NOTIFY;
  const adminUrl = url.origin + '/admin#letters';
  const html = '<div style="font-family:serif;line-height:1.8;color:#2A2520;max-width:560px">'
    + '<p style="letter-spacing:2px;color:#8B6F47">Dao is simple · 大道至簡</p>'
    + '<p style="font-size:20px;margin:0">' + esc(n.code) + '</p>'
    + '<p style="color:#736C63;margin:4px 0 16px">' + esc(n.at) + (n.f.lang === 'zh-Hans' ? '・簡體頁' : '') + '</p>'
    + '<div style="border-left:2px solid #A8543A;padding-left:14px;white-space:pre-wrap">' + esc(n.message) + '</div>'
    + '<p style="color:#736C63;margin-top:20px">客人會憑通關碼從 LINE、信箱或微信聯繫，請以通關碼對照。'
    + '到 <a href="' + esc(adminUrl) + '">管理頁</a> 搜尋通關碼，處理完標記狀態。</p></div>';
  const text = [n.code + '　' + n.at, '', n.message, '', '客人會憑通關碼聯繫，請以通關碼對照。管理頁：' + adminUrl].join('\n');
  const status = await sendMail(env, {
    to,
    subject: '[大道至簡] ' + n.subject,
    html, text,
    fromName: env.LETTER_FROM_NAME || '大道至簡 · Dao is simple',
    gmail: env.LETTER_GMAIL_APP_PASSWORD ? { user: to, pass: env.LETTER_GMAIL_APP_PASSWORD } : null
  });
  await env.DB.prepare('UPDATE letters SET mail_status = ? WHERE id = ?').bind('owner ' + status, n.id).run();
}
