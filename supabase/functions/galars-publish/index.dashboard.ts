// Supabase Edge Function \u00abgalars-publish\u00bb \u2014 \u0441\u0435\u0440\u0432\u0435\u0440 \u0440\u0435\u0436\u0438\u043c\u0430 \u043f\u0440\u0430\u0432\u043a\u0438 galars.ru.
//
// \u0427\u0442\u043e \u0434\u0435\u043b\u0430\u0435\u0442:
//   login   { password }                       \u2192 { ok, token }   \u0442\u043e\u043a\u0435\u043d \u043d\u0430 12 \u0447\u0430\u0441\u043e\u0432
//   publish { token, page, texts[], images[] } \u2192 { ok, sha }     \u043e\u0434\u0438\u043d \u043a\u043e\u043c\u043c\u0438\u0442 \u0432 bregeadmin/galars
//
// \u041c\u0435\u043d\u044f\u0435\u0442 \u0432 \u0444\u0430\u0439\u043b\u0435 \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u044b \u0442\u043e\u043b\u044c\u043a\u043e \u0431\u043b\u043e\u043a\u0438 \u0441 \u043c\u0435\u0442\u043a\u043e\u0439 data-e (\u0442\u0435\u043a\u0441\u0442\u044b \u2014 innerHTML \u043f\u043e\u0441\u043b\u0435
// \u0441\u0430\u043d\u0438\u0442\u0438\u0437\u0430\u0446\u0438\u0438 \u043f\u043e \u0431\u0435\u043b\u043e\u043c\u0443 \u0441\u043f\u0438\u0441\u043a\u0443; \u043a\u0430\u0440\u0442\u0438\u043d\u043a\u0438 \u2014 src; \u0441\u043b\u043e\u0442\u044b .ph-card \u2014 \u0441\u0442\u0430\u043d\u043e\u0432\u044f\u0442\u0441\u044f \u0444\u043e\u0442\u043e).
// \u0424\u043e\u0442\u043e \u043a\u043b\u0430\u0434\u0451\u0442 \u0432 img/uploads/. \u041a\u043b\u044e\u0447 GitHub \u0438 \u0445\u044d\u0448 \u043f\u0430\u0440\u043e\u043b\u044f \u0436\u0438\u0432\u0443\u0442 \u0442\u043e\u043b\u044c\u043a\u043e \u0432 \u0441\u0435\u043a\u0440\u0435\u0442\u0430\u0445.
//
// \u0421\u0435\u043a\u0440\u0435\u0442\u044b (Edge Functions \u2192 Secrets):
//   GITHUB_TOKEN     fine-grained token, Contents: Read and write \u043d\u0430 bregeadmin/galars
//   PASSWORD_HASH    sha256(\u043f\u0430\u0440\u043e\u043b\u044c + PEPPER) \u0432 hex \u2014 \u0441\u0447\u0438\u0442\u0430\u0435\u0442\u0441\u044f tools/password-hash.py
//   PEPPER           \u0441\u043b\u0443\u0447\u0430\u0439\u043d\u0430\u044f \u0441\u0442\u0440\u043e\u043a\u0430 (\u0442\u0430 \u0436\u0435, \u0447\u0442\u043e \u043f\u0440\u0438 \u0440\u0430\u0441\u0447\u0451\u0442\u0435 \u0445\u044d\u0448\u0430)
//   ALLOWED_ORIGINS  \u0447\u0435\u0440\u0435\u0437 \u0437\u0430\u043f\u044f\u0442\u0443\u044e: https://bregeadmin.github.io,https://galars.ru,https://www.galars.ru
// \u041d\u0435\u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u043e: GITHUB_REPO (bregeadmin/galars), GITHUB_BRANCH (main)
//
// \u0411\u0435\u0437 \u0432\u043d\u0435\u0448\u043d\u0438\u0445 \u0437\u0430\u0432\u0438\u0441\u0438\u043c\u043e\u0441\u0442\u0435\u0439 \u2014 \u043f\u0435\u0440\u0435\u043d\u043e\u0441\u0438\u0442\u0441\u044f \u043d\u0430 \u043b\u044e\u0431\u043e\u0439 Deno/Node-\u0445\u043e\u0441\u0442\u0438\u043d\u0433 (Yandex Cloud) \u0431\u0435\u0437 \u043f\u0440\u0430\u0432\u043e\u043a \u043b\u043e\u0433\u0438\u043a\u0438.

const REPO = Deno.env.get('GITHUB_REPO') || 'bregeadmin/galars';
const BRANCH = Deno.env.get('GITHUB_BRANCH') || 'main';
const GH = 'https://api.github.com';
const TOKEN_TTL = 12 * 3600;
const ALLOWED = (Deno.env.get('ALLOWED_ORIGINS') || 'https://bregeadmin.github.io,https://galars.ru,https://www.galars.ru').split(',').map((s) => s.trim());

// ---------- \u0443\u0442\u0438\u043b\u0438\u0442\u044b ----------
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

