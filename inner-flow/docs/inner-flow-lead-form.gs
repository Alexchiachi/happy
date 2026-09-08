/**
 * 內耗檢測 — 免費指南留資接收器
 * ================================================================
 * 把 index.html 的「下載 PDF 指南」表單送出的資料寫進 Google 試算表，
 * 並寄出兩封信：一封通知你，一封確認給填表的人。
 * 使用者按下按鈕的當下就開始下載，信件只是補上，不是取件方式。
 *
 * 和 google-sheet-form.gs 是兩個不同的端點：欄位不同、要進的表也不同，
 * 分開部署比較好查，也不會互相影響。
 *
 * ── 安裝步驟（大約五分鐘）─────────────────────────────
 *
 * 1. 開一份新的 Google 試算表，取名例如「內耗檢測 · 名單」
 *
 * 2. 在試算表上方選 [擴充功能] → [Apps Script]
 *
 * 3. 把編輯器裡原本的 function myFunction() {} 整個刪掉，
 *    貼上這個檔案的全部內容
 *
 * 4. 填下面的「設定」區：NOTIFY_EMAIL 是你自己的信箱。
 *    ★ 重貼這支腳本會把你上次填的蓋掉，貼完記得回來確認這一格 ★
 *
 * 5. 右上角 [部署] → [新增部署作業]
 *      類型          網頁應用程式
 *      執行身分      我
 *      具有存取權者  所有人          ← 這項一定要選「所有人」
 *    按 [部署]，第一次會要求授權，照著授權即可
 *    （這一版會寄信，授權畫面會多要一個寄信權限，一起同意）
 *
 * 6. 複製它給你的網址，長得像：
 *      https://script.google.com/macros/s/AKfycb.../exec
 *
 * 7. 把那串網址填進 index.html 的表單屬性：
 *      <form id="leadForm" data-endpoint="貼在這裡" ...>
 *    在那之前，使用者仍然拿得到 PDF，只是不會留下任何資料。
 *
 * ── 之後要改程式碼的話 ────────────────────────────────
 * 改完一定要重新 [部署] → [管理部署作業] → 編輯 → 版本選「新版本」，
 * 否則線上跑的還是舊的那一版。
 *
 * ── 為什麼前端送的是 text/plain ───────────────────────
 * application/json 會觸發瀏覽器的 CORS 預檢請求（OPTIONS），
 * 而 Apps Script 的 /exec 不處理 OPTIONS，請求會直接失敗。
 * text/plain 屬於「簡單請求」，不預檢，因此前端以 text/plain 送 JSON 字串，
 * 這裡再自己解析。下面兩種格式都收，日後換別的前端也不會壞。
 *
 * ── 寄信量 ────────────────────────────────────────────
 * 一般 Gmail 帳號每天可寄 100 封（Workspace 是 1500）。
 * 兩封都開的話，一筆名單吃掉 2 封，等於一天約 50 筆。
 * 快要撞到上限時，先把 SEND_CONFIRMATION 關掉，通知信留著。
 * ================================================================
 */

/* ================================================================
 * 設定
 * ============================================================== */

/** 收通知信的信箱。留空字串就不寄通知。 */
const NOTIFY_EMAIL = '';

/** 是否寄一封確認信給填表的人。 */
const SEND_CONFIRMATION = true;

/** 寄件人顯示名稱。 */
const SENDER_NAME = '簡家旗 · 大道至簡';

/** 資料要寫進哪一個工作表分頁（不存在會自動建立）。 */
const SHEET_NAME = '名單';

/** 網站位址，信裡的連結都由這裡組出來。 */
const SITE = 'https://alexchiachi.github.io/happy/inner-flow/';
const GUIDE_URL = SITE + 'downloads/inner-flow-7day-guide.pdf';
const PRIVACY_URL = 'https://alexchiachi.github.io/happy/privacy.html';

/* ================================================================
 * 主流程
 * ============================================================== */

