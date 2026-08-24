/**
 * 大道至簡 — 連繫表單接收器
 * ================================================================
 * 把 connect.html 表單送出的內容寫進 Google 試算表，
 * 並且（可選）寄一封通知信到你的信箱。
 *
 * ── 安裝步驟（大約五分鐘）─────────────────────────────
 *
 * 1. 開一份新的 Google 試算表，取名例如「大道至簡 · 來信」
 *
 * 2. 在試算表上方選 [擴充功能] → [Apps Script]
 *
 * 3. 把編輯器裡原本的 function myFunction() {} 整個刪掉，
 *    貼上這個檔案的全部內容
 *
 * 4. 改下面那行 NOTIFY_EMAIL，填你要收通知的信箱
 *    （不想收通知就留空字串）
 *
 * 5. 右上角 [部署] → [新增部署作業]
 *      類型          網頁應用程式
 *      執行身分      我
 *      具有存取權者  所有人          ← 這項一定要選「所有人」
 *    按 [部署]，第一次會要求授權，照著授權即可
 *
 * 6. 複製它給你的網址，長得像：
 *      https://script.google.com/macros/s/AKfycb.../exec
 *
 * 7. 把那串網址填進 scripts.js 最上面的 FORM_ENDPOINT
 *
 * ── 之後要改程式碼的話 ────────────────────────────────
 * 改完一定要重新 [部署] → [管理部署作業] → 編輯 → 版本選「新版本」，
 * 否則線上跑的還是舊的那一版。
 * ================================================================
 */

/** 收通知信的信箱。留空字串就不寄通知。 */
const NOTIFY_EMAIL = '';

/** 資料要寫進哪一個工作表分頁（不存在會自動建立）。 */
const SHEET_NAME = '來信';

function doPost(e) {
  try {
    const p = (e && e.parameter) || {};

    // 蜜罐欄位：真人看不到也不會填，有值就是機器人。
    // 回 ok 讓對方以為成功，避免它換方式再試。
    if (p.website) {
      return json({ ok: true });
    }

    const name    = String(p.name    || '').trim();
    const email   = String(p.email   || '').trim();
    const subject = String(p.subject || '').trim();
    const message = String(p.message || '').trim();

    if (!name || !email || !message) {
      return json({ ok: false, error: 'missing_fields' });
    }

    getSheet().appendRow([new Date(), name, email, subject, message]);

    if (NOTIFY_EMAIL) {
      MailApp.sendEmail({
        to: NOTIFY_EMAIL,
        replyTo: email,
        subject: '[大道至簡] 新的來信 — ' + (subject || name),
        body: [
          '稱呼：' + name,
          '信箱：' + email,
          '主題：' + (subject || '（未填）'),
          '',
          message,
          '',
          '— 直接回覆這封信就會回到對方的信箱。'
        ].join('\n')
      });
    }

    return json({ ok: true });

  } catch (err) {
    // 寫入或寄信失敗時也留下紀錄，方便事後查
    console.error(err);
    return json({ ok: false, error: String(err) });
  }
}

/** 瀏覽器直接打開這個網址時給個提示，不是錯誤。 */
function doGet() {
  return ContentService.createTextOutput(
    '這是大道至簡連繫表單的接收端點，請由網站表單送出。'
  );
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['時間', '稱呼', '電子郵件', '主題', '內容']);
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 150);
    sheet.setColumnWidth(5, 480);
  }
  return sheet;
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