// ---------- \u043b\u0438\u043c\u0438\u0442 \u043f\u043e\u043f\u044b\u0442\u043e\u043a \u0432\u0445\u043e\u0434\u0430 ----------
const fails = new Map<string, { n: number; until: number }>();
function locked(ip: string) { const f = fails.get(ip); return !!f && f.until > Date.now(); }
function fail(ip: string) {
  const f = fails.get(ip) || { n: 0, until: 0 }; f.n++;
  if (f.n >= 5) { f.until = Date.now() + 15 * 60 * 1000; f.n = 0; }
  fails.set(ip, f);
}

// ---------- \u0442\u043e\u043a\u0435\u043d ----------
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

// ---------- \u0441\u0430\u043d\u0438\u0442\u0438\u0437\u0430\u0446\u0438\u044f HTML \u0438\u0437 \u0440\u0435\u0434\u0430\u043a\u0442\u043e\u0440\u0430 ----------
const OK_TAGS = new Set(['b', 'strong', 'i', 'em', 'br', 'a', 'span', 'sup', 'sub', 'small', 'u', 's']);
function sanitize(html: string) {
  // \u0443\u0431\u0438\u0440\u0430\u0435\u043c \u0432\u0441\u0451 \u043e\u043f\u0430\u0441\u043d\u043e\u0435, \u043e\u0441\u0442\u0430\u0432\u043b\u044f\u0435\u043c \u0431\u0435\u043b\u044b\u0439 \u0441\u043f\u0438\u0441\u043e\u043a \u0442\u0435\u0433\u043e\u0432; \u0443 <a> \u2014 \u0442\u043e\u043b\u044c\u043a\u043e \u0431\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u044b\u0439 href
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
  }).replace(/&nbsp;/g, '\u00a0');
}

