/* ============================================================
   大道至簡 — Shared scripts
   - Nav scroll state
   - IntersectionObserver reveal-on-scroll
   - FAQ accordion
   - Mobile nav toggle
   ============================================================ */

(function () {
  'use strict';

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
  document.querySelectorAll('.faq-item').forEach((item) => {
    const q = item.querySelector('.faq-q');
    if (q) {
      q.addEventListener('click', () => {
        item.classList.toggle('open');
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
            ? shown + ' 篇文章'
            : want + '：' + shown + ' 篇';
        }
      });
    });

    // 初始狀態的篇數
    const status0 = document.querySelector('.filter-status');
    if (status0) status0.textContent = cards.length + ' 篇文章';
    filters.forEach((x) => x.setAttribute('aria-pressed', String(x.classList.contains('active'))));
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
        say('請填寫稱呼、電子郵件與信件內容。', 'err');
        const field = letterForm.querySelector('[name="' + missing + '"]');
        if (field) field.focus();
        return;
      }

      if (!FORM_ENDPOINT) {
        say('線上表單尚未啟用，請改寄 ' + FALLBACK_EMAIL + '，我們一樣會回覆您。', 'err');
        return;
      }

      if (btn) { btn.disabled = true; btn.textContent = '寄送中…'; }
      say('');

      // 用 FormData 送出（multipart），瀏覽器不會發 CORS 預檢請求，
      // Apps Script 才收得到。改成 JSON 會因為預檢失敗。
      fetch(FORM_ENDPOINT, { method: 'POST', body: data })
        .then((res) => res.json())
        .then((out) => {
          if (!out || !out.ok) throw new Error((out && out.error) || 'failed');
          letterForm.reset();
          if (btn) btn.textContent = '已寄出 · 謝謝您';
          say('收到了，我們會在三個工作日內回覆。', 'ok');
        })
        .catch(() => {
          if (btn) { btn.disabled = false; btn.textContent = btnLabel; }
          say('寄送沒有成功，請改寄 ' + FALLBACK_EMAIL + '，或稍後再試一次。', 'err');
        });
    });
  }
})();
