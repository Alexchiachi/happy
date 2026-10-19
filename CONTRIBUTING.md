# Contributing

感謝你對這個專案的興趣與貢獻。這個專案是以「靜態網站 + Cloudflare Workers」的方式運行，重點是內容與品牌體驗，不是重型前端框架專案。

## 專案定位

- 本專案主要目的是呈現品牌/內容網站，內容貼近「大道至簡」與「幸福餐桌」的品牌敘事。
- 靜態頁面部署在 GitHub Pages。
- 動態表單、訂單與管理流程由 Cloudflare Workers 處理，配置與 secrets 應保留在 Cloudflare 後台。

## 先做的事情

在開始修改之前：

1. 先閱讀 `README.md` 與 `AGENTS.md`。
2. 確認你是否要修改內容、樣式、資料、或 Cloudflare Worker 邏輯。
3. 如有涉及敏感資料（Email、金流、GitHub token、Cloudflare secret、LINE / SMS 資訊），請先確認不會被誤提交到 Git。

## 開發方式

### 靜態頁面

如果你只是修改 HTML/CSS/JS：

```bash
# 直接開啟本地檔案即可預覽
# 或使用本地靜態伺服器：
python3 -m http.server 8000
```

然後在瀏覽器開啟：

```text
http://localhost:8000/
```

### Worker / Cloudflare

如果你要修改 `executive-table/worker/` 或 `wrangler.jsonc`：

1. 安裝 Wrangler：

```bash
npm install -g wrangler
```

2. 登入 Cloudflare：

```bash
wrangler login
```

3. 進行本地檢查：

```bash
wrangler dev
```

4. 部署前確認 secrets / vars 已正確設定在 Cloudflare 儀表板。

## 不要做的事

- 不要把 Gmail 帳密、API 金鑰、Cloudflare secret、GitHub token、或私人聯絡資訊提交到 repo。
- 不要直接在公開 repo 中放置測試資料中包含真實客戶資訊。
- 不要在沒有驗證的情況下修改商業邏輯、付款流程或信件通知流程。

## Pull Request 規範

### 分支命名

建議使用：

```text
feature/xxx
fix/xxx
chore/xxx
```

### Commit Message

建議使用簡短、清楚的提交訊息：

```text
feat: add booking form validation
fix: correct checkout subtotal calculation
chore: add MIT LICENSE
```

### PR 檢查清單

在提交 PR 前，請確認：

- [ ] 變更範圍清楚明確
- [ ] 沒有遺漏敏感資訊
- [ ] README 或相關文件若有必要已更新
- [ ] 若是內容修改，與品牌風格/設計規範一致
- [ ] 若是 Worker 修改，已確認 Cloudflare vars / secrets 需求
- [ ] 若涉及資料表或訂單邏輯，已審慎檢查影響範圍

## 問題回報

在提交 issue 前，請盡量提供：

- 問題描述
- 自我測試步驟
- 影響頁面 / 區塊
- 瀏覽器 / 作業系統 / 版本
- 相關截圖或錯誤訊息

## 版權與授權

- 本專案目前採用 MIT License，詳見 `LICENSE`。
- 若你新增檔案或貢獻程式碼，請確保你有權利提交，且不會侵犯第三方著作權。

## 感謝

感謝你幫這個專案留下任何一點改善與價值。
