/**
 * 雲南安寧幸福之家（大道至簡品牌站 anning/）的入住預約。
 *
 *   POST /api/stay                         公開：收一筆預約（JSON），依 anning/stay.json 重算金額，存進 D1，寄信
 *   GET  /api/admin/stays                  管理：全部預約
 *   POST /api/admin/stays/<id>/status      管理：改狀態（待確認 → 已確認 → 已付款 → 已完成，或取消）；
 *                                          改成已確認時填入住日期與金額，寄付款資訊給客人；改成已付款時寄收款確認
 *   GET  /api/admin/stays.csv              管理：匯出 CSV
 *
 * 旅居方案（短期租賃居住）：三居室裡三種房型各一間（雙人套房、雙人雅房、單人雅房），一組客人可選一間或多間。
 * 一次只接待一組客人，日期要先對過才收錢，所以跟雲南好物不同：送出時不付款，
 * 管理頁確認日期（可調整金額）後，系統才寄付款資訊。
 * 房型、價格、開放月份、付款資訊都寫在 anning/stay.json，網頁和這裡共用同一份；
 * 客人送來的只有「哪幾個房型、入住日期、幾位」，金額一律在這裡重算。
 *
 * 寄信用幸福餐桌那組 Gmail，寄件人名稱 STAY_FROM_NAME；通知信寄到 SHOP_NOTIFY_EMAIL（與雲南好物相同）。
 */
import stay from '../../anning/stay.json';
import { sendMail } from './mail.js';
import { json, hashIp, formatTaipei } from './util.js';

export const STAY_STATUSES = ['待確認', '已確認', '已付款', '已完成', '取消'];
const PAY = { linepay: 'LINE Pay', bank: '匯款' };
const LIMITS = { name: 40, phone: 24, email: 120, im: 60, companions: 200, story: 1500, dates: 60, wish: 20 };
const RATE_WINDOW_MIN = 10;
const RATE_MAX = 5;
const DEFAULT_NOTIFY = 'jianchiachi@gmail.com';

/* ---------------- 公開：預約 ---------------- */

export async function handleStay(request, env, ctx, url) {
  if (Number(request.headers.get('Content-Length') || 0) > 32 * 1024) return json({ ok: false, code: 'too_large' }, 413);
  let data;
  try { data = await request.json(); } catch (e) { return json({ ok: false, code: 'bad_json' }, 400); }
  // 蜜罐欄位：真人看不到也不會填，有值就是機器人。回成功，不讓它換方式再試。
  if (data && data.website) return json({ ok: true, bookingNo: '' });

  const f = clean(data || {});
  const missing = [];
  if (!f.name) missing.push('name');
  if (!/^\+?\d{8,15}$/.test(f.phone)) missing.push('phone');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) missing.push('email');
  if (!f.im) missing.push('im');
  if (!PAY[f.pay]) missing.push('pay');
  if (missing.length) return json({ ok: false, code: 'invalid', fields: missing }, 400);

  const priced = quote(data);
  if (priced.error) return json({ ok: false, code: priced.error, fields: priced.fields }, 400);

  await ensureStaySchema(env);
  const ipHash = await hashIp(request.headers.get('CF-Connecting-IP') || '');
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM stays WHERE ip_hash = ? AND created_at > datetime('now', ?)"
  ).bind(ipHash, `-${RATE_WINDOW_MIN} minutes`).first();
  if (recent && recent.n >= RATE_MAX) return json({ ok: false, code: 'rate_limited' }, 429);

  // 同一個月已經有別組預約（一次只接一組）：通知信與管理頁標出來，排日期時留意
  const { results: same } = await env.DB.prepare(
    "SELECT booking_no FROM stays WHERE month = ? AND status IN ('待確認', '已確認', '已付款') ORDER BY id"
  ).bind(priced.month.key).all();
  const sameMonth = same.map(r => r.booking_no).join(', ');

  const row = await env.DB.prepare(
    `INSERT INTO stays (created_at, month, checkin, guests, room_ids, rooms, name, phone, email, im, companions, wishes, story,
       pay, total, same_month, ip_hash)
     VALUES (datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, created_at`
  ).bind(priced.month.key, priced.checkin, priced.guests, priced.rooms.map(r => r.id).join(','), priced.roomNames,
    f.name, f.phone, f.email, f.im, f.companions, f.wishes.join('、'), f.story, f.pay, priced.total, sameMonth, ipHash).first();

  const bookingNo = 'HS' + taipeiDate(row.created_at) + '-' + String(row.id).padStart(3, '0');
  await env.DB.prepare('UPDATE stays SET booking_no = ? WHERE id = ?').bind(bookingNo, row.id).run();

  const b = {
    ...f, id: row.id, bookingNo, month: priced.month.key, monthLabel: priced.month.label, checkin: priced.checkin,
    guests: priced.guests, rooms: priced.roomNames, total: priced.total, sameMonth,
    wishes: f.wishes.join('、'), submittedAt: formatTaipei(row.created_at), adminUrl: url.origin + '/admin#stays',
    siteUrl: env.BRAND_SITE_URL || 'https://alexchiachi.github.io/happy/'
  };
  // 預約已經存好；寄信放到回應之後，不讓客人等
  ctx.waitUntil(sendNewMails(env, b));
  return json({ ok: true, bookingNo, checkin: b.checkin, roomNames: b.rooms, guests: b.guests, total: b.total });
}

