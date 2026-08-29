# WordPress 內容維運工作區（範本）

這是一份**範本**，不是拿來直接在這個 repo 裡跑的東西。
把整個資料夾複製到你電腦上另一個位置，才是你的工作區。

完整的設定步驟見 [`docs/WORDPRESS_MAINTENANCE.md`](../../docs/WORDPRESS_MAINTENANCE.md)。

## 資料夾內容

| 檔案 | 用途 |
| --- | --- |
| `wp.py` | 內容拉取／推送工具。只用 Python 標準函式庫，不需安裝任何東西 |
| `.env.example` | 連線設定範本。複製成 `.env` 填入網址、帳號、應用程式密碼 |
| `CLAUDE.md.example` | 給 Claude 的工作守則：品牌禁區、文案語氣、不要碰什麼。複製成 `CLAUDE.md` |
| `dot-claude/settings.json` | 權限護欄。放到工作區的 `.claude/settings.json` |
| `gitignore.example` | 複製成 `.gitignore`，確保 `.env` 不會外流 |

## 快速開始

```bash
cp -R tools/wp-workspace ~/daoissimple-wp
cd ~/daoissimple-wp
mkdir -p .claude && mv dot-claude/settings.json .claude/ && rmdir dot-claude
mv CLAUDE.md.example CLAUDE.md
mv gitignore.example .gitignore
cp .env.example .env      # ← 然後編輯 .env 填入三個值
./wp.py whoami            # 確認連得上
```

## 為什麼要有這支工具，而不是直接讓 Claude 呼叫 API

三個理由：

1. **看得見。** 網站會被怎麼碰，全部收斂在 `wp.py` 的 `api()` 一個函式裡，讀一次就看完了
2. **擋得住。** 因為動作有固定形狀，`.claude/settings.json` 才能把「讀」設成免問、「寫」設成必問
3. **回得去。** 每次推送前自動把線上版本存進 `content/_backup/`。這個站沒有 staging，這是最後一道防線
