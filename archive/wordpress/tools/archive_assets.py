#!/usr/bin/env python3
"""舊網站資產整併：SQL → src/content/archive/*.md（文章）＋ legacy-pages/*.md（舊頁面），
uploads 原圖 → public/archive-images/*.webp

用法：
    python3 archive_assets.py localhost.sql wp-content.zip [--root .]

需要 Pillow（pip install Pillow）。
"""
import argparse
import io
import re
import zipfile
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path, PurePosixPath
from urllib.parse import quote, unquote

from PIL import Image, ImageOps

import wp_to_markdown as w

IMG_EXT = r"(?:jpe?g|png|gif|webp)"
THUMB_RE = re.compile(r"-\d+x\d+$")                  # WordPress 尺寸縮圖：-寬x高
UPLOAD_URL_RE = re.compile(r"(?:https?://[^\s()\"'<>]*?)?/wp-content/uploads/([^\s()\"'<>?#]+\.%s)(?:[?#][^\s()\"'<>]*)?" % IMG_EXT, re.I)
OLD_SITE_LINK_RE = re.compile(r"\]\(https?://(?:www\.)?(?:hii\.hdv\.mybluehost\.me|daoissimple\.com)(/[^)\s?#]*)?([?#][^)\s]*)?\)")
MAX_EDGE = 2560                                       # 與 WordPress 的大圖門檻相同
QUALITY = 80


def read_table(sql, table):
    """讀出 `<前綴>_<table>` 的所有列（前綴自動偵測，例如 9Bv_、wp_）。"""
    rows = []
    for m in re.finditer(r"INSERT INTO `[A-Za-z0-9]+_%s` \(([^)]*)\) VALUES\s*" % table, sql):
        cols = [c.strip().strip("`") for c in m.group(1).split(",")]
        rows += [dict(zip(cols, r)) for r in w.parse_values(sql, m.end())[0]]
    return rows


def split_name(rel):
    """'2024/05/foo-1024x691.jpg.webp' → ('2024/05', 'foo-1024x691', 是否為衍生檔)。

    衍生檔 = EWWW 產生的 .jpg.webp 副本或 .bk.png 備份，原檔另有存在。
    """
    p = PurePosixPath(rel)
    name, derived = p.name, False
    m = re.match(r"(.+)\.%s\.webp$" % IMG_EXT, name, re.I) or re.match(r"(.+)\.bk\.%s$" % IMG_EXT, name, re.I)
    if m:
        stem, derived = m.group(1), True
    else:
        stem = name.rsplit(".", 1)[0]
    return str(p.parent), stem, derived


def lookup_key(folder, stem):
    """縮圖與 -scaled 都對應回同一張原圖。"""
    stem = THUMB_RE.sub("", stem)
    stem = re.sub(r"-scaled$", "", stem)
    return f"{folder}/{stem}"


def pick_originals(names):
    """回傳 {lookup_key: zip 內路徑}，每張原圖只挑一個最好的來源。"""
    best = {}
    for zpath in names:
        rel = zpath.split("wp-content/uploads/", 1)[1]
        if not re.search(r"\.%s$" % IMG_EXT, rel, re.I):
            continue
        folder, stem, derived = split_name(rel)
        if THUMB_RE.search(stem):
            continue                                   # 跳過縮圖
        key = lookup_key(folder, stem)
        # 優先序：真正的原檔 > -scaled > EWWW 副本/備份
        rank = (2 if derived else 1 if stem.endswith("-scaled") else 0)
        if key not in best or rank < best[key][0]:
            best[key] = (rank, zpath)
    return {k: v[1] for k, v in best.items()}


def assign_output_names(keys):
    """扁平化：同名檔加上 -年-月 避免互相覆蓋。"""
    by_stem = {}
    for k in keys:
        by_stem.setdefault(PurePosixPath(k).name.lower(), []).append(k)
    out = {}
    for stem, ks in by_stem.items():
        for k in ks:
            folder, name = k.rsplit("/", 1) if "/" in k else ("", k)
            if len(ks) > 1 and folder:
                name = f"{name}-{folder.replace('/', '-')}"
            out[k] = re.sub(r'[\\/:*?"<>|\s]+', "-", name) + ".webp"
    return out


