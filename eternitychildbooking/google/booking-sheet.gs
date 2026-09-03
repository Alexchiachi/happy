/**
 * 永恆之子整椎中心 · 預約收單（Google 試算表版）
 * Eternity's Child Chiropractic — booking receiver on Google Apps Script
 *
 * 預約送出後會：
 *   1. 在試算表新增一列（含狀態欄，可直接當後台管理）
 *   2. 寄一封通知信到中心信箱（可直接按「回覆」回信給客人）
 *   3. 依客人選的語言，自動回一封確認信給客人
 *
 * 部署步驟見同資料夾的 README.md。
 */

const CENTER_EMAIL = 'ahanamita88888888@gmail.com';   // 中心收件信箱
const CENTER_NAME  = '永恆之子整椎中心';
const SHEET_NAME   = '預約紀錄';

/* 通常留空即可。
   只有在「不是從試算表的『擴充功能 → Apps Script』開啟」這支程式時才需要填：
   把試算表網址 .../spreadsheets/d/【這一段】/edit 貼進來。 */
const SPREADSHEET_ID = '';

/* 中心位置：會附在客人的確認信裡，方便當天找路。 */
const CENTER_MAP_URL = 'https://maps.google.com/?cid=12726538179269329750';

const HEADERS = [
  '送出時間', '預約編號', '狀態', '日期', '開始', '結束',
  '服務項目', '選擇部位', '看診類型', '分鐘', '金額',
  '姓名', '電話', 'Email', '語言', '匯款末五碼', '備註',
  /* 新欄位一律往後加。插在中間會讓試算表裡既有的列全部錯位，
     因為表頭只在工作表為空時才會寫入。 */
  '加贈項目'
];

/* ---------- 收單 ---------- */

function doPost(e) {
  // 從編輯器直接按「執行 doPost」時不會有 e，會在這裡被擋下並說明原因。
  // 要手動測試請改執行下面的 testWrite。
  // 預約頁有兩種送法：表單送出時資料在 e.parameter.payload，
  // 背景請求送出時資料在 e.postData.contents。兩種都要能收。
  const raw = (e && e.parameter && e.parameter.payload) ? e.parameter.payload
            : (e && e.postData && e.postData.contents) ? e.postData.contents
            : '';
  if (!raw) {
    const msg = 'doPost 要由預約頁呼叫才會有資料。' +
                '若要從編輯器測試，請在上方函式選單改選 testWrite 再按執行。';
    Logger.log(msg);
    return json_({ ok: false, error: msg });
  }

  try {
    const d = JSON.parse(raw);
    const sheet = getSheet_();

    sheet.appendRow([
      new Date(),
      d.ref || '',
      '待確認',
      d.date || '',
      d.startTime || '',
      d.endTime || '',
      d.serviceLabel || d.service || '',
      (d.partsLabels || []).join('、'),
      d.visit === 'first' ? '初診' : '回診',
      d.durationMinutes || '',
      d.price || '',
      d.name || '',
      "'" + (d.phone || ''),          // 前面加單引號，避免 0912 開頭被吃掉
      d.email || '',
      d.preferredLanguage || '',
      "'" + (d.transferLast5 || ''),  // 同理，保留開頭的 0
      d.notes || '',
      (d.extrasLabels || []).join('、')
    ]);

    notifyCentre_(d);
    notifyCustomer_(d);
    return json_({ ok: true, ref: d.ref || '' });
  } catch (err) {
    // 寫入或寄信失敗時回報，前端會自動退回「開啟客人信箱程式」。
    // 詳細原因會留在「執行記錄」裡，方便事後追查。
    Logger.log('收單失敗：' + err + '\n' + (err && err.stack));
    return json_({ ok: false, error: String(err) });
  }
}

/**
 * 手動測試用：在編輯器上方的函式選單選 testWrite，按「執行」。
 * 它會模擬一筆預約，走完「寫入試算表 → 寄通知信 → 寄確認信」的完整流程。
 * 跑完請到試算表把那一列刪掉。
 */
