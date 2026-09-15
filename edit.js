/* Режим правки прямо на сайте (?edit).
   Тексты с меткой data-e становятся редактируемыми, картинки и слоты принимают фото.
   «Опубликовать» отправляет только изменённые блоки на сервер (Supabase Edge Function
   galars-publish), тот меняет их в файле страницы и делает коммит в репозиторий. */
(function () {
  'use strict';
  var PUBLISH_URL = window.GALARS_PUBLISH_URL || 'https://SET-AFTER-DEPLOY.supabase.co/functions/v1/galars-publish';
  var MAX_SIDE = 1600, JPEG_Q = 0.82, MAX_BATCH_BYTES = 3.5 * 1024 * 1024;

  // ---- где мы: путь страницы относительно корня сайта ----
  var bootSrc = (function () { var s = document.querySelector('script[src$="edit-boot.js"]'); return s ? s.src : ''; })();
  var siteBase = bootSrc ? bootSrc.replace(/edit-boot\.js.*$/, '') : location.origin + '/';
  var pagePath = (function () {
    var full = location.origin + location.pathname;
    var rel = full.indexOf(siteBase) === 0 ? full.slice(siteBase.length) : location.pathname.replace(/^\//, '');
    if (rel === '' || rel.slice(-1) === '/') rel += 'index.html';
    return rel;
  })();

  var originals = new Map();   // el -> {html} | {src}
  var images = new Map();      // el -> {name, mime, b64, alt}
  var bar, statusEl, countEl, publishBtn;

  // ---- вход ----
  function token() { try { return sessionStorage.getItem('ed-token') || ''; } catch (e) { return ''; } }
  function setToken(t) { try { t ? sessionStorage.setItem('ed-token', t) : sessionStorage.removeItem('ed-token'); } catch (e) {} }

  function api(body) {
    return fetch(PUBLISH_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { j._status = r.status; return j; }); });
  }

  function askPassword(msg) {
    return new Promise(function (resolve) {
      var veil = el('div', 'ed-veil');
      veil.innerHTML = '<form class="ed-modal"><h2>Правка сайта</h2><p>' + (msg || 'Введите пароль редактора. После публикации сайт обновится через 1–3 минуты.') + '</p>' +
        '<input type="password" autocomplete="current-password" placeholder="Пароль" aria-label="Пароль">' +
        '<div class="ed-row"><button type="submit">Войти</button><button type="button" class="ed-ghost">Отмена</button><span class="ed-err"></span></div></form>';
      document.body.appendChild(veil);
      var form = veil.querySelector('form'), input = veil.querySelector('input'), err = veil.querySelector('.ed-err'), btn = veil.querySelector('[type=submit]');
      input.focus();
      veil.querySelector('.ed-ghost').onclick = function () { veil.remove(); location.href = location.pathname; };
      form.onsubmit = function (e) {
        e.preventDefault(); btn.disabled = true; err.textContent = '';
        api({ action: 'login', password: input.value }).then(function (j) {
          if (j.ok && j.token) { setToken(j.token); veil.remove(); resolve(true); }
          else { err.textContent = j.error || 'Неверный пароль'; btn.disabled = false; input.select(); }
        }).catch(function () { err.textContent = 'Сервер не отвечает'; btn.disabled = false; });
      };
    });
  }

  // ---- вспомогательное ----
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function isText(node) { return node.hasAttribute('data-e') && node.tagName !== 'IMG' && node.getAttribute('data-kind') !== 'slot'; }
  function isImg(node) { return node.tagName === 'IMG' && node.hasAttribute('data-e'); }
  function isSlot(node) { return node.getAttribute('data-kind') === 'slot'; }

  function changedCount() {
    var n = 0;
    originals.forEach(function (o, node) {
      if (isText(node)) { if (node.innerHTML !== o.html) n++; }
      else if (images.has(node)) n++;
    });
    return n;
  }
  function refresh() {
    var n = changedCount();
    countEl.innerHTML = 'Изменено: <b>' + n + '</b>';
    publishBtn.disabled = n === 0;
    originals.forEach(function (o, node) {
      var ch = isText(node) ? node.innerHTML !== o.html : images.has(node);
      node.classList.toggle('ed-changed', ch);
    });
  }
  function setStatus(text, kind) { statusEl.textContent = text || ''; statusEl.className = 'ed-status' + (kind ? ' ' + kind : ''); }

  // ---- тексты ----
  function setupText(node) {
    originals.set(node, { html: node.innerHTML });
    node.setAttribute('contenteditable', 'true');
    node.setAttribute('spellcheck', 'true');
    node.addEventListener('input', refresh);
    node.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); document.execCommand('insertLineBreak'); }
      if (e.key === 'Escape') { node.blur(); }
    });
    node.addEventListener('paste', function (e) {
      e.preventDefault();
      var t = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, t);
    });
  }

  // ---- фото ----
  function readAndShrink(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) && !/\.(jpe?g|png|webp|heic)$/i.test(file.name)) return reject(new Error('Нужна картинка (JPG, PNG, WebP)'));
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, MAX_SIDE / Math.max(w, h));
        var cw = Math.round(w * k), ch = Math.round(h * k);
        var c = document.createElement('canvas'); c.width = cw; c.height = ch;
        c.getContext('2d').drawImage(img, 0, 0, cw, ch);
        URL.revokeObjectURL(url);
        var dataUrl = c.toDataURL('image/jpeg', JPEG_Q);
        resolve({ dataUrl: dataUrl, b64: dataUrl.split(',')[1], mime: 'image/jpeg', w: cw, h: ch });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Не удалось прочитать картинку' + (/heic|heif/i.test(file.type + file.name) ? ' — HEIC с iPhone надо сначала сохранить как JPG' : ''))); };
      img.src = url;
    });
  }
  function slug(s) {
    var map = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
    return (s || '').toLowerCase().replace(/[а-яё]/g, function (c) { return map[c] || ''; }).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'photo';
  }
  function applyPhoto(node, file) {
    return readAndShrink(file).then(function (r) {
      var id = node.getAttribute('data-e');
      var name = slug(file.name.replace(/\.[^.]+$/, '')) + '-' + Date.now().toString(36) + '.jpg';
      if (isImg(node)) {
        if (!originals.has(node)) originals.set(node, { src: node.getAttribute('src'), srcset: node.getAttribute('srcset') });
        node.removeAttribute('srcset'); node.src = r.dataUrl;
        images.set(node, { id: id, name: name, mime: r.mime, b64: r.b64, w: r.w, h: r.h });
      } else { // слот
        if (!originals.has(node)) originals.set(node, { html: node.innerHTML, cls: node.className });
        var alt = (node.querySelector('.ph-coat') ? node.querySelector('.ph-coat').textContent.trim() : '') + (node.querySelector('.ph-material') ? ' — ' + node.querySelector('.ph-material').textContent.trim() : '');
        var cap = node.querySelector('.ph-material') ? node.querySelector('.ph-material').textContent.trim() : '';
        node.innerHTML = '<img src="' + r.dataUrl + '" alt="' + alt.replace(/"/g, '&quot;') + '" loading="lazy" width="' + r.w + '" height="' + r.h + '">' + (cap ? '<div class="ph-material">' + cap + '</div>' : '');
        node.classList.add('has-photo');
        images.set(node, { id: id, name: name, mime: r.mime, b64: r.b64, w: r.w, h: r.h, alt: alt, cap: cap });
      }
      refresh(); setStatus('');
    }).catch(function (e) { setStatus(e.message, 'err'); });
  }
  function setupPhoto(node) {
    node.addEventListener('dragenter', function (e) { e.preventDefault(); node.classList.add('ed-over'); });
    node.addEventListener('dragover', function (e) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; node.classList.add('ed-over'); });
    node.addEventListener('dragleave', function () { node.classList.remove('ed-over'); });
    node.addEventListener('drop', function (e) {
      e.preventDefault(); e.stopPropagation(); node.classList.remove('ed-over');
      var f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) applyPhoto(node, f);
    });
    node.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      var inp = el('input'); inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = function () { if (inp.files[0]) applyPhoto(node, inp.files[0]); };
      inp.click();
    }, true);
  }

  // ---- публикация ----
  function collect() {
    var texts = [], imgs = [];
    originals.forEach(function (o, node) {
      if (isText(node)) { if (node.innerHTML !== o.html) texts.push({ id: node.getAttribute('data-e'), html: node.innerHTML }); }
      else if (images.has(node)) { var im = images.get(node); imgs.push({ id: im.id, kind: isSlot(node) ? 'slot' : 'img', name: im.name, mime: im.mime, b64: im.b64, w: im.w, h: im.h, alt: im.alt || '', cap: im.cap || '' }); }
    });
    return { texts: texts, images: imgs };
  }
  function batches(c) {
    // фото могут не влезть в один запрос — режем по размеру
    var out = [], cur = { texts: c.texts, images: [] }, size = JSON.stringify(c.texts).length;
    c.images.forEach(function (im) {
      var s = im.b64.length;
      if (cur.images.length && size + s > MAX_BATCH_BYTES) { out.push(cur); cur = { texts: [], images: [] }; size = 0; }
      cur.images.push(im); size += s;
    });
    out.push(cur); return out;
  }
  function publish() {
    var c = collect(); if (!c.texts.length && !c.images.length) return;
    publishBtn.disabled = true; setStatus('Публикую…');
    var parts = batches(c), i = 0, shas = [];
    (function next() {
      if (i >= parts.length) {
        // зафиксировать новые оригиналы
        originals.forEach(function (o, node) {
          if (isText(node)) o.html = node.innerHTML;
          else { images.delete(node); if (isImg(node)) o.src = node.getAttribute('src'); else { o.html = node.innerHTML; o.cls = node.className; } }
        });
        refresh(); setStatus('Опубликовано. Сайт обновится через 1–3 минуты.', 'ok'); return;
      }
      var body = { action: 'publish', token: token(), page: pagePath, texts: parts[i].texts, images: parts[i].images };
      setStatus(parts.length > 1 ? 'Публикую ' + (i + 1) + ' из ' + parts.length + '…' : 'Публикую…');
      api(body).then(function (j) {
        if (j._status === 401) { setToken(''); publishBtn.disabled = false; setStatus('Сессия истекла — войдите снова', 'err'); askPassword('Сессия истекла. Введите пароль ещё раз — правки не потеряны.').then(publish); return; }
        if (!j.ok) { publishBtn.disabled = false; setStatus('Ошибка: ' + (j.error || 'сервер отказал'), 'err'); return; }
        shas.push(j.sha); i++; next();
      }).catch(function () { publishBtn.disabled = false; setStatus('Сервер не отвечает. Правки сохранены на странице — попробуйте ещё раз.', 'err'); });
    })();
  }
  function cancel() {
    originals.forEach(function (o, node) {
      if (isText(node)) node.innerHTML = o.html;
      else if (isImg(node)) { node.src = o.src; if (o.srcset) node.setAttribute('srcset', o.srcset); }
      else { node.innerHTML = o.html; node.className = o.cls; }
    });
    images.clear(); refresh(); setStatus('');
  }

  // ---- запуск ----
  function start() {
    document.documentElement.classList.add('ed-on');
    document.querySelectorAll('[data-e]').forEach(function (node) {
      if (isImg(node) || isSlot(node)) setupPhoto(node); else setupText(node);
    });
    document.querySelectorAll('details').forEach(function (d) { d.open = true; });
    // ссылки в режиме правки никуда не ведут — их текст можно править
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (a && !a.closest('.ed-bar')) e.preventDefault();
    }, true);
    window.addEventListener('beforeunload', function (e) { if (changedCount()) { e.preventDefault(); e.returnValue = ''; } });

    bar = el('div', 'ed-bar');
    countEl = el('span', 'ed-count', 'Изменено: <b>0</b>');
    statusEl = el('span', 'ed-status');
    publishBtn = el('button', 'ed-primary', 'Опубликовать'); publishBtn.type = 'button'; publishBtn.disabled = true; publishBtn.onclick = publish;
    var cancelBtn = el('button', '', 'Отменить'); cancelBtn.type = 'button'; cancelBtn.onclick = cancel;
    var exitBtn = el('button', '', 'Выйти'); exitBtn.type = 'button'; exitBtn.onclick = function () { if (!changedCount() || confirm('Есть неопубликованные правки. Выйти без публикации?')) { setToken(''); location.href = location.pathname; } };
    bar.append(countEl, statusEl, publishBtn, cancelBtn, exitBtn);
    document.body.appendChild(bar);
    var hint = el('div', 'ed-hint', 'Режим правки: кликните в текст и печатайте · перетащите фото на картинку · Enter — новая строка');
    document.body.appendChild(hint); setTimeout(function () { hint.remove(); }, 6000);
  }

  function boot() {
    if (token()) start(); else askPassword().then(start);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