const cleanText = (v, max) => String(v == null ? '' : v)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);

function clean(d) {
  const s = cleanText;
  const allowed = stay.wishes || [];
  const wishes = Array.isArray(d.wishes) ? d.wishes.map(w => s(w, LIMITS.wish)).filter(w => allowed.includes(w)) : [];
  return {
    name: s(d.name, LIMITS.name),
    phone: s(d.phone, LIMITS.phone).replace(/[\s\-()]/g, ''),
    email: s(d.email, LIMITS.email).toLowerCase(),
    im: s(d.im, LIMITS.im),
    companions: s(d.companions, LIMITS.companions),
    wishes: [...new Set(wishes)],
    story: s(d.story, LIMITS.story),
    pay: s(d.pay, 10)
  };
}

// 依 stay.json 重算：只收上架中的房型、開放月份內且不早於今天（台北）的入住日；
// 人數不超過所選房間住得下的人數，也不超過一次接待的上限 stay.maxGuests
export function quote(d, now = new Date()) {
  const ids = Array.isArray(d && d.rooms) ? [...new Set(d.rooms.map(String))] : [];
  if (!ids.length || ids.length > stay.rooms.length) return { error: 'no_rooms' };
  const rooms = [];
  for (const id of ids) {
    const r = stay.rooms.find(x => x.id === id);
    if (!r) return { error: 'invalid', fields: ['rooms'] };
    if (r.active === false) return { error: 'room_closed' };
    rooms.push(r);
  }
  rooms.sort((a, b) => stay.rooms.indexOf(a) - stay.rooms.indexOf(b));

  const checkin = String((d && d.checkin) || '');
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(checkin) && !isNaN(Date.parse(checkin + 'T00:00:00Z'))
    && new Date(checkin + 'T00:00:00Z').toISOString().slice(0, 10) === checkin;
  const today = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
  const month = valid && stay.months.find(m => m.key === checkin.slice(0, 7));
  if (!valid || !month || checkin < today) return { error: 'invalid', fields: ['checkin'] };
  if (month.open === false) return { error: 'month_closed' };

  const guests = Number(d.guests);
  if (!Number.isInteger(guests) || guests < 1) return { error: 'invalid', fields: ['guests'] };
  const cap = Math.min(stay.stay.maxGuests, rooms.reduce((a, r) => a + r.people, 0));
  if (guests > cap) return { error: 'too_many' };
  return {
    month, checkin, guests, rooms, roomNames: rooms.map(r => r.name).join('、'),
    total: rooms.reduce((a, r) => a + r.price, 0)
  };
}

function taipeiDate(sqlUtc) {
  const d = new Date(String(sqlUtc).replace(' ', 'T') + 'Z');
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(d).replace(/-/g, '');
}

/* ---------------- 信件 ---------------- */