function testWrite() {
  const demo = {
    ref: 'TEST-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss'),
    date: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    startTime: '09:00',
    endTime: '09:40',
    serviceLabel: '【測試】量子整骨',
    partsLabels: [],
    visit: 'first',
    durationMinutes: 40,
    price: 1688,
    name: '測試客人',
    phone: '0900000000',
    email: CENTER_EMAIL,          // 確認信也寄給自己，不會打擾到真實客人
    preferredLanguage: 'zh',
    transferLast5: '12345',
    notes: '這是測試資料，確認無誤後請把這一列刪掉',
    '預約明細': '這是一筆測試預約，用來確認試算表與寄信是否正常。'
  };
  const out = doPost({ postData: { contents: JSON.stringify(demo) } });
  Logger.log('執行結果：' + out.getContent());
  Logger.log('試算表：' + getSpreadsheet_().getUrl());
}

/**
 * GET 有兩個用途：
 *   ?action=slots  回傳已成立的時段，預約頁讀回來後把該時段反灰，避免撞單
 *   （不帶參數）    健康檢查，用瀏覽器打開就能確認部署成功
 * 狀態欄含「取消」二字的列會被排除，所以在試算表把狀態改成「已取消」，
 * 那個時段就會立刻重新開放預約。
 */
function doGet(e) {
  const params = (e && e.parameter) || {};
  if (params.action === 'slots') {
    return json_({ ok: true, taken: takenSlots_() });
  }
  return json_({
    ok: true, service: CENTER_NAME, sheet: SHEET_NAME,
    slots: '在網址後面加上 ?action=slots 可看到已被預約的時段'
  });
}

/** 回傳 { 'YYYY-MM-DD': [[開始分鐘, 結束分鐘], …] }，分鐘為當日 00:00 起算。 */
function takenSlots_() {
  const sheet = getSheet_();
  const last = sheet.getLastRow();
  const out = {};
  if (last < 2) return out;

  const rows = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
  const tz = Session.getScriptTimeZone();
  rows.forEach(function (r) {
    if (String(r[2] || '').indexOf('取消') !== -1) return;   // 狀態
    const date  = fmtDate_(r[3], tz);                        // 日期
    const start = toMinutes_(r[4], tz);                      // 開始
    const end   = toMinutes_(r[5], tz);                      // 結束（欄位順序見 HEADERS）
    if (!date || start === null || end === null || end <= start) return;
    if (!out[date]) out[date] = [];
    out[date].push([start, end]);
  });
  return out;
}

