/**
 * 解鎖與輪詢。
 *
 * 生成分成六步，每步各自是一次短請求，因此這裡不會遇到逾時；
 * 前端要做的是穩定地輪詢、把已完成的章節即時顯示出來——
 * 有進度感的兩分鐘，和空轉的兩分鐘是兩件事。
 */
(function () {
  'use strict';

  var config = window.InnerFlowConfig || {};
  var form = document.getElementById('innerFlowForm');
  if (!form) return;

  var licenseInput = document.getElementById('innerFlowLicense');
  var submitBtn = document.getElementById('innerFlowSubmit');
  var msg = document.getElementById('innerFlowMsg');
  var progress = document.getElementById('innerFlowProgress');
  var bar = document.getElementById('innerFlowBar');
  var stepLabel = document.getElementById('innerFlowStep');
  var preview = document.getElementById('innerFlowPreview');

  var POLL_MS = 3000;
  var MAX_SILENT_POLLS = 60;   // 約三分鐘沒有任何進展才放棄
  var timer = null;
  var lastStep = -1;
  var silentPolls = 0;

  function say(text, tone) {
    msg.textContent = text;
    msg.className = 'if-msg' + (tone ? ' is-' + tone : '');
  }

  /** 測驗結果存在 localStorage（結果頁寫入），這裡取出一起送給後端。 */
  function storedResult() {
    try {
      return JSON.parse(window.localStorage.getItem('innerFlowResult') || 'null');
    } catch (err) {
      return null;
    }
  }

  function renderChapters(chapters) {
    preview.innerHTML = chapters.map(function (chapter, i) {
      return '<section class="if-chapter-preview">' +
        '<p class="if-eyebrow">Chapter ' + (i + 1) + '</p>' +
        '<h4>' + chapter.title + '</h4>' +
        '<p>' + chapter.body.slice(0, 120) + '……</p>' +
        '</section>';
    }).join('');
  }

  function update(data) {
    progress.hidden = false;
    bar.style.width = data.percent + '%';

    var names = ['系統狀態', '耗散路徑', '負熵策略', '復位路線圖', '情境腳本', '寄語'];
    var current = Math.min(data.step, names.length - 1);
    stepLabel.textContent = data.status === 'done'
      ? '完成，共 ' + (data.pages || '') + ' 頁'
      : '正在寫：' + names[current] + '（' + data.step + ' / ' + data.total + '）';

    if (data.chapters && data.chapters.length) renderChapters(data.chapters);

    if (data.step !== lastStep) {
      lastStep = data.step;
      silentPolls = 0;
    } else {
      silentPolls += 1;
    }
  }

  function poll(job) {
    fetch(config.rest + '/report/' + job, { headers: { 'Cache-Control': 'no-cache' } })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.code) throw new Error(data.message || '無法取得進度');
        update(data);

        if (data.status === 'done') {
          window.clearInterval(timer);
          say('報告完成，正在為你打開……', 'ok');
          window.setTimeout(function () {
            window.location.href = config.reportUrl + (config.reportUrl.indexOf('?') === -1 ? '?' : '&') + 'job=' + job;
          }, 1200);
          return;
        }

        if (data.status === 'failed') {
          window.clearInterval(timer);
          say(data.error || '生成中斷了，請重新整理再試一次。', 'error');
          submitBtn.disabled = false;
          return;
        }

        if (silentPolls > MAX_SILENT_POLLS) {
          window.clearInterval(timer);
          say('生成似乎停住了。請重新整理頁面，已完成的章節不會重做。', 'error');
          submitBtn.disabled = false;
        }
      })
      .catch(function () {
        // 單次輪詢失敗不必打擾使用者，下一輪會再試
      });
  }

  function start(job) {
    // 重新整理後仍能接回同一份報告
    try { window.localStorage.setItem('innerFlowJob', job); } catch (err) { /* 忽略 */ }
    lastStep = -1;
    silentPolls = 0;
    poll(job);
    timer = window.setInterval(function () { poll(job); }, POLL_MS);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var license = licenseInput.value.trim();
    if (license.length < 8) {
      say('請貼上完整的授權碼。', 'error');
      return;
    }

    var result = storedResult();
    if (!result) {
      say('找不到你的測驗結果，請先完成測驗再回到這一頁。', 'error');
      return;
    }

    submitBtn.disabled = true;
    say('正在驗證授權碼……');

    fetch(config.rest + '/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        license: license,
        archetype: result.archetype,
        band: result.band,
        entropy: result.entropy,
        boundary: result.dimensions.boundary,
        flow: result.dimensions.flow,
        work: result.dimensions.work,
        bottleneck: result.bottleneckName || result.bottleneck,
        code: result.code,
      }),
    })
      .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
      .then(function (out) {
        if (!out.ok) {
          say(out.body && out.body.message ? out.body.message : '驗證失敗，請確認授權碼。', 'error');
          submitBtn.disabled = false;
          return;
        }
        say('開始生成，這需要一到兩分鐘。可以留在這一頁看著它長出來。');
        start(out.body.job);
      })
      .catch(function () {
        say('連線失敗，請稍後再試。', 'error');
        submitBtn.disabled = false;
      });
  });

  // 若上次離開時仍在生成，回到頁面自動接回
  try {
    var pending = window.localStorage.getItem('innerFlowJob');
    if (pending) {
      say('接回上一次的生成進度……');
      submitBtn.disabled = true;
      start(pending);
    }
  } catch (err) { /* 忽略 */ }
})();