const notifyList = env => String(env.SHOP_NOTIFY_EMAIL || DEFAULT_NOTIFY).split(',').map(s => s.trim()).filter(Boolean);
const fromNameOf = env => env.STAY_FROM_NAME || '大道至簡・安寧幸福之家';

async function sendNewMails(env, b) {
  const notify = notifyList(env);
  const fromName = fromNameOf(env);
  const results = [];
  for (const to of notify) {
    results.push('owner ' + await sendMail(env, {
      fromName, to, replyTo: b.email,
      subject: '[幸福之家] 新預約 ' + b.bookingNo + '｜' + b.name + '｜' + b.checkin + '｜' + b.rooms + '｜' + b.guests + ' 位' + (b.sameMonth ? '｜同月已有預約' : ''),
      html: ownerHtml(b), text: ownerText(b)
    }));
  }
  results.push('guest ' + await sendMail(env, {
    fromName, to: b.email, replyTo: notify[0],
    subject: '預約已收到 ' + b.bookingNo + '｜雲南安寧幸福之家',
    html: guestHtml(b), text: guestText(b)
  }));
  await env.DB.prepare('UPDATE stays SET mail_status = ? WHERE id = ?').bind(results.join('; '), b.id).run();
}

const C = { paper: '#FAF6EF', card: '#FFFDF8', ink: '#2A2520', soft: '#4A423A', mist: '#8A8175', line: '#E4DCCD', tea: '#8B6F47', seal: '#A8543A' };
const SERIF = '"Noto Serif TC","Songti TC","PMingLiU",serif';
const LATIN = '"Cormorant Garamond",Georgia,serif';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const para = s => esc(s).replace(/\r?\n/g, '<br>');
const money = n => 'NT$' + Number(n).toLocaleString('en-US');
const monthLabelOf = key => (stay.months.find(m => m.key === key) || {}).label || key;
const roomsText = b => b.rooms + '・' + b.guests + ' 位';

function shell(preheader, inner, footer) {
  return '<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="UTF-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light">'
    + '<title>雲南安寧幸福之家</title></head>'
    + '<body style="margin:0;padding:0;background:' + C.paper + ';">'
    + '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">' + esc(preheader) + '</div>'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + C.paper + ';">'
    + '<tr><td align="center" style="padding:36px 12px;">'
    + '<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background:' + C.card + ';border:1px solid ' + C.line + ';">'
    + '<tr><td style="padding:34px 40px 0;font-family:' + LATIN + ';font-size:13px;letter-spacing:3px;color:' + C.tea + ';text-transform:uppercase;">Anning · 安寧幸福之家</td></tr>'
    + inner
    + '</table>'
    + '<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">'
    + '<tr><td align="center" style="padding:20px 24px 0;font-family:' + SERIF + ';font-size:12px;line-height:1.9;color:' + C.mist + ';letter-spacing:1px;">' + footer + '</td></tr>'
    + '</table></td></tr></table></body></html>';
}

const heading = t => '<tr><td style="padding:18px 40px 0;font-family:' + SERIF + ';font-size:22px;line-height:1.6;color:' + C.ink + ';letter-spacing:1px;">' + t + '</td></tr>';
const lead = t => '<tr><td style="padding:10px 40px 14px;font-family:' + SERIF + ';font-size:15px;line-height:1.9;color:' + C.soft + ';">' + t + '</td></tr>';
const signature = '<tr><td style="padding:28px 40px 36px;font-family:' + SERIF + ';font-size:15px;line-height:1.8;color:' + C.ink + ';letter-spacing:2px;">'
  + '<div style="height:1px;background:' + C.line + ';line-height:1px;font-size:1px;margin-bottom:22px;">&nbsp;</div>雲南安寧幸福之家｜大道至簡</td></tr>';

const CONTACT = stay.contact || {};
const contactHtml = () => '有任何問題，直接回覆這封信'
  + (CONTACT.wechatName ? '，或加微信 <a href="' + esc(CONTACT.wechatUrl) + '" style="color:' + C.tea + ';">' + esc(CONTACT.wechatName) + '</a>' : '')
  + (CONTACT.line ? '、LINE 官方帳號 <a href="' + esc(CONTACT.lineUrl) + '" style="color:' + C.tea + ';">' + esc(CONTACT.line) + '</a>' : '')
  + '。<br>以家為媒，赴一場幸福之約。';
