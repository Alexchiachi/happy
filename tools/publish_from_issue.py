#!/usr/bin/env python3
"""
tools/publish_from_issue.py
由 GitHub Issue 內容自動解析並發布新文章至「幸福誌」。
包含：排版生成 HTML、新增至 journal.html 卡片列表、自動同步簡體版 (build_zhcn.py) 與資產雜湊 (bump_assets.py)。
"""
import datetime
import html
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JOURNAL_DIR = ROOT / "journal"


def get_current_date():
    """取得台灣時區 (UTC+8) 的當前日期"""
    tz_tw = datetime.timezone(datetime.timedelta(hours=8))
    return datetime.datetime.now(tz_tw)


def parse_date(title: str, body: str):
    """從標題或內文提取日期 (YYYY-MM-DD)，若無則使用今天"""
    date_match = re.search(r"\b(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})\b", title + " " + body)
    if date_match:
        y, m, d = date_match.groups()
        dt = datetime.date(int(y), int(m), int(d))
        return dt.strftime("%Y-%m-%d"), dt.strftime("%Y.%m")
    now = get_current_date()
    return now.strftime("%Y-%m-%d"), now.strftime("%Y.%m")


def clean_title(title: str) -> str:
    """清理標題前綴"""
    t = title.strip()
    t = re.sub(r"^\[(?:發文|publish|發布|文章)\]\s*", "", t, flags=re.I)
    t = re.sub(r"^【(?:發文|publish|發布|文章)】\s*", "", t, flags=re.I)
    return t.strip() or "每日隨筆"


def generate_slug(clean_t: str, date_str: str) -> str:
    """根據日期與標題生成檔案 slug"""
    base = f"{date_str}-happiness-news" if "幸福新聞" in clean_t else f"{date_str}-post"
    candidate = base
    counter = 2
    while (JOURNAL_DIR / f"{candidate}.html").exists():
        candidate = f"{base}-{counter}"
        counter += 1
    return candidate


def parse_content(body: str):
    """
    將 Issue 內文智慧解析為：
    - lede: 開場摘要
    - sections: 段落與小標題結構
    """
    lines = body.replace("\r\n", "\n").split("\n")
    lede = ""
    sections_html = []
    
    # 暫存當前段落文字
    current_paragraphs = []
    current_sources = {}
    
    def flush_sources():
        nonlocal current_sources
        if not current_sources:
            return ""
        items = []
        if "source" in current_sources:
            items.append(f"來源：{html.escape(current_sources['source'])}")
        if "date" in current_sources:
            items.append(f"日期：{html.escape(current_sources['date'])}")
        if "url" in current_sources:
            url = current_sources["url"]
            items.append(f'<a href="{html.escape(url)}" target="_blank" rel="noopener">閱讀原文 →</a>')
        current_sources = {}
        if items:
            return f'<div class="editor-note">\n        {" &nbsp;|&nbsp; ".join(items)}\n      </div>'
        return ""

    i = 0
    in_lede_block = False
    
    while i < len(lines):
        line = lines[i].strip()
        
        # 忽略裝飾線
        if re.match(r"^[═─\-=_]{3,}$", line):
            i += 1
            continue

        # 檢測導讀開頭
        if re.search(r"【(?:當日重點導讀|重點導讀|導讀|摘要)】", line) or line.startswith("### 開場摘要"):
            in_lede_block = True
            i += 1
            continue

        # 檢測分區或大主題（如 🌍 全球趨勢與研究）
        if re.match(r"^🌍|^\d+[\.、]\s*|^\#{1,2}\s+", line):
            in_lede_block = False
            # 如果是純大主題分類（例如 🌍 全球趨勢與研究），可略過或轉為章節小標
            clean_head = re.sub(r"^[\#\s🌍]+", "", line).strip()
            if clean_head and len(clean_head) < 30 and not re.search(r"【\d+】", line):
                i += 1
                continue

        # 處理導讀內容
        if in_lede_block:
            if line and not line.startswith("【") and not line.startswith("#"):
                lede += (" " + line if lede else line)
                i += 1
                continue
            else:
                in_lede_block = False

        # 檢測條目小標（例如 【1】標題、### 小標、## 小標）
        h_match = re.match(r"^(?:【\d+】|\#{2,3}\s+)(.*)$", line)
        if h_match:
            # 先清空前面累積的 source
            s_html = flush_sources()
            if s_html:
                sections_html.append(s_html)

            h_text = h_match.group(1).strip()
            sections_html.append(f"<h2>{html.escape(h_text)}</h2>")
            i += 1
            continue

        # 檢測來源與連結
        src_match = re.match(r"^(?:來源|Source)[:：]\s*(.*)$", line, re.I)
        if src_match:
            current_sources["source"] = src_match.group(1).strip()
            i += 1
            continue

        url_match = re.match(r"^(?:連結|網址|URL|Link)[:：]\s*(.*)$", line, re.I)
        if url_match:
            current_sources["url"] = url_match.group(1).strip()
            i += 1
            continue

        date_match = re.match(r"^(?:日期|Date)[:：]\s*(.*)$", line, re.I)
        if date_match:
            current_sources["date"] = date_match.group(1).strip()
            i += 1
            continue

        # 引用 blockquote
        if line.startswith(">"):
            q_text = line.lstrip("> ").strip()
            sections_html.append(f"<blockquote>\n  {html.escape(q_text)}\n</blockquote>")
            i += 1
            continue

        # 一般正文段落
        if line:
            # 先將來源清出
            s_html = flush_sources()
            if s_html:
                sections_html.append(s_html)

            sections_html.append(f"<p>{html.escape(line)}</p>")
        
        i += 1

    s_html = flush_sources()
    if s_html:
        sections_html.append(s_html)

    # 若無專門導讀，取第一個段落作為 lede
    if not lede and sections_html:
        for item in sections_html:
            if item.startswith("<p>"):
                lede = re.sub(r"<[^>]+>", "", item)
                break

    if not lede:
        lede = "今日精選生活與土地故事，與您分享真實、簡單的幸福。"

    return lede, "\n\n      ".join(sections_html)


