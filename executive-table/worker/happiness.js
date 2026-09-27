/**
 * 幸福影響力記帳本（Alexchiachi/happiness-ledger）的存入中繼。
 *
 *   POST /api/happiness                    公開：收一筆幸福紀錄，代為在 GitHub 開 Issue
 *   GET  /api/admin/happiness              管理：全部紀錄（含暫緩與待補送）
 *   POST /api/admin/happiness/<id>/retry   管理：把暫緩或待補送的那筆送去 GitHub
 *
 * 為什麼搬到這裡：原本的中繼是 Google Apps Script。GAS 的 /exec 會 302 轉址，
 * 前端只能用 mode:'no-cors' 送出 —— 拿到的是 opaque response，讀不到結果，
 * 於是不論成功失敗都顯示「已永久記錄」。Worker 有乾淨的 CORS，前端終於
 * 讀得到真實結果。另外 script.google.com 在中國大陸連不上。
 *
 * 送出之後：GitHub Issue → 該 repo 的 record-to-ledger workflow → data/ledger.json。
 * 這裡只負責把紀錄交到 Issue，不直接改帳本 —— 帳本維持單一寫入者。
 *
 * 內容準則（見該 repo 的 CONTRIBUTING.md）在這裡執行，前端的檢查一律可被繞過：
 *   ・少於 10 字            → 退回，請對方多寫一點
 *   ・含外部連結            → 收下但標記「暫緩」，不開 Issue，等人工確認
 *   ・蜜罐欄位有值          → 假裝成功，不留痕跡
 *
 * GitHub 若暫時不通（權杖過期、速率限制），紀錄會以「待補送」存進 D1 而不是
 * 消失，之後可在管理頁重送。這是整條路上唯一會遺失內容的地方，不能不接。
 *
 * 需要的設定（Cloudflare 專案 → Settings → Variables and Secrets）：
 *   HAPPINESS_GITHUB_TOKEN  Secret，fine-grained token，只授權 happiness-ledger 的 Issues 讀寫
 * 選用（wrangler.jsonc 的 vars）：
 *   HAPPINESS_REPO          預設 Alexchiachi/happiness-ledger
 */
import { json, hashIp, formatTaipei } from './util.js';

export const HAPPINESS_STATUSES = ['已存入', '暫緩', '待補送'];

const DEFAULT_REPO = 'Alexchiachi/happiness-ledger';
const LIMITS = { nickname: 40, category: 60, content: 2000 };
const MIN_CONTENT = 10;
const RATE_WINDOW_MIN = 10;
const RATE_MAX = 5;

/* ---------------- 公開：存入一筆 ---------------- */

export async function handleHappiness(request, env, ctx, url) {
  if (Number(request.headers.get('Content-Length') || 0) > 16 * 1024) {
    return json({ ok: false, code: 'too_large' }, 413);
  }
  let data;
  try { data = await request.json(); } catch (e) { return json({ ok: false, code: 'bad_json' }, 400); }

  // 蜜罐欄位：真人看不到也不會填，有值就是機器人。回成功，不讓它換方式再試。
  if (data && data.honeypot) return json({ ok: true, status: '已存入' });

  const f = clean(data || {});
  const missing = [];
  if (!f.nickname) missing.push('nickname');
  if (!f.category) missing.push('category');
  if (!f.content) missing.push('content');
  if (missing.length) return json({ ok: false, code: 'invalid', fields: missing }, 400);

  // 字數：CONTRIBUTING 的「不予收錄的雜訊」之一。退回而不是暫緩 ——
  // 對方補幾個字就能成立，沒有理由讓他等人工。
  if ([...f.content].length < MIN_CONTENT) {
    return json({ ok: false, code: 'too_short', min: MIN_CONTENT }, 400);
  }

  await ensureHappinessSchema(env);

  const ipHash = await hashIp(request.headers.get('CF-Connecting-IP') || '');
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM happiness WHERE ip_hash = ? AND created_at > datetime('now', ?)"
  ).bind(ipHash, `-${RATE_WINDOW_MIN} minutes`).first();
  if (recent && recent.n >= RATE_MAX) return json({ ok: false, code: 'rate_limited' }, 429);

  // 含外部連結：收下但不開 Issue，等人工確認。不直接退回 ——
  // 對方可能只是引用了一篇文章，那不該被當成廣告丟掉。
  const held = hasLink(f.content) || hasLink(f.nickname);

  const row = await env.DB.prepare(
    `INSERT INTO happiness (created_at, nickname, category, content, source_page, status, ip_hash)
     VALUES (datetime('now'), ?, ?, ?, ?, ?, ?) RETURNING id, created_at`
  ).bind(f.nickname, f.category, f.content, f.source, held ? '暫緩' : '待補送', ipHash).first();

  if (held) {
    return json({ ok: true, status: '暫緩', id: row.id });
  }

  const result = await createIssue(env, f, row.created_at);
  if (!result.ok) {
    // 紀錄已經存在 D1，狀態留在「待補送」，可在管理頁重送。
    console.error('happiness github failed', result.status, result.detail);
    return json({ ok: false, code: 'github_unavailable', status: '待補送', id: row.id }, 502);
  }

  await env.DB.prepare('UPDATE happiness SET status = ?, issue_number = ? WHERE id = ?')
    .bind('已存入', result.number, row.id).run();
  return json({ ok: true, status: '已存入', id: row.id, number: result.number });
}