/** 試算表可能把日期存成文字或日期物件，兩種都要能讀。 */
function fmtDate_(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

/** 時間同理：可能是文字 'HH:MM'、日期物件，或一天的比例（0.375 = 09:00）。 */
function toMinutes_(v, tz) {
  if (v instanceof Date) {
    return Number(Utilities.formatDate(v, tz, 'H')) * 60 +
           Number(Utilities.formatDate(v, tz, 'm'));
  }
  if (typeof v === 'number' && v >= 0 && v <= 1) return Math.round(v * 24 * 60);
  const m = String(v || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/* ---------- 內部函式 ---------- */

/** 取得試算表；沒綁定又沒填 SPREADSHEET_ID 時，給一個看得懂的錯誤。 */
function getSpreadsheet_() {
  if (SPREADSHEET_ID) return SpreadsheetApp.openById(SPREADSHEET_ID);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('找不到試算表。請從試算表的「擴充功能 → Apps Script」開啟這支程式，' +
                    '或把試算表網址中的 ID 填進最上方的 SPREADSHEET_ID。');
  }
  return ss;
}

function getSheet_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function notifyCentre_(d) {
  const subject = '[新預約 ' + (d.ref || '') + '] ' +
                  prettyDate_(d.date) + ' ' + (d.startTime || '') + ' ' + (d.name || '');
  const rows = [
    ['服務項目', esc_(d.serviceLabel || d.service || '')],
    ['選擇部位', (d.partsLabels || []).join('、')],
    ['加贈項目', (d.extrasLabels || []).join('、')],
    ['看診類型', d.visit === 'first' ? '初診' : '回診'],
    ['預約時間', prettyDate_(d.date) + '　' + (d.startTime || '') + '–' + (d.endTime || '')],
    ['療程時長', (d.durationMinutes || '') + ' 分鐘'],
    ['費用', money_(d.price)],
    ['—', ''],
    ['姓名', esc_(d.name || '')],
    ['電話', d.phone ? '<a href="tel:' + esc_(d.phone) + '" style="color:#1f5f52">' + esc_(d.phone) + '</a>' : ''],
    ['Email', d.email ? '<a href="mailto:' + esc_(d.email) + '" style="color:#1f5f52">' + esc_(d.email) + '</a>' : ''],
    ['溝通語言', LANG_NAME[d.preferredLanguage] || d.preferredLanguage || ''],
    ['匯款末五碼', d.transferLast5 ? '<strong>' + esc_(d.transferLast5) + '</strong>' : '（尚未填寫）'],
    ['備註', esc_(d.notes || '') || '—']
  ];

  const html = mailShell_(
    '新的線上預約',
    d.ref || '',
    tableHtml_(rows) +
    '<p style="margin:22px 0 0"><a href="' + getSpreadsheet_().getUrl() + '" ' +
    'style="display:inline-block;padding:11px 22px;background:#1f5f52;color:#fff;' +
    'border-radius:999px;text-decoration:none;font-weight:600;font-size:14px">開啟預約試算表</a></p>' +
    '<p style="margin:14px 0 0;font-size:12px;color:#7f8d89">直接回覆這封信，就是回信給客人。</p>'
  );

  const options = { name: CENTER_NAME, htmlBody: html };
  if (d.email) options.replyTo = d.email;
  MailApp.sendEmail(CENTER_EMAIL, subject, centreText_(d), options);
}

/** 不支援 HTML 的信箱看到的純文字版本。 */
function centreText_(d) {
  return [
    '預約編號：' + (d.ref || ''),
    '',
    '服務項目：' + (d.serviceLabel || d.service || ''),
    (d.partsLabels || []).length ? '選擇部位：' + d.partsLabels.join('、') : null,
    (d.extrasLabels || []).length ? '加贈項目：' + d.extrasLabels.join('、') : null,
    '看診類型：' + (d.visit === 'first' ? '初診' : '回診'),
    '預約時間：' + prettyDate_(d.date) + ' ' + (d.startTime || '') + '–' + (d.endTime || ''),
    '療程時長：' + (d.durationMinutes || '') + ' 分鐘',
    '費用：' + money_(d.price),
    '',
    '姓名：' + (d.name || ''),
    '電話：' + (d.phone || ''),
    'Email：' + (d.email || ''),
    '溝通語言：' + (LANG_NAME[d.preferredLanguage] || d.preferredLanguage || ''),
    '匯款末五碼：' + (d.transferLast5 || '（尚未填寫）'),
    '備註：' + (d.notes || '—'),
    '',
    '試算表：' + getSpreadsheet_().getUrl()
  ].filter(function (l) { return l !== null; }).join('\n');
}

/* ---------- 信件排版 ---------- */

const LANG_NAME = { zh: '中文', en: 'English', ja: '日本語', ko: '한국어' };

function esc_(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function money_(n) {
  const num = Number(n || 0);
  return 'NT$ ' + num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 2026-09-30 → 2026年9月30日（週三）。中心一律看中文。 */
function prettyDate_(s) {
  return prettyDateLang_(s, 'zh');
}

/** 依語言排版日期，讓客人收到的確認信讀起來像母語。 */
function prettyDateLang_(s, lang) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(s || '');
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const wd = new Date(y, mo - 1, d).getDay();
  const WEEK = {
    zh: ['日', '一', '二', '三', '四', '五', '六'],
    ja: ['日', '月', '火', '水', '木', '金', '土'],
    ko: ['일', '월', '화', '수', '목', '금', '토'],
    en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  };
  const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (lang === 'ja') return y + '年' + mo + '月' + d + '日（' + WEEK.ja[wd] + '）';
  if (lang === 'ko') return y + '년 ' + mo + '월 ' + d + '일 (' + WEEK.ko[wd] + ')';
  if (lang === 'en') return WEEK.en[wd] + ', ' + MON_EN[mo - 1] + ' ' + d + ', ' + y;
  if (lang === 'ar') return d + '/' + mo + '/' + y;
  return y + '年' + mo + '月' + d + '日（週' + WEEK.zh[wd] + '）';
}

/** 兩欄式明細表；標籤為 '—' 的列會畫成分隔線。 */
function tableHtml_(rows) {
  const cells = rows.map(function (r) {
    if (r[0] === '—') {
      return '<tr><td colspan="2" style="padding:6px 0"><div style="border-top:1px solid #eef1ee"></div></td></tr>';
    }
    if (!r[1]) return '';
    return '<tr>' +
      '<td style="padding:7px 16px 7px 0;color:#7f8d89;font-size:13px;white-space:nowrap;vertical-align:top">' + r[0] + '</td>' +
      '<td style="padding:7px 0;font-size:15px;color:#17211f;vertical-align:top">' + r[1] + '</td>' +
      '</tr>';
  }).join('');
  return '<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">' + cells + '</table>';
}

/** 信件外框：品牌色標題列 + 預約編號 + 內容。rtl 為真時整封信改為由右至左。 */
function mailShell_(heading, ref, inner, rtl) {
  const dir = rtl ? ' dir="rtl"' : '';
  return '' +
'<div' + dir + ' style="margin:0;padding:24px 12px;background:#f7f6f2;' +
'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',\'PingFang TC\',\'Noto Sans TC\',\'Hiragino Sans\',\'Apple SD Gothic Neo\',sans-serif">' +
  '<table cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;width:100%;' +
  'background:#fff;border:1px solid #e2e6e2;border-radius:14px;overflow:hidden">' +
    '<tr><td style="background:#1f5f52;padding:20px 26px">' +
      '<div style="color:#cfe3dd;font-size:12px;letter-spacing:.16em">' + esc_(CENTER_NAME) + '</div>' +
      '<div style="color:#fff;font-size:19px;font-weight:600;margin-top:4px">' + esc_(heading) + '</div>' +
    '</td></tr>' +
    (ref ? '<tr><td style="padding:18px 26px 0">' +
      '<span style="display:inline-block;padding:6px 14px;background:#e8f1ee;color:#1f5f52;' +
      'border-radius:999px;font-size:13px;font-weight:600;letter-spacing:.06em">' + esc_(ref) + '</span>' +
    '</td></tr>' : '') +
    '<tr><td style="padding:16px 26px 26px">' + inner + '</td></tr>' +
  '</table>' +
'</div>';
}

const CUSTOMER_MAIL = {
  zh: {
    subject: '【' + CENTER_NAME + '】預約申請已收到',
    hello: '您好：',
    body: '我們已收到您的預約申請，將於一個工作天內與您確認。',
    detail: '預約明細',
    pay: '付款方式：臺灣銀行（004）帳號 013004490011。請於送出預約的當天完成匯款，並保留後五碼以利核對。',
    foot: '如需取消，最晚須於預約日的前一天告知。已付款項可延期使用，不接受退款。本中心保留最終解釋權。',
    labels: { service: '服務項目', parts: '選擇部位', datetime: '預約時間', duration: '療程時長', price: '費用', map: '地圖', extras: '加贈項目', min: '分鐘' },
    next: '下一步',
    steps: ['我們會於一個工作天內與您確認時間', '請於送出預約的當天完成匯款', '當日請提前 10 分鐘抵達，以利填寫健康問卷']
  },
  en: {
    subject: '[' + CENTER_NAME + '] Booking request received',
    hello: 'Hello,',
    body: 'We have received your booking request and will confirm within one business day.',
    detail: 'Booking details',
    pay: 'Payment: Bank of Taiwan (004), account 013004490011. Please transfer on the day you book and keep the last five digits for reconciliation.',
    foot: 'To cancel, tell us no later than the day before your appointment. Paid sessions may be rescheduled; refunds are not available. The centre reserves the right of final interpretation.',
    labels: { service: 'Service', parts: 'Areas', datetime: 'Date & Time', duration: 'Length', price: 'Fee', map: 'Map', extras: 'Also includes', min: 'min' },
    next: 'What happens next',
    steps: ['We will confirm your time within one business day', 'Please transfer on the day you book', 'Please arrive 10 minutes early to complete the health questionnaire']
  },
  ja: {
    subject: '【' + CENTER_NAME + '】ご予約を受け付けました',
    hello: 'お世話になっております。',
    body: 'ご予約申込を受け付けました。1営業日以内にご連絡いたします。',
    detail: 'ご予約内容',
    pay: 'お支払い：台湾銀行（004）口座 013004490011。ご予約送信当日にお振込みいただき、下5桁をお控えください。',
    foot: 'キャンセルは予約日の前日までにご連絡ください。お支払い済みの施術は日程変更が可能ですが、返金はいたしません。本規約の最終的な解釈は当センターに帰属します。',
    labels: { service: 'メニュー', parts: '選択部位', datetime: '日時', duration: '施術時間', price: '料金', map: '地図', extras: '追加特典', min: '分' },
    next: '今後の流れ',
    steps: ['1営業日以内に日時のご確認をご連絡いたします', 'ご予約送信当日にお振込みをお願いいたします', '当日は問診票ご記入のため10分前にお越しください']
  },
  ko: {
    subject: '[' + CENTER_NAME + '] 예약 신청이 접수되었습니다',
    hello: '안녕하세요,',
    body: '예약 신청을 접수했습니다. 영업일 기준 1일 이내에 연락드리겠습니다.',
    detail: '예약 내용',
    pay: '결제: 대만은행(004) 계좌 013004490011. 예약 신청 당일에 이체해 주시고 뒤 5자리를 보관해 주세요.',
    foot: '취소는 예약일 하루 전까지 알려 주세요. 결제한 시술은 일정 변경이 가능하며 환불은 되지 않습니다. 본 약관의 최종 해석 권한은 센터에 있습니다.',
    labels: { service: '시술', parts: '선택 부위', datetime: '예약 일시', duration: '시술 시간', price: '금액', map: '지도', extras: '추가 제공', min: '분' },
    next: '다음 단계',
    steps: ['영업일 기준 1일 이내에 시간을 확인해 드립니다', '예약 신청 당일에 이체해 주세요', '당일 문진표 작성을 위해 10분 전에 도착해 주세요']
  },
  ar: {
    subject: '[' + CENTER_NAME + '] تم استلام طلب الحجز',
    hello: 'مرحباً،',
    body: 'استلمنا طلب حجزك وسنؤكده خلال يوم عمل واحد.',
    detail: 'تفاصيل الحجز',
    pay: 'الدفع: بنك تايوان (004)، حساب رقم 013004490011. يرجى إتمام الحوالة في نفس يوم الحجز والاحتفاظ بآخر خمسة أرقام للمطابقة.',
    foot: 'للإلغاء، أبلغنا قبل يوم واحد من موعدك على الأقل. يمكن تأجيل الجلسات المدفوعة ولا يوجد استرداد. يحتفظ المركز بحق التفسير النهائي.',
    labels: { service: 'الخدمة', parts: 'المواضع', datetime: 'التاريخ والوقت', duration: 'المدة', price: 'المبلغ', map: 'الخريطة', extras: 'يشمل أيضاً', min: 'دقيقة' },
    next: 'الخطوات التالية',
    steps: ['سنؤكد موعدك خلال يوم عمل واحد', 'يرجى إتمام الحوالة في نفس يوم الحجز', 'يرجى الحضور 10 دقائق مبكراً لتعبئة استبيان الحالة الصحية']
  }
};

function notifyCustomer_(d) {
  if (!d.email) return;
  const t = CUSTOMER_MAIL[d.preferredLanguage] || CUSTOMER_MAIL.zh;
  const L = t.labels;

  const lang = d.preferredLanguage || 'zh';
  const sep = (lang === 'zh' || lang === 'ja') ? '、'
            : (lang === 'ar') ? '، ' : ', ';
  const service = d.serviceLabelLocal || d.serviceLabel || '';
  const parts = (d.partsLabelsLocal && d.partsLabelsLocal.length)
              ? d.partsLabelsLocal : (d.partsLabels || []);

  const rows = [
    [L.datetime, prettyDateLang_(d.date, lang) + '　' + (d.startTime || '') + '–' + (d.endTime || '')],
    [L.service, esc_(service)],
    [L.parts, parts.map(esc_).join(sep)],
    [L.duration, (d.durationMinutes || '') + ' ' + (L.min || 'min')],
    [L.price, money_(d.price)],
    [L.extras, ((d.extrasLabelsLocal && d.extrasLabelsLocal.length)
                 ? d.extrasLabelsLocal : (d.extrasLabels || [])).map(esc_).join(sep)],
    [L.map, '<a href="' + CENTER_MAP_URL + '" style="color:#1f5f52">' +
            esc_(CENTER_NAME) + '</a>']
  ];

  const steps = t.steps.map(function (x, i) {
    return '<tr><td style="padding:3px 10px 3px 0;color:#b08949;font-size:13px;vertical-align:top">' +
           (i + 1) + '.</td><td style="padding:3px 0;font-size:14px;color:#4a5a56">' + esc_(x) + '</td></tr>';
  }).join('');

  const rtl = lang === 'ar';
  const html = mailShell_(t.subject.replace(/^[【\[][^】\]]*[】\]]\s*/, ''), d.ref || '',
    '<p style="margin:0 0 6px;font-size:15px;color:#17211f">' + esc_(t.hello) + '</p>' +
    '<p style="margin:0 0 20px;font-size:14px;color:#4a5a56;line-height:1.7">' + esc_(t.body) + '</p>' +
    tableHtml_(rows) +
    '<div style="margin:22px 0 0;padding:16px 18px;background:#f6efe1;' +
    'border:1px solid rgba(176,137,73,.3);border-radius:12px">' +
      '<div style="font-size:13px;font-weight:600;color:#6f5423;margin-bottom:8px">' + esc_(t.next) + '</div>' +
      '<table cellpadding="0" cellspacing="0">' + steps + '</table>' +
      '<div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(176,137,73,.28);' +
      'font-size:13px;color:#7a5f2c;line-height:1.65">' + esc_(t.pay) + '</div>' +
    '</div>' +
    '<p style="margin:20px 0 0;font-size:12px;color:#7f8d89;line-height:1.7">' + esc_(t.foot) + '</p>',
    rtl
  );

  const text = [
    t.hello, '', t.body, '',
    t.detail + '：',
    '  ' + prettyDateLang_(d.date, lang) + '  ' + (d.startTime || '') + '–' + (d.endTime || ''),
    '  ' + service +
      (parts.length ? '（' + parts.join(sep) + '）' : '') +
      ' / ' + (d.durationMinutes || '') + ' ' + (L.min || 'min') + ' / ' + money_(d.price),
    '  ' + (d.ref || ''), '',
    L.map + '：' + CENTER_MAP_URL, '',
    t.pay, '', t.foot, '', CENTER_NAME
  ].join('\n');

  MailApp.sendEmail(d.email, t.subject + '（' + (d.ref || '') + '）', text,
                    { name: CENTER_NAME, htmlBody: html });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
