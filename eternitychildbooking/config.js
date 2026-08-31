/* ============================================================
   永恆之子整椎中心 · 預約系統設定檔
   Eternity's Child Chiropractic — booking configuration
   修改本檔即可調整營業時間、價格與收件方式，無須動到程式。
   ============================================================ */

const CONFIG = {
  /* 中心收件信箱：預約明細會寄到這裡 */
  email: 'ahanamita88888888@gmail.com',

  /* 付款資訊 */
  bank: { code: '004', name: 'Bank of Taiwan', account: '013004490011' },

  /* 選填：TWQR 收款條碼圖檔（放進 assets/ 後填入檔名，例如 'assets/twqr.jpg'） */
  qrImage: '',

  /* 幣別與價格（依療程分鐘數） */
  currency: 'NT$',
  prices: { 40: 1688, 60: 2888 },

  /* 服務項目 key 對應 i18n 字典 */
  services: ['quantum', 'sculpt', 'spine', 'massage', 'aesthetic'],

  /* 療程長度（分鐘） */
  durations: [40, 60],

  /* 「醫美整骨」是選部位計價，不是選時長：
     客人從 parts 的十個部位中挑三項或五項，價格看挑幾項。
     minutes 決定要佔用多長的時段，可依實際施作時間調整。 */
  pickService: {
    key: 'aesthetic',
    parts: ['face', 'jaw', 'pelvis', 'hip', 'waist',
            'belly', 'shoulder', 'hunch', 'tuina', 'detail'],
    packages: [
      { pick: 3, price: 1688, minutes: 40 },
      { pick: 5, price: 2888, minutes: 60 }
    ]
  },

  /* 時段起始間隔（分鐘） */
  slotStep: 30,

  /* 最早可預約：今天起 N 個月之後；最晚：今天起 M 個月內 */
  leadMonths: 1,
  windowMonths: 4,

  /* 中心所在時區偏移（台北 UTC+8，無日光節約） */
  tzOffsetHours: 8,
  tzName: 'Asia/Taipei',

  /* 營業時間：0=週日 … 6=週六，時間為 24 小時制分鐘數起訖 */
  hours: {
    0: { open: '09:00', close: '12:00', firstVisitOnly: true },  // 週日：上午、限初診
    1: { open: '09:00', close: '21:00' },
    2: { open: '09:00', close: '21:00' },
    3: { open: '09:00', close: '21:00' },
    4: { open: '09:00', close: '17:00' },                        // 週四提早打烊
    5: { open: '09:00', close: '21:00' },
    6: { open: '09:00', close: '21:00' }
  },

  /* 公休日（YYYY-MM-DD），可自行增列國定假日 */
  closedDates: [],

  /* 收單網址：送出時會把預約資料 POST 過去。
     留空的話會退回「開啟客人的信箱程式」，客人得自己再按一次寄出，容易漏單。

     ★ 建議：Google 試算表收單（免費、資料只經過你自己的 Google 帳號）
       部署 google/booking-sheet.gs 之後，把產生的 /exec 網址貼在下面。
       做法見 google/README.md。 */
  endpoint: '',
  // endpoint: 'https://script.google.com/macros/s/AKfycb.../exec',

  /* 其他選擇：
       WordPress 自架 → '/eternitychildbooking/booking-submit.php'
       不想開試算表 → 'https://formsubmit.co/ajax/ahanamita88888888@gmail.com'
                      （免註冊，第一次送出後要點信中的啟用連結） */

  /* 送出時的 Content-Type。留空會自動判斷：
     Google Apps Script 必須用 text/plain，否則瀏覽器的 CORS 預檢會被擋下來。 */
  endpointContentType: '',

  /* 選填：要一併送出的額外欄位（第三方服務的設定或金鑰）。
     Google 試算表版不需要；FormSubmit 用底線開頭的欄位，Web3Forms 用 access_key。 */
  endpointFields: {}
};
