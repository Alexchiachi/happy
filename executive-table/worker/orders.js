/**
 * 雲南好物選購頁（大道至簡品牌站 shop/）的訂單。
 *
 *   POST /api/order                        公開：收一張訂單（JSON），依 shop/products.json 重算金額，存進 D1，寄信
 *   GET  /api/admin/orders                 管理：全部訂單
 *   POST /api/admin/orders/<id>/status     管理：改狀態（待付款 → 已付款 → 已出貨，或取消）、填物流與追蹤號碼；
 *                                          改成已付款／已出貨時寄信通知客人（出貨信附追蹤號碼）
 *   GET  /api/admin/orders.csv             管理：匯出 CSV
 *
 * 商品、價格、運費、檔期截止日、付款資訊都寫在 shop/products.json，網頁和這裡共用同一份：
 * 客人送來的只有「哪樣商品、哪個規格、幾份」，金額一律在這裡重算，改網頁也改不了價格。
 *
 * 寄信（用幸福餐桌那組 Gmail 寄出，寄件人名稱 SHOP_FROM_NAME）：
 *   ・新訂單通知 → SHOP_NOTIFY_EMAIL（逗號分隔可以寫好幾個），回覆鍵直接回給客人
 *   ・訂單確認   → 客人，附訂單編號、明細、金額與付款資訊；回覆會回到第一個通知信箱
 *   ・款項確認、出貨通知 → 客人（管理頁改狀態時）
 *
 * 送禮：訂購人（name/phone/email）與收件人（to_name/to_phone）分開，另有卡片內容（card）
 * 與「不附價格明細」（hide_price）。價格明細只寄給訂購人；包裹要不要放明細，看通知信與管理頁的標示。
 */
import catalog from '../../shop/products.json';
import { sendMail } from './mail.js';
import { json, hashIp, formatTaipei } from './util.js';

export const ORDER_STATUSES = ['待付款', '已付款', '已出貨', '取消'];
const DELIVERY = { home: '宅配', '711': '7-11 取貨', family: '全家取貨', meet: '面交（南投市／草屯）' };
const PAY = { linepay: 'LINE Pay', bank: '匯款' };
const LIMITS = { name: 40, phone: 20, email: 120, line: 60, address: 200, store: 60, note: 1000, card: 200, tracking: 40 };
export const CARRIERS = ['黑貓宅急便', '新竹物流', '中華郵政', '7-11 交貨便', '全家店到店', '其他'];
const RATE_WINDOW_MIN = 10;
const RATE_MAX = 5;
const DEFAULT_NOTIFY = 'jianchiachi@gmail.com';

/* ---------------- 公開：下單 ---------------- */

