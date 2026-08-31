/**
 * 內耗檢測 — 免費指南留資接收器
 * ================================================================
 * 把 inner-flow.html 的「下載 PDF 指南」表單送出的資料寫進 Google 試算表。
 * 使用者按下按鈕的當下就開始下載，這支腳本只負責留下名單。
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
 * 4. 需要通知信就改 NOTIFY_EMAIL；不需要就留空字串
 *    （名單量可能不小，建議留空，改成每天自己看表）
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
 * 7. 把那串網址填進 inner-flow.html 的表單屬性：
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
 * ================================================================
 */

/** 收通知信的信箱。留空字串就不寄通知。 */
const NOTIFY_EMAIL = '';

/** 資料要寫進哪一個工作表分頁（不存在會自動建立）。 */
const SHEET_NAME = '名單';

function doPost(e) {
  try {
    const data = readPayload(e);

    const name  = String(data.name  || '').trim();
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
      String(data.type    || ''),      // 能量原型
      data.entropy === undefined ? '' : Number(data.entropy),
      String(data.code    || ''),      // 六位答案碼，可還原成分享連結
      String(data.submittedAt || '')
    ];

    const existing = findRowByEmail(sheet, email);
    if (existing > 0) {
      sheet.getRange(existing, 1, 1, row.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }

    if (NOTIFY_EMAIL) {
      MailApp.sendEmail({
        to: NOTIFY_EMAIL,
        subject: '[內耗檢測] 新的名單 — ' + name,
        body: [
          '稱呼：' + name,
          '信箱：' + email,
          '原型：' + (data.type || '（未完成測驗）'),
          '熵值：' + (data.entropy === undefined ? '—' : data.entropy),
          '答案碼：' + (data.code || '—')
        ].join('\n')
      });
    }

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