def build_article_html(title: str, date_str: str, year_month: str, lede: str, body_html: str, slug: str) -> str:
    """生成完整文章 HTML"""
    # 決定色塊與構圖
    color = "moss" if any(w in title for w in ("台灣", "田", "米", "動", "健康")) else "tea"
    comp_v = "v4"

    return f"""<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{html.escape(title)} · 幸福誌 · 大道至簡</title>
  <meta name="description" content="{html.escape(lede[:120])}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="大道至簡 · Dao is simple">
  <meta property="og:locale" content="zh_TW">
  <meta property="og:url" content="https://alexchiachi.github.io/happy/journal/{slug}.html">
  <meta property="og:title" content="{html.escape(title)} · 幸福誌 · 大道至簡">
  <meta property="og:description" content="{html.escape(lede[:120])}">
  <meta property="og:image" content="https://alexchiachi.github.io/happy/images/og-default.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="大道至簡 · 做幸福的事，讓幸福變成有價值的事">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{html.escape(title)} · 幸福誌 · 大道至簡">
  <meta name="twitter:description" content="{html.escape(lede[:120])}">
  <meta name="twitter:image" content="https://alexchiachi.github.io/happy/images/og-default.png">
  <meta name="theme-color" content="#FAF6EF">
  <link rel="icon" href="../images/favicon.png" type="image/png">
  <link rel="apple-touch-icon" href="../images/apple-touch-icon.png">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,400&family=Noto+Serif+TC:wght@200;300;400;500&display=swap" onload="this.onload=null;this.rel='stylesheet'">
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,400&family=Noto+Serif+TC:wght@200;300;400;500&display=swap"></noscript>
  <link rel="stylesheet" href="../styles.css">
</head>
<body>
<a class="skip-link" href="#main">跳到主要內容</a>

<nav class="nav">
  <a class="nav-brand" href="../index.html">大道至簡<small>Dao is simple</small></a>
  <button class="nav-toggle" aria-label="menu">≡</button>
  <ul class="nav-menu">
    <li><a href="../yunnan.html">雲南</a></li>
    <li><a href="../taiwan.html">台灣</a></li>
    <li><a href="../journal.html" class="active">幸福誌</a></li>
    <li><a href="../services.html">服務體驗</a></li>
    <li><a href="../executive.html">高階顧問</a></li>
    <li><a href="../about.html">關於</a></li>
    <li><a href="../connect.html">連繫</a></li>
  </ul>
</nav>

<main id="main" tabindex="-1">
  <article class="container narrow">

    <div class="img-placeholder {color} article-cover reveal {comp_v} cover-title">
      <div class="cover-inner">
        <div class="meta">生活提案 · {year_month}</div>
        <h1 class="t-md">{html.escape(title)}</h1>
      </div>
      <span>DAILY · 幸福新聞</span>
    </div>

    <header class="article-hero after-cover reveal">
      <p class="lede">{html.escape(lede)}</p>
      <div class="byline">文 · 幸福誌編輯部 &nbsp;|&nbsp; {date_str} &nbsp;|&nbsp; 約 3 分鐘</div>
    </header>

    <div class="article-body">

      {body_html}

      <hr>

      <blockquote>
        做幸福的事，讓幸福變成有價值的事。<br>
        把心慢下來，看見身邊尋常而動人的好。
        <cite>— 幸福誌 · 每日隨筆</cite>
      </blockquote>

    </div>

    <footer class="article-foot">
      <p class="article-next">回到生活與土地。看看我們的 <a href="../taiwan.html">台灣土地誠實選物</a>。</p>
      <a href="../journal.html" class="svc-cta">← 回幸福誌</a>
      <div class="seal">大道至簡</div>
    </footer>

  </article>
</main>

<footer class="footer">
  <div class="container">
    <div class="footer-grid">
      <div>
        <div class="footer-brand-name">大道至簡</div>
        <div class="footer-brand-en">Dao is simple</div>
        <p class="footer-brand-desc">做幸福的事，讓幸福變成有價值的事。雲南與台灣的好物與生活提案，由簡家旗主理。</p>
      </div>
      <div><h2>選物</h2><ul><li><a href="../yunnan.html">雲南選物</a></li><li><a href="../taiwan.html">台灣選物</a></li></ul></div>
      <div><h2>內容</h2><ul><li><a href="../journal.html">幸福誌</a></li><li><a href="../about.html">關於</a></li></ul></div>
      <div><h2>連繫</h2><ul><li><a href="../services.html">服務體驗</a></li><li><a href="../executive.html">高階顧問</a></li><li><a href="../connect.html">寫信給我們</a></li></ul></div>
    </div>
    <div class="footer-bottom">
      <p>© 2026 大道至簡 · Dao is simple</p>
      <p>Designed in stillness · 設計於靜處</p>
    </div>
  </div>
</footer>

<script src="../scripts.js"></script>
<!-- Cloudflare Web Analytics：不用 cookie、不追蹤個人，只統計瀏覽量（見 privacy.html）--><script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{{"token": "bbab4131ad864cc59ac6bdd0c4707adb"}}'></script>
</body>
</html>
"""