export async function handleOrder(request, env, ctx, url) {
  if (Number(request.headers.get('Content-Length') || 0) > 32 * 1024) return json({ ok: false, code: 'too_large' }, 413);
  let data;
  try { data = await request.json(); } catch (e) { return json({ ok: false, code: 'bad_json' }, 400); }
  // 蜜罐欄位：真人看不到也不會填，有值就是機器人。回成功，不讓它換方式再試。
  if (data && data.website) return json({ ok: true, orderNo: '' });

  const f = clean(data || {});
  const missing = [];
  if (!f.name) missing.push('name');
  if (!/^09\d{8}$/.test(f.phone)) missing.push('phone');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) missing.push('email');
  if (!DELIVERY[f.delivery]) missing.push('delivery');
  if (f.delivery === 'home' && !f.address) missing.push('address');
  if ((f.delivery === '711' || f.delivery === 'family') && !f.store) missing.push('store');
  if (!PAY[f.pay]) missing.push('pay');
  if (f.gift && !f.to_name) missing.push('to_name');
  if (f.gift && !/^09\d{8}$/.test(f.to_phone)) missing.push('to_phone');
  if (missing.length) return json({ ok: false, code: 'invalid', fields: missing }, 400);

  const priced = price(data.items);
  if (priced.error) return json({ ok: false, code: priced.error, item: priced.item || '' }, 400);
  const shipping = shippingFee(priced.subtotal, f.delivery);

  await ensureOrderSchema(env);
  const ipHash = await hashIp(request.headers.get('CF-Connecting-IP') || '');
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM orders WHERE ip_hash = ? AND created_at > datetime('now', ?)"
  ).bind(ipHash, `-${RATE_WINDOW_MIN} minutes`).first();
  if (recent && recent.n >= RATE_MAX) return json({ ok: false, code: 'rate_limited' }, 429);

  // 同一檔、同一支電話已經下過單：通知信與管理頁標出來，方便合併寄送、調整運費
  const season = catalog.season.name;
  const { results: earlier } = await env.DB.prepare(
    "SELECT order_no FROM orders WHERE phone = ? AND season = ? AND status != '取消' ORDER BY id"
  ).bind(f.phone, season).all();
  const samePhone = earlier.map(r => r.order_no).join(', ');

  const row = await env.DB.prepare(
    `INSERT INTO orders (created_at, season, name, phone, email, line, delivery, address, store, pay, note,
       items, subtotal, shipping, total, same_phone, ip_hash, gift, to_name, to_phone, card, hide_price)
     VALUES (datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, created_at`
  ).bind(season, f.name, f.phone, f.email, f.line, f.delivery, f.address, f.store, f.pay, f.note,
    JSON.stringify(priced.lines), priced.subtotal, shipping, priced.subtotal + shipping, samePhone, ipHash,
    f.gift ? 1 : 0, f.to_name, f.to_phone, f.card, f.hide_price ? 1 : 0).first();

  const orderNo = 'YN' + taipeiDate(row.created_at) + '-' + String(row.id).padStart(3, '0');
  await env.DB.prepare('UPDATE orders SET order_no = ? WHERE id = ?').bind(orderNo, row.id).run();

  const o = {
    ...f, id: row.id, orderNo, season, lines: priced.lines, subtotal: priced.subtotal, shipping,
    total: priced.subtotal + shipping, samePhone, submittedAt: formatTaipei(row.created_at),
    adminUrl: url.origin + '/admin#orders'
  };
  // 訂單已經存好；寄信放到回應之後，不讓客人等
  ctx.waitUntil(sendOrderMails(env, o));
  return json({
    ok: true, orderNo, subtotal: o.subtotal, shipping, total: o.total,
    payment: catalog.payment, ship: catalog.season.ship
  });
}

const cleanText = (v, max) => String(v == null ? '' : v)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
const yes = v => v === true || v === 'on' || v === '1' || v === 1;

function clean(d) {
  const s = cleanText;
  const gift = yes(d.gift);
  return {
    name: s(d.name, LIMITS.name),
    phone: s(d.phone, LIMITS.phone).replace(/[\s\-()]/g, ''),
    email: s(d.email, LIMITS.email).toLowerCase(),
    line: s(d.line, LIMITS.line),
    delivery: s(d.delivery, 10),
    address: s(d.address, LIMITS.address),
    store: s(d.store, LIMITS.store),
    pay: s(d.pay, 10),
    note: s(d.note, LIMITS.note),
    gift,
    to_name: gift ? s(d.to_name, LIMITS.name) : '',
    to_phone: gift ? s(d.to_phone, LIMITS.phone).replace(/[\s\-()]/g, '') : '',
    card: gift ? s(d.card, LIMITS.card) : '',
    hide_price: gift && yes(d.hide_price)
  };
}

// 依商品表重算：只認得 products.json 裡上架中的商品與規格；預購品過了截止日不收
export function price(items, now = new Date()) {
  if (!Array.isArray(items) || !items.length || items.length > 50) return { error: 'empty_cart' };
  const deadline = new Date(catalog.season.deadline);
  const byId = Object.fromEntries(catalog.products.map(p => [p.id, p]));
  const merged = new Map();
  for (const it of items) {
    const p = byId[String(it && it.id)];
    const v = p && p.variants.find(x => x.key === String(it.variant));
    const qty = Number(it && it.qty);
    if (!p || !v || p.active === false) return { error: 'unknown_item', item: String(it && it.id) };
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) return { error: 'bad_qty', item: p.name };
    if (p.shelf === 'season' && now > deadline) return { error: 'season_closed', item: p.name };
    const key = p.id + '|' + v.key;
    merged.set(key, { id: p.id, variant: v.key, name: p.name, label: v.label, unit: v.unit, price: v.price,
      qty: (merged.has(key) ? merged.get(key).qty : 0) + qty });
  }
  const lines = [...merged.values()].map(l => ({ ...l, amount: l.price * l.qty }));
  return { lines, subtotal: lines.reduce((a, l) => a + l.amount, 0) };
}

