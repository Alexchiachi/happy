/* ============================================================
   大道至簡 — Shared scripts
   - Nav scroll state
   - IntersectionObserver reveal-on-scroll
   - FAQ accordion
   - Mobile nav toggle
   ============================================================ */

(function () {
  'use strict';

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

  // --- Filters (journal) — purely visual, marks active ---
  const filters = document.querySelectorAll('.filter');
  filters.forEach((f) => {
    f.addEventListener('click', (e) => {
      e.preventDefault();
      filters.forEach((x) => x.classList.remove('active'));
      f.classList.add('active');
    });
  });

  // --- Letter form → Google 試算表 ---
  // 部署 docs/google-sheet-form.gs 之後，把拿到的 /exec 網址貼進 FORM_ENDPOINT。
  // 留空時表單「不會」假裝寄出，而是請訪客改用 Email —— 寧可麻煩，也不要讓來信憑空消失。
  const FORM_ENDPOINT = '';
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
