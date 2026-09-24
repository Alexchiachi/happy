/**
 * 由 inner-flow/guide/7day-guide.html 產生四份 inner-flow/downloads/*.pdf。
 *
 * 四份的差別只有封面那一行與「你的起點」整頁，七天的內容完全共用——
 * 依測驗算出的瓶頸維度決定給哪一份（見 index.html 的 guidePath()）。
 * 版本由 <html data-variant> 切換，樣式表負責隱藏其餘三頁。
 *
 *   node inner-flow/tools/build-guide-pdf.js
 *
 * 需要 Node.js、playwright 與 curl。若環境已預裝 Chromium，
 * 可用 CHROMIUM_PATH 指定執行檔路徑。
 *
 * 為什麼要自己內嵌字體：
 * Chromium 列印成 PDF 時不會使用以網址載入的網頁字體，成品會靜靜地退回系統
 * 預設字型（Liberation／文泉驛），中文排版整份走樣。因此這支腳本先取出文件
 * 實際用到的字，向 Google Fonts 要一份「只含這些字」的子集（text= 參數，通常
 * 只有幾十 KB），轉成 data URI 內嵌後再列印。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const SRC  = path.join(__dirname, '..', 'guide', '7day-guide.html');
const TMP  = path.join(__dirname, '..', 'guide', '.7day-guide.build.html');
const OUTDIR = path.join(__dirname, '..', 'downloads');

// key 要與 index.html 的 DIMENSIONS 代號一致；balanced 是沒有明顯瓶頸時的預設版，
// 檔名不帶後綴，這樣舊網址（…/inner-flow-7day-guide.pdf）仍然指得到東西。
const VARIANTS = [
  { key: 'balanced', file: 'inner-flow-7day-guide.pdf' },
  { key: 'boundary', file: 'inner-flow-7day-guide-boundary.pdf' },
  { key: 'flow',     file: 'inner-flow-7day-guide-flow.pdf' },
  { key: 'work',     file: 'inner-flow-7day-guide-work.pdf' },
];
const UA   = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 與 7day-guide.html 的 CSS 對應
const FAMILIES = ['Noto+Serif+TC:wght@200;300;400', 'Noto+Sans+TC:wght@300;400;500'];

function curl(url, asBuffer) {
  return execFileSync('curl', ['-sSL', '-A', UA, url], {
    maxBuffer: 64 * 1024 * 1024,
    encoding: asBuffer ? 'buffer' : 'utf8',
  });
}

/** 取回只含指定字元的 @font-face CSS，並把字體檔轉成 data URI 內嵌 */
function buildFontCss(chars) {
  const text = encodeURIComponent(chars);
  const cache = new Map();
  return FAMILIES.map(function (family) {
    const css = curl('https://fonts.googleapis.com/css2?family=' + family + '&text=' + text + '&display=block');
    return css.replace(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g, function (_, url) {
      if (!cache.has(url)) cache.set(url, curl(url, true).toString('base64'));
      return 'url(data:font/woff2;base64,' + cache.get(url) + ')';
    });
  }).join('\n');
}

(async () => {
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
  );
  const page = await browser.newPage();

  // 第一趟：載入原始檔，取出實際用到的字元。
  // 這裡刻意取「四個版本的全部文字」——四份共用同一組字體子集，
  // 分開取會多下載三次，而且每份都要各自驗證，划不來。
  await page.goto('file://' + SRC, { waitUntil: 'domcontentloaded' });
  const used = await page.evaluate(() => {
    document.querySelectorAll('.variant').forEach((n) => { n.style.setProperty('display', 'block', 'important'); });
    return Array.from(new Set(document.body.innerText)).join('');
  });
  const chars = used.replace(/\s/g, '') + ' ';
  console.log('文件用到 ' + chars.length + ' 個不重複字元，向 Google Fonts 取子集……');

  // 第二趟：改用內嵌字體的版本列印
  const base = fs.readFileSync(SRC, 'utf8')
    .replace(/<link rel="preconnect"[^>]*>\s*/g, '')
    .replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>\s*/g, '')
    .replace('</head>', '<style>' + buildFontCss(chars) + '</style>\n</head>');

  try {
    for (const variant of VARIANTS) {
      fs.writeFileSync(TMP, base.replace('<html lang="zh-Hant">',
        '<html lang="zh-Hant" data-variant="' + variant.key + '">'));

      await page.goto('file://' + TMP, { waitUntil: 'load' });
      await page.waitForFunction(
        (specs) => document.fonts.status === 'loaded' && specs.every((s) => document.fonts.check(s)),
        ['300 30pt "Noto Serif TC"', '400 11pt "Noto Sans TC"'],
        { timeout: 30000 }
      );
      await page.pdf({
        path: path.join(OUTDIR, variant.file),
        format: 'A4',
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });
      console.log('  ' + variant.file);
    }
  } finally {
    fs.unlinkSync(TMP);
    await browser.close();
  }

  // 驗證輸出：確認每一份 PDF 都真的用了思源字體，而不是退回系統預設字型
  // （Chromium 會把子集字體改名為 AAAAAA+，因此比對 FontName／FontFamily）
  for (const variant of VARIANTS) {
    const bytes = fs.readFileSync(path.join(OUTDIR, variant.file), 'latin1');
    if (!/\/Font(Name|Family)\s*[(\/][^)\s]*Noto/.test(bytes)) {
      throw new Error(variant.file + ' 未嵌入 Noto 字體，請確認建置環境能連上 fonts.gstatic.com');
    }
  }
  const total = VARIANTS.reduce((sum, v) => sum + fs.statSync(path.join(OUTDIR, v.file)).size, 0);
  console.log('已輸出 ' + VARIANTS.length + ' 份（共 ' + Math.round(total / 1024) + ' KB）');
})();