def convert(job):
    zip_path, member, dest = job
    if Path(dest).exists():
        return dest, None
    try:
        with zipfile.ZipFile(zip_path) as z:
            data = z.read(member)
        im = Image.open(io.BytesIO(data))
        animated = getattr(im, "is_animated", False) and im.format in ("GIF", "WEBP")  # iPhone MPO 也是多幀，當靜態圖處理
        if animated:
            im.save(dest, "WEBP", save_all=True, quality=QUALITY)
        else:
            im = ImageOps.exif_transpose(im)
            if im.mode not in ("RGB", "RGBA"):
                im = im.convert("RGBA" if "transparency" in im.info or im.mode in ("LA", "PA") else "RGB")
            im.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)
            im.save(dest, "WEBP", quality=QUALITY, method=6)
        return dest, None
    except Exception as e:  # 壞檔不中斷整批，最後列出
        Path(dest).unlink(missing_ok=True)
        return dest, f"{member}: {e}"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("sql")
    ap.add_argument("zip")
    ap.add_argument("--root", default=".", help="專案根目錄（輸出 src/ 與 public/ 的位置）")
    args = ap.parse_args()
    root = Path(args.root)
    md_dir = root / "src/content/archive"
    pages_dir = root / "legacy-pages"
    img_dir = root / "public/archive-images"
    md_dir.mkdir(parents=True, exist_ok=True)
    pages_dir.mkdir(parents=True, exist_ok=True)
    img_dir.mkdir(parents=True, exist_ok=True)

    # 1. 圖片：挑原圖 → 轉 webp
    with zipfile.ZipFile(args.zip) as z:
        names = [n for n in z.namelist() if "wp-content/uploads/" in n and not n.endswith("/")]
    originals = pick_originals(names)
    out_names = assign_output_names(originals)
    jobs = [(args.zip, originals[k], str(img_dir / out_names[k])) for k in originals]
    errors = []
    with ProcessPoolExecutor() as ex:
        for i, (_, err) in enumerate(ex.map(convert, jobs, chunksize=16), 1):
            if err:
                errors.append(err)
            if i % 500 == 0:
                print(f"  圖片 {i}/{len(jobs)}", flush=True)

    # 2. 文章：SQL → Markdown，補上分類／標籤／封面／摘要，並替換圖片與站內網址
    sql = Path(args.sql).read_text(encoding="utf-8", errors="replace")
    posts = [p for p in w.read_posts(sql)
             if p.get("post_status") == "publish" and p.get("post_type") in ("post", "page")]
    meta = {}
    for r in read_table(sql, "postmeta"):
        meta.setdefault(r["post_id"], {})[r["meta_key"]] = r["meta_value"]
    terms = {t["term_id"]: w.html.unescape(unquote(t["name"])) for t in read_table(sql, "terms")}
    tax = {t["term_taxonomy_id"]: (t["taxonomy"], terms.get(t["term_id"])) for t in read_table(sql, "term_taxonomy")}
    post_terms = {}
    for r in read_table(sql, "term_relationships"):
        taxonomy, name = tax.get(r["term_taxonomy_id"], (None, None))
        if taxonomy in ("category", "post_tag") and name and name != "Uncategorized":
            post_terms.setdefault(r["object_id"], {}).setdefault(taxonomy, []).append(name)
    slug_by_id = {p["ID"]: unquote(p["post_name"] or "") or p["ID"] for p in posts}
    known_paths = {f"/{s}/" for s in slug_by_id.values()} | {"/"}
    old_slugs = {}                                       # WordPress 改名前的 slug → 現在的 slug
    for pid, m in meta.items():
        old = m.get("_wp_old_slug")
        if old and pid in slug_by_id and unquote(old) != slug_by_id[pid]:
            old_slugs[unquote(old)] = slug_by_id[pid]
    replaced, missing, used, links_fixed, broken = 0, set(), set(), 0, {}

    def image_path(rel):
        folder, stem, _ = split_name(unquote(rel))
        name = out_names.get(lookup_key(folder, stem))
        return "/archive-images/" + quote(name) if name and img_dir.joinpath(name).exists() else None

    def swap(m):
        nonlocal replaced
        new = image_path(m.group(1))
        if new:
            replaced += 1
            return new
        missing.add(m.group(0))
        return m.group(0)

    def relink(m):
        nonlocal links_fixed
        path, query = m.group(1) or "/", m.group(2) or ""
        if path.startswith("/wp-content/"):
            return m.group(0)                            # 影音／PDF 等媒體檔，維持舊網址
        q = re.search(r"[?&](?:p|page_id)=(\d+)", query)
        if q and q.group(1) in slug_by_id:
            path, query = f"/{slug_by_id[q.group(1)]}/", ""
        path = unquote(path)
        if not path.endswith("/") and "." not in path.rsplit("/", 1)[-1]:
            path += "/"
        if path.strip("/") in old_slugs:
            path = f"/{old_slugs[path.strip('/')]}/"
        links_fixed += 1
        if path not in known_paths and not query:
            broken.setdefault(path, set()).add(current[0])
        return f"]({path}{query})"

    current = [""]
    for p in posts:
        is_post = p["post_type"] == "post"
        out_dir = md_dir if is_post else pages_dir
        title = w.html.unescape(p["post_title"] or "")
        slug = slug_by_id[p["ID"]]
        fname = w.safe_filename(slug)
        if (out_dir, fname) in used:
            fname = f"{fname}-{p['ID']}"
        used.add((out_dir, fname))
        current[0] = f"{out_dir.name}/{fname}.md"
        body = UPLOAD_URL_RE.sub(swap, w.clean_content(p["post_content"] or ""))
        body = OLD_SITE_LINK_RE.sub(relink, body)

        m = meta.get(p["ID"], {})
        fields = [("title", title), ("date", p["post_date"]), ("slug", slug)]
        if is_post:
            t = post_terms.get(p["ID"], {})
            fields += [("categories", t.get("category", [])), ("tags", t.get("post_tag", []))]
        thumb = meta.get(m.get("_thumbnail_id"), {}).get("_wp_attached_file")
        cover = image_path(thumb) if thumb else None
        if cover:
            fields.append(("cover", cover))
        desc = (m.get("rank_math_description") or "").strip()
        if not desc or "%" in desc:                      # Rank Math 變數（%excerpt% 等）不可用
            desc = re.sub(r"<[^>]+>", "", w.html.unescape(p["post_excerpt"] or "")).strip()
        if desc and is_post:
            fields.append(("description", " ".join(desc.split())))
        front = "---\n" + "".join(f"{k}: {w.yaml_str(v)}\n" for k, v in fields) + "---\n\n"
        (out_dir / f"{fname}.md").write_text(front + body, encoding="utf-8")

    # 舊網址轉址表（Cloudflare _redirects 格式），供第二步建站時放進 public/
    lines = [f"/{quote(o)}/ /{quote(n)}/ 301" for o, n in sorted(old_slugs.items())]
    (root / "legacy-redirects.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")

    n_posts = sum(p["post_type"] == "post" for p in posts)
    n_img = len(list(img_dir.glob("*.webp")))
    print(f"文章：{n_posts} 篇 → {md_dir.resolve()}")
    print(f"舊頁面（僅供重做參考）：{len(posts) - n_posts} 個 → {pages_dir.resolve()}")
    print(f"圖片：{n_img} 張 webp（從 {len(names)} 個 uploads 檔案中挑出 {len(originals)} 張原圖）→ {img_dir.resolve()}")
    print(f"圖片網址替換：{replaced} 處；找不到原圖而保留舊網址：{len(missing)} 處")
    print(f"站內連結改為相對路徑：{links_fixed} 處；指向不存在頁面：{len(broken)} 個路徑")
    print(f"舊 slug 轉址：{len(old_slugs)} 條 → {(root / 'legacy-redirects.txt').resolve()}")
    for path, files in sorted(broken.items()):
        print("  斷連結", path, "←", ", ".join(sorted(files)))
    for u in sorted(missing):
        print("  缺圖", u)
    for e in errors:
        print("  轉檔失敗", e)


if __name__ == "__main__":
    main()
