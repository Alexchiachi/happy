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

  // --- Letter form (placeholder behavior) ---
  const letterForm = document.querySelector('.letter-form');
  if (letterForm) {
    letterForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const btn = letterForm.querySelector('button[type=submit]');
      if (btn) {
        btn.textContent = '已寄出 · 謝謝您';
        btn.disabled = true;
      }
    });
  }
})();