export function shippingFee(subtotal, delivery) {
  const s = catalog.shipping;
  if (subtotal >= s.free || delivery === 'meet') return 0;
  return delivery === 'home' ? s.home : s.cvs;
}

function taipeiDate(sqlUtc) {
  const d = new Date(String(sqlUtc).replace(' ', 'T') + 'Z');
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(d).replace(/-/g, '');
}

/* ---------------- 信件 ---------------- */

async function sendOrderMails(env, o) {
  const notify = String(env.SHOP_NOTIFY_EMAIL || DEFAULT_NOTIFY).split(',').map(s => s.trim()).filter(Boolean);
  const fromName = env.SHOP_FROM_NAME || '大道至簡・雲南好物';
  const results = [];
  for (const to of notify) {
    results.push('owner ' + await sendMail(env, {
      fromName, to, replyTo: o.email,
      subject: '[雲南好物] 新訂單 ' + o.orderNo + '｜' + o.name + '｜' + money(o.total) + (o.gift ? '｜送禮' : '') + (o.samePhone ? '｜同檔已有訂單' : ''),
      html: ownerHtml(o), text: ownerText(o)
    }));
  }
  results.push('guest ' + await sendMail(env, {
    fromName, to: o.email, replyTo: notify[0],
    subject: '訂單已收到 ' + o.orderNo + '｜大道至簡・雲南好物',
    html: guestHtml(o), text: guestText(o)
  }));
  await env.DB.prepare('UPDATE orders SET mail_status = ? WHERE id = ?').bind(results.join('; '), o.id).run();
}

const C = { paper: '#FAF6EF', card: '#FFFDF8', ink: '#2A2520', soft: '#4A423A', mist: '#8A8175', line: '#E4DCCD', tea: '#8B6F47', seal: '#A8543A' };
const SERIF = '"Noto Serif TC","Songti TC","PMingLiU",serif';
const LATIN = '"Cormorant Garamond",Georgia,serif';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const para = s => esc(s).replace(/\r?\n/g, '<br>');
const money = n => 'NT$' + Number(n).toLocaleString('en-US');

function shell(preheader, inner, footer) {
  return '<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="UTF-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light">'
    + '<title>大道至簡・雲南好物</title></head>'
    + '<body style="margin:0;padding:0;background:' + C.paper + ';">'
    + '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">' + esc(preheader) + '</div>'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + C.paper + ';">'
    + '<tr><td align="center" style="padding:36px 12px;">'
    + '<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background:' + C.card + ';border:1px solid ' + C.line + ';">'
    + '<tr><td style="padding:34px 40px 0;font-family:' + LATIN + ';font-size:13px;letter-spacing:3px;color:' + C.tea + ';text-transform:uppercase;">Yunnan · 雲南好物</td></tr>'
    + inner
    + '</table>'
    + '<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">'
    + '<tr><td align="center" style="padding:20px 24px 0;font-family:' + SERIF + ';font-size:12px;line-height:1.9;color:' + C.mist + ';letter-spacing:1px;">' + footer + '</td></tr>'
    + '</table></td></tr></table></body></html>';
}

function linesTable(o) {
  const td = 'padding:8px 0;border-bottom:1px dashed ' + C.line + ';font-family:' + SERIF + ';font-size:14px;line-height:1.6;';
  const rows = o.lines.map(l => '<tr><td style="' + td + 'color:' + C.ink + ';">' + esc(l.name)
    + '<br><span style="color:' + C.mist + ';font-size:12px;">' + esc(l.label) + ' × ' + l.qty + '</span></td>'
    + '<td align="right" style="' + td + 'color:' + C.ink + ';white-space:nowrap;">' + money(l.amount) + '</td></tr>').join('');
  const sum = (k, v, strong) => '<tr><td style="padding:4px 0;font-family:' + SERIF + ';font-size:' + (strong ? 16 : 14) + 'px;color:' + (strong ? C.ink : C.soft) + ';">' + k
    + '</td><td align="right" style="padding:4px 0;font-family:' + SERIF + ';font-size:' + (strong ? 18 : 14) + 'px;color:' + C.ink + ';">' + v + '</td></tr>';
  return '<tr><td style="padding:6px 40px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
    + rows + sum('商品小計', money(o.subtotal)) + sum('運費', o.shipping ? money(o.shipping) : '免運') + sum('合計', money(o.total), true)
    + '</table></td></tr>';
}