def insert_card_into_journal_html(title: str, year_month: str, lede: str, slug: str, color="moss", comp_v="v4"):
    """在 journal.html 的列表頂端插入卡片"""
    journal_path = ROOT / "journal.html"
    content = journal_path.read_text(encoding="utf-8")
    
    card_html = f"""      <a href="journal/{slug}.html" class="article-card reveal">
        <div class="img-placeholder {color} {comp_v} has-title">
          <div class="cover-inner">
            <div class="meta">生活提案 · {year_month}</div>
            <h3>{html.escape(title)}</h3>
          </div>
          <span>DAILY · 幸福新聞</span>
        </div>
        <p>{html.escape(lede[:90])}...</p>
      </a>"""

    # 尋找文章列表起始註解後的插入點
    marker = "══════════════════════════════════════════════════════════════ -->"
    if marker in content:
        parts = content.split(marker, 1)
        new_content = parts[0] + marker + "\n" + card_html + parts[1]
        journal_path.write_text(new_content, encoding="utf-8")
        print("✅ 已在 journal.html 插入新文章卡片。")
    else:
        print("⚠️ 未在 journal.html 找到標記，請檢查排版。", file=sys.stderr)


def main():
    raw_title = os.environ.get("ISSUE_TITLE") or (sys.argv[1] if len(sys.argv) > 1 else "")
    raw_body = os.environ.get("ISSUE_BODY") or (sys.argv[2] if len(sys.argv) > 2 else "")

    if not raw_title and not raw_body:
        print("❌ 缺少 Issue 標題或內容！", file=sys.stderr)
        sys.exit(1)

    clean_t = clean_title(raw_title)
    date_str, year_month = parse_date(clean_t, raw_body)
    slug = generate_slug(clean_t, date_str)
    
    print(f"📖 處理文章: {clean_t}")
    print(f"📅 日期: {date_str} ({year_month})")
    print(f"🔗 Slug: {slug}")

    lede, body_html = parse_content(raw_body)
    article_html = build_article_html(clean_t, date_str, year_month, lede, body_html, slug)

    target_file = JOURNAL_DIR / f"{slug}.html"
    target_file.write_text(article_html, encoding="utf-8")
    print(f"✅ 已生成文章檔案: {target_file}")

    insert_card_into_journal_html(clean_t, year_month, lede, slug)

    # 執行專案繁簡同步與資產快取更新
    bump_assets = ROOT / "tools" / "bump_assets.py"
    build_zhcn = ROOT / "tools" / "build_zhcn.py"

    if bump_assets.exists():
        import subprocess
        subprocess.run(["python3", str(bump_assets)], cwd=ROOT)

    if build_zhcn.exists():
        import subprocess
        subprocess.run(["python3", str(build_zhcn)], cwd=ROOT)

    if bump_assets.exists():
        import subprocess
        subprocess.run(["python3", str(bump_assets)], cwd=ROOT)

    # 輸出變數給 GitHub Actions
    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        with open(github_output, "a", encoding="utf-8") as f:
            f.write(f"slug={slug}\n")
            f.write(f"title={clean_t}\n")

    print(f"🎉 文章 {clean_t} 發布準備就緒！")


if __name__ == "__main__":
    main()
