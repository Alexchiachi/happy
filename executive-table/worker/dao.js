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

// 保存期限：自送出日起算，期滿由每日排程自動刪除（見 purgeExpiredDao 與 wrangler.jsonc 的 triggers）。
// 隱私權政策（privacy.html 第五節）對外承諾「兩年」，改這個數字時兩邊要一起改。
export const DAO_RETENTION_DAYS = 730;
const DAO_PAGES = ['daoissimple:mirror', 'daoissimple:petal'];
const PURGE_BATCH = 500;
const PURGE_MAX_ROUNDS = 10;

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

  // 資料已經存好。寄信在回應前等結果（最多約 25 秒），失敗會重試一次，
  // 讓網頁能如實告訴客人「通知信有沒有寄出」，而不是只因為存檔成功就說已送達。
  // 沒寄出時資料仍在 /admin「大道至簡來信」，mail_status 欄會寫明原因。
  const mailed = await notify(env, url, { id: row.id, at: formatTaipei(row.created_at), code, subject, message, f });
  return json({ ok: true, code, mailed });
}

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// SMTP 連線沒有內建逾時，卡住時會一直等；包一層逾時，讓重試與回應都不被拖住
function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise(resolve => setTimeout(() => resolve('failed: timeout'), ms))]);
}

// 回傳 true 代表通知信確實寄出；寄信結果（含重試）寫進 letters.mail_status 供管理頁查看
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
  const msg = {
    to,
    subject: '[大道至簡] ' + n.subject,
    html, text,
    fromName: env.LETTER_FROM_NAME || '大道至簡 · Dao is simple',
    gmail: env.LETTER_GMAIL_APP_PASSWORD ? { user: to, pass: env.LETTER_GMAIL_APP_PASSWORD } : null
  };

  let status = await withTimeout(sendMail(env, msg), 12000);
  const log = ['owner ' + status];
  if (String(status).startsWith('failed')) {
    status = await withTimeout(sendMail(env, msg), 12000);
    log.push('retry ' + status);
  }
  try {
    await env.DB.prepare('UPDATE letters SET mail_status = ? WHERE id = ?').bind(log.join('; ').slice(0, 300), n.id).run();
  } catch (e) { /* 狀態欄寫不進去不影響回應 */ }
  return status === 'sent';
}

/**
 * 每日排程：刪除超過保存期限的問道之鏡與花瓣預約。
 * 只動 page 為 daoissimple:mirror / daoissimple:petal 的列；一般來信與其他表單的資料不受影響。
 * 分批刪除（每批 PURGE_BATCH 列），避免單次語句過大。回傳這次刪掉的總列數，也寫進 log。
 * 注意：寄到主理人信箱的通知信副本不在這裡，信箱是主理人自己的信件，見隱私權政策說明。
 */
export async function purgeExpiredDao(env) {
  await ensureLetterSchema(env);
  const marks = DAO_PAGES.map(() => '?').join(', ');
  const cutoff = `-${DAO_RETENTION_DAYS} days`;
  let total = 0;
  for (let i = 0; i < PURGE_MAX_ROUNDS; i++) {
    const res = await env.DB.prepare(
      `DELETE FROM letters WHERE id IN (
         SELECT id FROM letters WHERE page IN (${marks}) AND created_at < datetime('now', ?) LIMIT ${PURGE_BATCH}
       )`
    ).bind(...DAO_PAGES, cutoff).run();
    const n = (res && res.meta && res.meta.changes) || 0;
    total += n;
    if (n < PURGE_BATCH) break;
  }
  console.log(`dao purge: deleted ${total} row(s) older than ${DAO_RETENTION_DAYS} days`);
  return total;
}