const contactText = () => '有問題直接回覆這封信'
  + (CONTACT.wechatName ? '，或加微信 ' + CONTACT.wechatName + '（' + CONTACT.wechatUrl + '）' : '')
  + (CONTACT.line ? '、LINE 官方帳號 ' + CONTACT.line : '');

function infoRows(b, forOwner) {
  const row = (k, v) => '<tr><td style="padding:3px 16px 3px 0;color:' + C.mist + ';white-space:nowrap;vertical-align:top;">' + k + '</td><td style="padding:3px 0;color:' + C.ink + ';">' + v + '</td></tr>';
  return '<tr><td style="padding:12px 40px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:' + SERIF + ';font-size:14px;line-height:1.7;">'
    + row('房型', esc(b.rooms) + '・' + esc(stay.stay.label))
    + (b.dates ? row('入住日期', '<b>' + esc(b.dates) + '</b>') : row('入住日期', esc(b.checkin)))
    + row('人數', esc(b.guests) + ' 位')
    + row('金額', money(b.total))
    + row('預約人', esc(b.name) + '・' + esc(b.phone))
    + (forOwner ? row('Email', esc(b.email)) : '')
    + row('微信／LINE', esc(b.im))
    + (b.companions ? row('同行', esc(b.companions)) : '')
    + (b.wishes ? row('想要的', esc(b.wishes)) : '')
    + row('付款', esc(PAY[b.pay]))
    + (b.story ? row('想說的話', para(b.story)) : '')
    + '</table></td></tr>';
}

function wechatBox(siteUrl) {
  if (!CONTACT.wechatImage) return '';
  return '<tr><td style="padding:22px 40px 0;"><div style="background:' + C.paper + ';border:1px solid ' + C.line + ';padding:16px 18px;font-family:' + SERIF + ';font-size:14px;line-height:1.9;color:' + C.soft + ';">'
    + '<div style="color:' + C.seal + ';letter-spacing:2px;font-size:12px;margin-bottom:6px;">加微信，確認日期更快</div>'
    + '<img src="' + esc(siteUrl + 'anning/' + CONTACT.wechatImage) + '" alt="微信 QR Code（' + esc(CONTACT.wechatName) + '）" width="160" style="display:block;width:160px;max-width:100%;height:auto;margin:8px 0;border:1px solid ' + C.line + ';">'
    + '用微信掃描，加 <b>' + esc(CONTACT.wechatName) + '</b> 為朋友。</div></td></tr>';
}

function guestHtml(b) {
  const inner = heading(esc(b.name) + '，預約收到了。')
    + lead('預約編號 <b style="color:' + C.ink + ';">' + esc(b.bookingNo) + '</b>。<br>現在先不用付款。一次只接待一組客人，我們會在兩三天內用微信或 LINE 跟你確認日期與房間；確認後再寄一封信，附上付款資訊。')
    + infoRows(b, false) + wechatBox(b.siteUrl) + signature;
  return shell('預約 ' + b.bookingNo + '，' + b.checkin + ' 入住。我們會先跟你確認日期。', inner, contactHtml());
}

function guestText(b) {
  return [
    b.name + '，預約收到了。', '',
    '預約編號：' + b.bookingNo,
    '房型：' + b.rooms + '・' + stay.stay.label,
    '入住日期：' + b.checkin,
    '人數：' + b.guests + ' 位',
    '金額：' + money(b.total), '',
    '現在先不用付款。我們會在兩三天內用微信或 LINE 跟你確認日期與房間，確認後再寄付款資訊。', '',
    contactText(), '',
    '雲南安寧幸福之家｜大道至簡'
  ].filter(l => l !== '').join('\n');
}

