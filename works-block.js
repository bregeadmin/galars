/* Блок «Работы» на внутренних страницах: стенд + плитки. Клик по плитке — фото в стенде,
   стрелки и ← → с клавиатуры. Плитка = кнопка с <img> или слот .ph-card.has-photo
   (после заполнения через режим правки). Всё только в ответ на действие человека. */
(function () {
  document.querySelectorAll('.wk').forEach(function (sec) {
    var stage = sec.querySelector('.stage'), imgs = stage.querySelectorAll('.stage-img img'),
        cap = stage.querySelector('.cap'), ctr = stage.querySelector('.ctr'), thumbs = sec.querySelector('.thumbs');
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, cur = -1, top = 0, capT = null;

    function tiles() { return [].filter.call(thumbs.querySelectorAll('.th'), function (t) { return !!t.querySelector('img'); }); }
    function srcOf(t) { return t.querySelector('img').getAttribute('src'); }
    function capOf(t) { var c = t.querySelector('.c, .ph-material'); return c ? c.textContent.trim() : (t.querySelector('img').alt || ''); }
    function pad(n) { return String(n).padStart(2, '0'); }

    function show(k, instant) {
      var list = tiles(); if (!list.length) { stage.hidden = true; return; } stage.hidden = false;
      k = (k + list.length) % list.length; var t = list[k]; if (k === cur && !instant) return; cur = k;
      list.forEach(function (x, i) { x.classList.toggle('on', i === k); x.setAttribute('aria-current', i === k ? 'true' : 'false'); });
      var nxt = imgs[1 - top], prv = imgs[top];
      var swap = function () { nxt.classList.add('on'); prv.classList.remove('on'); top = 1 - top; };
      nxt.src = srcOf(t); nxt.alt = capOf(t);
      if (instant || reduce || nxt.complete) swap(); else nxt.addEventListener('load', swap, { once: true });
      ctr.textContent = pad(k + 1) + ' / ' + pad(list.length);
      clearTimeout(capT);
      if (instant || reduce) { cap.textContent = capOf(t); return; }
      cap.classList.add('fade'); capT = setTimeout(function () { cap.textContent = capOf(t); cap.classList.remove('fade'); }, 120);
      [list[(k + 1) % list.length], list[(k - 1 + list.length) % list.length]].forEach(function (n) { var i = new Image(); i.src = srcOf(n); });
    }

    thumbs.addEventListener('click', function (e) {
      if (document.documentElement.classList.contains('ed-on')) return; // в режиме правки клик = выбор файла (edit.js)
      var t = e.target.closest('.th'); if (!t || !t.querySelector('img')) return;
      show(tiles().indexOf(t));
    });
    sec.querySelector('.nav .prev').addEventListener('click', function () { show(cur - 1); });
    sec.querySelector('.nav .next').addEventListener('click', function () { show(cur + 1); });
    sec.addEventListener('keydown', function (e) {
      if (e.target.closest('.thumbs') || e.target.closest('.nav')) {
        if (e.key === 'ArrowRight') { e.preventDefault(); show(cur + 1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); show(cur - 1); }
      }
    });
    show(0, true);
  });
})();
