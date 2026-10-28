/**
 * 無人商店雲端小舖（大道至簡品牌站 cloudshop/，孩子園藝 CH GARDEN）的訂單。寫法照 orders.js（雲南好物）。
 *
 *   POST /api/cloudshop-order                    公開：收一張訂單（JSON），依 cloudshop/products.json 重算金額，存進 D1，寄信
 *   GET  /api/admin/cloudshop                    管理：全部訂單
 *   POST /api/admin/cloudshop/<id>/status        管理：改狀態、填物流與追蹤號碼；改成已付款／可取貨／已出貨時寄信通知客人
 *   GET  /api/admin/cloudshop.csv                管理：匯出 CSV
 *
 * 商品、價格、運費、本週預訂截止日、付款資訊都寫在 cloudshop/products.json，網頁和這裡共用同一份：
 * 客人送來的只有「哪樣商品、哪個規格、幾份」，金額一律在這裡重算。
 *
 * 跟雲南好物不同的地方：
 *   ・Email 選填（客人多用 LINE）。沒填 Email 就不寄確認信與狀態通知，管理頁會提醒改用 LINE 聯絡。
 *   ・取貨多一種「到店自取」：無人商店的取貨櫃輸入訂單編號末四碼取貨，所以編號是 CS＋日期＋4 位流水號。
 *     到店自取的訂單備好後改「可取貨」，客人會收到「可以來取貨了」的信。
 *   ・shelf: "week"（本週預訂）的商品過了 week.deadline 不收。
 *
 * 寄信用幸福餐桌那組 Gmail，寄件人名稱 CLOUDSHOP_FROM_NAME；新訂單通知寄 SHOP_NOTIFY_EMAIL（與雲南好物相同）。
 */
import catalog from '../../cloudshop/products.json';
import { sendMail } from './mail.js';
import { json, hashIp, formatTaipei } from './util.js';

export const CLOUDSHOP_STATUSES = ['待付款', '已付款', '可取貨', '已出貨', '已完成', '取消'];
const DELIVERY = { pickup: '到店自取', home: '宅配', '711': '7-11 取貨', family: '全家取貨' };
const FEE_KIND = { pickup: 'pickup', home: 'home', '711': 'cvs', family: 'cvs' };
const PAY = { linepay: 'LINE Pay', bank: '匯款' };
const LIMITS = { name: 40, phone: 20, email: 120, line: 60, address: 200, store: 60, note: 1000, tracking: 40 };
export const CLOUDSHOP_CARRIERS = ['黑貓宅急便', '新竹物流', '中華郵政', '7-11 交貨便', '全家店到店', '其他'];
const RATE_WINDOW_MIN = 10;
const RATE_MAX = 5;
const DEFAULT_NOTIFY = 'jianchiachi@gmail.com';
const FROM_NAME = env => env.CLOUDSHOP_FROM_NAME || '孩子園藝・雲端小舖';

/* ---------------- 公開：下單 ---------------- */