function ownerHtml(b) {
  const flag = b.sameMonth
    ? '<tr><td style="padding:14px 40px 0;"><div style="border-left:3px solid ' + C.seal + ';padding:6px 12px;font-family:' + SERIF + ';font-size:14px;color:' + C.seal + ';">這個月已經有其他預約：' + esc(b.sameMonth) + '。一次只接一組，排日期時請留意。</div></td></tr>'
    : '';
  const inner = '<tr><td style="padding:18px 40px 4px;font-family:' + SERIF + ';font-size:22px;line-height:1.6;color:' + C.ink + ';letter-spacing:1px;">新預約 ' + esc(b.bookingNo) + '</td></tr>'
    + '<tr><td style="padding:0 40px;font-family:' + SERIF + ';font-size:13px;color:' + C.mist + ';">' + esc(b.submittedAt) + '</td></tr>'
    + flag + infoRows(b, true)
    + '<tr><td style="padding:28px 40px 36px;font-family:' + SERIF + ';font-size:14px;line-height:1.8;color:' + C.soft + ';">'
    + '先用微信或 LINE 跟客人對好日期。確認後到 <a href="' + esc(b.adminUrl) + '" style="color:' + C.tea + ';">管理頁</a> 填上入住日期（需要時調整金額），改成「已確認」，系統會寄付款資訊給客人；收到款項再改「已付款」。</td></tr>';
  return shell(b.name + '・' + b.checkin + '・' + b.rooms + '・' + b.guests + ' 位', inner, '#' + b.id + ' · 已存進預約紀錄；客人同時收到一封預約確認信。');
}

function ownerText(b) {
  return [
    '預約：' + b.bookingNo + '（' + b.submittedAt + '）',
    b.sameMonth ? '※ 這個月已經有其他預約：' + b.sameMonth : '',
    '入住日期：' + b.checkin,
    '房型：' + b.rooms + '・' + b.guests + ' 位・' + money(b.total),
    '預約人：' + b.name, '手機：' + b.phone, 'Email：' + b.email, '微信／LINE：' + b.im,
    b.companions ? '同行：' + b.companions : '',
    b.wishes ? '想要的：' + b.wishes : '',
    '付款：' + PAY[b.pay],
    b.story ? '想說的話：' + b.story : '', '',
    '管理頁：' + b.adminUrl
  ].filter(l => l !== '').join('\n');
}

/* ---------------- 狀態通知（管理頁改狀態時寄給客人） ---------------- */

function fromRow(r) {
  return { ...r, bookingNo: r.booking_no || ('#' + r.id), monthLabel: monthLabelOf(r.month) };
}

function payBox(b, siteUrl) {
  const p = stay.payment;
  const img = p.linepayImage ? new URL(p.linepayImage, siteUrl + 'anning/').href : '';
  const body = b.pay === 'bank'
    ? '請匯款 <b>' + money(b.total) + '</b> 到：<br>' + para(p.bank) + '<br>匯款後直接回覆這封信，告訴我們帳號末五碼就好。'
    : '請用 LINE Pay 付款 <b>' + money(b.total) + '</b>：<br>' + para(p.linepay)
      + (img ? '<br><img src="' + esc(img) + '" alt="LINE Pay 收款碼（嘉禮慕華）" width="200" style="display:block;width:200px;max-width:100%;height:auto;margin:12px 0;border:1px solid ' + C.line + ';">' : '')
      + (p.linepayUrl ? '<a href="' + esc(p.linepayUrl) + '" style="display:inline-block;margin:4px 0 8px;padding:8px 18px;background:#06C755;color:#FFFFFF;text-decoration:none;border-radius:999px;font-size:14px;">開啟 LINE Pay 付款</a><br>' : '')
      + '付款後直接回覆這封信告訴我們。';
  return '<tr><td style="padding:22px 40px 0;"><div style="background:' + C.paper + ';border:1px solid ' + C.line + ';padding:16px 18px;font-family:' + SERIF + ';font-size:14px;line-height:1.9;color:' + C.soft + ';">'
    + '<div style="color:' + C.seal + ';letter-spacing:2px;font-size:12px;margin-bottom:6px;">付款方式・' + esc(PAY[b.pay]) + '</div>' + body + '</div></td></tr>';
}