const whereOf = o => o.delivery === 'home' ? o.address : o.delivery === 'meet' ? '另外約時間地點' : o.store;
const CONTACT = catalog.contact || {};
const contactHtml = () => '有任何問題，直接回覆這封信'
  + (CONTACT.line ? '，或加 LINE 官方帳號 <a href="' + esc(CONTACT.lineUrl) + '" style="color:' + C.tea + ';">' + esc(CONTACT.line) + '</a>' : '')
  + (CONTACT.facebook ? '・<a href="' + esc(CONTACT.facebook) + '" style="color:' + C.tea + ';">Facebook</a>' : '')
  + '。<br>做幸福的事，讓幸福變成有價值的事。';
const contactText = () => '有問題直接回覆這封信' + (CONTACT.line ? '，或加 LINE 官方帳號 ' + CONTACT.line : '')
  + (CONTACT.facebook ? '\nFacebook：' + CONTACT.facebook : '');

function infoRows(o) {
  const row = (k, v) => '<tr><td style="padding:3px 16px 3px 0;color:' + C.mist + ';white-space:nowrap;vertical-align:top;">' + k + '</td><td style="padding:3px 0;color:' + C.ink + ';">' + v + '</td></tr>';
  const buyer = o.gift ? '訂購人' : '收件人';
  return '<tr><td style="padding:18px 40px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:' + SERIF + ';font-size:14px;line-height:1.7;">'
    + row(buyer, esc(o.name) + '・' + esc(o.phone))
    + row('Email', esc(o.email))
    + (o.line ? row('LINE', esc(o.line)) : '')
    + (o.gift ? row('收件人', esc(o.to_name) + '・' + esc(o.to_phone)) : '')
    + row('取貨', esc(DELIVERY[o.delivery]) + '・' + esc(whereOf(o)))
    + row('付款', esc(PAY[o.pay]))
    + (o.note ? row('備註', para(o.note)) : '')
    + '</table></td></tr>';
}

// 送禮：卡片內容與「不附價格明細」
function giftBox(o, forOwner) {
  if (!o.gift) return '';
  const lines = [];
  if (forOwner) lines.push(o.hide_price ? '<b>包裹裡不要放價格明細、出貨單不寫金額。</b>' : '包裹可以附價格明細。');
  else lines.push('寄給 <b>' + esc(o.to_name) + '</b>' + (o.hide_price ? '，包裹裡不會附價格明細。' : '。'));
  lines.push(o.card ? '卡片內容：<br><span style="color:' + C.ink + ';">' + para(o.card) + '</span>' : '不附卡片。');
  return '<tr><td style="padding:18px 40px 0;"><div style="border-left:3px solid ' + C.tea + ';padding:6px 14px;font-family:' + SERIF + ';font-size:14px;line-height:1.9;color:' + C.soft + ';">'
    + '<div style="color:' + C.tea + ';letter-spacing:2px;font-size:12px;">送禮</div>' + lines.join('<br>') + '</div></td></tr>';
}
function giftText(o, forOwner) {
  if (!o.gift) return [];
  return [
    '送禮：寄給 ' + o.to_name + '（' + o.to_phone + '）' + (o.hide_price ? '，不附價格明細' : ''),
    forOwner && o.hide_price ? '※ 包裹裡不要放價格明細、出貨單不寫金額' : '',
    o.card ? '卡片內容：' + o.card : '不附卡片'
  ].filter(Boolean);
}

function payBox(o) {
  const p = catalog.payment;
  const body = o.pay === 'bank'
    ? '請匯款 <b>' + money(o.total) + '</b> 到：<br>' + para(p.bank) + '<br>匯款後直接回覆這封信，告訴我們帳號末五碼就好。'
    : '請用 LINE Pay 付款 <b>' + money(o.total) + '</b>：<br>' + para(p.linepay) + '<br>付款後直接回覆這封信告訴我們，我們核對後就安排出貨。';
  return '<tr><td style="padding:24px 40px 0;"><div style="background:' + C.paper + ';border:1px solid ' + C.line + ';padding:16px 18px;font-family:' + SERIF + ';font-size:14px;line-height:1.9;color:' + C.soft + ';">'
    + '<div style="color:' + C.seal + ';letter-spacing:2px;font-size:12px;margin-bottom:6px;">付款方式・' + esc(PAY[o.pay]) + '</div>' + body + '</div></td></tr>';
}

