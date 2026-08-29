# Inner Flow API

`inner-flow.html` 的 AI 生成後端：依使用者的三維度分數，生成《自洽躍遷破局手冊》
與身心復位冥想語音。前端只跟這裡說話，Gemini 金鑰永遠留在伺服器端。

## 快速開始

```bash
cd server
cp .env.example .env        # 填入 GEMINI_API_KEY
npm install
npm run dev                 # http://localhost:8787
```

接著把 `inner-flow.html` 裡的 `API_BASE` 指向這個位址：

```js
var API_BASE = 'http://localhost:8787';
```

`API_BASE` 留空時，前端的 AI 生成區塊會整區隱藏，頁面完全不需要後端也能運作。

## 端點

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| GET | `/api/health` | 存活狀態、執行時間、目前掛載的模型（不回傳金鑰） |
| POST | `/api/generate-breakthrough-report` | 五章手冊 + 簡家旗寄語 |
| POST | `/api/generate-meditation-audio` | 250–350 字導引詞 + WAV 語音 |

兩個生成端點的請求主體相同：

```json
{
  "archetype": "次生擾動型：思維反芻與情緒代謝延遲",
  "band": "中高熵",
  "entropy": 61,
  "dimensions": { "boundary": 33, "flow": 33, "work": 50 },
  "bottleneck": "心智流動度"
}
```

回應：

```jsonc
// generate-breakthrough-report
{ "chapters": [{ "title": "…", "body": "…" }], "message": "寄語", "model": "實際生成的模型" }

// generate-meditation-audio
{ "script": "導引詞…", "audio": { "mimeType": "audio/wav", "base64": "UklGRi…" }, "model": "…" }
```

## 兩個實作上的重點

**語音必須自己封裝。** Gemini 的語音端點回傳的是裸 PCM，沒有任何檔頭，
瀏覽器的 `<audio>` 播不出來。`src/wav.ts` 會補上標準的 44 byte RIFF/WAVE 檔頭，
取樣率優先取自回應的 `mimeType`（形如 `audio/L16;codec=pcm;rate=24000`），
取不到才退回環境變數的設定。

**模型名稱請自行確認。** `.env.example` 的預設值取自系統規格書
（`gemini-3.6-flash` / `gemini-3.7-flash` / `gemini-3.1-flash-tts-preview`），
但各帳號可用的模型不同。全部都能用環境變數覆寫，`GET /api/health` 會回報目前
實際掛載的是哪幾個——部署後先打這一支確認，比等到使用者按下生成才發現要好。
主模型失敗時會自動改用備援模型；被安全機制擋下（422）則不重試，因為換模型結果相同。

## 其他行為

- **流量限制**：每個 IP 預設 10 次 / 10 分鐘（生成要花錢）。回應 429 並附 `Retry-After`。
- **CORS**：以 `ALLOWED_ORIGINS` 白名單控制；留空代表放行任何來源，僅適合本機開發。
- **驗證**：分數必須落在 0–100，缺欄位直接回 400，不會浪費一次模型呼叫。
- **逾時**：預設 90 秒，逾時回 504。

## 測試

```bash
npm run typecheck
npm test
```

15 個測試涵蓋 WAV 檔頭的每個欄位、模型備援切換、JSON 圍欄解析、流量限制與各種錯誤回應。
測試以本機的 Gemini 替身執行，不需要真的 API 金鑰。

## 部署

任何支援 Node 20+ 的平台皆可（Render、Railway、Fly.io、Cloud Run）。
`npm run build` 產出 `dist/`，`npm start` 啟動。記得設定 `GEMINI_API_KEY` 與
`ALLOWED_ORIGINS`（填你的 GitHub Pages 網域），前端則只需改 `API_BASE`。
