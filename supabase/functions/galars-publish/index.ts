// Supabase Edge Function «galars-publish» — сервер режима правки galars.ru.
//
// Что делает:
//   login   { password }                       → { ok, token }   токен на 12 часов
//   publish { token, page, texts[], images[] } → { ok, sha }     один коммит в bregeadmin/galars
//
// Меняет в файле страницы только блоки с меткой data-e (тексты — innerHTML после
// санитизации по белому списку; картинки — src; слоты .ph-card — становятся фото).
// Фото кладёт в img/uploads/. Ключ GitHub и хэш пароля живут только в секретах.
//
// Секреты (Edge Functions → Secrets):
//   GITHUB_TOKEN     fine-grained token, Contents: Read and write на bregeadmin/galars
//   PASSWORD_HASH    sha256(пароль + PEPPER) в hex — считается tools/password-hash.py
//   PEPPER           случайная строка (та же, что при расчёте хэша)
//   ALLOWED_ORIGINS  через запятую: https://bregeadmin.github.io,https://galars.ru,https://www.galars.ru
// Необязательно: GITHUB_REPO (bregeadmin/galars), GITHUB_BRANCH (main)
//
// Без внешних зависимостей — переносится на любой Deno/Node-хостинг (Yandex Cloud) без правок логики.

const REPO = Deno.env.get('GITHUB_REPO') || 'bregeadmin/galars';
const BRANCH = Deno.env.get('GITHUB_BRANCH') || 'main';
const GH = 'https://api.github.com';
const TOKEN_TTL = 12 * 3600;
const ALLOWED = (Deno.env.get('ALLOWED_ORIGINS') || 'https://bregeadmin.github.io,https://galars.ru,https://www.galars.ru').split(',').map((s) => s.trim());

// ---------- утилиты ----------
const enc = new TextEncoder();
async function sha256hex(s: string) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function hmac(s: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(Deno.env.get('PEPPER') || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(s));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function safeEq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function b64ToBytes(b64: string) { return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); }
function utf8ToB64(s: string) {
  const bytes = enc.encode(s); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64ToUtf8(b64: string) { return new TextDecoder().decode(b64ToBytes(b64.replace(/\n/g, ''))); }

// ---------- лимит попыток входа ----------
const fails = new Map<string, { n: number; until: number }>();
function locked(ip: string) { const f = fails.get(ip); return !!f && f.until > Date.now(); }
function fail(ip: string) {
  const f = fails.get(ip) || { n: 0, until: 0 }; f.n++;
  if (f.n >= 5) { f.until = Date.now() + 15 * 60 * 1000; f.n = 0; }
  fails.set(ip, f);
}

// ---------- токен ----------
async function makeToken() {
  const exp = String(Math.floor(Date.now() / 1000) + TOKEN_TTL);
  return exp + '.' + await hmac('galars:' + exp);
}
async function checkToken(t: string) {
  if (!t || t.indexOf('.') < 0) return false;
  const [exp, sig] = t.split('.');
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return false;
  return safeEq(sig, await hmac('galars:' + exp));
}

// ---------- санитизация HTML из редактора ----------
const OK_TAGS = new Set(['b', 'strong', 'i', 'em', 'br', 'a', 'span', 'sup', 'sub', 'small', 'u', 's']);
function sanitize(html: string) {
  // убираем всё опасное, оставляем белый список тегов; у <a> — только безопасный href
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  html = html.replace(/<(script|style|iframe|object|embed|svg|math|template)[\s\S]*?<\/\1>/gi, '');
  return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g, (m, tag: string, attrs: string) => {
    const t = tag.toLowerCase();
    if (!OK_TAGS.has(t)) return '';
    if (m.startsWith('</')) return '</' + t + '>';
    if (t === 'br') return '<br>';
    if (t === 'a') {
      const h = /\shref\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] || /\shref\s*=\s*'([^']*)'/i.exec(attrs)?.[1] || '';
      const ok = /^(https?:\/\/|mailto:|tel:|#|\/|[\w./-]+(\.html)?(#.*)?$)/i.test(h) && !/^javascript:/i.test(h);
      return ok && h ? '<a href="' + h.replace(/"/g, '&quot;') + '">' : '<a>';
    }
    return '<' + t + '>';
  }).replace(/&nbsp;/g, ' ');
}