export async function handleCloudshopOrder(request, env, ctx, url) {
  if (Number(request.headers.get('Content-Length') || 0) > 32 * 1024) return json({ ok: false, code: 'too_large' }, 413);
  let data;
  try { data = await request.json(); } catch (e) { return json({ ok: false, code: 'bad_json' }, 400); }
  // 蜜罐欄位：真人看不到也不會填，有值就是機器人。回成功，不讓它換方式再試。
  if (data && data.website) return json({ ok: true, orderNo: '' });

  const f = clean(data || {});
  const missing = [];
  if (!f.name) missing.push('name');
  if (!/^09\d{8}$/.test(f.phone)) missing.push('phone');
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) missing.push('email');
  if (!DELIVERY[f.delivery]) missing.push('delivery');
  if (f.delivery === 'home' && !f.address) missing.push('address');
  if ((f.delivery === '711' || f.delivery === 'family') && !f.store) missing.push('store');
  if (!PAY[f.pay]) missing.push('pay');
  if (missing.length) return json({ ok: false, code: 'invalid', fields: missing }, 400);

  const priced = price(data.items);
  if (priced.error) return json({ ok: false, code: priced.error, item: priced.item || '' }, 400);
  const shipping = shippingFee(priced.subtotal, f.delivery);

  await ensureCloudshopSchema(env);
  const ipHash = await hashIp(request.headers.get('CF-Connecting-IP') || '');
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM cloudshop_orders WHERE ip_hash = ? AND created_at > datetime('now', ?)"
  ).bind(ipHash, `-${RATE_WINDOW_MIN} minutes`).first();
  if (recent && recent.n >= RATE_MAX) return json({ ok: false, code: 'rate_limited' }, 429);

  // 同一支電話還有沒完成的訂單：通知信與管理頁標出來，方便合併取貨或寄送、調整運費
  const { results: earlier } = await env.DB.prepare(
    "SELECT order_no FROM cloudshop_orders WHERE phone = ? AND status IN ('待付款', '已付款', '可取貨') ORDER BY id"
  ).bind(f.phone).all();
  const samePhone = earlier.map(r => r.order_no).join(', ');

  const row = await env.DB.prepare(
    `INSERT INTO cloudshop_orders (created_at, name, phone, email, line, delivery, address, store, pay, note,
       items, subtotal, shipping, total, same_phone, ip_hash)
     VALUES (datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, created_at`
  ).bind(f.name, f.phone, f.email, f.line, f.delivery, f.address, f.store, f.pay, f.note,
    JSON.stringify(priced.lines), priced.subtotal, shipping, priced.subtotal + shipping, samePhone, ipHash).first();

  // 末四碼是取貨櫃要輸入的號碼：用流水號，一萬張以內不會重複
  const orderNo = 'CS' + taipeiDate(row.created_at) + '-' + String(row.id % 10000).padStart(4, '0');
  await env.DB.prepare('UPDATE cloudshop_orders SET order_no = ? WHERE id = ?').bind(orderNo, row.id).run();

  const o = {
    ...f, id: row.id, orderNo, lines: priced.lines, subtotal: priced.subtotal, shipping,
    total: priced.subtotal + shipping, samePhone, submittedAt: formatTaipei(row.created_at),
    adminUrl: url.origin + '/admin#cloudshop', siteUrl: env.BRAND_SITE_URL || 'https://alexchiachi.github.io/happy/'
  };
  // 訂單已經存好；寄信放到回應之後，不讓客人等
  ctx.waitUntil(sendNewOrderMails(env, o));
  return json({ ok: true, orderNo, pickupCode: orderNo.slice(-4), subtotal: o.subtotal, shipping, total: o.total, emailed: !!f.email });
}

const cleanText = (v, max) => String(v == null ? '' : v)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);

function clean(d) {
  const s = cleanText;
  return {
    name: s(d.name, LIMITS.name),
    phone: s(d.phone, LIMITS.phone).replace(/[\s\-()]/g, ''),
    email: s(d.email, LIMITS.email).toLowerCase(),
    line: s(d.line, LIMITS.line),
    delivery: s(d.delivery, 10),
    address: s(d.address, LIMITS.address),
    store: s(d.store, LIMITS.store),
    pay: s(d.pay, 10),
    note: s(d.note, LIMITS.note)
  };
}

// 依商品表重算：只認得 products.json 裡上架中、有價格的商品與規格；本週預訂過了截止日不收
export function price(items, now = new Date()) {
  if (!Array.isArray(items) || !items.length || items.length > 80) return { error: 'empty_cart' };
  const deadline = new Date(catalog.week.deadline);
  const byId = Object.fromEntries(catalog.products.map(p => [p.id, p]));
  const merged = new Map();
  for (const it of items) {
    const p = byId[String(it && it.id)];
    const v = p && (p.variants || []).find(x => x.key === String(it.variant));
    const qty = Number(it && it.qty);
    if (!p || !v || p.active === false) return { error: 'unknown_item', item: String(it && it.id) };
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) return { error: 'bad_qty', item: p.name };
    if (p.shelf === 'week' && now > deadline) return { error: 'week_closed', item: p.name };
    const key = p.id + '|' + v.key;
    merged.set(key, { id: p.id, variant: v.key, name: p.name, label: v.label, unit: v.unit, price: v.price,
      qty: (merged.has(key) ? merged.get(key).qty : 0) + qty });
  }
  const lines = [...merged.values()].map(l => ({ ...l, amount: l.price * l.qty }));
  return { lines, subtotal: lines.reduce((a, l) => a + l.amount, 0) };
}

