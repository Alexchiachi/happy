#!/usr/bin/env python3
"""幸福誌封面與卡片標題：替每個標題標上 --n（最長詞組約幾個字），
CSS（styles.css「標題不折出單獨一個字」）會據此把字級縮到最長詞組排得進封面寬度。

用法：
    python3 tools/set_title_fit.py          # 檢查會改什麼
    python3 tools/set_title_fit.py --write  # 寫回檔案

可重複執行（已有 --n 會更新）。新增文章、改標題後都跑一次，再跑 tools/build_zhcn.py。
規則：標題以 <br> 與 <i class="gap"> 分成詞組；12 字以內的詞組不拆行，更長的詞組允許平衡成兩行。
"""
import glob, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
KEEP = 12  # 這個字數以內的詞組不准拆成兩行


def segs(inner):
    t = re.sub(r'<br\s*/?>', '\x00', inner)
    t = re.sub(r'<i class="gap">[^<]*</i>', '\x00', t)
    t = re.sub(r'<[^>]+>', '', t)
    return [s for s in t.split('\x00') if s.strip()]


def n_of(inner):
    return max((len(s) if len(s) <= KEEP else -(-len(s) // 2) + 1) for s in segs(inner))


def fix(src, pat):
    def r(m):
        tag, cls, inner = m.group(1), m.group(2), m.group(4)
        return '<%s%s style="--n:%d">%s</%s>' % (tag, cls, n_of(inner), inner, tag)
    return re.sub(pat, r, src, flags=re.S)


def main():
    write = '--write' in sys.argv
    changed = 0
    for f in sorted(glob.glob(str(ROOT / 'journal' / '2026-*.html'))):
        s = pathlib.Path(f).read_text(encoding='utf-8')
        s2 = fix(s, r'<(h1)( class="t-[a-z]+")( style="--n:\d+")?>(.*?)</h1>')
        if s2 != s:
            changed += 1
            if write: pathlib.Path(f).write_text(s2, encoding='utf-8')
    jp = ROOT / 'journal.html'
    j = jp.read_text(encoding='utf-8')
    j2 = fix(j, r'<(h3)()( style="--n:\d+")?>(.*?)</h3>')
    j2 = re.sub(r'(<div class="cover-inner">\s*<div class="meta">[^<]*</div>\s*)<h2( style="--n:\d+")?>(.*?)</h2>',
                lambda m: '%s<h2 style="--n:%d">%s</h2>' % (m.group(1), n_of(m.group(3)), m.group(3)), j2, flags=re.S)
    if j2 != j:
        changed += 1
        if write: jp.write_text(j2, encoding='utf-8')
    print(('已更新' if write else '會更新'), changed, '個檔案')


if __name__ == '__main__':
    main()
