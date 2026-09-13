/* ============================================================
   大道至簡 — Shared scripts
   - Nav scroll state
   - IntersectionObserver reveal-on-scroll
   - FAQ accordion
   - Mobile nav toggle
   ============================================================ */

(function () {
  'use strict';

  // --- 介面文字的語言對照 ---
  // 簡體版（zh-cn/）與繁體版共用這一支 scripts.js，所以會顯示給使用者看的
  // 幾句話要跟著 <html lang> 走，否則簡體頁面會跳出繁體訊息。
  const LANG = (document.documentElement.lang || '').startsWith('zh-Hans') ? 'cn' : 'tw';
  const T = (key) => ({
    formMissing:  { tw: '請填寫稱呼、電子郵件與信件內容。',
                    cn: '请填写称呼、电子邮件与信件内容。' },
    formNoBackend:{ tw: '線上表單尚未啟用，請改寄 ',  cn: '在线表单尚未启用，请改寄 ' },
    formNoBackend2:{tw: '，我們一樣會回覆您。',      cn: '，我们一样会回复您。' },
    formSending:  { tw: '寄送中…',                 cn: '发送中…' },
    formSent:     { tw: '已寄出 · 謝謝您',          cn: '已发送 · 谢谢您' },
    formOk:       { tw: '收到了，我們會在三個工作日內回覆。',
                    cn: '收到了，我们会在三个工作日内回复。' },
    formFail:     { tw: '寄送沒有成功，請改寄 ',      cn: '发送没有成功，请改寄 ' },
    formFail2:    { tw: '，或稍後再試一次。',        cn: '，或稍后再试一次。' },
    countAll:     { tw: ' 篇文章',                 cn: ' 篇文章' },
    countOne:     { tw: ' 篇',                    cn: ' 篇' },
  }[key][LANG]);


  // --- 圖片載不到時的替代標記 ---
  // 帶 data-fallback-mark 的 <img> 若 404，換成圓形字標（與其他卡片同一套樣式），
  // 讓版面在「圖還沒上傳」時看起來仍然是完整的，而不是破圖或「待補」字樣。
  document.querySelectorAll('img[data-fallback-mark]').forEach((img) => {
    const swap = () => {
      if (!img.isConnected) return;
      const mark = document.createElement('div');
      mark.className = 'icon-mark';
      mark.textContent = img.dataset.fallbackMark;
      img.replaceWith(mark);
    };
    // 這支腳本掛在 </body> 前，圖片 404 可能在腳本執行前就發生了，
    // 所以除了監聽 error，也要補檢查「已經載入失敗」的狀態。
    if (img.complete && img.naturalWidth === 0) swap();
    else img.addEventListener('error', swap, { once: true });
  });

  // --- Nav scroll state ---
  const nav = document.querySelector('.nav');
  if (nav) {
    const setNavState = () => {
      if (window.scrollY > 32) nav.classList.add('scrolled');
      else nav.classList.remove('scrolled');
    };
    setNavState();
    window.addEventListener('scroll', setNavState, { passive: true });
  }

  // --- Mobile nav toggle ---
  const toggle = document.querySelector('.nav-toggle');
  const menu = document.querySelector('.nav-menu');
  if (toggle && menu) {
    toggle.addEventListener('click', () => {
      menu.classList.toggle('open');
      toggle.textContent = menu.classList.contains('open') ? '✕' : '≡';
    });
  }

  // --- Reveal on scroll (IntersectionObserver) ---
  const reveals = document.querySelectorAll('.reveal');
  if (reveals.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry, idx) => {
        if (entry.isIntersecting) {
          // small stagger for groups
          setTimeout(() => entry.target.classList.add('in'), idx * 80);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach((el) => io.observe(el));
  } else {
    // Fallback: just show everything
    reveals.forEach((el) => el.classList.add('in'));
  }

  // --- FAQ accordion ---
  // aria-expanded 要跟著開合走，否則用螢幕閱讀器的人不知道這一題是開還是關。
  // 在這裡設初始值而不是寫死在 HTML 裡，是因為沒有 JS 時手風琴根本不會收合，
  // 那時候標成 false 反而是錯的。
  document.querySelectorAll('.faq-item').forEach((item) => {
    const q = item.querySelector('.faq-q');
    if (q) {
      q.setAttribute('aria-expanded', item.classList.contains('open') ? 'true' : 'false');
      q.addEventListener('click', () => {
        const open = item.classList.toggle('open');
        q.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }
  });

  // --- 幸福誌分類篩選 ---
  // 分類寫在每張卡片的 .meta 裡（例如「產地故事 · 2026.08」），
  // 從那裡取第一段當分類，不需要另外維護一份對照表。
  const filters = document.querySelectorAll('.filter');
  const cards = document.querySelectorAll('.article-list > .article-card');
  if (filters.length && cards.length) {
    const catOf = (card) => {
      const meta = card.querySelector('.meta');
      return meta ? meta.textContent.split('·')[0].trim() : '';
    };
    const status = document.querySelector('.filter-status');

    filters.forEach((f) => {
      f.addEventListener('click', () => {
        filters.forEach((x) => {
          x.classList.remove('active');
          x.setAttribute('aria-pressed', 'false');
        });
        f.classList.add('active');
        f.setAttribute('aria-pressed', 'true');

        const want = f.dataset.cat;
        let shown = 0;
        cards.forEach((c) => {
          const hit = want === '全部' || catOf(c) === want;
          c.hidden = !hit;
          if (hit) shown++;
        });
        if (status) {
          status.textContent = want === '全部'
            ? shown + T('countAll')
            : want + '：' + shown + T('countOne');
        }
      });
    });

    // 初始狀態的篇數
    const status0 = document.querySelector('.filter-status');
    if (status0) status0.textContent = cards.length + T('countAll');
    filters.forEach((x) => x.setAttribute('aria-pressed', String(x.classList.contains('active'))));
  }

  // --- 商品卡帶著商品名去寫信 ---
  // 卡片在 HTML 裡就是 <a href="connect.html">，沒有 JS 也點得到連繫頁。
  // 這裡只是把商品名接上去；名字讀自卡片自己的 h3，所以改了 h3 連結就跟著變，
  // 不需要在 href 裡再維護一份（兩份遲早會不同步）。
  document.querySelectorAll('a.product').forEach((card) => {
    const h3 = card.querySelector('h3');
    const name = h3 ? h3.textContent.trim() : '';
    if (!name) return;
    const base = card.getAttribute('href').split('?')[0];
    card.setAttribute('href', base + '?item=' + encodeURIComponent(name));
  });

  // 連繫頁：把帶過來的商品名填進「想聊的事情」，省得訪客再打一次
  const itemParam = new URLSearchParams(location.search).get('item');
  if (itemParam) {
    const subject = document.getElementById('subject');
    if (subject) {
      // 只當成文字填進 value，不碰 innerHTML；長度設上限，避免網址被塞奇怪的東西
      subject.value = itemParam.slice(0, 100);
      const msg = document.getElementById('message');
      if (msg) {
        // 捲到表單並把游標放在第一個要填的欄位，讓人看見已經填好一半
        const name = document.getElementById('name');
        (name || subject).focus({ preventScroll: true });
        subject.closest('form').scrollIntoView({ block: 'center' });
      }
    }
  }

  // --- Letter form → Google 試算表 ---
  // 部署 docs/google-sheet-form.gs 之後，把拿到的 /exec 網址貼進 FORM_ENDPOINT。
  // 留空時表單「不會」假裝寄出，而是請訪客改用 Email —— 寧可麻煩，也不要讓來信憑空消失。
  const FORM_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwlq6c4hwhrLKG3dS095Sn68E-ncHrRxSI323dpuXw6Fkg3g8Im3ZFSEuknsx-zkwh1/exec';
  const FALLBACK_EMAIL = 'dadaoissimple@gmail.com';

  const letterForm = document.querySelector('.letter-form');
  if (letterForm) {
    const btn = letterForm.querySelector('button[type=submit]');
    const status = letterForm.querySelector('.form-status');
    const btnLabel = btn ? btn.textContent : '';

    const say = (text, kind) => {
      if (!status) return;
      status.textContent = text || '';
      status.className = 'form-status' + (kind ? ' ' + kind : '');
    };

    letterForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const data = new FormData(letterForm);
      const missing = ['name', 'email', 'message']
        .find((k) => !String(data.get(k) || '').trim());

      if (missing) {
        say(T('formMissing'), 'err');
        const field = letterForm.querySelector('[name="' + missing + '"]');
        if (field) field.focus();
        return;
      }

      if (!FORM_ENDPOINT) {
        say(T('formNoBackend') + FALLBACK_EMAIL + T('formNoBackend2'), 'err');
        return;
      }

      if (btn) { btn.disabled = true; btn.textContent = T('formSending'); }
      say('');

      // 用 FormData 送出（multipart），瀏覽器不會發 CORS 預檢請求，
      // Apps Script 才收得到。改成 JSON 會因為預檢失敗。
      fetch(FORM_ENDPOINT, { method: 'POST', body: data })
        .then((res) => res.json())
        .then((out) => {
          if (!out || !out.ok) throw new Error((out && out.error) || 'failed');
          letterForm.reset();
          if (btn) btn.textContent = T('formSent');
          say(T('formOk'), 'ok');
        })
        .catch(() => {
          if (btn) { btn.disabled = false; btn.textContent = btnLabel; }
          say(T('formFail') + FALLBACK_EMAIL + T('formFail2'), 'err');
        });
    });
  }
})();
