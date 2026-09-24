/**
 * 預約意向信件：給預約者的收件確認、給主持人的新預約通知。
 * 由 apps-script/Code.gs 的範本移植而來（版面、色彩、文案相同）。
 * 郵件用表格排版＋行內樣式，Gmail、Apple Mail、Outlook 都能正確顯示。
 */

export const PLAN_LABEL = {
  taster: '先參加第一階段（線上一小時）',
  cohort: '高管跨公司小班・全程',
  company: '企業包班・全程',
  notify: '首期日期公布時通知我'
};

let PAGE_URL = '';
let PORTRAIT_URL = '';

/** 信裡的連結跟著網站網址走，不寫死網域 */
export function configure(siteUrl) {
  PAGE_URL = siteUrl;
  PORTRAIT_URL = siteUrl + 'images/founder-jianchiachi.jpg';
}

function esc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escBr_(s) { return esc_(s).replace(/\r?\n/g, '<br>'); }
/* ---------------- Email design ----------------
 * 郵件用表格排版＋行內樣式，Gmail、Apple Mail、Outlook 都能正確顯示。
 * 色彩沿用大道至簡：紙 #FAF6EF、墨 #2A2520、苔綠 #547050、朱印 #A8543A。
 */

const C = {
  paper: '#FAF6EF', deep: '#F2EBDF', card: '#FFFDF8', ink: '#2A2520', soft: '#4A423A',
  mist: '#736C63', line: '#D9D1C2', moss: '#547050', seal: '#A8543A'
};
const SERIF = "'Noto Serif TC','Songti TC','PMingLiU','MingLiU',Georgia,serif";
const LATIN = "'Cormorant Garamond',Georgia,'Times New Roman',serif";

function shell_(preheader, inner) {
  return '<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">'
    + '<title>幸福餐桌</title></head>'
    + '<body style="margin:0;padding:0;background:' + C.deep + ';">'
    + '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">' + esc_(preheader) + '</div>'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + C.deep + ';">'
    + '<tr><td align="center" style="padding:32px 12px;">'
    + '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:' + C.paper + ';border:1px solid ' + C.line + ';">'
    + inner
    + '</table>'
    + '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">'
    + '<tr><td align="center" style="padding:20px 24px 0;font-family:' + SERIF + ';font-size:12px;line-height:1.8;color:' + C.mist + ';letter-spacing:1px;">'
    + '幸福餐桌 · 南投<br><span style="font-family:' + LATIN + ';font-style:italic;letter-spacing:0.5px;">Dao is simple</span> · 大道至簡'
    + '</td></tr></table>'
    + '</td></tr></table></body></html>';
}

function masthead_(eyebrow) {
  return '<tr><td style="padding:36px 44px 0;">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
    + '<td style="font-family:' + SERIF + ';font-size:17px;letter-spacing:3px;color:' + C.ink + ';">幸福餐桌'
    + '<div style="font-family:' + LATIN + ';font-style:italic;font-size:13px;letter-spacing:0.5px;color:' + C.mist + ';">Rice Field Table · Executive</div></td>'
    + '<td align="right" valign="top" style="font-family:' + LATIN + ';font-size:11px;letter-spacing:4px;color:' + C.moss + ';text-transform:uppercase;">' + esc_(eyebrow) + '</td>'
    + '</tr></table>'
    + '<div style="height:1px;background:' + C.line + ';margin-top:20px;line-height:1px;font-size:1px;">&nbsp;</div>'
    + '</td></tr>';
}

function rows_(pairs) {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ' + C.line + ';">'
    + pairs.filter(p => p[1]).map(p =>
      '<tr><td valign="top" width="92" style="padding:11px 0;border-bottom:1px solid ' + C.line + ';font-family:' + SERIF + ';font-size:13px;letter-spacing:2px;color:' + C.mist + ';">' + esc_(p[0]) + '</td>'
      + '<td valign="top" style="padding:11px 0;border-bottom:1px solid ' + C.line + ';font-family:' + SERIF + ';font-size:15px;line-height:1.7;color:' + C.ink + ';">' + (p[2] ? p[1] : escBr_(p[1])) + '</td></tr>'
    ).join('')
    + '</table>';
}

