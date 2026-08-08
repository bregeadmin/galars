/* ГАЛАРС — поиск по сайту.
   Скрипт сам монтирует кнопку в шапку, пункт в мобильное меню и оверлей —
   на странице достаточно одной строки <script src="search.js" defer></script>.
   Индекс (search-index.json) грузится лениво, при первом открытии поиска.
   Пути считаются от адреса самого скрипта, поэтому работает и из /coatings/. */
(() => {
  'use strict';

  const self = document.currentScript || [...document.scripts].find(s => /search\.js/.test(s.src));
  const BASE = self ? self.src.replace(/[^/]+$/, '') : './';
  const INDEX_URL = BASE + 'search-index.json';

  /* — нормализация: регистр, ё/е, пунктуация — чтобы «ГОСТ 9.301-86» искалось как «гост 9 301 86» — */
  const norm = s => (s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\wа-я0-9]+/gi, ' ').trim();
  const tokens = q => norm(q).split(' ').filter(t => t.length >= 2);
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let index = null;      // массив записей
  let loading = null;    // промис загрузки
  let mounted = false;

  function loadIndex() {
    if (index) return Promise.resolve(index);
    if (loading) return loading;
    loading = fetch(INDEX_URL)
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(data => {
        index = data.map(e => Object.assign({}, e, { _t: norm(e.t), _s: norm(e.s), _x: norm(e.x) }));
        return index;
      });
    return loading;
  }

  /* — Русская морфология «на минималках»: слово ищется по основе, чтобы
     «хроматная плёнка» находило «хроматные плёнки», а «припуски» — «припуск».
     Полноценный стеммер здесь избыточен: словарь сайта узкий и технический. — */
  const stem = t => (t.length <= 4 ? t : t.slice(0, Math.max(4, t.length - 3)));
  const rxEsc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stemRx = t => new RegExp('(^| )' + rxEsc(stem(t)));

  /* — поиск: сначала строгий (все слова), при пустом результате — мягкий (любое слово) — */
  function search(q) {
    const ts = tokens(q);
    if (!ts.length || !index) return [];
    const rx = ts.map(stemRx);
    const score = (e, requireAll) => {
      let total = 0, hit = 0;
      for (const r of rx) {
        let s = 0;
        if (r.test(' ' + e._s)) s += 10;
        if (r.test(' ' + e._t)) s += 6;
        if (r.test(' ' + e._x)) s += 3;
        if (s) hit++;
        total += s;
      }
      if (requireAll && hit < ts.length) return 0;
      if (!hit) return 0;
      return total;
    };
    let res = index.map(e => ({ e, s: score(e, true) })).filter(r => r.s > 0);
    if (!res.length) res = index.map(e => ({ e, s: score(e, false) })).filter(r => r.s > 0);
    return res.sort((a, b) => b.s - a.s).slice(0, 14).map(r => r.e);
  }

  /* — фрагмент вокруг первого совпадения, с подсветкой всех слов запроса — */
  function snippet(entry, q) {
    const ts = tokens(q);
    const raw = entry.x || '';
    const low = entry._x;
    let at = -1;
    for (const t of ts) {
      const m = stemRx(t).exec(' ' + low);
      if (m && (at < 0 || m.index < at)) at = m.index;
    }
    if (at < 0) at = 0;
    const from = Math.max(0, at - 70);
    let text = raw.slice(from, from + 200);
    if (from > 0) text = '…' + text;
    if (from + 200 < raw.length) text = text + '…';
    let html = esc(text);
    for (const t of ts) {
      const re = new RegExp('(' + rxEsc(stem(t)) + '[а-яё]*)', 'gi');
      html = html.replace(re, '<mark>$1</mark>');
    }
    return html;
  }

  /* — разметка: кнопка в шапке, пункт в меню, оверлей — */
  function mount() {
    if (mounted) return;
    mounted = true;

    const icon = '<svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="9" r="6"/><line x1="13.5" y1="13.5" x2="18" y2="18"/></svg>';

    const navBar = document.querySelector('.site-header .nav-bar');
    if (navBar) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'search-btn';
      btn.setAttribute('aria-label', 'Поиск по сайту');
      btn.innerHTML = icon + '<span class="k">K</span>';
      navBar.insertBefore(btn, navBar.querySelector('.header-cta'));
      btn.addEventListener('click', open);
    }

    const drawerNav = document.querySelector('.drawer-nav');
    if (drawerNav) {
      const a = document.createElement('button');
      a.type = 'button';
      a.className = 'drawer-search';
      a.innerHTML = icon + '<span>Поиск по сайту</span>';
      drawerNav.parentNode.insertBefore(a, drawerNav);
      a.addEventListener('click', () => {
        const d = document.getElementById('drawer');
        if (d) d.classList.remove('is-open');
        open();
      });
    }

    const ov = document.createElement('div');
    ov.className = 'search-overlay';
    ov.id = 'searchOverlay';
    ov.hidden = true;
    ov.innerHTML =
      '<div class="search-panel" role="dialog" aria-modal="true" aria-label="Поиск по сайту">' +
        '<div class="search-field">' + icon +
          '<input type="search" id="searchInput" placeholder="Покрытие, ГОСТ, материал, вопрос…" autocomplete="off" spellcheck="false" aria-label="Поисковый запрос">' +
          '<button type="button" class="search-close" aria-label="Закрыть поиск">esc</button>' +
        '</div>' +
        '<div class="search-results" id="searchResults"></div>' +
        '<div class="search-foot"><span>↑ ↓ — выбор</span><span>Enter — открыть</span><span>Esc — закрыть</span></div>' +
      '</div>';
    document.body.appendChild(ov);

    const input = ov.querySelector('#searchInput');
    const box = ov.querySelector('#searchResults');
    let cursor = -1;

    const render = list => {
      cursor = -1;
      if (!input.value.trim()) {
        box.innerHTML = '<div class="search-hint">Ищем по покрытиям, стандартам, технологическим вопросам и страницам сайта.</div>';
        return;
      }
      if (!list.length) {
        box.innerHTML = '<div class="search-hint">Ничего не нашли. Попробуйте другое слово — или спросите технолога: <a href="tel:+78127777811">+7 (812) 777-78-11</a></div>';
        return;
      }
      box.innerHTML = list.map((e, i) =>
        '<a class="search-hit" href="' + BASE + e.u + '" data-i="' + i + '">' +
          '<div class="hit-top"><span class="hit-title">' + esc(e.s || e.t) + '</span><span class="hit-page">' + esc(e.t) + '</span></div>' +
          '<div class="hit-text">' + snippet(e, input.value) + '</div>' +
        '</a>').join('');
    };

    const move = d => {
      const hits = [...box.querySelectorAll('.search-hit')];
      if (!hits.length) return;
      cursor = (cursor + d + hits.length) % hits.length;
      hits.forEach((h, i) => h.classList.toggle('is-cur', i === cursor));
      hits[cursor].scrollIntoView({ block: 'nearest' });
    };

    let timer = null;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => loadIndex().then(() => render(search(input.value)))
        .catch(() => { box.innerHTML = '<div class="search-hint">Не удалось загрузить поисковый индекс. Обновите страницу.</div>'; }), 90);
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') {
        const cur = box.querySelector('.search-hit.is-cur') || box.querySelector('.search-hit');
        if (cur) { e.preventDefault(); window.location.href = cur.getAttribute('href'); }
      } else if (e.key === 'Escape') { close(); }
    });

    ov.querySelector('.search-close').addEventListener('click', close);
    ov.addEventListener('click', e => { if (e.target === ov) close(); });

    window.__galarsSearch = { ov, input, render };
  }

  function open() {
    mount();
    const { ov, input, render } = window.__galarsSearch;
    ov.hidden = false;
    document.body.style.overflow = 'hidden';
    render([]);
    input.value = '';
    setTimeout(() => input.focus(), 20);
    loadIndex().catch(() => {});
  }

  function close() {
    if (!window.__galarsSearch) return;
    window.__galarsSearch.ov.hidden = true;
    document.body.style.overflow = '';
  }

  const start = () => {
    mount();
    document.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open(); }
      if (e.key === 'Escape') close();
      /* «/» открывает поиск, если фокус не в поле ввода */
      if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
        e.preventDefault(); open();
      }
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