const signature = '<tr><td style="padding:28px 40px 36px;font-family:' + SERIF + ';font-size:15px;line-height:1.8;color:' + C.ink + ';letter-spacing:2px;">'
  + '<div style="height:1px;background:' + C.line + ';line-height:1px;font-size:1px;margin-bottom:22px;">&nbsp;</div>簡家旗｜大道至簡</td></tr>';
const heading = t => '<tr><td style="padding:18px 40px 0;font-family:' + SERIF + ';font-size:22px;line-height:1.6;color:' + C.ink + ';letter-spacing:1px;">' + t + '</td></tr>';
const lead = t => '<tr><td style="padding:10px 40px 14px;font-family:' + SERIF + ';font-size:15px;line-height:1.9;color:' + C.soft + ';">' + t + '</td></tr>';

function guestHtml(o) {
  const inner = heading(esc(o.name) + '，訂單收到了。')
    + lead('訂單編號 <b style="color:' + C.ink + ';">' + esc(o.orderNo) + '</b>。收到款項後，我們會依本檔時程（' + esc(catalog.season.ship) + '）寄出；常備好物會更早出貨。出貨時會再寄一封信，附上物流追蹤號碼。')
    + linesTable(o) + payBox(o) + giftBox(o, false) + infoRows(o) + signature;
  return shell('訂單 ' + o.orderNo + '，合計 ' + money(o.total) + '。付款資訊在信裡。', inner, contactHtml());
}

function guestText(o) {
  const p = catalog.payment;
  return [
    o.name + '，訂單收到了。', '',
    '訂單編號：' + o.orderNo,
    ...o.lines.map(l => '・' + l.name + '（' + l.label + '）× ' + l.qty + '　' + money(l.amount)),
    '商品小計：' + money(o.subtotal),
    '運費：' + (o.shipping ? money(o.shipping) : '免運'),
    '合計：' + money(o.total), '',
    '付款方式：' + PAY[o.pay],
    o.pay === 'bank' ? '匯款資訊：' + p.bank + '\n匯款後回覆這封信告訴我們帳號末五碼。' : 'LINE Pay：' + p.linepay + '\n付款後回覆這封信告訴我們。',
    '',
    ...giftText(o, false),
    '取貨：' + DELIVERY[o.delivery] + '・' + whereOf(o),
    '出貨：' + catalog.season.ship + '（出貨時會再寄信附上追蹤號碼）', '',
    contactText(), '',
    '簡家旗｜大道至簡'
  ].join('\n');
}

function ownerHtml(o) {
  const flag = o.samePhone
    ? '<tr><td style="padding:14px 40px 0;"><div style="border-left:3px solid ' + C.seal + ';padding:6px 12px;font-family:' + SERIF + ';font-size:14px;color:' + C.seal + ';">同一支電話本檔已有訂單：' + esc(o.samePhone) + '。可以合併寄送，運費請手動調整。</div></td></tr>'
    : '';
  const inner = '<tr><td style="padding:18px 40px 4px;font-family:' + SERIF + ';font-size:22px;line-height:1.6;color:' + C.ink + ';letter-spacing:1px;">新訂單 ' + esc(o.orderNo) + (o.gift ? '・送禮' : '') + '</td></tr>'
    + '<tr><td style="padding:0 40px;font-family:' + SERIF + ';font-size:13px;color:' + C.mist + ';">' + esc(o.submittedAt) + '・' + esc(o.season) + '</td></tr>'
    + flag + giftBox(o, true) + infoRows(o) + linesTable(o)
    + '<tr><td style="padding:28px 40px 36px;font-family:' + SERIF + ';font-size:14px;line-height:1.8;color:' + C.soft + ';">'
    + '直接按「回覆」就會寄到客人的信箱。收到款項後，到 <a href="' + esc(o.adminUrl) + '" style="color:' + C.tea + ';">管理頁</a> 把狀態改成「已付款」；出貨後填上追蹤號碼、改「已出貨」，系統會寄信通知客人。</td></tr>';
  return shell(o.name + '・' + money(o.total) + '・' + PAY[o.pay], inner, '#' + o.id + ' · 已存進訂單紀錄；客人同時收到一封訂單確認信。');
}