function button_(href, label) {
  return '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
    + '<td style="border-radius:999px;background:' + C.moss + ';">'
    + '<a href="' + esc_(href) + '" style="display:inline-block;padding:12px 26px;font-family:' + SERIF + ';font-size:14px;letter-spacing:2px;color:' + C.paper + ';text-decoration:none;border-radius:999px;">' + esc_(label) + '</a>'
    + '</td></tr></table>';
}

/* ---- 給預約者：收件確認 ---- */
function guestEmailHtml_(f) {
  const step = (n, title, text) =>
    '<tr><td valign="top" width="36" style="padding:0 0 16px;font-family:' + LATIN + ';font-size:22px;line-height:1.2;color:' + C.moss + ';">' + n + '</td>'
    + '<td valign="top" style="padding:0 0 16px;font-family:' + SERIF + ';font-size:15px;line-height:1.8;color:' + C.soft + ';">'
    + '<span style="color:' + C.ink + ';letter-spacing:1px;">' + title + '</span><br>' + text + '</td></tr>';

  const notify = f.plan === 'notify';
  const intro = '<tr><td style="padding:36px 44px 8px;">'
    + '<h1 style="margin:0;font-family:' + SERIF + ';font-weight:400;font-size:26px;line-height:1.5;letter-spacing:3px;color:' + C.ink + ';">' + esc_(f.name) + '，<br>'
    + (notify ? '日期一公布，就先通知你。' : '這張餐桌為你留了位子。') + '</h1>'
    + '<p style="margin:18px 0 0;font-family:' + SERIF + ';font-size:16px;line-height:1.9;color:' + C.soft + ';">'
    + (notify
        ? '首期工作坊日期與報名截止日確定後，我們會第一時間寫信到這個信箱。首期小班每期只有 8 個座位。'
        : '我們已收到你的預約意向。接下來會用這個信箱與你約第一階段——線上一小時的時間。')
    + '</p></td></tr>';

  // 只登記通知的人：不談課前準備與三步驟，改為一個「想先體驗」的邀請
  const notifyMiddle = '<tr><td style="padding:24px 44px 20px;">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EAEFE6;border-radius:6px;"><tr><td style="padding:20px 24px;">'
    + '<div style="font-family:' + SERIF + ';font-size:13px;letter-spacing:2px;color:' + C.moss + ';">等待的時候</div>'
    + '<div style="margin-top:6px;font-family:' + SERIF + ';font-size:17px;line-height:1.8;color:' + C.ink + ';">也可以先預約線上一小時，先嚐一口。</div>'
    + '<div style="margin-top:4px;font-family:' + SERIF + ';font-size:14px;line-height:1.8;color:' + C.soft + ';">每人 NT$15,000，進入全程時可全額折抵。直接回覆這封信就能安排。</div>'
    + '</td></tr></table></td></tr>';

  const inner = masthead_('Received')
    + intro
    + (notify ? notifyMiddle : ''

    // 課前準備
    + '<tr><td style="padding:24px 44px 0;">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EAEFE6;border-radius:6px;"><tr><td style="padding:20px 24px;">'
    + '<div style="font-family:' + SERIF + ';font-size:13px;letter-spacing:2px;color:' + C.moss + ';">在那之前，只要準備一樣東西</div>'
    + '<div style="margin-top:6px;font-family:' + SERIF + ';font-size:17px;line-height:1.8;color:' + C.ink + ';">一道小時候家裡的菜，或一個對你有意義的食材。</div>'
    + '<div style="margin-top:4px;font-family:' + SERIF + ';font-size:14px;line-height:1.8;color:' + C.soft + ';">課堂上只圍繞一兩個問題，每人說約五分鐘。帶著它的故事來就好。</div>'
    + '</td></tr></table></td></tr>'

    // 接下來
    + '<tr><td style="padding:32px 44px 0;">'
    + '<div style="font-family:' + LATIN + ';font-size:11px;letter-spacing:4px;color:' + C.moss + ';text-transform:uppercase;margin-bottom:16px;">What happens next</div>'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
    + step('1', '約時間', '我們會回信與你確認線上一小時的日期。')
    + step('2', '先嚐一口', '一小時不是教學，而是讓你確認自己是否準備好進入第二階段。')
    + step('3', '再決定', '體驗後，再決定是否進入南投三天兩夜與八週陪伴。第一階段費用可全額折抵全程。')
    + '</table></td></tr>')

    // 你留下的資料
    + '<tr><td style="padding:16px 44px 0;">'
    + '<div style="font-family:' + LATIN + ';font-size:11px;letter-spacing:4px;color:' + C.moss + ';text-transform:uppercase;margin-bottom:12px;">Your note</div>'
    + rows_([
        ['公司', f.company + (f.title ? '・' + f.title : '')],
        ['方案', PLAN_LABEL[f.plan]],
        ['人數', f.heads],
        ['電話', f.phone],
        ['備註', f.message]
      ])
    + '<p style="margin:12px 0 0;font-family:' + SERIF + ';font-size:13px;line-height:1.8;color:' + C.mist + ';">資料有誤，直接回覆這封信告訴我們即可。</p>'
    + '</td></tr>'

    // 主持人簽名
    + '<tr><td style="padding:36px 44px 40px;">'
    + '<div style="height:1px;background:' + C.line + ';line-height:1px;font-size:1px;margin-bottom:28px;">&nbsp;</div>'
    + '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
    + '<td valign="middle" width="76"><img src="' + PORTRAIT_URL + '" width="64" height="64" alt="簡家旗" style="display:block;width:64px;height:64px;border-radius:50%;object-fit:cover;border:0;"></td>'
    + '<td valign="middle" style="font-family:' + SERIF + ';font-size:14px;line-height:1.7;color:' + C.soft + ';">'
    + '<span style="font-size:17px;letter-spacing:4px;color:' + C.ink + ';">簡家旗</span><br>幸福餐桌 主理人 · 南投</td>'
    + '<td valign="middle" style="padding-left:18px;"><div style="display:inline-block;border:1.5px solid ' + C.seal + ';color:' + C.seal + ';font-family:' + SERIF + ';font-size:11px;line-height:1.3;letter-spacing:1px;padding:5px 6px;border-radius:3px;text-align:center;white-space:nowrap;">幸福<br>餐桌</div></td>'
    + '</tr></table>'
    + '<div style="margin-top:28px;">' + button_(PAGE_URL, '再看一次課程內容') + '</div>'
    + '</td></tr>';

  return shell_(notify ? '首期日期確定後，我們會第一時間通知你。' : '我們已收到你的預約意向，接下來會與你約線上一小時的時間。', inner);
}