function doPost(e) {
  try {
    const data = readPayload(e);

    const name = String(data.name || '').trim();
    const email = String(data.email || '').trim();

    if (!name || !email) {
      return json({ ok: false, error: 'missing_fields' });
    }

    // 同一個信箱重複送出時只更新最後一次的結果，不重複佔一列
    const sheet = getSheet();
    const row = [
      new Date(),
      name,
      email,
      String(data.type || ''),      // 能量原型
      data.entropy === undefined ? '' : Number(data.entropy),
      String(data.code || ''),      // 六位答案碼，可還原成分享連結
      String(data.submittedAt || '')
    ];

    const existing = findRowByEmail(sheet, email);
    if (existing > 0) {
      sheet.getRange(existing, 1, 1, row.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }

    // 名單已經落表了，寄信失敗不該讓整支請求變成錯誤——
    // 那會讓前端記一筆 lead_record_failed，看起來像資料掉了。
    sendMails(data, name, email);

    return json({ ok: true });

  } catch (err) {
    console.error(err);
    return json({ ok: false, error: String(err) });
  }
}

/** 瀏覽器直接打開這個網址時給個提示，不是錯誤。 */
function doGet() {
  return ContentService.createTextOutput(
    '這是內耗檢測名單的接收端點，請由網站表單送出。'
  );
}

function sendMails(data, name, email) {
  const view = buildView(data, name, email);

  if (NOTIFY_EMAIL) {
    try {
      MailApp.sendEmail({
        to: NOTIFY_EMAIL,
        name: SENDER_NAME,
        subject: '[內耗檢測] ' + name + ' · ' + (view.band || '未完成測驗') +
                 (view.entropy === null ? '' : ' · S' + view.entropy),
        htmlBody: notifyHtml(view),
        body: notifyText(view),
        replyTo: isEmail(email) ? email : undefined
      });
    } catch (err) {
      console.error('通知信寄送失敗：' + err);
    }
  }

  if (SEND_CONFIRMATION && isEmail(email)) {
    try {
      MailApp.sendEmail({
        to: email,
        name: SENDER_NAME,
        subject: '你的《7 天能量自洽復位指南》',
        htmlBody: confirmHtml(view),
        body: confirmText(view),
        replyTo: NOTIFY_EMAIL || undefined
      });
    } catch (err) {
      console.error('確認信寄送失敗：' + err);
    }
  }
}

/**
 * 把送進來的欄位整理成版面要用的形狀。
 * 沒做完測驗就直接留資的情況也要撐得住，所以每一項都給預設值。
 */
function buildView(data, name, email) {
  const d = data.dimensions || {};
  const has = function (v) { return typeof v === 'number' && isFinite(v); };

  return {
    name: name,
    email: email,
    type: String(data.type || ''),
    band: String(data.band || ''),
    entropy: has(Number(data.entropy)) ? Number(data.entropy) : null,
    bottleneck: String(data.bottleneck || ''),
    key: String(data.key || ''),
    code: String(data.code || ''),
    submittedAt: formatTime(data.submittedAt),
    dims: has(Number(d.boundary)) ? [
      { name: '邊界防禦力', value: Number(d.boundary) },
      { name: '心智流動度', value: Number(d.flow) },
      { name: '有效做功能力', value: Number(d.work) }
    ] : null,
    resultUrl: /^[1-4]{6}$/.test(String(data.code || '')) ? SITE + '?r=' + data.code : SITE
  };
}

/* ================================================================
 * 版面：共用的色票、字體與元件
 *
 * 信件排版跟網頁不是同一套規矩：
 *   · <style> 會被部分客戶端拿掉，所以樣式一律寫成 inline
 *   · 沒有 flex / grid，版面用 <table> 疊
 *   · 網頁字體載不進來，思源黑／宋只能當第一順位，後面要有中文備援
 *   · rgba() 支援不一致，半透明一律先算成實色
 *   · 圖片預設被擋，所以整封信不放任何圖——這個品牌本來就是靠字撐的
 * ============================================================== */

// 字型名稱用單引號包。這些字串會被塞進 style="…" 裡，
// 用雙引號的話屬性會在第一個字型名稱就被截斷，後面所有樣式一起失效。
const FONT_SERIF = "'Noto Serif TC','Songti TC',STSong,'PingFang TC','Microsoft JhengHei',serif";
const FONT_SANS = "'Noto Sans TC','PingFang TC','Hiragino Sans','Microsoft JhengHei','Heiti TC',Arial,sans-serif";

const C = {
  ground: '#EDEAE1',   // 信件最外層的底
  paper: '#F7F5F0',    // 內容區，與網站同一張紙
  ink: '#2A2723',
  body: '#5D5B56',     // 內文（ink 75%，對比 6.3:1）
  meta: '#7C7975',     // 次要資訊（ink 60%，對比 4.0:1）
  line: '#DDD7CB',
  clay: '#A67C52',
  clayDeep: '#8C6743', // 小字級用的暖棕，對比 4.7:1
  sage: '#5F6E60',     // 小字級用的鼠尾草綠，對比 5.0:1
  track: '#E4DFD4',
  paperText: '#F7F5F0'
};

const PAD = 'padding-left:32px;padding-right:32px;';

function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function shell(preheader, inner) {
  return '' +
    '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" ' +
    '"http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">' +
    '<html xmlns="http://www.w3.org/1999/xhtml"><head>' +
    '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />' +
    '<meta name="viewport" content="width=device-width,initial-scale=1" />' +
    '<meta name="color-scheme" content="light only" />' +
    '<meta name="supported-color-schemes" content="light only" />' +
    '<title>Inner Flow Assessment</title>' +
    // <style> 在部分客戶端會被移除，所以這裡只放「錦上添花」的窄螢幕微調，
    // 版面本身完全靠 inline 樣式撐住，拿掉也不會壞。
    '<style type="text/css">' +
    '@media only screen and (max-width:480px){' +
    '.px{padding-left:20px !important;padding-right:20px !important;}' +
    '.bar-label{width:78px !important;}' +
    '}' +
    '</style>' +
    '</head>' +
    '<body style="margin:0;padding:0;background-color:' + C.ground + ';">' +

    // 收件匣列表的預覽文字。後面那串零寬空白是用來把信件正文推出預覽範圍的，
    // 不然 Gmail 會把開頭那幾個字接在預覽文字後面一起顯示。
    '<div style="display:none;font-size:1px;color:' + C.ground + ';line-height:1px;' +
    'max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">' +
    esc(preheader) +
    new Array(60).join('&#8203;&nbsp;') +
    '</div>' +

    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
    'bgcolor="' + C.ground + '" style="background-color:' + C.ground + ';margin:0;padding:0;">' +
    '<tr><td align="center" style="padding:36px 12px 48px 12px;">' +

    // Outlook 桌面版是 Word 排版引擎，看不懂 max-width，會把內容拉滿整個視窗。
    // 所以只餵它一個固定 600px 的表格當外框；其他客戶端跳過這一段，
    // 用下面那個可伸縮的百分比寬表格，窄螢幕才不會橫向溢出。
    '<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" ' +
    'border="0" align="center"><tr><td><![endif]-->' +

    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
    'style="width:100%;max-width:600px;background-color:' + C.paper + ';">' +
    inner +
    '</table>' +

    '<!--[if mso]></td></tr></table><![endif]-->' +

    '</td></tr></table></body></html>';
}

/** 上下留白 */
function gap(px) {
  return '<tr><td style="height:' + px + 'px;line-height:' + px + 'px;font-size:0;">&nbsp;</td></tr>';
}

/** 細分隔線。寬度給百分比，做出置中的短線。 */
function rule(widthPct) {
  return '<tr><td class="px" style="' + PAD + '">' +
    '<table role="presentation" width="' + (widthPct || 100) + '%" cellpadding="0" cellspacing="0" ' +
    'border="0" align="center"><tr>' +
    '<td style="height:1px;line-height:1px;font-size:0;background-color:' + C.line + ';">&nbsp;</td>' +
    '</tr></table></td></tr>';
}

/** 全大寫的小標，字距拉開 */
function eyebrow(text, align) {
  return '<tr><td class="px" align="' + (align || 'center') + '" style="' + PAD + FONT_SANS_STYLE() +
    'font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:' + C.sage + ';' +
    'line-height:1.6;">' + esc(text) + '</td></tr>';
}

function FONT_SANS_STYLE() { return 'font-family:' + FONT_SANS + ';'; }
function FONT_SERIF_STYLE() { return 'font-family:' + FONT_SERIF + ';'; }

function heading(text, color, size) {
  return '<tr><td class="px" align="center" style="' + PAD + FONT_SERIF_STYLE() +
    'font-size:' + (size || 24) + 'px;font-weight:300;line-height:1.7;letter-spacing:0.08em;' +
    'color:' + (color || C.ink) + ';">' + esc(text) + '</td></tr>';
}

function para(text, align, color, size) {
  return '<tr><td class="px" align="' + (align || 'left') + '" style="' + PAD + FONT_SANS_STYLE() +
    'font-size:' + (size || 14) + 'px;line-height:2;letter-spacing:0.05em;' +
    'color:' + (color || C.body) + ';">' + text + '</td></tr>';
}

/** 主要按鈕。用單格表格畫，Outlook 也吃得下，不需要 VML。 */
function button(href, label) {
  return '<tr><td class="px" align="center" style="' + PAD + '">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td bgcolor="' + C.clayDeep + '" style="background-color:' + C.clayDeep + ';">' +
    '<a href="' + esc(href) + '" target="_blank" style="display:inline-block;' +
    'padding:15px 34px;' + FONT_SANS_STYLE() + 'font-size:14px;letter-spacing:0.12em;' +
    'color:' + C.paperText + ';text-decoration:none;">' + esc(label) + '</a>' +
    '</td></tr></table></td></tr>';
}

/** 次要連結，置中 */
function textLink(href, label) {
  return '<tr><td class="px" align="center" style="' + PAD + FONT_SANS_STYLE() +
    'font-size:12px;letter-spacing:0.12em;line-height:2;">' +
    '<a href="' + esc(href) + '" target="_blank" style="color:' + C.sage + ';' +
    'text-decoration:underline;">' + esc(label) + '</a></td></tr>';
}

/** 大數字＋單位 */
function bigScore(value, unit) {
  return '<tr><td class="px" align="center" style="' + PAD + '">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td valign="bottom" style="' + FONT_SERIF_STYLE() + 'font-size:52px;font-weight:300;' +
    'line-height:1;color:' + C.ink + ';padding-right:10px;">' + esc(value) + '</td>' +
    '<td valign="bottom" style="' + FONT_SANS_STYLE() + 'font-size:11px;letter-spacing:0.12em;' +
    'color:' + C.meta + ';padding-bottom:5px;">' + esc(unit) + '</td>' +
    '</tr></table></td></tr>';
}

/**
 * 三維度長條。用巢狀表格的背景色畫，各家客戶端都認得。
 * 分數是 0 的時候不放填色格——width="0%" 在某些客戶端會被畫成一小截。
 */
function bars(dims, bottleneckName) {
  let rows = '';
  dims.forEach(function (d, i) {
    const isBottleneck = bottleneckName && d.name === bottleneckName;
    const value = Math.max(0, Math.min(100, Math.round(d.value)));
    const fill = value > 0
      ? '<td width="' + value + '%" bgcolor="' + (isBottleneck ? C.clayDeep : C.clay) + '" ' +
        'style="width:' + value + '%;height:6px;line-height:6px;font-size:0;">&nbsp;</td>'
      : '';
    const rest = value < 100
      ? '<td style="height:6px;line-height:6px;font-size:0;">&nbsp;</td>'
      : '';

    rows += '<tr>' +
      '<td width="96" class="bar-label" valign="middle" style="width:96px;' + FONT_SANS_STYLE() +
        'font-size:12px;letter-spacing:0.06em;line-height:1.6;padding:9px 12px 9px 0;' +
        'color:' + (isBottleneck ? C.clayDeep : C.body) + ';">' + esc(d.name) + '</td>' +
      '<td valign="middle" style="padding:9px 0;">' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
        'bgcolor="' + C.track + '" style="background-color:' + C.track + ';">' +
        '<tr>' + fill + rest + '</tr></table>' +
      '</td>' +
      '<td width="52" align="right" valign="middle" style="width:52px;' + FONT_SERIF_STYLE() +
        'font-size:19px;font-weight:300;line-height:1;padding:9px 0 9px 14px;' +
        'color:' + (isBottleneck ? C.clayDeep : C.ink) + ';">' + value + '</td>' +
      '</tr>';

    if (i < dims.length - 1) {
      rows += '<tr><td colspan="3" style="height:1px;line-height:1px;font-size:0;">&nbsp;</td></tr>';
    }
  });

  // 瓶頸那一列只有顏色不同，不說一句的話讀者不會知道深色代表什麼。
  // 標記寫在標籤欄裡會換行，所以放在整組長條下面。
  const caption = bottleneckName
    ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
      '<tr><td align="right" style="' + FONT_SANS_STYLE() + 'font-size:10px;letter-spacing:0.1em;' +
      'line-height:2;padding-top:10px;color:' + C.meta + ';">深色為瓶頸維度</td></tr></table>'
    : '';

  return '<tr><td class="px" style="' + PAD + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
    rows + '</table>' + caption + '</td></tr>';
}

/** 通知信用的「欄位：值」一列 */
function field(label, value, valueColor, isLink) {
  const shown = isLink
    ? '<a href="' + esc(value) + '" target="_blank" style="color:' + C.sage + ';">' + esc(value) + '</a>'
    : esc(value);

  return '<tr>' +
    '<td width="92" valign="top" style="width:92px;' + FONT_SANS_STYLE() +
      'font-size:11px;letter-spacing:0.12em;line-height:2.1;color:' + C.meta + ';' +
      'padding:7px 16px 7px 0;white-space:nowrap;">' + esc(label) + '</td>' +
    '<td valign="top" style="' + FONT_SANS_STYLE() + 'font-size:14px;line-height:2.1;' +
      'letter-spacing:0.04em;color:' + (valueColor || C.ink) + ';padding:7px 0;">' +
      (shown || '<span style="color:' + C.meta + ';">—</span>') + '</td>' +
    '</tr>';
}

function fieldTable(rows) {
  return '<tr><td class="px" style="' + PAD + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
    rows + '</table></td></tr>';
}

function footNote(html) {
  return '<tr><td class="px" align="center" style="' + PAD + FONT_SANS_STYLE() +
    'font-size:11px;line-height:2;letter-spacing:0.08em;color:' + C.meta + ';">' + html + '</td></tr>';
}

/* ================================================================
 * 信一：通知你自己
 * ============================================================== */

function notifyHtml(v) {
  let inner = '';
  inner += gap(44);
  inner += eyebrow('Inner Flow · 新的名單');
  inner += gap(18);
  inner += heading(v.name, C.ink, 26);
  inner += gap(30);
  inner += rule(28);
  inner += gap(30);

  let rows = '';
  rows += field('信箱', v.email, C.ink);
  rows += field('能量原型', v.type || '未完成測驗', v.type ? C.clayDeep : C.meta);
  rows += field('內耗熵值', v.entropy === null ? '' :
                (v.entropy + '  /  100' + (v.band ? '　' + v.band : '')), C.ink);
  rows += field('瓶頸維度', v.bottleneck, C.ink);
  rows += field('答案碼', v.code, C.ink);
  rows += field('送出時間', v.submittedAt, C.body);
  inner += fieldTable(rows);

  if (v.dims) {
    inner += gap(30);
    inner += rule(100);
    inner += gap(26);
    inner += bars(v.dims, v.bottleneck);
  }

  if (v.code) {
    inner += gap(38);
    inner += button(v.resultUrl, '打開這份結果');
  }

  inner += gap(40);
  inner += rule(100);
  inner += gap(24);
  inner += footNote(
    '已寫進試算表的「' + esc(SHEET_NAME) + '」分頁。<br />' +
    '同一個信箱重複送出只會更新同一列，不會多佔一筆。'
  );
  inner += gap(40);

  return shell(
    v.name + '　' + (v.type || '未完成測驗') +
    (v.entropy === null ? '' : '　S ' + v.entropy),
    inner
  );
}

function notifyText(v) {
  return [
    '內耗檢測 · 新的名單',
    '',
    '稱呼：' + v.name,
    '信箱：' + v.email,
    '原型：' + (v.type || '未完成測驗'),
    '熵值：' + (v.entropy === null ? '—' : v.entropy + ' / 100 ' + v.band),
    '瓶頸：' + (v.bottleneck || '—'),
    '答案碼：' + (v.code || '—'),
    '送出：' + v.submittedAt,
    '',
    v.dims ? v.dims.map(function (d) {
      return d.name + '：' + Math.round(d.value);
    }).join('　') : '',
    '',
    '打開這份結果：' + v.resultUrl,
    '',
    '已寫進試算表的「' + SHEET_NAME + '」分頁。'
  ].join('\n');
}

/* ================================================================
 * 信二：確認給填表的人
 * ============================================================== */

function confirmHtml(v) {
  let inner = '';
  inner += gap(48);
  inner += eyebrow('Inner Flow Assessment');
  inner += gap(22);
  inner += heading('7 天能量自洽復位指南', C.ink, 25);
  inner += gap(34);
  inner += rule(28);
  inner += gap(34);

  inner += para(esc(v.name) + '，', 'left', C.ink, 15);
  inner += gap(10);
  // 開場白要看對方有沒有做完測驗。沒有結果卻寫「你剛才看到的那個數字」，
  // 對一個直接留資的人來說是一句沒有對象的話。
  inner += para(
    v.type
      ? '你剛才看到的那個數字不是評分，是一次測量——測量你的能量正在流出去，' +
        '而不是在累積。指南要做的，是把它慢慢收回來。'
      : '內耗不是因為你不夠努力，而是系統封閉之後，熵必然增加。' +
        '指南要做的，是把它慢慢打開。', 'left');
  inner += gap(14);
  inner += para(
    '13 頁，每天一則三分鐘的練習：從邊界重設、心智清空，到做功對齊。' +
    '不必一次讀完，一天一則就好——它本來就是設計成慢慢走的。', 'left');

  inner += gap(38);
  inner += button(GUIDE_URL, '下載指南 PDF');
  inner += gap(14);
  inner += footNote('連結長期有效，收在信箱裡隨時可以回來拿。');

  if (v.type) {
    inner += gap(46);
    inner += rule(100);
    inner += gap(38);
    inner += eyebrow('Your Energy State');
    inner += gap(20);
    if (v.band) {
      inner += para(esc(v.band), 'center', C.meta, 12);
      inner += gap(8);
    }
    inner += heading(v.type, C.clayDeep, 20);
    if (v.entropy !== null) {
      inner += gap(26);
      inner += bigScore(v.entropy, '內耗熵值 S / 100');
    }
    if (v.dims) {
      inner += gap(34);
      inner += bars(v.dims, v.bottleneck);
    }
    if (v.key) {
      inner += gap(34);
      inner += para(esc(v.key), 'center', C.body, 13);
    }
    inner += gap(30);
    inner += textLink(v.resultUrl, '回到完整的診斷 →');
  }

  inner += gap(46);
  inner += rule(100);
  inner += gap(34);
  inner += para('願你這七天過得安靜一些。', 'left', C.body);
  inner += gap(12);
  inner += para('簡家旗', 'left', C.ink, 14);

  inner += gap(40);
  inner += footNote(
    '這封信只會寄這一次，我們不寄電子報，也不會把你的信箱給任何人。<br />' +
    '本工具為自我覺察用途，不構成醫療或心理診斷建議。<br />' +
    '<a href="' + esc(PRIVACY_URL) + '" target="_blank" style="color:' + C.sage + ';">隱私權政策</a>'
  );
  inner += gap(44);

  return shell('13 頁，每天一則三分鐘的練習。連結在信裡。', inner);
}

function confirmText(v) {
  const lines = [
    v.name + '，',
    '',
    v.type ? '你剛才看到的那個數字不是評分，是一次測量——測量你的能量正在流出去，'
           : '內耗不是因為你不夠努力，而是系統封閉之後，熵必然增加。',
    v.type ? '而不是在累積。指南要做的，是把它慢慢收回來。'
           : '指南要做的，是把它慢慢打開。',
    '',
    '13 頁，每天一則三分鐘的練習：從邊界重設、心智清空，到做功對齊。',
    '不必一次讀完，一天一則就好。',
    '',
    '下載指南：' + GUIDE_URL,
    ''
  ];

  if (v.type) {
    lines.push('── 你這次的狀態 ──');
    lines.push((v.band ? v.band + '　' : '') + v.type);
    if (v.entropy !== null) lines.push('內耗熵值 S = ' + v.entropy + ' / 100');
    if (v.dims) {
      lines.push(v.dims.map(function (d) {
        return d.name + ' ' + Math.round(d.value);
      }).join('　'));
    }
    if (v.key) lines.push(v.key);
    lines.push('完整診斷：' + v.resultUrl);
    lines.push('');
  }

  lines.push('願你這七天過得安靜一些。');
  lines.push('簡家旗');
  lines.push('');
  lines.push('這封信只會寄這一次，我們不寄電子報。');
  lines.push('本工具為自我覺察用途，不構成醫療或心理診斷建議。');
  lines.push('隱私權政策：' + PRIVACY_URL);

  return lines.join('\n');
}

/* ================================================================
 * 資料處理
 * ============================================================== */

/**
 * 同時支援兩種送法：
 *  - JSON 字串（前端目前用的方式，Content-Type 為 text/plain）
 *  - 傳統的表單欄位（e.parameter）
 */
function readPayload(e) {
  if (e && e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (err) {
      // 不是 JSON 就當作表單欄位處理
    }
  }
  return (e && e.parameter) || {};
}

function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ''));
}

