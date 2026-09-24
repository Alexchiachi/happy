// 雲南好物：商品資料、購物車、運費與結帳（設計稿，尚未接後端）
// 正式版會改成從 Worker 的 /api/shop/products 讀商品，在 /admin 維護；這裡先寫死方便看版面。
(function () {
  'use strict';

  var FREE_SHIP = 2000;
  var SHIPPING = { home: 80, '711': 60, family: 60, meet: 0 };
  var DEADLINE = new Date('2027-01-15T23:59:59+08:00');
  var STORE_KEY = 'yunnan-shop-cart';

  // img：有實拍照才填；沒有的會顯示色塊＋大字，版面不會開天窗
  // han／tone：色塊上的字與色調（tea 茶、moss 菌、seal 餅、sugar 糖、smoke 香）
  var PRODUCTS = [
    {
      id: 'rose-cake', shelf: 'season', featured: true, badge: '上一檔賣最好',
      cat: '餅 · Pastry', han: '餅', tone: 'seal',
      name: '玫瑰花餅禮盒',
      intro: '雲南人過節一定要有的那一口，酥皮裡包著滿滿的玫瑰花醬。',
      story: '兩款禮盒同價：「暴美」是經典玫瑰花餅配玫瑰花松仁餅，一次吃兩種口感；「暴富」是 12 枚經典玫瑰花餅，名字討喜，最適合送長輩。',
      specs: [['內容', '暴美：花餅＋松仁餅各 6 枚／暴富：花餅 12 枚'], ['產地', '雲南']],
      variants: [
        { key: 'mei', label: '暴美 · 花餅＋松仁餅各 6 枚', price: 650, unit: '盒' },
        { key: 'fu', label: '暴富 · 經典花餅 12 枚', price: 650, unit: '盒' }
      ]
    },
    {
      id: 'nougat', shelf: 'season', badge: '回購第二名',
      cat: '甜 · Sweets', han: '糖', tone: 'sugar',
      name: '玫瑰花生牛軋糖',
      intro: '花生的香、玫瑰的甜，一盒剛好分給一桌人。',
      story: '年節桌上擺一盒，客人來了隨手就能招待。價格輕，適合搭配禮盒一起寄，也是湊免運的好選擇。',
      specs: [['產地', '雲南']],
      variants: [{ key: 'std', label: '一盒', price: 250, unit: '盒' }]
    },
    {
      id: 'brown-sugar', shelf: 'season',
      cat: '甜 · Sweets', han: '暖', tone: 'sugar',
      name: '雲南紅糖三味',
      intro: '冬天的早晨，一匙化在熱水裡。',
      story: '玫瑰、紅棗、薑汁三種口味，都是冬天會想喝一杯的味道。三盒一起買，一天換一種。',
      specs: [['規格', '玫瑰 225g／紅棗 230g／薑汁 270g'], ['產地', '雲南']],
      variants: [
        { key: 'rose', label: '玫瑰紅糖 225g', price: 400, unit: '盒' },
        { key: 'date', label: '紅棗紅糖 230g', price: 400, unit: '盒' },
        { key: 'ginger', label: '薑汁紅糖 270g', price: 400, unit: '盒' }
      ]
    },
    {
      id: 'porcini-sauce', shelf: 'season',
      cat: '菌 · Mushroom', han: '醬', tone: 'moss',
      name: '牛肝菌拌醬禮盒',
      intro: '拌麵、拌飯、炒一盤青菜，年菜桌上的隱藏主角。',
      story: '一組三罐。A 組偏香辣，B 組偏椒麻，兩組都有蔥油牛肝菌和牛肝菌白醬。',
      specs: [['A 組', '香辣＋蔥油＋白醬'], ['B 組', '椒麻＋蔥油＋白醬'], ['產地', '雲南']],
      variants: [
        { key: 'a', label: 'A 組 · 香辣', price: 880, unit: '組' },
        { key: 'b', label: 'B 組 · 椒麻', price: 880, unit: '組' }
      ]
    },
    {
      id: 'morel-gift', shelf: 'season', badge: '一盒即免運',
      cat: '菌 · Mushroom', han: '菌', tone: 'moss',
      name: '羊肚菌禮盒',
      intro: '菌中的珍品，一盒就是一份體面的年禮。',
      story: '乾燥羊肚菌，泡發後燉湯、清炒都好。禮盒裝，適合送給懂吃的朋友。',
      specs: [['規格', '160g'], ['產地', '雲南']],
      variants: [{ key: 'std', label: '160g 禮盒', price: 2480, unit: '盒' }]
    },

    {
      id: 'rose-tea', shelf: 'always', featured: true, badge: '兩檔都有人回購',
      cat: '花 · Flower', han: '玫', tone: 'seal', img: 'images/rose-tea.jpg',
      imgAlt: '兩罐透明罐裝的墨紅玫瑰乾燥花瓣，貼著手寫「墨紅玫瑰」的米色標籤',
      name: '墨紅玫瑰花茶',
      intro: '花瓣大、顏色深，沖開是一杯溫柔的暗紅。',
      story: '乾燥的墨紅玫瑰花瓣，熱水沖泡就能喝，也可以加進紅茶或紅糖水裡。放在辦公桌上，下午三點的那杯茶就有了。',
      specs: [['規格', '20g／罐'], ['產地', '雲南']],
      variants: [{ key: 'std', label: '一罐 20g', price: 400, unit: '罐' }]
    },
    {
      id: 'puer-minis', shelf: 'always',
      cat: '茶 · Tea', han: '茶', tone: 'tea', img: '../images/yunnan-puer-gift-bag.jpg',
      imgAlt: '四顆棉紙包的迷你普洱茶餅，分別標著景邁山、南糯山、小冰島、困鹿山，旁邊是印著「山」字的米色棉布袋',
      name: '四大山頭 mini 七子餅禮袋',
      intro: '四座名山各一餅，一次喝懂普洱的山頭味。',
      story: '景邁山、南糯山、小冰島、困鹿山，一袋四餅。適合剛開始喝普洱、想比較不同山頭的朋友，也適合送禮。',
      specs: [['規格', '49g × 4 餅'], ['山頭', '景邁山 · 南糯山 · 小冰島 · 困鹿山']],
      read: { href: '../journal/2026-08-yunnan-puer-basics.html', text: '讀：普洱入門' },
      variants: [{ key: 'std', label: '一袋四餅', price: 1250, unit: '袋' }]
    },
    {
      id: 'mushroom-soup', shelf: 'always',
      cat: '菌 · Mushroom', han: '湯', tone: 'moss',
      name: '雲南野生菌湯包',
      intro: '一包燉一鍋湯，把雨季的山林味留在冬天。',
      story: '雲南野生菌配好的湯包，燉雞湯、排骨湯都適合。常喝的朋友喜歡一次帶幾包，所以有四包組。',
      specs: [['產地', '雲南']],
      variants: [
        { key: 'one', label: '單包', price: 500, unit: '包' },
        { key: 'four', label: '四包組（省 200）', price: 1800, unit: '組' }
      ]
    },
    {
      id: 'morel-daily', shelf: 'always',
      cat: '菌 · Mushroom', han: '菌', tone: 'moss',
      name: '羊肚菌日常包',
      intro: '不是禮盒，是自己家裡燉湯、炒菜用的份量。',
      story: '和禮盒同樣的乾燥羊肚菌，改用簡單的袋裝，價格更輕。',
      specs: [['規格', '100g／包'], ['產地', '雲南']],
      variants: [{ key: 'std', label: '一包 100g', price: 780, unit: '包' }]
    },
    {
      id: 'tibetan-incense', shelf: 'always',
      cat: '香 · Incense', han: '香', tone: 'smoke',
      name: '香格里拉藏香',
      intro: '從煨桑的柏枝煙開始，一縷帶得走的高原。',
      story: '藏香的源頭是煨桑時燒的柏枝。長支適合靜坐、讀書時慢慢點；短支份量輕，適合剛開始用香的朋友。',
      specs: [['產地', '雲南迪慶 · 香格里拉']],
      read: { href: '../journal/2026-08-shangrila-tibetan-incense.html', text: '讀：香格里拉藏香' },
      variants: [
        { key: 'long', label: '長支', price: 350, unit: '盒' },
        { key: 'short', label: '短支', price: 200, unit: '盒' }
      ]
    }
  ];

  var byId = {};
  PRODUCTS.forEach(function (p) { byId[p.id] = p; });

  // ---------- 購物車（只存在這台瀏覽器，送出後清空） ----------
  var cart = {};
  try { cart = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { cart = {}; }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(cart)); } catch (e) { /* 無痕模式等情況：不記也沒關係 */ } }

  function find(key) {
    var parts = key.split('|'), p = byId[parts[0]];
    if (!p) return null;
    for (var i = 0; i < p.variants.length; i++) if (p.variants[i].key === parts[1]) return { p: p, v: p.variants[i] };
    return null;
  }
  Object.keys(cart).forEach(function (k) { if (!find(k) || !(cart[k] > 0)) delete cart[k]; });

  function money(n) { return 'NT$' + n.toLocaleString('en-US'); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---------- 商品卡 ----------
  function cardHTML(p) {
    var visual = p.img
      ? '<img src="' + p.img + '" alt="' + esc(p.imgAlt || p.name) + '" loading="lazy" decoding="async" width="800" height="1000">'
      : '<div class="ph tone-' + p.tone + '" role="img" aria-label="' + esc(p.name) + '（照片準備中）"><span class="ph-han">' + p.han + '</span><span class="ph-note">照片準備中</span></div>';
    var from = Math.min.apply(null, p.variants.map(function (v) { return v.price; }));
    var rows = p.variants.map(function (v) {
      var k = p.id + '|' + v.key;
      return '<li class="variant">' +
        '<span class="v-label">' + esc(v.label) + '</span>' +
        '<span class="v-price">' + money(v.price) + '<small>／' + v.unit + '</small></span>' +
        '<span class="stepper" data-key="' + k + '">' +
          '<button type="button" data-step="-1" aria-label="' + esc(p.name + ' ' + v.label) + ' 減一">−</button>' +
          '<output aria-live="polite">0</output>' +
          '<button type="button" data-step="1" aria-label="' + esc(p.name + ' ' + v.label) + ' 加一">＋</button>' +
        '</span></li>';
    }).join('');
    var specs = p.specs.map(function (s) { return '<div><dt>' + s[0] + '</dt><dd>' + esc(s[1]) + '</dd></div>'; }).join('');
    return '<article class="card' + (p.featured ? ' card-featured' : '') + '" id="p-' + p.id + '">' +
      '<div class="card-media">' + visual + (p.badge ? '<span class="badge">' + p.badge + '</span>' : '') + '</div>' +
      '<div class="card-body">' +
        '<p class="card-cat">' + p.cat + '</p>' +
        '<h3 class="card-name">' + p.name + '</h3>' +
        '<p class="card-price">' + (p.variants.length > 1 ? '<small>自</small> ' : '') + money(from) + '</p>' +
        '<p class="card-intro">' + p.intro + '</p>' +
        '<details class="card-more"><summary>介紹與規格</summary>' +
          '<p>' + p.story + '</p><dl class="specs">' + specs + '</dl>' +
          (p.read ? '<a class="read" href="' + p.read.href + '">' + p.read.text + ' →</a>' : '') +
        '</details>' +
        '<ul class="variants">' + rows + '</ul>' +
      '</div></article>';
  }

  document.querySelectorAll('[data-shelf]').forEach(function (el) {
    el.innerHTML = PRODUCTS.filter(function (p) { return p.shelf === el.dataset.shelf; }).map(cardHTML).join('');
  });

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-step]');
    if (!b) return;
    var key = b.parentNode.dataset.key;
    var n = Math.max(0, Math.min(99, (cart[key] || 0) + Number(b.dataset.step)));
    if (n) cart[key] = n; else delete cart[key];
    save(); render();
  });

  // ---------- 金額 ----------
  var form = document.querySelector('[data-form]');
  function delivery() { var r = form.querySelector('input[name=delivery]:checked'); return r ? r.value : 'home'; }
  function calc() {
    var sub = 0, count = 0;
    Object.keys(cart).forEach(function (k) { var f = find(k); sub += f.v.price * cart[k]; count += cart[k]; });
    var ship = sub === 0 || sub >= FREE_SHIP ? 0 : SHIPPING[delivery()];
    return { sub: sub, ship: ship, total: sub + ship, count: count };
  }

  function $(sel) { return document.querySelector(sel); }
  function render() {
    var t = calc();
    document.querySelectorAll('.stepper').forEach(function (s) {
      var n = cart[s.dataset.key] || 0;
      s.querySelector('output').textContent = n;
      s.classList.toggle('on', n > 0);
      s.closest('.variant').classList.toggle('picked', n > 0);
    });
    document.querySelectorAll('[data-count]').forEach(function (el) { el.textContent = t.count; });

    $('[data-lines]').innerHTML = Object.keys(cart).map(function (k) {
      var f = find(k);
      return '<li><span>' + esc(f.p.name) + '<small>' + esc(f.v.label) + ' × ' + cart[k] + '</small></span><b>' + money(f.v.price * cart[k]) + '</b></li>';
    }).join('');
    $('[data-empty]').hidden = t.count > 0;
    $('[data-subtotal]').textContent = money(t.sub);
    $('[data-shipping]').textContent = t.sub === 0 ? '—' : (t.ship === 0 ? '免運' : money(t.ship));
    $('[data-total]').textContent = money(t.total);

    var gap = FREE_SHIP - t.sub;
    $('[data-meter]').style.width = Math.min(100, t.sub / FREE_SHIP * 100) + '%';
    $('[data-freeship]').classList.toggle('reached', gap <= 0 && t.sub > 0);
    $('[data-freeship-text]').textContent = t.sub === 0 ? '滿 NT$2,000 免運'
      : gap > 0 ? '再 ' + money(gap) + ' 就免運' : '已達免運門檻';

    // 還差一點免運時，推薦幾樣常備小品
    var addons = $('[data-addons]');
    if (gap > 0 && t.sub > 0) {
      var picks = PRODUCTS.filter(function (p) {
        return p.shelf === 'always' && p.variants[0].price <= 500 && !Object.keys(cart).some(function (k) { return k.indexOf(p.id + '|') === 0; });
      }).slice(0, 3);
      addons.innerHTML = picks.length ? '<p>順手帶一樣：</p>' + picks.map(function (p) {
        var v = p.variants[0];
        return '<button type="button" data-add="' + p.id + '|' + v.key + '">' + p.name + ' <small>' + money(v.price) + '</small></button>';
      }).join('') : '';
      addons.hidden = !picks.length;
    } else { addons.hidden = true; }

    $('[data-dock-total]').textContent = money(t.total);
    $('[data-dock-hint]').textContent = t.count ? (gap > 0 ? '再 ' + money(gap) + ' 免運' : '已免運') : '';
    dockVisible();
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-add]');
    if (!b) return;
    cart[b.dataset.add] = (cart[b.dataset.add] || 0) + 1;
    save(); render();
  });

  // ---------- 取貨方式：只顯示需要的欄位 ----------
  function syncDelivery() {
    var d = delivery();
    form.querySelectorAll('[data-when]').forEach(function (el) {
      var on = el.dataset.when.split(' ').indexOf(d) > -1;
      el.hidden = !on;
      var input = el.querySelector('input');
      if (input) input.required = on;
    });
    render();
  }
  form.addEventListener('change', function (e) { if (e.target.name === 'delivery') syncDelivery(); });

  // ---------- 送出（設計稿：只顯示完成畫面） ----------
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var msg = $('[data-form-msg]');
    var t = calc();
    if (!t.count) { msg.textContent = '還沒有選商品喔。'; return; }
    var bad = Array.prototype.filter.call(form.querySelectorAll('input[required]'), function (i) { return !i.checkValidity(); })[0];
    if (bad) { msg.textContent = '請確認「' + bad.closest('.field').querySelector('span').firstChild.textContent.trim() + '」'; bad.focus(); return; }
    msg.textContent = '';
    var d = new Date(), pad = function (n) { return String(n).padStart(2, '0'); };
    $('[data-order-no]').textContent = 'YN' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + Math.floor(Math.random() * 900 + 100);
    $('[data-order-total]').textContent = money(t.total);
    var done = $('[data-done]');
    done.hidden = false;
    $('#checkout').hidden = true;
    cart = {}; save(); render();
    done.focus();
    done.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });

  // ---------- 本檔倒數 ----------
  var cd = $('[data-countdown]');
  var days = Math.ceil((DEADLINE - new Date()) / 86400000);
  cd.textContent = days > 0 ? '還有 ' + days + ' 天收單' : '本檔已截止，下一檔籌備中';

  // ---------- 手機底部小計列：看不到結帳區時才出現 ----------
  var dock = $('[data-dock]'), checkoutInView = false;
  function dockVisible() { dock.hidden = !calc().count || checkoutInView || !$('[data-done]').hidden; }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { checkoutInView = es[0].isIntersecting; dockVisible(); }, { threshold: 0.05 })
      .observe($('#checkout'));
  }

  syncDelivery();
})();