function clean(d) {
  const s = (v, max) => String(v == null ? '' : v)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
  return {
    nickname: s(d.nickname, LIMITS.nickname),
    category: s(d.category, LIMITS.category),
    content: s(d.content, LIMITS.content),
    source: s(d.source, 200)
  };
}

// 只看有沒有外部網址。內文允許換行，所以不能只檢查開頭。
function hasLink(text) {
  return /https?:\/\/|www\.[a-z0-9-]+\.[a-z]{2,}/i.test(String(text || ''));
}

/* ---------------- 送去 GitHub ---------------- */

async function createIssue(env, f, createdAtUtc) {
  const token = String(env.HAPPINESS_GITHUB_TOKEN || '');
  if (!token) return { ok: false, status: 0, detail: 'HAPPINESS_GITHUB_TOKEN 未設定' };
  const repo = String(env.HAPPINESS_REPO || DEFAULT_REPO);

  // 這些 ### 小標題是給該 repo 的 update-ledger.js 解析用的，不要改動字樣。
  // 「原始存入時間」讓帳本記的是對方按下送出的時刻，而不是 Issue 建立的時間。
  const body =
    `### 您的稱呼 / 筆名\n\n${f.nickname}\n\n` +
    `### 幸福微類型\n\n${f.category}\n\n` +
    `### 幸福感知內容\n\n${f.content}\n\n` +
    `### 原始存入時間\n\n${new Date(createdAtUtc.replace(' ', 'T') + 'Z').toISOString()}`;

  let res;
  try {
    res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        // fine-grained token 必須用 Bearer；用舊的 'token ' 會拿到 401
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'happiness-ledger-worker'
      },
      body: JSON.stringify({
        title: `【幸福存入】: ${f.nickname} 的微光覺察`,
        labels: ['happiness-record'],
        body
      })
    });
  } catch (err) {
    return { ok: false, status: 0, detail: String(err) };
  }

  const text = await res.text();
  if (!res.ok) return { ok: false, status: res.status, detail: text.slice(0, 300) };
  try {
    return { ok: true, number: JSON.parse(text).number };
  } catch (e) {
    return { ok: false, status: res.status, detail: 'GitHub 回應不是 JSON' };
  }
}

/* ---------------- 管理 ---------------- */

export async function handleAdminHappiness(request, env, url, path) {
  if (path === '/api/admin/happiness' && request.method === 'GET') {
    await ensureHappinessSchema(env);
    const { results } = await env.DB.prepare(
      'SELECT id, created_at, nickname, category, content, source_page, status, issue_number FROM happiness ORDER BY id DESC LIMIT 1000'
    ).all();
    return json({
      ok: true,
      happiness: results.map(r => ({ ...r, created_at_taipei: formatTaipei(r.created_at) }))
    });
  }

  const m = path.match(/^\/api\/admin\/happiness\/(\d+)\/retry$/);
  if (m && request.method === 'POST') {
    // 只接受同源請求，避免被別的網站借用登入狀態
    if (request.headers.get('Origin') !== url.origin) return json({ ok: false, code: 'bad_origin' }, 403);
    await ensureHappinessSchema(env);
    const row = await env.DB.prepare('SELECT * FROM happiness WHERE id = ?').bind(Number(m[1])).first();
    if (!row) return json({ ok: false, code: 'not_found' }, 404);
    if (row.status === '已存入') return json({ ok: false, code: 'already_sent', number: row.issue_number }, 409);

    const result = await createIssue(env, {
      nickname: row.nickname, category: row.category, content: row.content
    }, row.created_at);
    if (!result.ok) return json({ ok: false, code: 'github_unavailable', detail: result.detail }, 502);

    await env.DB.prepare('UPDATE happiness SET status = ?, issue_number = ? WHERE id = ?')
      .bind('已存入', result.number, row.id).run();
    return json({ ok: true, number: result.number });
  }

  return null;
}

/* ---------------- 資料表 ---------------- */

let schemaReady = null;
export function ensureHappinessSchema(env) {
  if (!schemaReady) {
    schemaReady = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS happiness (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        nickname TEXT NOT NULL,
        category TEXT NOT NULL,
        content TEXT NOT NULL,
        source_page TEXT,
        status TEXT NOT NULL DEFAULT '待補送',
        issue_number INTEGER,
        ip_hash TEXT
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS happiness_ip_time ON happiness (ip_hash, created_at)')
    ]).catch(err => { schemaReady = null; throw err; });
  }
  return schemaReady;
}
