# 用本機 Claude Code 維護 daoissimple.com 的內容

適用對象：daoissimple.com（WordPress · Blocksy 主題 · cPanel 共享主機）
目標：**內容與文案**的日常維護 —— 改頁面文字、發文章、調 SEO 標題描述。

主題外觀與程式碼開發不走這條路，那些留在 GitHub 的 `alexchiachi/happy` repo。

---

## 為什麼是「本機」，不是雲端

我在雲端執行時，網路受環境政策管控 —— 實測 `daoissimple.com` 是被擋住的，
連不上就談不上維護。而且雲端 session 要能連你的站，就得把密碼交給我，
那串密碼會留在對話記錄裡。

裝在你自己電腦上，兩個問題一起消失：**密碼不離開你的機器，網路也不再有中間人。**
前期多花半小時設定，換來的是往後可以放心用。

---

## 步驟零：先把備份弄好

你說備份「不確定」。**在還沒確認備份之前，不要讓任何自動化工具碰這個站** ——
包括我。這一步做完再往下走。

### 檢查 cPanel 有沒有在備份

登入 cPanel，看「檔案」區塊：

- 有 **JetBackup** → 點進去看有沒有每日還原點，有的話這步就完成了
- 只有 **備份精靈（Backup Wizard）** → 那是手動的，不會自己跑。往下看

主機商的備份**不能當作唯一保險**。很多共享主機的備份是「主機層級」的，
還原時整個帳號一起回到某個時間點，而且不保證保留幾天。

### 裝一個自己控制的備份

後台 → 外掛 → 安裝外掛 → 搜尋 **UpdraftPlus**，安裝並啟用。設定：

| 項目 | 建議值 |
| --- | --- |
| 檔案備份排程 | 每週 |
| 資料庫備份排程 | **每日**（內容都在資料庫裡） |
| 保留幾份 | 4 份以上 |
| 遠端儲存 | Google Drive 或 Dropbox（**不要只存在主機上**） |

設定完按一次「**立即備份**」，確認真的跑出檔案、真的傳到雲端硬碟。
沒看到檔案就是沒備份成功，不要假設它有在跑。

> 為什麼堅持遠端：備份跟網站放在同一台主機上，主機出事的時候兩個一起沒。

---

## 步驟一：安裝 Claude Code

需要 Claude 的 **Pro 或 Max** 方案（免費方案不含 Claude Code）。

**macOS**：打開「終端機」（Spotlight 搜尋 Terminal），貼上：

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

**Windows**：打開 PowerShell，貼上：

```powershell
irm https://claude.ai/install.ps1 | iex
```

裝完確認一下：

```bash
claude --version
```

有印出版本號（像 `2.1.211 (Claude Code)`）就成功了。
如果顯示 `command not found`，把終端機關掉重開再試一次。

> 不想用終端機的話，Claude Code 也有桌面版 App。但下面的步驟都用終端機寫，
> 因為指令複製貼上比描述點哪裡快。

---

## 步驟二：建立工作區

從這個 repo 複製一份工作區範本出來。**工作區要放在 repo 外面** ——
裡面會有密碼，不能跟公開的 repo 混在一起。

```bash
cd ~/Desktop/happy          # 換成你放 repo 的位置
cp -R tools/wp-workspace ~/daoissimple-wp
cd ~/daoissimple-wp

mkdir -p .claude && mv dot-claude/settings.json .claude/ && rmdir dot-claude
mv CLAUDE.md.example CLAUDE.md
mv gitignore.example .gitignore
cp .env.example .env
```

現在 `~/daoissimple-wp` 裡有：

| 檔案 | 是什麼 |
| --- | --- |
| `wp.py` | 內容拉取／推送工具 |
| `.env` | 你的連線密碼（下一步填） |
| `CLAUDE.md` | 給我的工作守則：品牌禁區、文案語氣、不要碰什麼 |
| `.claude/settings.json` | 權限護欄：讀免問、寫必問 |

---

## 步驟三：產生應用程式密碼

