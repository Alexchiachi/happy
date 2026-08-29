/**
 * 由 tools/guide/7day-guide.html 產生 downloads/inner-flow-7day-guide.pdf。
 *
 *   node tools/build-guide-pdf.js
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

const SRC  = path.join(__dirname, 'guide', '7day-guide.html');
const TMP  = path.join(__dirname, 'guide', '.7day-guide.build.html');
const OUT  = path.join(__dirname, '..', 'downloads', 'inner-flow-7day-guide.pdf');
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

  // 第一趟：載入原始檔，取出實際用到的字元
  await page.goto('file://' + SRC, { waitUntil: 'domcontentloaded' });
  const used = await page.evaluate(() => Array.from(new Set(document.body.innerText)).join(''));
  const chars = used.replace(/\s/g, '') + ' ';
  console.log('文件用到 ' + chars.length + ' 個不重複字元，向 Google Fonts 取子集……');

  // 第二趟：改用內嵌字體的版本列印
  const html = fs.readFileSync(SRC, 'utf8')
    .replace(/<link rel="preconnect"[^>]*>\s*/g, '')
    .replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>\s*/g, '')
    .replace('</head>', '<style>' + buildFontCss(chars) + '</style>\n</head>');
  fs.writeFileSync(TMP, html);

  try {
    await page.goto('file://' + TMP, { waitUntil: 'load' });
    await page.waitForFunction(
      (specs) => document.fonts.status === 'loaded' && specs.every((s) => document.fonts.check(s)),
      ['300 30pt "Noto Serif TC"', '400 11pt "Noto Sans TC"'],
      { timeout: 30000 }
    );
    await page.pdf({
      path: OUT,
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
  } finally {
    fs.unlinkSync(TMP);
    await browser.close();
  }

  // 驗證輸出：確認 PDF 真的用了思源字體，而不是退回系統預設字型
  // （Chromium 會把子集字體改名為 AAAAAA+，因此比對 FontName／FontFamily）
  const bytes = fs.readFileSync(OUT, 'latin1');
  if (!/\/Font(Name|Family)\s*[(\/][^)\s]*Noto/.test(bytes)) {
    throw new Error('PDF 未嵌入 Noto 字體，請確認建置環境能連上 fonts.gstatic.com');
  }
  console.log('已輸出 ' + OUT + '（' + Math.round(fs.statSync(OUT).size / 1024) + ' KB）');
})();