function ownerText(o) {
  return [
    '訂單：' + o.orderNo + '（' + o.submittedAt + '・' + o.season + '）',
    o.samePhone ? '※ 同一支電話本檔已有訂單：' + o.samePhone : '',
    (o.gift ? '訂購人：' : '收件人：') + o.name, '手機：' + o.phone, 'Email：' + o.email, o.line ? 'LINE：' + o.line : '',
    ...giftText(o, true),
    '取貨：' + DELIVERY[o.delivery] + '・' + whereOf(o),
    '付款：' + PAY[o.pay], o.note ? '備註：' + o.note : '', '',
    ...o.lines.map(l => '・' + l.name + '（' + l.label + '）× ' + l.qty + '　' + money(l.amount)),
    '小計 ' + money(o.subtotal) + '／運費 ' + (o.shipping ? money(o.shipping) : '免運') + '／合計 ' + money(o.total), '',
    '管理頁：' + o.adminUrl
  ].filter(l => l !== '').join('\n');
}

/* ---------------- 狀態通知（管理頁改狀態時寄給客人） ---------------- */

// 資料庫的一列 → 寄信用的訂單物件
function fromRow(r) {
  let lines = [];
  try { lines = JSON.parse(r.items); } catch (e) { /* 舊資料壞掉就不列明細 */ }
  return { ...r, orderNo: r.order_no || ('#' + r.id), lines, gift: !!r.gift, hide_price: !!r.hide_price };
}