/** 前端送的是 ISO 時間字串，轉成台北時間讀起來比較快 */
function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return Utilities.formatDate(d, 'Asia/Taipei', 'yyyy/MM/dd HH:mm');
}

/**
 * 找出這個信箱已經在第幾列（沒有就回 0）。
 * 只讀 C 欄，資料量大也不會慢。
 */
function findRowByEmail(sheet, email) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return 0;
  }
  const emails = sheet.getRange(2, 3, lastRow - 1, 1).getValues();
  for (let i = 0; i < emails.length; i++) {
    if (String(emails[i][0]).trim().toLowerCase() === email.toLowerCase()) {
      return i + 2;
    }
  }
  return 0;
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['時間', '稱呼', '電子郵件', '能量原型', '熵值', '答案碼', '送出時間']);
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 150);
    sheet.setColumnWidth(4, 260);
  }
  return sheet;
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ================================================================
 * 預覽用：在 Apps Script 編輯器裡直接執行，把兩封信寄給自己看版面。
 * 選單選 previewMails 按執行即可，不會動到試算表。
 * ============================================================== */

function previewMails() {
  const to = NOTIFY_EMAIL || Session.getEffectiveUser().getEmail();
  const v = buildView({
    type: '次生擾動型：思維反芻與情緒代謝延遲',
    band: '中高熵',
    entropy: 61,
    dimensions: { boundary: 33, flow: 17, work: 67 },
    bottleneck: '心智流動度',
    key: '起手式：為一件已成定局的事寫下一句結論，然後停在那裡。',
    code: '231342',
    submittedAt: new Date().toISOString()
  }, '阿旗', to);

  MailApp.sendEmail({
    to: to, name: SENDER_NAME, subject: '[預覽] 通知信',
    htmlBody: notifyHtml(v), body: notifyText(v)
  });
  MailApp.sendEmail({
    to: to, name: SENDER_NAME, subject: '[預覽] 確認信',
    htmlBody: confirmHtml(v), body: confirmText(v)
  });
}