function statusMail(b, siteUrl) {
  if (b.status === '已確認') {
    const p = stay.payment;
    const inner = heading(esc(b.name) + '，日期確認好了。')
      + lead('預約 <b style="color:' + C.ink + ';">' + esc(b.bookingNo) + '</b>：<b style="color:' + C.ink + ';">' + esc(b.dates) + '</b>，' + esc(stay.stay.label) + '，' + esc(roomsText(b)) + '。<br>金額 ' + money(b.total) + '，付款資訊在下面。')
      + payBox(b, siteUrl) + infoRows(b, false) + signature;
    return {
      subject: '日期確認與付款資訊 ' + b.bookingNo + '｜雲南安寧幸福之家',
      html: shell(b.dates + '，金額 ' + money(b.total) + '。付款資訊在信裡。', inner, contactHtml()),
      text: [b.name + '，日期確認好了。', '',
        '預約編號：' + b.bookingNo, '入住日期：' + b.dates + '（' + stay.stay.label + '）', '房型：' + roomsText(b),
        '金額：' + money(b.total), '',
        '付款方式：' + PAY[b.pay],
        b.pay === 'bank' ? '匯款資訊：' + p.bank + '\n匯款後回覆這封信告訴我們帳號末五碼。'
          : 'LINE Pay：' + p.linepay + (p.linepayUrl ? '\n手機付款連結：' + p.linepayUrl : '') + '\n付款後回覆這封信告訴我們。',
        '', contactText(), '', '雲南安寧幸福之家｜大道至簡'].join('\n')
    };
  }
  if (b.status === '已付款') {
    const inner = heading(esc(b.name) + '，款項收到了。')
      + lead('預約 <b style="color:' + C.ink + ';">' + esc(b.bookingNo) + '</b> 的款項 ' + money(b.total) + ' 已經入帳，謝謝你。<br>'
        + esc(b.dates) + '，我們在安寧等你。出發前會再跟你聊聊這趟想怎麼過，微信一直在線。')
      + infoRows(b, false) + signature;
    return {
      subject: '款項已收到 ' + b.bookingNo + '｜雲南安寧幸福之家',
      html: shell('預約 ' + b.bookingNo + ' 的款項收到了，我們在安寧等你。', inner, contactHtml()),
      text: [b.name + '，款項收到了。', '', '預約 ' + b.bookingNo + ' 的款項 ' + money(b.total) + ' 已經入帳。',
        b.dates + '，我們在安寧等你。出發前會再跟你聊聊這趟想怎麼過。', '', contactText(), '', '雲南安寧幸福之家｜大道至簡'].join('\n')
    };
  }
  return null;
}

async function sendStatusMail(env, row) {
  const siteUrl = env.BRAND_SITE_URL || 'https://alexchiachi.github.io/happy/';
  const m = statusMail(fromRow(row), siteUrl);
  if (!m) return '';
  return await sendMail(env, { fromName: fromNameOf(env), to: row.email, replyTo: notifyList(env)[0], ...m });
}

/* ---------------- 管理 ---------------- */

