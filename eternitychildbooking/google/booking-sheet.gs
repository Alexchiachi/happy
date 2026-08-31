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

const HEADERS = [
  '送出時間', '預約編號', '狀態', '日期', '開始', '結束',
  '服務項目', '選擇部位', '看診類型', '分鐘', '金額',
  '姓名', '電話', 'Email', '語言', '匯款末五碼', '備註'
];

/* ---------- 收單 ---------- */

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
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
      d.notes || ''
    ]);

    notifyCentre_(d);
    notifyCustomer_(d);
    return json_({ ok: true, ref: d.ref || '' });
  } catch (err) {
    // 寫入或寄信失敗時回報，前端會自動退回「開啟客人信箱程式」
    return json_({ ok: false, error: String(err) });
  }
}

/** 用瀏覽器打開 /exec 網址時看到的健康檢查，方便確認部署成功。 */
function doGet() {
  return json_({ ok: true, service: CENTER_NAME, sheet: SHEET_NAME });
}

/* ---------- 內部函式 ---------- */

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
                  (d.date || '') + ' ' + (d.startTime || '') + ' ' + (d.name || '');
  // 前端已附上排好版的中文明細，直接拿來當信件內容
  const body = (d['預約明細'] || JSON.stringify(d, null, 2)) +
               '\n\n試算表：' + SpreadsheetApp.getActiveSpreadsheet().getUrl();
  const options = { name: CENTER_NAME };
  if (d.email) options.replyTo = d.email;
  MailApp.sendEmail(CENTER_EMAIL, subject, body, options);
}

const CUSTOMER_MAIL = {
  zh: {
    subject: '【' + CENTER_NAME + '】預約申請已收到',
    hello: '您好：',
    body: '我們已收到您的預約申請，將於一個工作天內與您確認。',
    detail: '預約明細',
    pay: '付款方式：臺灣銀行（004）帳號 013004490011。確認後請於三日內完成轉帳，並保留後五碼以利核對。',
    foot: '如需改期或取消，請於預約日前 48 小時與我們聯繫。'
  },
  en: {
    subject: '[' + CENTER_NAME + '] Booking request received',
    hello: 'Hello,',
    body: 'We have received your booking request and will confirm within one business day.',
    detail: 'Booking details',
    pay: 'Payment: Bank of Taiwan (004), account 013004490011. Please transfer within three days of confirmation and keep the last five digits for reconciliation.',
    foot: 'To reschedule or cancel, please contact us at least 48 hours in advance.'
  },
  ja: {
    subject: '【' + CENTER_NAME + '】ご予約を受け付けました',
    hello: 'お世話になっております。',
    body: 'ご予約申込を受け付けました。1営業日以内にご連絡いたします。',
    detail: 'ご予約内容',
    pay: 'お支払い：台湾銀行（004）口座 013004490011。確定後3日以内にお振込みいただき、下5桁をお控えください。',
    foot: '変更・キャンセルは予約日の48時間前までにご連絡ください。'
  },
  ko: {
    subject: '[' + CENTER_NAME + '] 예약 신청이 접수되었습니다',
    hello: '안녕하세요,',
    body: '예약 신청을 접수했습니다. 영업일 기준 1일 이내에 연락드리겠습니다.',
    detail: '예약 내용',
    pay: '결제: 대만은행(004) 계좌 013004490011. 확정 후 3일 이내에 이체해 주시고 뒤 5자리를 보관해 주세요.',
    foot: '변경 및 취소는 예약일 48시간 전까지 연락해 주세요.'
  }
};

function notifyCustomer_(d) {
  if (!d.email) return;
  const t = CUSTOMER_MAIL[d.preferredLanguage] || CUSTOMER_MAIL.zh;
  const body = [
    t.hello, '',
    t.body, '',
    t.detail + '：',
    '  ' + (d.date || '') + '  ' + (d.startTime || '') + '–' + (d.endTime || ''),
    '  ' + (d.serviceLabel || '') +
      ((d.partsLabels || []).length ? '（' + d.partsLabels.join('、') + '）' : '') +
      ' / ' + (d.durationMinutes || '') + ' min / NT$ ' + (d.price || ''),
    '  ' + (d.ref || ''), '',
    t.pay, '',
    t.foot, '',
    CENTER_NAME
  ].join('\n');
  MailApp.sendEmail(d.email, t.subject + '（' + (d.ref || '') + '）', body, { name: CENTER_NAME });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