WordPress 內建這個功能，**不用裝任何外掛**。它產生的是一串專用密碼，
可以隨時單獨撤銷，撤銷不影響你自己的登入密碼。

### 先開一個專用帳號（建議，但可以先跳過）

後台 → 使用者 → 新增使用者。角色選「**編輯**」而不是「管理員」。

這樣就算哪天出錯，能被改動的範圍也只有文章和頁面 ——
外掛、佈景、使用者設定碰不到。多花三分鐘，換一層保險。

### 產生密碼

1. 用那個帳號登入後台
2. 使用者 → 個人資料，**捲到最下面**找「應用程式密碼」
3. 名稱填 `Claude Code`，按「新增應用程式密碼」
4. 會出現一串像 `abcd EFGH ijkl MNOP qrst UVWX` 的東西

**那串只會顯示這一次。** 立刻複製，貼進 `.env`：

```
WP_SITE=https://daoissimple.com
WP_USER=你的使用者名稱
WP_APP_PASSWORD=abcd EFGH ijkl MNOP qrst UVWX
```

- `WP_USER` 是**使用者名稱**，不是 email，也不是顯示名稱。在後台的使用者列表看得到
- 密碼**含空格照貼**，不要把空格刪掉

> 找不到「應用程式密碼」區塊？往下看〈常見狀況〉第一項。

---

## 步驟四：確認連得上

```bash
cd ~/daoissimple-wp
./wp.py whoami
```

順利的話會看到：

```
連線成功
  站台：https://daoissimple.com
  身分：簡家旗 (alex)
  角色：editor
```

接著把現有內容全部拉下來看看：

```bash
./wp.py list pages
./wp.py pull-all pages
```

`content/` 現在有了每一頁的內容檔。**這本身就是一份內容快照**，
之後改壞了還能對照。

出錯的話錯誤訊息會直接告訴你原因（401 是密碼、403 是權限、404 是被外掛擋），
對照〈常見狀況〉處理。

---

## 步驟五：第一次改文案，完整走一遍

現在啟動 Claude Code：

```bash
cd ~/daoissimple-wp
claude
```

第一次會請你在瀏覽器登入。之後就是直接講話，例如：

> 幫我看一下「關於」這頁的文案，第二段講品牌起源那裡讀起來太像廣告詞，
> 改得樸實一點，但不要變短。

我會做的事，照順序：

1. `./wp.py list pages` 找出「關於」的 ID
2. `./wp.py pull pages <id>` 拉下來
3. 讀 `CLAUDE.md` 確認品牌語氣的規矩
4. 改 `content/pages-<id>-about.html`
5. `./wp.py diff pages <id>` 把改動列給你看
6. **停下來等你確認** —— 推送這個動作，`.claude/settings.json` 設成必問

你看過差異、覺得可以，我才推。建議的推法：

```
先存成草稿，我到後台預覽過再上線
```

我就會用 `./wp.py draft pages <id> --yes`，線上版本原封不動，
你在後台按預覽看實際長相，滿意了再說「上線吧」。

### 每次開工前先 pull

如果中間有人直接在後台改過東西，本機的檔案就舊了。開工第一件事：

```bash
./wp.py pull-all pages
```

覆蓋掉本機的舊檔，從線上的現況開始改。

---

## 護欄是怎麼設的

`.claude/settings.json` 把動作分成三類：

| 類別 | 動作 | 行為 |
| --- | --- | --- |
| **免問** | `list`、`pull`、`diff`、讀寫 `content/` | 直接做，不打擾你 |
| **必問** | `push`、`draft` | 每次都跳出來等你按確認 |
| **禁止** | `curl`、`wget`、讀 `.env` | 直接擋掉 |

擋 `curl` 和 `wget` 是刻意的：這樣我就沒有繞過 `wp.py` 直接打 API 的路。
所有對網站的動作都得經過那一支腳本，而那支腳本的對外請求全部收斂在
一個叫 `api()` 的函式裡 —— 你想確認我能做什麼，讀那二十行就夠了。

想更嚴格的話，把 `pull` 也移到 `ask` 區塊。想更省事的話，
等你用順手了再把 `draft` 移到 `allow`（草稿不影響線上版本，風險低）。