export async function handleAdminStays(request, env, url, path) {
  if (!path.startsWith('/api/admin/stays')) return null;
  await ensureStaySchema(env);

  if (path === '/api/admin/stays' && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT id, booking_no, created_at, month, checkin, dates, guests, room_ids, rooms, name, phone, email, im, companions,
              wishes, story, pay, total, status, same_month, mail_status, confirmed_at
       FROM stays ORDER BY id DESC LIMIT 2000`
    ).all();
    return json({ ok: true, stays: results, pay: PAY });
  }

  if (path === '/api/admin/stays.csv' && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM stays ORDER BY id').all();
    return new Response(toCsv(results), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="anning-stays.csv"',
        'Cache-Control': 'no-store'
      }
    });
  }

  const m = path.match(/^\/api\/admin\/stays\/(\d+)\/status$/);
  if (m && request.method === 'POST') {
    // 只接受同源請求，避免被別的網站借用登入狀態改資料
    if (request.headers.get('Origin') !== url.origin) return json({ ok: false, code: 'bad_origin' }, 403);
    let body;
    try { body = await request.json(); } catch (e) { return json({ ok: false, code: 'bad_json' }, 400); }
    if (!STAY_STATUSES.includes(body.status)) return json({ ok: false, code: 'invalid_status' }, 400);
    const id = Number(m[1]);
    const prev = await env.DB.prepare('SELECT * FROM stays WHERE id = ?').bind(id).first();
    if (!prev) return json({ ok: false, code: 'not_found' }, 404);
    const dates = cleanText(body.dates, LIMITS.dates);
    let total = prev.total;
    if (body.total !== undefined && body.total !== '') {
      total = Number(body.total);
      if (!Number.isInteger(total) || total < 0 || total > 1000000) return json({ ok: false, code: 'invalid_total' }, 400);
    }
    // 付款資訊信一定要寫清楚入住日期
    if ((body.status === '已確認' || body.status === '已付款') && body.notify && !dates) {
      return json({ ok: false, code: 'need_dates' }, 400);
    }
    const row = await env.DB.prepare(
      `UPDATE stays SET status = ?, dates = ?, total = ?,
         confirmed_at = CASE WHEN ? = '已確認' THEN COALESCE(confirmed_at, datetime('now')) ELSE confirmed_at END
       WHERE id = ? RETURNING *`
    ).bind(body.status, dates, total, body.status, id).first();
    // 第一次改成已確認／已付款時才寄；日期或金額改了要重寄時，管理頁送 resend
    const changed = prev.status !== body.status;
    let mail = '';
    if (body.notify && (changed || body.resend) && (body.status === '已確認' || body.status === '已付款')) {
      mail = await sendStatusMail(env, row);
      if (mail) {
        const log = (body.status === '已確認' ? 'confirmed ' : 'paid ') + mail;
        await env.DB.prepare('UPDATE stays SET mail_status = ? WHERE id = ?')
          .bind([row.mail_status, log].filter(Boolean).join('; '), id).run();
      }
    }
    return json({ ok: true, mail });
  }
  return json({ ok: false, code: 'not_found' }, 404);
}

function toCsv(rows) {
  const cols = [
    ['booking_no', '預約編號'], ['created_at', '送出時間'], ['status', '狀態'], ['month', '月份'], ['checkin', '入住日期'],
    ['dates', '確認的入住日期'], ['rooms', '房型'], ['guests', '人數'], ['total', '金額'], ['pay', '付款方式'],
    ['name', '預約人'], ['phone', '手機'], ['email', 'Email'], ['im', '微信／LINE'], ['companions', '同行'],
    ['wishes', '想要的'], ['story', '想說的話'], ['confirmed_at', '確認時間'], ['same_month', '同月其他預約'], ['mail_status', '寄信結果']
  ];
  const cell = (v) => {
    let t = v == null ? '' : String(v);
    if (/^[=+\-@]/.test(t)) t = "'" + t; // 防止試算表公式注入
    return '"' + t.replace(/"/g, '""') + '"';
  };
  const lines = [cols.map(c => cell(c[1])).join(',')];
  for (const r of rows) {
    lines.push(cols.map(([k]) => {
      if (k === 'created_at' || k === 'confirmed_at') return cell(r[k] ? formatTaipei(r[k]) : '');
      if (k === 'month') return cell(monthLabelOf(r[k]));
      if (k === 'pay') return cell(PAY[r[k]] || r[k]);
      return cell(r[k]);
    }).join(','));
  }
  return '﻿' + lines.join('\r\n'); // BOM 讓 Excel 正確顯示中文
}

let ready = null;
export function ensureStaySchema(env) {
  if (!ready) {
    ready = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS stays (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_no TEXT,
        created_at TEXT NOT NULL,
        month TEXT NOT NULL,
        checkin TEXT,
        dates TEXT,
        guests INTEGER NOT NULL,
        room_ids TEXT NOT NULL,
        rooms TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT NOT NULL,
        im TEXT,
        companions TEXT,
        wishes TEXT,
        story TEXT,
        pay TEXT NOT NULL,
        total INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT '待確認',
        same_month TEXT,
        confirmed_at TEXT,
        ip_hash TEXT,
        mail_status TEXT
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS stays_ip_time ON stays (ip_hash, created_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS stays_month ON stays (month)')
    ]).catch(err => { ready = null; throw err; });
  }
  return ready;
}