// 跟網頁同一條規則：到店自取免運；寄送滿 shipping.free 免運
export function shippingFee(subtotal, delivery) {
  const s = catalog.shipping;
  if (subtotal >= s.free) return 0;
  return Number(s[FEE_KIND[delivery]] || 0);
}

function taipeiDate(sqlUtc) {
  const d = new Date(String(sqlUtc).replace(' ', 'T') + 'Z');
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(d).replace(/-/g, '');
}

/* ---------------- 信件 ---------------- */

const notifyList = env => String(env.SHOP_NOTIFY_EMAIL || DEFAULT_NOTIFY).split(',').map(s => s.trim()).filter(Boolean);

async function sendNewOrderMails(env, o) {
  const notify = notifyList(env);
  const results = [];
  for (const to of notify) {
    results.push('owner ' + await sendMail(env, {
      fromName: FROM_NAME(env), to, replyTo: o.email || undefined,
      subject: '[雲端小舖] 新訂單 ' + o.orderNo + '｜' + o.name + '｜' + money(o.total) + '｜' + DELIVERY[o.delivery] + (o.samePhone ? '｜同電話有未完成訂單' : ''),
      html: ownerHtml(o), text: ownerText(o)
    }));
  }
  if (o.email) {
    results.push('guest ' + await sendMail(env, {
      fromName: FROM_NAME(env), to: o.email, replyTo: notify[0],
      subject: '訂單已收到 ' + o.orderNo + '｜孩子園藝・雲端小舖',
      html: guestHtml(o), text: guestText(o)
    }));
  } else {
    results.push('guest skipped: no email');
  }
  await env.DB.prepare('UPDATE cloudshop_orders SET mail_status = ? WHERE id = ?').bind(results.join('; '), o.id).run();
}