function guestEmailText_(f) {
  if (f.plan === 'notify') return [
    f.name + '，日期一公布，就先通知你。',
    '',
    '首期工作坊日期與報名截止日確定後，我們會第一時間寫信到這個信箱。',
    '等待的時候，也可以先預約線上一小時（每人 NT$15,000，可全額折抵全程），直接回覆這封信即可。',
    '',
    '簡家旗｜幸福餐桌',
    PAGE_URL
  ].join('\n');
  return [
    f.name + '，這張餐桌為你留了位子。',
    '',
    '我們已收到你的預約意向，接下來會用這個信箱與你約第一階段——線上一小時的時間。',
    '在那之前，請準備一道小時候家裡的菜，或一個對你有意義的食材。',
    '',
    '方案：' + PLAN_LABEL[f.plan],
    '人數：' + f.heads,
    '',
    '簡家旗｜幸福餐桌',
    PAGE_URL
  ].join('\n');
}

/* ---- 給主持人：新預約通知 ---- */
function ownerEmailHtml_(f) {
  const mailto = 'mailto:' + f.email + '?subject=' + encodeURIComponent('幸福餐桌｜線上一小時時間確認');
  const chip = (t) => '<span style="display:inline-block;padding:3px 12px;margin:0 6px 6px 0;border:1px solid ' + C.moss + ';border-radius:999px;font-family:' + SERIF + ';font-size:13px;letter-spacing:1px;color:' + C.moss + ';">' + esc_(t) + '</span>';

  const inner = masthead_('New inquiry')
    + '<tr><td style="padding:32px 44px 0;">'
    + '<div style="font-family:' + SERIF + ';font-size:13px;letter-spacing:2px;color:' + C.mist + ';">' + esc_(f.submittedAt) + ' · 第 ' + esc_(f.id) + ' 筆</div>'
    + '<h1 style="margin:8px 0 0;font-family:' + SERIF + ';font-weight:400;font-size:26px;line-height:1.5;letter-spacing:3px;color:' + C.ink + ';">' + esc_(f.name)
    + (f.title ? '<span style="font-size:16px;letter-spacing:1px;color:' + C.soft + ';">　' + esc_(f.title) + '</span>' : '') + '</h1>'
    + '<div style="margin-top:2px;font-family:' + SERIF + ';font-size:17px;letter-spacing:2px;color:' + C.soft + ';">' + esc_(f.company) + '</div>'
    + '<div style="margin-top:16px;">' + chip(PLAN_LABEL[f.plan]) + chip(f.heads) + '</div>'
    + '</td></tr>'

    + (f.message
      ? '<tr><td style="padding:16px 44px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
        + '<td width="3" style="background:' + C.seal + ';font-size:1px;line-height:1px;">&nbsp;</td>'
        + '<td style="padding:4px 0 4px 18px;font-family:' + SERIF + ';font-size:16px;line-height:1.9;color:' + C.ink + ';">' + escBr_(f.message) + '</td>'
        + '</tr></table></td></tr>'
      : '')

    + '<tr><td style="padding:28px 44px 0;">'
    + rows_([
        ['Email', '<a href="mailto:' + esc_(f.email) + '" style="color:' + C.moss + ';text-decoration:none;">' + esc_(f.email) + '</a>', true],
        ['電話', f.phone],
        ['來源', f.source]
      ])
    + '</td></tr>'

    + '<tr><td style="padding:28px 44px 40px;">'
    + '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
    + '<td style="padding-right:12px;">' + button_(mailto, '回信約時間') + '</td>'
    + '<td><a href="' + esc_(f.adminUrl) + '" style="display:inline-block;padding:11px 22px;font-family:' + SERIF + ';font-size:14px;letter-spacing:2px;color:' + C.moss + ';text-decoration:none;border:1px solid ' + C.moss + ';border-radius:999px;">開啟管理頁</a></td>'
    + '</tr></table>'
    + '<p style="margin:18px 0 0;font-family:' + SERIF + ';font-size:13px;line-height:1.8;color:' + C.mist + ';">直接回覆這封信，會寄給 ' + esc_(f.name) + '。對方已收到一封收件確認信。</p>'
    + '</td></tr>';

  return shell_(f.name + '・' + f.company + '：' + PLAN_LABEL[f.plan] + '，' + f.heads, inner);
}

function ownerEmailText_(f) {
  return [
    '新預約意向（' + f.submittedAt + '）',
    '姓名：' + f.name + (f.title ? '（' + f.title + '）' : ''),
    '公司：' + f.company,
    'Email：' + f.email,
    f.phone ? '電話：' + f.phone : '',
    '方案：' + PLAN_LABEL[f.plan],
    '人數：' + f.heads,
    f.message ? '備註：' + f.message : '',
    '',
    '管理頁：' + f.adminUrl
  ].filter(Boolean).join('\n');
}

export const guestEmailHtml = guestEmailHtml_;
export const guestEmailText = guestEmailText_;
export const ownerEmailHtml = ownerEmailHtml_;
export const ownerEmailText = ownerEmailText_;
