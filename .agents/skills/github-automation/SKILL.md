---
name: github-automation
description: >-
  一鍵自動化提交並推送修改到 GitHub 遠端倉庫。當使用者在本機完成修改後，啟動此技能全自動執行專案建置前置檢查（如繁簡同步 build_zhcn.py、資產版本 bump_assets.py）、變更檢視、自動化生成語意 Commit 訊息、認證通道驗證與免密推送（git push）。支援 SSH 與 Token 認證。
---

# GitHub 自動化推送技能 (github-automation)

當使用者要求「推上 GitHub」、「部署上線」、「一鍵推送」、「sync to github」或本機修改完成後需要自動發布時，使用此技能。

## 核心能力

1. **專案前置建置檢查**：
   - 自動檢測倉庫根目錄是否有客製化前置任務（例如 `happy` 倉庫的 `tools/build_zhcn.py` 繁簡同步、`tools/bump_assets.py` 快取版本雜湊更新），確保上線程式碼品質完整。
2. **自動暫存與提交 (git add & commit)**：
   - 檢測工作區變更，若有未提交的檔案，自動加入暫存區並依據修改內容生成語意清晰的 Commit Message。
3. **免密推送通道檢測 (SSH / PAT)**：
   - 自動檢測 SSH 金鑰免密通道，若已連通自動以 `git@github.com:...` 協議安全推送，避免任何終端機互動式密碼阻擋。
4. **一鍵推送至 GitHub (git push)**：
   - 自動推送至當前分支（預設 `main`），成功後觸發 GitHub Actions CI/CD（如 GitHub Pages 自動發布）。

## 執行方式

執行輔助腳本 `scripts/push.py`：

```bash
# 預設自動建置、自動提交、自動推送當前倉庫
python3 "<SKILL_DIR>/scripts/push.py" -C "/path/to/repo"

# 或指定提交訊息
python3 "<SKILL_DIR>/scripts/push.py" -C "/path/to/repo" -m "自訂 Commit 訊息"
```

## 認證故障排除

如果推送時遇到 `Authentication failed` 或 `Permission denied (publickey)`：
- 檢查 `~/.ssh/id_ed25519.pub`。
- 確認公鑰已新增至 GitHub：<https://github.com/settings/ssh/new>。
- 新增完成後重新執行此技能即可。