// 孩子園藝配色（cloudshop.css）：粉米底、標誌棕字、薄荷點綴
const C = { paper: '#FFFAF5', card: '#FFFFFF', ink: '#4A2C12', soft: '#6A4A30', mist: '#7A6656', line: '#EBDCD2', mint: '#276A62', brown: '#603813', red: '#B5462F' };
const SERIF = '"Noto Serif TC","Songti TC","PMingLiU",serif';
const LATIN = '"Cormorant Garamond",Georgia,serif';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const para = s => esc(s).replace(/\r?\n/g, '<br>');
const money = n => 'NT$' + Number(n).toLocaleString('en-US');
const plain = s => s.replace(/<br>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');

function shell(preheader, inner, footer) {
  return '<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="UTF-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light">'
    + '<title>孩子園藝・雲端小舖</title></head>'
    + '<body style="margin:0;padding:0;background:' + C.paper + ';">'
    + '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">' + esc(preheader) + '</div>'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + C.paper + ';">'
    + '<tr><td align="center" style="padding:36px 12px;">'
    + '<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background:' + C.card + ';border:1px solid ' + C.line + ';">'
    // 標誌的四色葉子細條
    + '<tr><td style="padding:0;font-size:0;line-height:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
    + ['#E0465E', '#F2C14E', '#F0782D', '#7FD3C7'].map(c => '<td style="height:4px;background:' + c + ';"></td>').join('') + '</tr></table></td></tr>'
    + '<tr><td style="padding:30px 40px 0;font-family:' + LATIN + ';font-size:13px;letter-spacing:3px;color:' + C.mint + ';text-transform:uppercase;">CH Garden · 雲端小舖</td></tr>'
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
const linesText = o => o.lines.map(l => '・' + l.name + '（' + l.label + '）× ' + l.qty + '　' + money(l.amount));

const STORE = catalog.store || {};
const whereOf = o => o.delivery === 'home' ? o.address : o.delivery === 'pickup' ? (STORE.name || '門市') + (STORE.address ? '・' + STORE.address : '') : o.store;
const CONTACT = catalog.contact || {};
const contactHtml = () => '有任何問題' + (CONTACT.line ? '，加 LINE 官方帳號 <a href="' + esc(CONTACT.lineUrl) + '" style="color:' + C.mint + ';">' + esc(CONTACT.line) + '</a> 問我們' : '')
  + '，或直接回覆這封信。<br>孩子園藝 · CH GARDEN — children &amp; happiness';
const contactText = () => '有問題' + (CONTACT.line ? '加 LINE 官方帳號 ' + CONTACT.line + ' 問我們，' : '') + '或直接回覆這封信。';

function infoRows(o) {
  const row = (k, v) => '<tr><td style="padding:3px 16px 3px 0;color:' + C.mist + ';white-space:nowrap;vertical-align:top;">' + k + '</td><td style="padding:3px 0;color:' + C.ink + ';">' + v + '</td></tr>';
  return '<tr><td style="padding:18px 40px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:' + SERIF + ';font-size:14px;line-height:1.7;">'
    + row('姓名', esc(o.name) + '・' + esc(o.phone))
    + (o.email ? row('Email', esc(o.email)) : '')
    + (o.line ? row('LINE', esc(o.line)) : '')
    + row('取貨', esc(DELIVERY[o.delivery]) + '・' + esc(whereOf(o)))
    + row('付款', esc(PAY[o.pay]))
    + (o.note ? row('備註', para(o.note)) : '')
    + '</table></td></tr>';
}

function payBox(o) {
  const p = catalog.payment;
  const img = p.linepayImage ? new URL(p.linepayImage, o.siteUrl + 'cloudshop/').href : '';
  const body = o.pay === 'bank'
    ? '請匯款 <b>' + money(o.total) + '</b> 到：<br>' + para(p.bank) + '<br>匯款後用 LINE 或回覆這封信，告訴我們帳號末五碼就好。'
    : '請用 LINE Pay 付款 <b>' + money(o.total) + '</b>：<br>' + para(p.linepay)
      + (img ? '<br><img src="' + esc(img) + '" alt="LINE Pay 收款碼（嘉禮慕華）" width="200" style="display:block;width:200px;max-width:100%;height:auto;margin:12px 0;border:1px solid ' + C.line + ';">' : '')
      + (p.linepayUrl ? '<a href="' + esc(p.linepayUrl) + '" style="display:inline-block;margin:4px 0 8px;padding:8px 18px;background:#06C755;color:#FFFFFF;text-decoration:none;border-radius:999px;font-size:14px;">開啟 LINE Pay 付款</a><br>' : '')
      + '付款後用 LINE 或回覆這封信告訴我們，我們核對後就備貨。';
  return '<tr><td style="padding:24px 40px 0;"><div style="background:' + C.paper + ';border:1px solid ' + C.line + ';padding:16px 18px;font-family:' + SERIF + ';font-size:14px;line-height:1.9;color:' + C.soft + ';">'
    + '<div style="color:' + C.red + ';letter-spacing:2px;font-size:12px;margin-bottom:6px;">付款方式・' + esc(PAY[o.pay]) + '</div>' + body + '</div></td></tr>';
}

const signature = '<tr><td style="padding:28px 40px 36px;font-family:' + SERIF + ';font-size:15px;line-height:1.8;color:' + C.brown + ';letter-spacing:2px;">'
  + '<div style="height:1px;background:' + C.line + ';line-height:1px;font-size:1px;margin-bottom:22px;">&nbsp;</div>孩子園藝・雲端小舖</td></tr>';
const heading = t => '<tr><td style="padding:18px 40px 0;font-family:' + SERIF + ';font-size:22px;line-height:1.6;color:' + C.ink + ';letter-spacing:1px;">' + t + '</td></tr>';
const lead = t => '<tr><td style="padding:10px 40px 14px;font-family:' + SERIF + ';font-size:15px;line-height:1.9;color:' + C.soft + ';">' + t + '</td></tr>';
const box = (title, t) => '<tr><td style="padding:6px 40px 0;"><div style="background:' + C.paper + ';border:1px solid ' + C.line + ';padding:16px 18px;font-family:' + SERIF + ';font-size:14px;line-height:1.9;color:' + C.soft + ';">'
  + '<div style="color:' + C.red + ';letter-spacing:2px;font-size:12px;margin-bottom:6px;">' + title + '</div>' + t + '</div></td></tr>';

// 到店自取：取貨櫃輸入訂單編號末四碼
const pickupNote = o => '到店後在取貨櫃輸入訂單編號末四碼 <b style="color:' + C.ink + ';font-size:16px;letter-spacing:2px;">' + esc(o.orderNo.slice(-4)) + '</b> 取貨。'
  + (STORE.hours ? '<br>營業時間：' + esc(STORE.hours) : '');

function guestHtml(o) {
  const next = o.delivery === 'pickup'
    ? '收到款項後我們開始備貨，備好會再寄信通知你來取貨。'
    : '收到款項後我們開始備貨、寄出，寄出時會再寄一封信附上物流追蹤號碼。';
  const inner = heading(esc(o.name) + '，訂單收到了。')
    + lead('訂單編號 <b style="color:' + C.ink + ';">' + esc(o.orderNo) + '</b>。' + next)
    + linesTable(o) + payBox(o)
    + (o.delivery === 'pickup' ? box('到店自取', pickupNote(o)) : '')
    + infoRows(o) + signature;
  return shell('訂單 ' + o.orderNo + '，合計 ' + money(o.total) + '。付款資訊在信裡。', inner, contactHtml());
}

function guestText(o) {
  const p = catalog.payment;
  return [
    o.name + '，訂單收到了。', '',
    '訂單編號：' + o.orderNo,
    ...linesText(o),
    '商品小計：' + money(o.subtotal),
    '運費：' + (o.shipping ? money(o.shipping) : '免運'),
    '合計：' + money(o.total), '',
    '付款方式：' + PAY[o.pay],
    o.pay === 'bank' ? '匯款資訊：' + p.bank + '\n匯款後告訴我們帳號末五碼。' : 'LINE Pay：' + p.linepay + (p.linepayUrl ? '\n手機付款連結：' + p.linepayUrl : '') + '\n付款後告訴我們。',
    '',
    '取貨：' + DELIVERY[o.delivery] + '・' + whereOf(o),
    o.delivery === 'pickup' ? plain(pickupNote(o)) : '寄出時會再寄信附上追蹤號碼。', '',
    contactText(), '',
    '孩子園藝・雲端小舖'
  ].join('\n');
}

function ownerHtml(o) {
  const flag = o.samePhone
    ? '<tr><td style="padding:14px 40px 0;"><div style="border-left:3px solid ' + C.red + ';padding:6px 12px;font-family:' + SERIF + ';font-size:14px;color:' + C.red + ';">同一支電話還有沒完成的訂單：' + esc(o.samePhone) + '。可以合併取貨或寄送，運費請手動調整。</div></td></tr>'
    : '';
  const noMail = o.email ? '' : '<tr><td style="padding:14px 40px 0;"><div style="border-left:3px solid ' + C.mint + ';padding:6px 12px;font-family:' + SERIF + ';font-size:14px;color:' + C.soft + ';">客人沒有留 Email，收不到確認信與通知信，請用 LINE 或電話聯絡。</div></td></tr>';
  const inner = '<tr><td style="padding:18px 40px 4px;font-family:' + SERIF + ';font-size:22px;line-height:1.6;color:' + C.ink + ';letter-spacing:1px;">新訂單 ' + esc(o.orderNo) + '</td></tr>'
    + '<tr><td style="padding:0 40px;font-family:' + SERIF + ';font-size:13px;color:' + C.mist + ';">' + esc(o.submittedAt) + '</td></tr>'
    + flag + noMail + infoRows(o) + linesTable(o)
    + '<tr><td style="padding:28px 40px 36px;font-family:' + SERIF + ';font-size:14px;line-height:1.8;color:' + C.soft + ';">'
    + (o.email ? '直接按「回覆」就會寄到客人的信箱。' : '')
    + '收到款項後，到 <a href="' + esc(o.adminUrl) + '" style="color:' + C.mint + ';">管理頁</a> 把狀態改成「已付款」；'
    + (o.delivery === 'pickup' ? '放進取貨櫃後改「可取貨」' : '寄出後填上追蹤號碼、改「已出貨」') + '，有留 Email 的客人會收到通知信。</td></tr>';
  return shell(o.name + '・' + money(o.total) + '・' + DELIVERY[o.delivery], inner, '#' + o.id + ' · 已存進雲端小舖訂單紀錄。');
}

function ownerText(o) {
  return [
    '訂單：' + o.orderNo + '（' + o.submittedAt + '）',
    o.samePhone ? '※ 同一支電話還有沒完成的訂單：' + o.samePhone : '',
    o.email ? '' : '※ 客人沒有留 Email，請用 LINE 或電話聯絡',
    '姓名：' + o.name, '手機：' + o.phone, o.email ? 'Email：' + o.email : '', o.line ? 'LINE：' + o.line : '',
    '取貨：' + DELIVERY[o.delivery] + '・' + whereOf(o),
    '付款：' + PAY[o.pay], o.note ? '備註：' + o.note : '', '',
    ...linesText(o),
    '小計 ' + money(o.subtotal) + '／運費 ' + (o.shipping ? money(o.shipping) : '免運') + '／合計 ' + money(o.total), '',
    '管理頁：' + o.adminUrl
  ].filter(l => l !== '').join('\n');
}

/* ---------------- 狀態通知（管理頁改狀態時寄給有留 Email 的客人） ---------------- */

function fromRow(r) {
  let lines = [];
  try { lines = JSON.parse(r.items); } catch (e) { /* 舊資料壞掉就不列明細 */ }
  return { ...r, orderNo: r.order_no || ('#' + r.id), lines };
}

function statusMail(o) {
  const tail = ['', contactText(), '', '孩子園藝・雲端小舖'];
  if (o.status === '已付款') {
    const next = o.delivery === 'pickup' ? '我們開始備貨，放進取貨櫃後會再寄信通知你。' : '我們開始備貨，寄出當天會再寄一封信，附上物流追蹤號碼。';
    const inner = heading(esc(o.name) + '，款項收到了。')
      + lead('訂單 <b style="color:' + C.ink + ';">' + esc(o.orderNo) + '</b> 的款項 ' + money(o.total) + ' 已經入帳，謝謝你。<br>' + next)
      + linesTable(o) + signature;
    return {
      subject: '款項已收到 ' + o.orderNo + '｜孩子園藝・雲端小舖',
      html: shell('訂單 ' + o.orderNo + ' 的款項收到了。', inner, contactHtml()),
      text: [o.name + '，款項收到了。', '', '訂單 ' + o.orderNo + ' 的款項 ' + money(o.total) + ' 已經入帳。', next, ...tail].join('\n')
    };
  }
  if (o.status === '可取貨') {
    const inner = heading(esc(o.name) + '，可以來取貨了。')
      + lead('訂單 <b style="color:' + C.ink + ';">' + esc(o.orderNo) + '</b> 已經放進取貨櫃。')
      + box('到店自取・' + esc(whereOf(o)), pickupNote(o)) + linesTable(o) + signature;
    return {
      subject: '可以取貨了 ' + o.orderNo + '｜取貨碼 ' + o.orderNo.slice(-4) + '｜孩子園藝・雲端小舖',
      html: shell('取貨碼 ' + o.orderNo.slice(-4) + '，到店在取貨櫃輸入即可。', inner, contactHtml()),
      text: [o.name + '，可以來取貨了。', '', '訂單 ' + o.orderNo + ' 已經放進取貨櫃。', '地點：' + whereOf(o), plain(pickupNote(o)), ...tail].join('\n')
    };
  }
  if (o.status === '已出貨') {
    const cvs = o.delivery === '711' || o.delivery === 'family';
    const track = '物流：' + esc(o.carrier || DELIVERY[o.delivery]) + '<br>追蹤號碼：<b style="color:' + C.ink + ';font-size:16px;letter-spacing:1px;">' + esc(o.tracking_no || '（稍後補上）') + '</b>'
      + '<br><span style="color:' + C.mist + ';font-size:13px;">可以到物流公司的網站，用追蹤號碼查詢配送進度。</span>';
    const note = cvs ? '包裹到店後，超商會用簡訊通知取件，請記得在 7 天內取貨。' : '宅配到你填的地址，送達前物流可能會先打電話聯絡。';
    const inner = heading(esc(o.name) + '，你的訂單出發了。')
      + lead('訂單 <b style="color:' + C.ink + ';">' + esc(o.orderNo) + '</b> 已經寄出。<br>' + note)
      + box('出貨資訊', track) + linesTable(o) + signature;
    return {
      subject: '已出貨 ' + o.orderNo + (o.tracking_no ? '｜追蹤號碼 ' + o.tracking_no : '') + '｜孩子園藝・雲端小舖',
      html: shell('訂單 ' + o.orderNo + ' 已經寄出' + (o.tracking_no ? '，追蹤號碼 ' + o.tracking_no : '') + '。', inner, contactHtml()),
      text: [o.name + '，你的訂單出發了。', '', '訂單 ' + o.orderNo + ' 已經寄出。', plain(track), note, ...tail].join('\n')
    };
  }
  return null;
}

async function sendStatusMail(env, row) {
  if (!row.email) return 'skipped: no email';
  const m = statusMail(fromRow(row));
  if (!m) return '';
  return await sendMail(env, { fromName: FROM_NAME(env), to: row.email, replyTo: notifyList(env)[0], ...m });
}

/* ---------------- 管理 ---------------- */

export async function handleAdminCloudshop(request, env, url, path) {
  if (!path.startsWith('/api/admin/cloudshop')) return null;
  await ensureCloudshopSchema(env);

  if (path === '/api/admin/cloudshop' && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT id, order_no, created_at, name, phone, email, line, delivery, address, store, pay, note,
              items, subtotal, shipping, total, status, same_phone, mail_status, carrier, tracking_no, shipped_at
       FROM cloudshop_orders ORDER BY id DESC LIMIT 2000`
    ).all();
    return json({ ok: true, orders: results, delivery: DELIVERY, pay: PAY, carriers: CLOUDSHOP_CARRIERS });
  }

  if (path === '/api/admin/cloudshop.csv' && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM cloudshop_orders ORDER BY id').all();
    return new Response(toCsv(results), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="cloudshop-orders.csv"',
        'Cache-Control': 'no-store'
      }
    });
  }

  const m = path.match(/^\/api\/admin\/cloudshop\/(\d+)\/status$/);
  if (m && request.method === 'POST') {
    // 只接受同源請求，避免被別的網站借用登入狀態改資料
    if (request.headers.get('Origin') !== url.origin) return json({ ok: false, code: 'bad_origin' }, 403);
    let body;
    try { body = await request.json(); } catch (e) { return json({ ok: false, code: 'bad_json' }, 400); }
    if (!CLOUDSHOP_STATUSES.includes(body.status)) return json({ ok: false, code: 'invalid_status' }, 400);
    const id = Number(m[1]);
    const prev = await env.DB.prepare('SELECT * FROM cloudshop_orders WHERE id = ?').bind(id).first();
    if (!prev) return json({ ok: false, code: 'not_found' }, 404);
    const carrier = cleanText(body.carrier, 20);
    const tracking = cleanText(body.tracking, LIMITS.tracking);
    if (carrier && !CLOUDSHOP_CARRIERS.includes(carrier)) return json({ ok: false, code: 'invalid_carrier' }, 400);
    // 「可取貨」只給到店自取；「已出貨」只給寄送的訂單，寄信時一定要附追蹤號碼
    if (body.status === '可取貨' && prev.delivery !== 'pickup') return json({ ok: false, code: 'not_pickup' }, 400);
    if (body.status === '已出貨' && prev.delivery === 'pickup') return json({ ok: false, code: 'is_pickup' }, 400);
    if (body.status === '已出貨' && body.notify && prev.email && !tracking) return json({ ok: false, code: 'need_tracking' }, 400);
    const row = await env.DB.prepare(
      `UPDATE cloudshop_orders SET status = ?, carrier = ?, tracking_no = ?,
         shipped_at = CASE WHEN ? IN ('已出貨', '可取貨') THEN COALESCE(shipped_at, datetime('now')) ELSE shipped_at END
       WHERE id = ? RETURNING *`
    ).bind(body.status, carrier, tracking, body.status, id).first();
    // 待付款 → 已付款、第一次改成可取貨／已出貨時才寄；資訊填錯要重寄時，管理頁送 resend
    const changed = body.status === '已付款' ? prev.status === '待付款' : prev.status !== body.status;
    let mail = '';
    if (body.notify && (changed || body.resend)) {
      mail = await sendStatusMail(env, row);
      if (mail) {
        const tag = { '已付款': 'paid ', '可取貨': 'ready ', '已出貨': 'shipped ' }[body.status] || '';
        if (tag) {
          await env.DB.prepare('UPDATE cloudshop_orders SET mail_status = ? WHERE id = ?')
            .bind([row.mail_status, tag + mail].filter(Boolean).join('; '), id).run();
        } else mail = '';
      }
    }
    return json({ ok: true, mail });
  }
  return json({ ok: false, code: 'not_found' }, 404);
}

function toCsv(rows) {
  const cols = [
    ['order_no', '訂單編號'], ['created_at', '下單時間'], ['status', '狀態'],
    ['name', '姓名'], ['phone', '手機'], ['email', 'Email'], ['line', 'LINE'],
    ['delivery', '取貨方式'], ['address', '宅配地址'], ['store', '門市'], ['pay', '付款方式'],
    ['items', '商品明細'], ['subtotal', '商品小計'], ['shipping', '運費'], ['total', '合計'],
    ['carrier', '物流'], ['tracking_no', '追蹤號碼'], ['shipped_at', '可取貨／出貨時間'],
    ['note', '備註'], ['same_phone', '同電話未完成的訂單'], ['mail_status', '寄信結果']
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
      if (k === 'delivery') return cell(DELIVERY[r[k]] || r[k]);
      if (k === 'pay') return cell(PAY[r[k]] || r[k]);
      if (k === 'items') return cell(items(r[k]));
      return cell(r[k]);
    }).join(','));
  }
  return '﻿' + lines.join('\r\n'); // BOM 讓 Excel 正確顯示中文
}

let ready = null;
export function ensureCloudshopSchema(env) {
  if (!ready) {
    ready = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS cloudshop_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_no TEXT,
        created_at TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
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
        mail_status TEXT,
        carrier TEXT,
        tracking_no TEXT,
        shipped_at TEXT
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS cloudshop_ip_time ON cloudshop_orders (ip_hash, created_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS cloudshop_phone ON cloudshop_orders (phone)')
    ]).catch(err => { ready = null; throw err; });
  }
  return ready;
}