---

## 加分題：如果主機有 SSH

cPanel 如果有開 SSH（左側找「SSH 存取」或「終端機」），
就能用 **WP-CLI**，那比 REST API 強得多 —— 可以管外掛、跑資料庫查詢、
批次搜尋取代。

先在 cPanel 的終端機試：

```bash
wp --info
```

有東西出來就代表主機裝了 WP-CLI。這時候告訴我，我再幫你設定
本機透過 SSH 操作的方式（`wp --ssh=user@host` 或 SSH alias）。

**沒有 SSH 也完全沒關係。** 你要做的是內容維護，REST API 這條路已經夠用，
而且風險小得多 —— WP-CLI 的權限大到可以刪資料庫。

---

## 出事了怎麼辦

依序試，越前面越輕：

1. **後台的修訂版本。** 編輯該頁 → 右側「修訂版本」→ 挑推送前那一版 → 還原。
   WordPress 每次更新都自動存一版，這是最快的路
2. **`content/_backup/`。** 每次推送前，工具會自動把線上版本存成 JSON 存在這裡。
   把裡面的 `content.raw` 內容貼回去就還原了
3. **UpdraftPlus。** 前兩個都不行才動這個 —— 它會還原整個資料庫，
   等於把那段時間內所有人的改動一起退掉

發現改壞了，**先停手不要再推**。多推一次會多蓋一層修訂版本，讓還原更麻煩。

---

## 常見狀況

**個人資料頁找不到「應用程式密碼」區塊**
三個可能：網站沒有啟用 HTTPS（這個功能強制要求 SSL）；WordPress 版本低於 5.6；
或是安全外掛（Wordfence、iThemes Security、Solid Security）把它關掉了。
到那個外掛的設定裡找 `Application Passwords` 或 `REST API`，開回來。

**`whoami` 回 401，但密碼確定沒打錯**
cPanel 用的 Apache 常常會把 `Authorization` 標頭吃掉，這是共享主機的老問題。
到 cPanel 的檔案管理員，編輯網站根目錄的 `.htaccess`，在最前面加一行：

```apache
RewriteRule ^(.*) - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]
```

存檔後再試一次。

**`whoami` 回 403 或 404，`wp-json` 打不開**
安全外掛把 REST API 整個關了。找到「停用 REST API」的選項改成
「僅停用未登入者的存取」——已驗證的請求要放行，不然這套工具不能用。

**`diff` 顯示一堆看不懂的 `<!-- wp:paragraph -->`**
那是 Gutenberg 的區塊註解，是正常的，**不要刪**。刪掉 WordPress 就認不得那是區塊，
後台編輯器會顯示成一坨壞掉的 HTML。改字就好，註解留著。

**改完推上去，版面跑掉了**
多半是動到了 Blocksy 的區塊結構或 CSS class。用後台的修訂版本還原，
然後告訴我是哪一頁 —— 這種情況通常表示那個改動應該用區塊編輯器做，
不該用文字檔硬改。

**列表只出現 100 筆**
工具一次最多列 100 筆。頁面數量超過的話告訴我，我加分頁。
以這個站目前的規模不會遇到。

**我的電腦掉了 / 密碼可能外流**
後台 → 使用者 → 個人資料 → 應用程式密碼 → 按那組的「撤銷」。
立刻失效，不影響你自己的登入密碼，重新產生一組就好。

---

## 這條路做不到的事

講清楚邊界，免得期待落空：

- **改主題外觀、調版面** —— 那要改主題檔案，屬於程式碼工作，回 `alexchiachi/happy` 做（而且要開子主題，不然 Blocksy 一更新就被蓋掉）
- **裝外掛、改設定** —— 這支工具刻意做不到。要做請在後台手動做
- **上傳圖片** —— 走後台媒體庫。你上傳完把網址給我，我寫進內容裡
- **改選單、頁尾、小工具** —— 那些不在文章內容裡，在主題設定裡

這些要做也可以，只是不走這條路。到時候再說。