function statusMail(o) {
  if (o.status === '已付款') {
    const when = '本檔預購品 ' + catalog.season.ship + '；常備好物 3–5 天內出貨';
    const inner = heading(esc(o.name) + '，款項收到了。')
      + lead('訂單 <b style="color:' + C.ink + ';">' + esc(o.orderNo) + '</b> 的款項 ' + money(o.total) + ' 已經入帳，謝謝你。<br>出貨時程：' + esc(when) + '。寄出當天會再寄一封信，附上物流追蹤號碼。')
      + linesTable(o) + giftBox(o, false) + signature;
    return {
      subject: '款項已收到 ' + o.orderNo + '｜大道至簡・雲南好物',
      html: shell('訂單 ' + o.orderNo + ' 的款項收到了，出貨時會再通知你。', inner, contactHtml()),
      text: [o.name + '，款項收到了。', '', '訂單 ' + o.orderNo + ' 的款項 ' + money(o.total) + ' 已經入帳。',
        '出貨時程：' + when + '。寄出當天會再寄信附上物流追蹤號碼。', '', contactText(), '', '簡家旗｜大道至簡'].join('\n')
    };
  }
  if (o.status === '已出貨') {
    const meet = o.delivery === 'meet';
    const cvs = o.delivery === '711' || o.delivery === 'family';
    const to = o.gift ? o.to_name : o.name;
    const track = meet ? '面交，我們會用 LINE 或電話跟你約時間地點。'
      : '物流：' + esc(o.carrier || DELIVERY[o.delivery]) + '<br>追蹤號碼：<b style="color:' + C.ink + ';font-size:16px;letter-spacing:1px;">' + esc(o.tracking_no || '（稍後補上）') + '</b>'
        + '<br><span style="color:' + C.mist + ';font-size:13px;">可以到物流公司的網站，用追蹤號碼查詢配送進度。</span>';
    const note = cvs ? '包裹到店後，超商會用簡訊通知 ' + esc(to) + ' 取件，請記得在 7 天內取貨。'
      : meet ? '' : '宅配到 ' + esc(to) + ' 的地址，送達前物流可能會先打電話聯絡。';
    const inner = heading(esc(o.name) + '，' + (o.gift ? '禮物' : '你的訂單') + '出發了。')
      + lead('訂單 <b style="color:' + C.ink + ';">' + esc(o.orderNo) + '</b> 已經寄出' + (o.gift ? '，收件人是 ' + esc(o.to_name) : '') + '。' + (note ? '<br>' + note : ''))
      + '<tr><td style="padding:6px 40px 0;"><div style="background:' + C.paper + ';border:1px solid ' + C.line + ';padding:16px 18px;font-family:' + SERIF + ';font-size:14px;line-height:1.9;color:' + C.soft + ';">'
      + '<div style="color:' + C.seal + ';letter-spacing:2px;font-size:12px;margin-bottom:6px;">出貨資訊</div>' + track + '</div></td></tr>'
      + linesTable(o) + signature;
    const plain = s => s.replace(/<br>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    return {
      subject: '已出貨 ' + o.orderNo + (o.tracking_no && !meet ? '｜追蹤號碼 ' + o.tracking_no : '') + '｜大道至簡・雲南好物',
      html: shell('訂單 ' + o.orderNo + ' 已經寄出' + (o.tracking_no && !meet ? '，追蹤號碼 ' + o.tracking_no : '') + '。', inner, contactHtml()),
      text: [o.name + '，' + (o.gift ? '禮物' : '你的訂單') + '出發了。', '', '訂單 ' + o.orderNo + ' 已經寄出。', plain(track), note ? plain(note) : '',
        '', contactText(), '', '簡家旗｜大道至簡'].filter(l => l !== '').join('\n')
    };
  }
  return null;
}

async function sendStatusMail(env, row) {
  const m = statusMail(fromRow(row));
  if (!m) return '';
  const notify = String(env.SHOP_NOTIFY_EMAIL || DEFAULT_NOTIFY).split(',').map(s => s.trim()).filter(Boolean);
  return await sendMail(env, { fromName: env.SHOP_FROM_NAME || '大道至簡・雲南好物', to: row.email, replyTo: notify[0], ...m });
}

/* ---------------- 管理 ---------------- */

export async function handleAdminOrders(request, env, url, path) {
  if (!path.startsWith('/api/admin/orders')) return null;
  await ensureOrderSchema(env);

  if (path === '/api/admin/orders' && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT id, order_no, created_at, season, name, phone, email, line, delivery, address, store, pay, note,
              items, subtotal, shipping, total, status, same_phone, mail_status,
              gift, to_name, to_phone, card, hide_price, carrier, tracking_no, shipped_at
       FROM orders ORDER BY id DESC LIMIT 2000`
    ).all();
    return json({ ok: true, orders: results, delivery: DELIVERY, pay: PAY, carriers: CARRIERS });
  }

  if (path === '/api/admin/orders.csv' && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM orders ORDER BY id').all();
    return new Response(toCsv(results), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="yunnan-orders.csv"',
        'Cache-Control': 'no-store'
      }
    });
  }

  const m = path.match(/^\/api\/admin\/orders\/(\d+)\/status$/);
  if (m && request.method === 'POST') {
    // 只接受同源請求，避免被別的網站借用登入狀態改資料
    if (request.headers.get('Origin') !== url.origin) return json({ ok: false, code: 'bad_origin' }, 403);
    let body;
    try { body = await request.json(); } catch (e) { return json({ ok: false, code: 'bad_json' }, 400); }
    if (!ORDER_STATUSES.includes(body.status)) return json({ ok: false, code: 'invalid_status' }, 400);
    const id = Number(m[1]);
    const prev = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
    if (!prev) return json({ ok: false, code: 'not_found' }, 404);
    const carrier = cleanText(body.carrier, 20);
    const tracking = cleanText(body.tracking, LIMITS.tracking);
    if (carrier && !CARRIERS.includes(carrier)) return json({ ok: false, code: 'invalid_carrier' }, 400);
    // 出貨通知一定要附追蹤號碼（面交除外）
    if (body.status === '已出貨' && body.notify && prev.delivery !== 'meet' && !tracking) {
      return json({ ok: false, code: 'need_tracking' }, 400);
    }
    const row = await env.DB.prepare(
      `UPDATE orders SET status = ?, carrier = ?, tracking_no = ?,
         shipped_at = CASE WHEN ? = '已出貨' THEN COALESCE(shipped_at, datetime('now')) ELSE shipped_at END
       WHERE id = ? RETURNING *`
    ).bind(body.status, carrier, tracking, body.status, id).first();
    // 待付款 → 已付款、第一次改成已出貨時才寄；出貨資訊填錯要重寄時，管理頁送 resend
    const changed = body.status === '已付款' ? prev.status === '待付款' : prev.status !== body.status;
    let mail = '';
    if (body.notify && (changed || body.resend)) {
      mail = await sendStatusMail(env, row);
      if (mail) {
        const log = (body.status === '已出貨' ? 'shipped ' : 'paid ') + mail;
        await env.DB.prepare('UPDATE orders SET mail_status = ? WHERE id = ?')
          .bind([row.mail_status, log].filter(Boolean).join('; '), id).run();
      }
    }
    return json({ ok: true, mail });
  }
  return json({ ok: false, code: 'not_found' }, 404);
}

function toCsv(rows) {
  const cols = [
    ['order_no', '訂單編號'], ['created_at', '下單時間'], ['season', '檔期'], ['status', '狀態'],
    ['name', '收件人'], ['phone', '手機'], ['email', 'Email'], ['line', 'LINE'],
    ['delivery', '取貨方式'], ['address', '宅配地址'], ['store', '門市'], ['pay', '付款方式'],
    ['gift', '送禮'], ['to_name', '收件人（送禮）'], ['to_phone', '收件人手機（送禮）'], ['card', '卡片內容'], ['hide_price', '不附價格明細'],
    ['items', '商品明細'], ['subtotal', '商品小計'], ['shipping', '運費'], ['total', '合計'],
    ['carrier', '物流'], ['tracking_no', '追蹤號碼'], ['shipped_at', '出貨時間'],
    ['note', '備註'], ['same_phone', '同檔同電話的其他訂單'], ['mail_status', '寄信結果']
  ];
  const cell = (v) => {
    let t = v == null ? '' : String(v);
    if (/^[=+\-@]/.test(t)) t = "'" + t; // 防止試算表公式注入
    return '"' + t.replace(/"/g, '""') + '"';
  };
  const items = (s) => {
    try { return JSON.parse(s).map(l => l.name + '（' + l.label + '）×' + l.qty).join('、'); } catch (e) { return s; }
  };
  const lines = [cols.map(c => cell(c[1])).join(',')];
  for (const r of rows) {
    lines.push(cols.map(([k]) => {
      if (k === 'created_at' || k === 'shipped_at') return cell(r[k] ? formatTaipei(r[k]) : '');
      if (k === 'gift' || k === 'hide_price') return cell(r[k] ? '是' : '');
      if (k === 'delivery') return cell(DELIVERY[r[k]] || r[k]);
      if (k === 'pay') return cell(PAY[r[k]] || r[k]);
      if (k === 'items') return cell(items(r[k]));
      return cell(r[k]);
    }).join(','));
  }
  return '﻿' + lines.join('\r\n'); // BOM 讓 Excel 正確顯示中文
}

let ready = null;
export function ensureOrderSchema(env) {
  if (!ready) {
    ready = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_no TEXT,
        created_at TEXT NOT NULL,
        season TEXT,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT NOT NULL,
        line TEXT,
        delivery TEXT NOT NULL,
        address TEXT,
        store TEXT,
        pay TEXT NOT NULL,
        note TEXT,
        items TEXT NOT NULL,
        subtotal INTEGER NOT NULL,
        shipping INTEGER NOT NULL,
        total INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT '待付款',
        same_phone TEXT,
        ip_hash TEXT,
        mail_status TEXT
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS orders_ip_time ON orders (ip_hash, created_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS orders_phone_season ON orders (phone, season)')
    ]).then(migrate).catch(err => { ready = null; throw err; });
  }
  return ready;

  // 之後加的欄位：舊資料表補上（已經有的會報「duplicate column」，略過）
  async function migrate() {
    const cols = ['gift INTEGER NOT NULL DEFAULT 0', 'to_name TEXT', 'to_phone TEXT', 'card TEXT',
      'hide_price INTEGER NOT NULL DEFAULT 0', 'carrier TEXT', 'tracking_no TEXT', 'shipped_at TEXT'];
    for (const c of cols) {
      try { await env.DB.prepare('ALTER TABLE orders ADD COLUMN ' + c).run(); }
      catch (e) { if (!/duplicate column/i.test(String(e && e.message))) throw e; }
    }
  }
}