// ---------- правка HTML-файла по меткам ----------
const VOID = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'source']);
function findElement(src: string, id: string) {
  // возвращает {tag, openStart, openEnd, closeStart, closeEnd} для элемента с data-e="id"
  const re = new RegExp('<([a-zA-Z][a-zA-Z0-9-]*)(\\s[^>]*?)?\\sdata-e="' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*>');
  const m = re.exec(src); if (!m) return null;
  const tag = m[1].toLowerCase(); const openStart = m.index; const openEnd = openStart + m[0].length;
  if (VOID.has(tag)) return { tag, openStart, openEnd, closeStart: openEnd, closeEnd: openEnd };
  // ищем парный закрывающий с учётом вложенных того же имени
  const tre = new RegExp('<(/?)' + tag + '(?=[\\s>/])[^>]*>', 'gi'); tre.lastIndex = openEnd;
  let depth = 1, mm: RegExpExecArray | null;
  while ((mm = tre.exec(src))) {
    if (mm[1]) { depth--; if (depth === 0) return { tag, openStart, openEnd, closeStart: mm.index, closeEnd: mm.index + mm[0].length }; }
    else depth++;
  }
  return null;
}
function setAttr(openTag: string, name: string, value: string) {
  const re = new RegExp('\\s' + name + '\\s*=\\s*"[^"]*"');
  const v = ' ' + name + '="' + value.replace(/"/g, '&quot;') + '"';
  return re.test(openTag) ? openTag.replace(re, v) : openTag.replace(/\s*\/?>$/, (e) => v + e);
}
function stripAttr(openTag: string, name: string) { return openTag.replace(new RegExp('\\s' + name + '\\s*=\\s*"[^"]*"'), ''); }
function addClass(openTag: string, cls: string) {
  const m = /\sclass\s*=\s*"([^"]*)"/.exec(openTag);
  if (!m) return setAttr(openTag, 'class', cls);
  return m[1].split(/\s+/).includes(cls) ? openTag : openTag.replace(m[0], ' class="' + (m[1] + ' ' + cls).trim() + '"');
}

