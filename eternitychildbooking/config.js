/* ============================================================
   永恆之子整椎中心 · 預約系統設定檔
   Eternity's Child Chiropractic — booking configuration
   修改本檔即可調整營業時間、價格與收件方式，無須動到程式。
   ============================================================ */

const CONFIG = {
  /* 版本標記：會顯示在頁尾右下角，用來確認線上跑的是不是最新版。
     ★ 改版時，這裡和 index.html 裡四個 ?v= 要一起改成同一個數字，
       否則瀏覽器會繼續沿用快取裡的舊檔案。 */
  version: '2.1',

  /* 中心收件信箱：預約明細會寄到這裡 */
  email: 'ahanamita88888888@gmail.com',

  /* 聯絡資訊。填了才會顯示在頁面上，留空的項目會自動略過。
     phone 會做成可直接撥打的連結，line 填官方帳號 ID 或邀請連結。 */
  contact: {
    name: '林廣漢',
    phone: '0985727168',
    instagram: 'cosmoskhan',       // 只填帳號，不用網址
    lineQr: 'assets/line-qr.jpg',  // LINE 官方帳號的 QR 圖檔，沒放檔案就不顯示
    line: '',                      // 若之後拿到 LINE ID 或邀請連結，填這裡
    address: ''                    // 有需要再填，地圖已經標好位置
  },

  /* 付款資訊 */
  bank: { code: '004', name: 'Bank of Taiwan', account: '013004490011' },

  /* 選填：TWQR 收款條碼圖檔（放進 assets/ 後填入檔名，例如 'assets/twqr.jpg'） */
  qrImage: '',

  /* 中心實景照片。把檔案放進 assets/ 並用這些檔名即可自動顯示；
     還沒放上去的照片會自動略過，四張都沒有時整個區塊會隱藏，不會留白。
     第一張同時用於社群分享的預覽圖（見 index.html 的 og:image）。 */
  photos: [
    'assets/photo-1.jpg',
    'assets/photo-2.jpg',
    'assets/photo-3.jpg',
    'assets/photo-4.jpg'
  ],

  /* 中心位置。embed 是 Google 地圖「嵌入地圖」給的網址（iframe 的 src），
     link 是點「在 Google 地圖開啟」時要去的網址。
     換地點時到 Google 地圖 → 分享 → 嵌入地圖，複製新的網址貼進來即可。 */
  map: {
    embed: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3645.9809356376345!2d120.68283367539682!3d23.961114278527212!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x346931e48b0bf07b%3A0xb09dbf0bc3cb8356!2z5rC45oGG5LmL5a2Q5pW05qSO5Lit5b-D!5e0!3m2!1szh-TW!2s!4v1788172605408!5m2!1szh-TW!2s',
    link: 'https://maps.google.com/?cid=12726538179269329750'
  },

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
      { pick: 3,  price: 1688, minutes: 40 },
      { pick: 5,  price: 2888, minutes: 60 },
      /* 十項全選的旗艦方案，另含四項加贈項目（見 i18n 的 extra.*）。
         pick 等於部位總數時，網頁會自動全選並鎖住，客人不需逐項點選。 */
      { pick: 10, price: 4588, minutes: 90, name: 'signature',
        extras: ['pulse', 'detail', 'surface', 'lift'] }
    ]
  },

  /* 時段起始間隔（分鐘） */
  slotStep: 30,

  /* 最早可預約：今天起 leadDays 天之後。
     若要改回「幾個月之後」，把 leadDays 設為 0 並填 leadMonths。 */
  leadDays: 7,
  leadMonths: 0,

  /* 最晚可預約：今天起幾個月內 */
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

     目前使用 Google 試算表收單（google/booking-sheet.gs）：
     預約會寫進試算表、寄通知信給中心，並依客人語言回一封確認信。
     同一個網址也提供 ?action=slots，讓日曆讀回已成立的時段來防止撞單。
     換一份試算表時，把新的 /exec 網址換掉即可，做法見 google/README.md。 */
  endpoint: 'https://script.google.com/macros/s/AKfycbx40cgxLzV90wDEpfT6ro4i4uyTgqJQhWZAmY5zxg5vmA1kMeQgDo9m-OW_xDxJBhPl/exec',

  /* 其他選擇：
       WordPress 自架 → '/eternitychildbooking/booking-submit.php'
       不想開試算表 → 'https://formsubmit.co/ajax/ahanamita88888888@gmail.com'
                      （免註冊，第一次送出後要點信中的啟用連結） */

  /* 送出方式。留空會自動判斷，一般不用改：
       'form'  用隱藏的表單送出（不受 CORS 與網頁安全政策影響，Google 試算表用這個）
       'fetch' 用背景請求送出，可以讀到後端的回應（自架 PHP 用這個）
     自動判斷：網址是 script.google.com 就用 form，其餘用 fetch。 */
  endpointMode: '',

  /* 用 fetch 送出時的 Content-Type，留空自動判斷。 */
  endpointContentType: '',

  /* 選填：要一併送出的額外欄位（第三方服務的設定或金鑰）。
     Google 試算表版不需要；FormSubmit 用底線開頭的欄位，Web3Forms 用 access_key。 */
  endpointFields: {}
};