// ---------- \u043f\u0440\u0430\u0432\u043a\u0430 HTML-\u0444\u0430\u0439\u043b\u0430 \u043f\u043e \u043c\u0435\u0442\u043a\u0430\u043c ----------
const VOID = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'source']);
function findElement(src: string, id: string) {
  // \u0432\u043e\u0437\u0432\u0440\u0430\u0449\u0430\u0435\u0442 {tag, openStart, openEnd, closeStart, closeEnd} \u0434\u043b\u044f \u044d\u043b\u0435\u043c\u0435\u043d\u0442\u0430 \u0441 data-e="id"
  const re = new RegExp('<([a-zA-Z][a-zA-Z0-9-]*)(\\s[^>]*?)?\\sdata-e="' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*>');
  const m = re.exec(src); if (!m) return null;
  const tag = m[1].toLowerCase(); const openStart = m.index; const openEnd = openStart + m[0].length;
  if (VOID.has(tag)) return { tag, openStart, openEnd, closeStart: openEnd, closeEnd: openEnd };
  // \u0438\u0449\u0435\u043c \u043f\u0430\u0440\u043d\u044b\u0439 \u0437\u0430\u043a\u0440\u044b\u0432\u0430\u044e\u0449\u0438\u0439 \u0441 \u0443\u0447\u0451\u0442\u043e\u043c \u0432\u043b\u043e\u0436\u0435\u043d\u043d\u044b\u0445 \u0442\u043e\u0433\u043e \u0436\u0435 \u0438\u043c\u0435\u043d\u0438
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

// ---------- \u043e\u0442\u0432\u0435\u0442\u044b ----------
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
  try { body = await req.json(); } catch { return json({ ok: false, error: '\u041f\u043b\u043e\u0445\u043e\u0439 \u0437\u0430\u043f\u0440\u043e\u0441' }, 400, H); }

  // ----- \u0432\u0445\u043e\u0434 -----
  if (body.action === 'login') {
    if (locked(ip)) return json({ ok: false, error: '\u0421\u043b\u0438\u0448\u043a\u043e\u043c \u043c\u043d\u043e\u0433\u043e \u043f\u043e\u043f\u044b\u0442\u043e\u043a. \u041f\u043e\u0434\u043e\u0436\u0434\u0438\u0442\u0435 15 \u043c\u0438\u043d\u0443\u0442.' }, 429, H);
    const hash = await sha256hex(String(body.password || '') + (Deno.env.get('PEPPER') || ''));
    if (!safeEq(hash, Deno.env.get('PASSWORD_HASH') || '')) {
      fail(ip); await new Promise((r) => setTimeout(r, 800));
      return json({ ok: false, error: '\u041d\u0435\u0432\u0435\u0440\u043d\u044b\u0439 \u043f\u0430\u0440\u043e\u043b\u044c' }, 401, H);
    }
    fails.delete(ip);
    return json({ ok: true, token: await makeToken() }, 200, H);
  }

  // ----- \u043f\u0443\u0431\u043b\u0438\u043a\u0430\u0446\u0438\u044f -----
  if (body.action !== 'publish') return json({ ok: false, error: '\u041d\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043d\u043e\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435' }, 400, H);
  if (!(await checkToken(String(body.token || '')))) return json({ ok: false, error: '\u041d\u0443\u0436\u0435\u043d \u0432\u0445\u043e\u0434' }, 401, H);

  const page = String(body.page || '');
  if (!/^(coatings\/)?[a-z0-9-]+\.html$/.test(page)) return json({ ok: false, error: '\u041d\u0435\u0434\u043e\u043f\u0443\u0441\u0442\u0438\u043c\u0430\u044f \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u0430' }, 400, H);
  const texts: { id: string; html: string }[] = Array.isArray(body.texts) ? body.texts : [];
  const images: { id: string; kind: string; name: string; b64: string; w?: number; h?: number; alt?: string; cap?: string }[] = Array.isArray(body.images) ? body.images : [];
  if (!texts.length && !images.length) return json({ ok: false, error: '\u041d\u0435\u0447\u0435\u0433\u043e \u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u0442\u044c' }, 400, H);
  if (texts.length > 400 || images.length > 30) return json({ ok: false, error: '\u0421\u043b\u0438\u0448\u043a\u043e\u043c \u043c\u043d\u043e\u0433\u043e \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u0439 \u0437\u0430 \u0440\u0430\u0437' }, 400, H);
  const idOk = (id: string) => /^[a-z0-9-]+#\d+$/.test(id);

  try {
    // 1. \u0444\u0430\u0439\u043b \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u044b
    const file = await ghJson(`/repos/${REPO}/contents/${page}?ref=${BRANCH}`);
    let src = b64ToUtf8(file.content);
    const prefix = page.startsWith('coatings/') ? '../' : '';
    const missing: string[] = [];

    // 2. \u0442\u0435\u043a\u0441\u0442\u044b
    for (const t of texts) {
      if (!idOk(t.id)) continue;
      const e = findElement(src, t.id);
      if (!e || VOID.has(e.tag)) { missing.push(t.id); continue; }
      src = src.slice(0, e.openEnd) + sanitize(String(t.html || '')) + src.slice(e.closeStart);
    }

    // 3. \u0444\u043e\u0442\u043e: \u0431\u043b\u043e\u0431\u044b + \u043f\u0440\u0430\u0432\u043a\u0430 src / \u0441\u043b\u043e\u0442\u0430
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
        open = setAttr(open, 'src', url); open = stripAttr(open, 'srcset');
        if (im.w && im.h) { open = setAttr(open, 'width', String(im.w)); open = setAttr(open, 'height', String(im.h)); }
        src = src.slice(0, e.openStart) + open + src.slice(e.openEnd);
      } else { // \u0441\u043b\u043e\u0442 .ph-card
        let open = addClass(src.slice(e.openStart, e.openEnd), 'has-photo');
        const alt = sanitize(String(im.alt || '')).replace(/<[^>]+>/g, '');
        const cap = sanitize(String(im.cap || '')).replace(/<[^>]+>/g, '');
        const inner = `\n          <img src="${url}" alt="${alt.replace(/"/g, '&quot;')}" loading="lazy"${im.w && im.h ? ` width="${im.w}" height="${im.h}"` : ''}>` + (cap ? `\n          <div class="ph-material">${cap}</div>` : '') + '\n        ';
        src = src.slice(0, e.openStart) + open + inner + src.slice(e.closeStart);
      }
    }

    // 4. \u043e\u0434\u0438\u043d \u043a\u043e\u043c\u043c\u0438\u0442 \u0447\u0435\u0440\u0435\u0437 Git Data API
    const ref = await ghJson(`/repos/${REPO}/git/ref/heads/${BRANCH}`);
    const baseSha = ref.object.sha;
    const baseCommit = await ghJson(`/repos/${REPO}/git/commits/${baseSha}`);
    const pageBlob = await ghJson(`/repos/${REPO}/git/blobs`, { method: 'POST', body: JSON.stringify({ content: utf8ToB64(src), encoding: 'base64' }) });
    const tree = [{ path: page, mode: '100644', type: 'blob', sha: pageBlob.sha }, ...blobs.map((b) => ({ path: b.path, mode: '100644', type: 'blob', sha: b.sha }))];
    const newTree = await ghJson(`/repos/${REPO}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree }) });
    const msg = `\u041f\u0440\u0430\u0432\u043a\u0430 \u0447\u0435\u0440\u0435\u0437 \u0441\u0430\u0439\u0442: ${page} \u2014 ${texts.length} \u0442\u0435\u043a\u0441\u0442., ${images.length} \u0444\u043e\u0442\u043e`;
    const commit = await ghJson(`/repos/${REPO}/git/commits`, { method: 'POST', body: JSON.stringify({ message: msg, tree: newTree.sha, parents: [baseSha] }) });
    await ghJson(`/repos/${REPO}/git/refs/heads/${BRANCH}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });

    return json({ ok: true, sha: commit.sha, missing }, 200, H);
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500, H);
  }
});
