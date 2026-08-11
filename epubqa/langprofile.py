"""Language profiles for en / zh-Hant / zh-Hans / ja / ko.

Holds the script ranges used for language detection, the curated character sets
that separate Traditional from Simplified Chinese, the one-to-many conversion
traps that survive a naive OpenCC pass, and the per-language typography rules.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

# --------------------------------------------------------------------- scripts

HIRAGANA = (0x3040, 0x309F)
KATAKANA = (0x30A0, 0x30FF)
KATAKANA_EXT = (0x31F0, 0x31FF)
HALFWIDTH_KANA = (0xFF66, 0xFF9D)
HANGUL_SYLLABLES = (0xAC00, 0xD7A3)
HANGUL_JAMO = (0x1100, 0x11FF)
HANGUL_COMPAT_JAMO = (0x3130, 0x318F)
HAN_RANGES = [
    (0x4E00, 0x9FFF),
    (0x3400, 0x4DBF),
    (0xF900, 0xFAFF),
    (0x20000, 0x2A6DF),
]
KANBUN = (0x3190, 0x319F)


def _in(cp: int, rng: Tuple[int, int]) -> bool:
    return rng[0] <= cp <= rng[1]


def is_kana(ch: str) -> bool:
    cp = ord(ch)
    return _in(cp, HIRAGANA) or _in(cp, KATAKANA) or _in(cp, KATAKANA_EXT) or _in(
        cp, HALFWIDTH_KANA
    )


def is_hangul(ch: str) -> bool:
    cp = ord(ch)
    return (
        _in(cp, HANGUL_SYLLABLES)
        or _in(cp, HANGUL_JAMO)
        or _in(cp, HANGUL_COMPAT_JAMO)
    )


def is_han(ch: str) -> bool:
    cp = ord(ch)
    return any(_in(cp, r) for r in HAN_RANGES)


def is_latin(ch: str) -> bool:
    return ("a" <= ch <= "z") or ("A" <= ch <= "Z")


def is_cjk(ch: str) -> bool:
    return is_han(ch) or is_kana(ch) or is_hangul(ch)


# ------------------------------------------------- Traditional vs Simplified
#
# Curated exclusive pairs. A character only enters the sets below when it is
# genuinely exclusive to one orthography; characters valid in both (台, 干, 后,
# 里, 面, 制, 采, 松, 只, 丑, 志, 系, 复 as surname 復 etc.) are deliberately kept
# out and handled by the CONVERSION_TRAPS table instead, which needs context.

_TRAD_SIMP_PAIRS = """
們们 這这 個个 說说 對对 時时 會会 來来 學学 國国 過过 樂乐 開开 關关 買买 賣卖 錢钱
難难 點点 語语 電电 發发 頭头 體体 灣湾 廠厂 廣广 應应 該该 樣样 種种 東东 車车 馬马
鳥鸟 魚鱼 龍龙 龜龟 麼么 兒儿 幾几 從从 為为 認认 識识 讀读 書书 寫写 聽听 講讲 譯译
選选 還还 進进 遠远 邊边 運运 達达 遞递 邁迈 遲迟 郵邮 報报 觀观 覺觉 視视 規规 計计
記记 設设 試试 話话 誰谁 請请 課课 謝谢 讓让 貝贝 財财 責责 貨货 質质 購购 貿贸 費费
資资 賽赛 讚赞 銀银 鐵铁 針针 閉闭 陽阳 陰阴 隊队 陸陆 頁页 順顺 須须 領领 風风 飛飞
飯饭 飲饮 館馆 齊齐 齡龄 義义 習习 單单 雙双 變变 業业 樂乐 專专 傳传 產产 眾众 準准
豐丰 醫医 藥药 農农 論论 隨随 陳陈 韓韩 顧顾 願愿 麗丽 齒齿 龐庞 擊击 擁拥 擇择 據据
壞坏 壯壮 聲声 職职 聯联 舊旧 興兴 舉举 蘇苏 藍蓝 蟲虫 覽览 觸触 誠诚 誤误 諾诺 謹谨
豬猪 貴贵 賓宾 贏赢 軟软 較较 輕轻 輸输 轉转 農农 郵邮 鄉乡 鄭郑 鑰钥 鑽钻 長长 門门
問问 間间 閱阅 陣阵 際际 雖虽 雜杂 雞鸡 離离 電电 靈灵 靜静 韻韵 響响 頂顶 項项 順顺
預预 領领 頻频 顏颜 類类 風风 飄飘 餐餐 餓饿 馬马 駕驾 騎骑 驗验 驚惊 體体 髮发 鬥斗
鬧闹 魯鲁 鮮鲜 鳳凤 鳴鸣 鵝鹅 鹽盐 麵面 黃黄 點点 黨党 鼓鼓 鼠鼠 齊齐 億亿 儀仪 償偿
優优 儲储 傷伤 側侧 偉伟 備备 僅仅 價价 儉俭 兌兑 兩两 內内 冊册 寫写 決决 淨净 減减
凍冻 劃划 劉刘 劍剑 動动 勝胜 勞劳 勢势 勵励 勸劝 匯汇 區区 協协 華华 卻却 廳厅 曆历
歷历 壓压 厭厌 參参 叢丛 嚴严 喪丧 單单 嗎吗 嚇吓 嘗尝 器器 團团 園园 圓圆 圖图 執执
堅坚 場场 塊块 墳坟 壇坛 壓压 壘垒 壽寿 夢梦 夥伙 奪夺 獎奖 奮奋 妝妆 婦妇 媽妈 嬰婴
孫孙 學学 寧宁 實实 寵宠 寶宝 將将 對对 導导 屆届 層层 屬属 崗岗 嶺岭 巔巅 帥帅 師师
帶带 幫帮 廢废 廟庙 廠厂 廣广 廬庐 彈弹 彌弥 徑径 徹彻 憂忧 慮虑 憲宪 懷怀 懶懒 戀恋
戲戏 戰战 戶户 掃扫 掛挂 揀拣 搖摇 擔担 擠挤 擬拟 攝摄 攤摊 敗败 敵敌 數数 斃毙 斷断
時时 曬晒 曉晓 暫暂 暢畅 極极 構构 標标 樓楼 模模 橋桥 機机 檢检 櫃柜 權权 歐欧 歡欢
歲岁 殺杀 殼壳 毀毁 氣气 決决 沒没 濟济 潔洁 潛潜 濃浓 澤泽 濕湿 濱滨 灑洒 灣湾 災灾
燈灯 燒烧 營营 燦灿 爐炉 爭争 爺爷 爾尔 牆墙 獨独 獲获 獻献 獸兽 現现 環环 產产 畢毕
異异 當当 疇畴 療疗 癢痒 發发 皺皱 監监 盤盘 盧卢 眾众 睞睐 瞭了 礎础 禮礼 種种 積积
穩稳 窮穷 竊窃 競竞 筆笔 節节 範范 築筑 簡简 籃篮 籌筹 籤签 粵粤 糧粮
""".split()

TRADITIONAL_ONLY: set = set()
SIMPLIFIED_ONLY: set = set()
TRAD_TO_SIMP: Dict[str, str] = {}
SIMP_TO_TRAD: Dict[str, str] = {}

for _pair in _TRAD_SIMP_PAIRS:
    if len(_pair) != 2:
        continue
    _t, _s = _pair[0], _pair[1]
    if _t == _s:
        continue
    TRADITIONAL_ONLY.add(_t)
    SIMPLIFIED_ONLY.add(_s)
    TRAD_TO_SIMP.setdefault(_t, _s)
    SIMP_TO_TRAD.setdefault(_s, _t)

# Characters that look exclusive but are legitimate in the other orthography.
#
# Two kinds live here and both must stay out of the exclusive sets:
#   1. Simplified forms that are ALSO ordinary Traditional characters —
#      了 (算了/來了), 几 (茶几), 划 (划船), 伙 (伙伴), 面 (面孔), 只 (只有).
#      了 in particular appears in almost every Chinese sentence, so leaving it
#      in SIMPLIFIED_ONLY floods a clean Traditional book with false positives.
#   2. One-to-many merge targets that need context, not character identity —
#      those are handled by ZH_HANT_TRAPS below instead.
AMBIGUOUS_HAN = set(
    "台干后里面制采松只丑志系复历表钟准范丰郁术征愿党斗谷困"
    "了几划伙挂晒么儿听坏胜柜板"
)
TRADITIONAL_ONLY -= AMBIGUOUS_HAN
SIMPLIFIED_ONLY -= AMBIGUOUS_HAN

#: PRC-only simplifications that are *not* Japanese shinjitai. Finding these in a
#: Japanese book means Chinese text leaked in (or a bad font fallback).
NOT_JAPANESE_HAN = (
    SIMPLIFIED_ONLY
    - set("学国会来対実写単双医薬帰予余価両営売読続団図囲圧压")
    - set("为习优价众伟")
)

# ------------------------------------------------------ conversion traps
#
# One Simplified character maps to several Traditional ones. A naive conversion
# picks the wrong branch and produces text that is *valid characters* but wrong
# words, so a spell checker will never catch it. These are the highest-value
# findings for a zh-Hant edition converted from zh-Hans.


@dataclass
class Trap:
    wrong: str
    right: str
    note: str


ZH_HANT_TRAPS: List[Trap] = [
    Trap("干淨", "乾淨", "干/乾/幹 三分：清潔義用「乾」"),
    Trap("干燥", "乾燥", "干/乾/幹 三分：無水義用「乾」"),
    Trap("干杯", "乾杯", "干/乾/幹 三分"),
    Trap("餅干", "餅乾", "干/乾/幹 三分"),
    Trap("才干", "才幹", "干/乾/幹 三分：能力義用「幹」"),
    Trap("干部", "幹部", "干/乾/幹 三分：組織義用「幹」"),
    Trap("主干", "主幹", "干/乾/幹 三分"),
    Trap("后面", "後面", "后/後 二分：方位義用「後」"),
    Trap("以后", "以後", "后/後 二分"),
    Trap("然后", "然後", "后/後 二分"),
    Trap("最后", "最後", "后/後 二分"),
    Trap("之后", "之後", "后/後 二分"),
    Trap("背后", "背後", "后/後 二分"),
    Trap("那里", "那裡", "里/裡 二分：內部義用「裡」"),
    Trap("哪里", "哪裡", "里/裡 二分"),
    Trap("心里", "心裡", "里/裡 二分"),
    Trap("手里", "手裡", "里/裡 二分"),
    Trap("家里", "家裡", "里/裡 二分"),
    Trap("這里", "這裡", "里/裡 二分"),
    Trap("面條", "麵條", "面/麵 二分：麥製品用「麵」"),
    Trap("面包", "麵包", "面/麵 二分"),
    Trap("面粉", "麵粉", "面/麵 二分"),
    Trap("泡面", "泡麵", "面/麵 二分"),
    Trap("頭發", "頭髮", "发→發/髮 二分：毛髮義用「髮」"),
    Trap("發型", "髮型", "发→發/髮 二分"),
    Trap("理發", "理髮", "发→發/髮 二分"),
    Trap("白發", "白髮", "发→發/髮 二分"),
    Trap("輕松", "輕鬆", "松/鬆 二分：非緊繃義用「鬆」"),
    Trap("松弛", "鬆弛", "松/鬆 二分"),
    Trap("放松", "放鬆", "松/鬆 二分"),
    Trap("蓬松", "蓬鬆", "松/鬆 二分"),
    Trap("一只", "一隻", "只/隻 二分：量詞用「隻」"),
    Trap("兩只", "兩隻", "只/隻 二分"),
    Trap("丑陋", "醜陋", "丑/醜 二分：難看義用「醜」"),
    Trap("准確", "準確", "准/準 二分：標準義用「準」"),
    Trap("准備", "準備", "准/準 二分"),
    Trap("標准", "標準", "准/準 二分"),
    Trap("水准", "水準", "准/準 二分"),
    Trap("鍾頭", "鐘頭", "鐘/鍾 二分：計時用「鐘」"),
    Trap("時鍾", "時鐘", "鐘/鍾 二分"),
    Trap("分鍾", "分鐘", "鐘/鍾 二分"),
    Trap("雜志", "雜誌", "志/誌 二分：記載義用「誌」"),
    Trap("日志", "日誌", "志/誌 二分"),
    Trap("標志", "標誌", "志/誌 二分"),
    Trap("關系", "關係", "系/係/繫 三分"),
    Trap("聯系", "聯繫", "系/係/繫 三分"),
    Trap("制造", "製造", "制/製 二分：生產義用「製」"),
    Trap("制作", "製作", "制/製 二分"),
    Trap("復雜", "複雜", "复→復/複/覆 三分"),
    Trap("重復", "重複", "复→復/複/覆 三分"),
    Trap("答復", "答覆", "复→復/複/覆 三分"),
    Trap("盡管", "儘管", "尽→盡/儘 二分"),
    Trap("采訪", "採訪", "采/採 二分：動作義用「採」"),
    Trap("采用", "採用", "采/採 二分"),
    Trap("采購", "採購", "采/採 二分"),
    Trap("歷法", "曆法", "历→歷/曆 二分：曆書義用「曆」"),
    Trap("日歷", "日曆", "历→歷/曆 二分"),
    Trap("農歷", "農曆", "历→歷/曆 二分"),
    Trap("胡須", "鬍鬚", "须→須/鬚 二分：毛髮義用「鬚」"),
    Trap("范圍", "範圍", "范/範 二分：范僅用於姓氏"),
    Trap("模范", "模範", "范/範 二分"),
    Trap("布置", "佈置", "布/佈 二分（台灣多作「佈置」）"),
    Trap("困難地", "困難的", "誤用「地」修飾名詞"),
]

ZH_HANS_TRAPS: List[Trap] = [
    Trap("那裡", "那里", "繁體殘留"),
    Trap("乾淨", "干净", "繁體殘留"),
    Trap("頭髮", "头发", "繁體殘留"),
]

#: Terms that legitimately differ between zh-Hant (TW) and zh-Hans (CN) beyond
#: character conversion. Flagged as INFO so the localiser can review.
ZH_VOCAB_DIVERGENCE = [
    ("軟件", "軟體", "zh-Hant 慣用「軟體」"),
    ("硬件", "硬體", "zh-Hant 慣用「硬體」"),
    ("網絡", "網路", "zh-Hant 慣用「網路」"),
    ("信息", "資訊", "zh-Hant 慣用「資訊」"),
    ("視頻", "影片", "zh-Hant 慣用「影片」"),
    ("質量", "品質", "zh-Hant 品質(quality) / 質量(mass) 語義不同"),
    ("激光", "雷射", "zh-Hant 慣用「雷射」"),
    ("打印", "列印", "zh-Hant 慣用「列印」"),
    ("屏幕", "螢幕", "zh-Hant 慣用「螢幕」"),
    ("數據", "資料", "zh-Hant 慣用「資料」"),
    ("項目", "專案", "zh-Hant 慣用「專案」"),
    ("默認", "預設", "zh-Hant 慣用「預設」"),
]

# ------------------------------------------------------------------ profiles


@dataclass
class LangProfile:
    code: str  # canonical BCP-47 tag we recommend
    name: str
    aliases: Tuple[str, ...]  # acceptable dc:language values
    #: Opening/closing quote pairs considered correct for this locale.
    primary_quotes: Tuple[str, str]
    secondary_quotes: Tuple[str, str]
    ellipsis: str
    dash: str
    #: Punctuation expected in full width.
    fullwidth_punct: bool
    #: CSS declarations strongly recommended for this language.
    required_css: Dict[str, str] = field(default_factory=dict)
    notes: str = ""


PROFILES: Dict[str, LangProfile] = {
    "en": LangProfile(
        code="en",
        name="English",
        aliases=("en", "en-us", "en-gb", "en-au", "en-ca"),
        primary_quotes=("“", "”"),
        secondary_quotes=("‘", "’"),
        ellipsis="…",
        dash="—",
        fullwidth_punct=False,
        required_css={"hyphens": "auto", "orphans": "2", "widows": "2"},
        notes="Curly quotes, em dash, hyphenation on, no double spaces.",
    ),
    "zh-Hant": LangProfile(
        code="zh-Hant",
        name="繁體中文",
        aliases=("zh-hant", "zh-tw", "zh-hk", "zh-mo", "zh-hant-tw", "zh-hant-hk"),
        primary_quotes=("「", "」"),
        secondary_quotes=("『", "』"),
        ellipsis="……",
        dash="——",
        fullwidth_punct=True,
        required_css={"line-break": "strict", "text-align": "justify"},
        notes="直角引號「」『』、全形標點、破折號兩格、刪節號六點。",
    ),
    "zh-Hans": LangProfile(
        code="zh-Hans",
        name="简体中文",
        # Bare "zh" is deliberately NOT an alias: it does not say Traditional or
        # Simplified, and guessing would defeat the point of the check.
        aliases=("zh-hans", "zh-cn", "zh-sg", "zh-hans-cn"),
        primary_quotes=("“", "”"),
        secondary_quotes=("‘", "’"),
        ellipsis="……",
        dash="——",
        fullwidth_punct=True,
        required_css={"line-break": "strict", "text-align": "justify"},
        notes="弯引号“”‘’、全角标点、破折号两格、省略号六点。",
    ),
    "ja": LangProfile(
        code="ja",
        name="日本語",
        aliases=("ja", "ja-jp"),
        primary_quotes=("「", "」"),
        secondary_quotes=("『", "』"),
        ellipsis="……",
        dash="——",
        fullwidth_punct=True,
        required_css={"line-break": "strict", "text-align": "justify"},
        notes="かぎ括弧「」『』、句読点「、。」、三点リーダ二つ、縦書き時は rtl。",
    ),
    "ko": LangProfile(
        code="ko",
        name="한국어",
        aliases=("ko", "ko-kr"),
        primary_quotes=("“", "”"),
        secondary_quotes=("‘", "’"),
        ellipsis="……",
        dash="—",
        fullwidth_punct=False,
        required_css={"word-break": "keep-all", "line-break": "strict"},
        notes="한국어는 어절 단위로 줄바꿈해야 하므로 word-break: keep-all 필수.",
    ),
}

ALIAS_TO_PROFILE: Dict[str, str] = {}
for _code, _p in PROFILES.items():
    for _a in _p.aliases:
        ALIAS_TO_PROFILE[_a] = _code


def normalise_tag(tag: str) -> str:
    return (tag or "").strip().replace("_", "-").lower()


def profile_for(tag: str) -> Optional[LangProfile]:
    """Map a dc:language value onto a profile, tolerating region subtags."""
    t = normalise_tag(tag)
    if not t:
        return None
    if t in ALIAS_TO_PROFILE:
        return PROFILES[ALIAS_TO_PROFILE[t]]
    base = t.split("-")[0]
    if base == "zh":
        # zh with an unknown region: undecidable without looking at the text.
        return None
    if base in ALIAS_TO_PROFILE:
        return PROFILES[ALIAS_TO_PROFILE[base]]
    return None


# ----------------------------------------------------------------- detection


@dataclass
class Detection:
    lang: Optional[str]
    confidence: float
    counts: Dict[str, int]
    reason: str


def detect_language(text: str) -> Detection:
    """Classify text into one of the five supported profiles.

    Kana implies Japanese, Hangul implies Korean; Han without either is Chinese,
    and Traditional vs Simplified is decided by the exclusive character sets.
    """
    counts = {
        "kana": 0,
        "hangul": 0,
        "han": 0,
        "latin": 0,
        "trad": 0,
        "simp": 0,
        "total": 0,
    }
    for ch in text:
        if ch.isspace():
            continue
        counts["total"] += 1
        if is_kana(ch):
            counts["kana"] += 1
        elif is_hangul(ch):
            counts["hangul"] += 1
        elif is_han(ch):
            counts["han"] += 1
            if ch in TRADITIONAL_ONLY:
                counts["trad"] += 1
            elif ch in SIMPLIFIED_ONLY:
                counts["simp"] += 1
        elif is_latin(ch):
            counts["latin"] += 1

    total = counts["total"] or 1
    cjk = counts["kana"] + counts["hangul"] + counts["han"]

    if counts["kana"] >= 3 and counts["kana"] / total > 0.02:
        return Detection("ja", min(1.0, counts["kana"] / total * 8), counts, "假名出現")
    if counts["hangul"] >= 3 and counts["hangul"] / total > 0.02:
        return Detection(
            "ko", min(1.0, counts["hangul"] / total * 4), counts, "한글 출현"
        )
    if counts["han"] / total > 0.05:
        trad, simp = counts["trad"], counts["simp"]
        if trad == simp == 0:
            return Detection("zh-Hant", 0.3, counts, "漢字但無獨有字，無法區分繁簡")
        if trad >= simp:
            conf = trad / (trad + simp) if (trad + simp) else 0.5
            return Detection("zh-Hant", conf, counts, f"繁體獨有字 {trad} vs 簡體 {simp}")
        conf = simp / (trad + simp)
        return Detection("zh-Hans", conf, counts, f"简体独有字 {simp} vs 繁体 {trad}")
    if counts["latin"] / total > 0.5:
        return Detection("en", min(1.0, counts["latin"] / total), counts, "Latin script")
    if cjk == 0 and counts["latin"] == 0:
        return Detection(None, 0.0, counts, "文字量不足，無法判斷")
    return Detection("en", 0.3, counts, "fallback")


# ------------------------------------------------------------- text helpers

#: Character class for "we are inside CJK text". Deliberately wider than
#: ideographs + kana: CJK punctuation (《》「」、。) and fullwidth forms count as
#: CJK context too, otherwise a half-width comma before 《 is missed.
CJK_CONTEXT = "　-〿぀-ヿ㐀-鿿豈-﫿＀-￯"
#: Characters that can *precede* a mis-set half-width mark: ideographs, kana and
#: closing brackets, but not opening brackets or the marks themselves.
CJK_LEAD = "぀-ヿ㐀-鿿豈-﫿」』〉》）"

ASCII_PUNCT_IN_CJK = {
    ",": "，",
    ".": "。",
    ";": "；",
    ":": "：",
    "?": "？",
    "!": "！",
    "(": "（",
    ")": "）",
}

#: Characters that must never begin a line in CJK typesetting (kinsoku shori).
KINSOKU_NO_START = "、。，．：；！？）〕］｝〉》」』】〙〗»‐–—…‥ヽヾゝゞ々ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ"
KINSOKU_NO_END = "（〔［｛〈《「『【〘〖«"


def resolve_book_language(epub, target_lang: str = "", limit: int = 120_000) -> str:
    """Decide which profile's rules apply to a book.

    Precedence: explicit ``--lang`` → an unambiguous ``dc:language`` → detection
    from the content itself. The fallback matters because the books most in need
    of checking are exactly the ones with a missing or ambiguous language tag.
    """
    if target_lang:
        return target_lang
    profile = profile_for(epub.declared_language())
    if profile:
        return profile.code

    from .model import visible_text

    parts = []
    size = 0
    for item in epub.content_docs():
        if not epub.has(item.path):
            continue
        chunk = visible_text(epub.text(item.path))
        parts.append(chunk)
        size += len(chunk)
        if size > limit:
            break
    return detect_language("\n".join(parts)).lang or ""


def cjk_ratio(text: str) -> float:
    stripped = [c for c in text if not c.isspace()]
    if not stripped:
        return 0.0
    return sum(1 for c in stripped if is_cjk(c)) / len(stripped)


def iter_matches(pattern: str, text: str, flags: int = 0):
    for m in re.finditer(pattern, text, flags):
        yield m


def excerpt_at(text: str, index: int, width: int = 28) -> str:
    """Context around an offset, with the whitespace left by stripped markup
    collapsed so the excerpt reads as a sentence rather than a column of gaps."""
    start = max(0, index - width // 2)
    end = min(len(text), index + width // 2)
    return re.sub(r"\s+", " ", text[start:end]).strip()


def normalise_nfc(text: str) -> str:
    return unicodedata.normalize("NFC", text)
