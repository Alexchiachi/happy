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

  /* 選填：若填入後端網址（PHP / Google Apps Script / Web3Forms 等），
     送出時會 POST JSON 過去；留空則改用電子郵件寄送。 */
  endpoint: '',

  /* 選填：要一併送出的額外欄位。第三方表單服務通常需要一組金鑰，
     例如 Web3Forms：
       endpoint: 'https://api.web3forms.com/submit',
       endpointFields: { access_key: '你的金鑰', subject: '新預約' }
     這樣不用改任何程式，靜態主機（Netlify、Cloudflare Pages）也能收信。 */
  endpointFields: {}
};