// ---------- GitHub ----------
function gh(path: string, init: RequestInit = {}) {
  return fetch(GH + path, { ...init, headers: { Authorization: 'Bearer ' + Deno.env.get('GITHUB_TOKEN'), Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json', ...(init.headers || {}) } });
}
async function ghJson(path: string, init: RequestInit = {}) {
  const r = await gh(path, init); const j = await r.json();
  if (!r.ok) throw new Error('GitHub ' + r.status + ': ' + (j.message || path));
  return j;
}

// ---------- ответы ----------
function cors(origin: string) {
  const ok = ALLOWED.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin);
  return { 'Access-Control-Allow-Origin': ok ? origin : ALLOWED[0], 'Access-Control-Allow-Headers': 'content-type, authorization, apikey', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json; charset=utf-8' };
}
function json(body: unknown, status: number, h: Record<string, string>) { return new Response(JSON.stringify(body), { status, headers: h }); }

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  const H = cors(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: H });
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405, H);
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'ip';
  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'Плохой запрос' }, 400, H); }

  // ----- вход -----
  if (body.action === 'login') {
    if (locked(ip)) return json({ ok: false, error: 'Слишком много попыток. Подождите 15 минут.' }, 429, H);
    const hash = await sha256hex(String(body.password || '') + (Deno.env.get('PEPPER') || ''));
    if (!safeEq(hash, Deno.env.get('PASSWORD_HASH') || '')) {
      fail(ip); await new Promise((r) => setTimeout(r, 800));
      return json({ ok: false, error: 'Неверный пароль' }, 401, H);
    }
    fails.delete(ip);
    return json({ ok: true, token: await makeToken() }, 200, H);
  }

  // ----- публикация -----
  if (body.action !== 'publish') return json({ ok: false, error: 'Неизвестное действие' }, 400, H);
  if (!(await checkToken(String(body.token || '')))) return json({ ok: false, error: 'Нужен вход' }, 401, H);

  const page = String(body.page || '');
  if (!/^(coatings\/)?[a-z0-9-]+\.html$/.test(page)) return json({ ok: false, error: 'Недопустимая страница' }, 400, H);
  const texts: { id: string; html: string }[] = Array.isArray(body.texts) ? body.texts : [];
  const images: { id: string; kind: string; name: string; b64: string; w?: number; h?: number; alt?: string; cap?: string }[] = Array.isArray(body.images) ? body.images : [];
  if (!texts.length && !images.length) return json({ ok: false, error: 'Нечего публиковать' }, 400, H);
  if (texts.length > 400 || images.length > 30) return json({ ok: false, error: 'Слишком много изменений за раз' }, 400, H);
  const idOk = (id: string) => /^[a-z0-9-]+#\d+$/.test(id);

  try {
    // 1. файл страницы
    const file = await ghJson(`/repos/${REPO}/contents/${page}?ref=${BRANCH}`);
    let src = b64ToUtf8(file.content);
    const prefix = page.startsWith('coatings/') ? '../' : '';
    const missing: string[] = [];

    // 2. тексты
    for (const t of texts) {
      if (!idOk(t.id)) continue;
      const e = findElement(src, t.id);
      if (!e || VOID.has(e.tag)) { missing.push(t.id); continue; }
      src = src.slice(0, e.openEnd) + sanitize(String(t.html || '')) + src.slice(e.closeStart);
    }

    // 3. фото: блобы + правка src / слота
    const blobs: { path: string; sha: string }[] = [];
    for (const im of images) {
      if (!idOk(im.id) || !im.b64 || im.b64.length > 6 * 1024 * 1024) continue;
      const e = findElement(src, im.id);
      if (!e) { missing.push(im.id); continue; }
      let base = String(im.name || '').replace(/\.(jpe?g|png|webp)$/i, '').replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
      if (base.length < 3) base = 'photo-' + Date.now().toString(36);
      const name = base.slice(0, 60) + '.jpg';
      const path = 'img/uploads/' + name;
      const blob = await ghJson(`/repos/${REPO}/git/blobs`, { method: 'POST', body: JSON.stringify({ content: im.b64, encoding: 'base64' }) });
      blobs.push({ path, sha: blob.sha });
      const url = prefix + path;
      if (e.tag === 'img') {
        let open = src.slice(e.openStart, e.openEnd);
        const oldSrc = /\ssrc\s*=\s*"([^"]*)"/.exec(open)?.[1] || '';
        open = setAttr(open, 'src', url); open = stripAttr(open, 'srcset');
        if (im.w && im.h) { open = setAttr(open, 'width', String(im.w)); open = setAttr(open, 'height', String(im.h)); }
        src = src.slice(0, e.openStart) + open + src.slice(e.openEnd);
        // плитка «Работ»: у кнопки-обёртки лежит адрес большой версии для лайтбокса — обновляем и его
        if (oldSrc) {
          const from = Math.max(0, e.openStart - 400);
          const before = src.slice(from, e.openStart).replace(new RegExp('data-full="' + oldSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"'), 'data-full="' + url + '"');
          src = src.slice(0, from) + before + src.slice(e.openStart);
        }
      } else { // слот .ph-card
        let open = addClass(src.slice(e.openStart, e.openEnd), 'has-photo');
        const alt = sanitize(String(im.alt || '')).replace(/<[^>]+>/g, '');
        const cap = sanitize(String(im.cap || '')).replace(/<[^>]+>/g, '');
        const inner = `\n          <img src="${url}" alt="${alt.replace(/"/g, '&quot;')}" loading="lazy"${im.w && im.h ? ` width="${im.w}" height="${im.h}"` : ''}>` + (cap ? `\n          <div class="ph-material">${cap}</div>` : '') + '\n        ';
        src = src.slice(0, e.openStart) + open + inner + src.slice(e.closeStart);
      }
    }

    // 4. один коммит через Git Data API
    const ref = await ghJson(`/repos/${REPO}/git/ref/heads/${BRANCH}`);
    const baseSha = ref.object.sha;
    const baseCommit = await ghJson(`/repos/${REPO}/git/commits/${baseSha}`);
    const pageBlob = await ghJson(`/repos/${REPO}/git/blobs`, { method: 'POST', body: JSON.stringify({ content: utf8ToB64(src), encoding: 'base64' }) });
    const tree = [{ path: page, mode: '100644', type: 'blob', sha: pageBlob.sha }, ...blobs.map((b) => ({ path: b.path, mode: '100644', type: 'blob', sha: b.sha }))];
    const newTree = await ghJson(`/repos/${REPO}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree }) });
    const msg = `Правка через сайт: ${page} — ${texts.length} текст., ${images.length} фото`;
    const commit = await ghJson(`/repos/${REPO}/git/commits`, { method: 'POST', body: JSON.stringify({ message: msg, tree: newTree.sha, parents: [baseSha] }) });
    await ghJson(`/repos/${REPO}/git/refs/heads/${BRANCH}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });

    return json({ ok: true, sha: commit.sha, missing }, 200, H);
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500, H);
  }
});
