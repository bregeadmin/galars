#!/usr/bin/env python3
"""Ставит метки data-e на редактируемые блоки для режима правки (?edit).

Что помечаем:
  • текстовые блоки h1–h4, p, li, dt, dd, figcaption, td, th — только самые внутренние,
    с непустым текстом, не внутри header/nav/footer/script/style/template/svg,
    без атрибута id (такими управляют скрипты);
  • картинки <img> — кроме логотипов, иконок и картинок внутри header/footer;
  • рамки-заглушки .ph-card на страницах покрытий — как слоты для фото (data-kind="slot").
Метка = "<страница>#<номер>", номер идёт по порядку в документе. Уже помеченные
элементы не трогаем — метки стабильны после первого прогона.
Также подключает edit-boot.js на страницы (с учётом ../ для coatings/).
"""
import re, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
TEXT_TAGS = {'h1','h2','h3','h4','p','li','dt','dd','figcaption','td','th','summary'}
SKIP_CONTAINERS = {'header','nav','footer','script','style','template','svg','noscript','button','select','textarea'}
VOID = {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}
SERVICE_PAGES = {'plan.html','status.html','site-map.html','404.html'}

TAG_RE = re.compile(r'<(/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^<>]*?)?)(/?)>', re.S)
COMMENT_RE = re.compile(r'<!--.*?-->', re.S)

def page_key(rel):
    rel = rel.replace('\\','/')
    if rel.startswith('coatings/'):
        return 'c-' + rel[len('coatings/'):-len('.html')]
    return rel[:-len('.html')]

def has_attr(attrs, name):
    return re.search(r'(^|\s)' + re.escape(name) + r'(\s*=|\s|$)', attrs) is not None

def attr(attrs, name):
    m = re.search(r'(^|\s)' + re.escape(name) + r'\s*=\s*"([^"]*)"', attrs)
    return m.group(2) if m else ''

def mark(page: pathlib.Path):
    src = page.read_text(encoding='utf-8')
    rel = page.relative_to(ROOT).as_posix()
    key = page_key(rel)
    # уже занятые номера
    used = [int(m) for m in re.findall(re.escape(key) + r'#(\d+)"', src)]
    counter = max(used) if used else 0

    # маскируем комментарии, чтобы теги внутри них не считались
    masked = COMMENT_RE.sub(lambda m: ' ' * len(m.group(0)), src)

    tokens = list(TAG_RE.finditer(masked))
    # строим дерево: для каждого открывающего тега — позиция закрывающего
    stack = []          # (tag, index)
    close_of = {}       # index of open tag -> match of close tag
    for i, m in enumerate(tokens):
        closing, tag, attrs, selfclose = m.group(1), m.group(2).lower(), m.group(3), m.group(4)
        if closing:
            # закрываем ближайший открытый с тем же именем
            for j in range(len(stack) - 1, -1, -1):
                if stack[j][0] == tag:
                    close_of[stack[j][1]] = m
                    del stack[j:]
                    break
        elif tag in VOID or selfclose:
            continue
        else:
            stack.append((tag, i))

    inserts = []  # (pos, text)
    # для проверки «внутри контейнера» — список интервалов skip-контейнеров
    skip_spans = [(tokens[i].start(), close_of[i].end()) for i in close_of if tokens[i].group(2).lower() in SKIP_CONTAINERS]
    def in_skip(pos):
        return any(a <= pos < b for a, b in skip_spans)

    # интервалы текстовых кандидатов, чтобы помечать только внутренние
    cand = []
    for i, m in enumerate(tokens):
        if m.group(1) or i not in close_of: continue
        tag = m.group(2).lower()
        if tag in TEXT_TAGS and not in_skip(m.start()):
            cand.append((i, m.start(), close_of[i].start()))
    cand_starts = sorted(s for _, s, _ in cand)

    def marked_already(attrs): return has_attr(attrs, 'data-e')

    for i, start, end in cand:
        m = tokens[i]; attrs = m.group(3)
        if marked_already(attrs) or has_attr(attrs, 'id'): continue
        # внутри есть другой кандидат → это контейнер, не помечаем
        inner_has = any(start < s < end for s in cand_starts)
        if inner_has: continue
        inner = masked[m.end():end]
        text = re.sub(r'<[^>]+>', '', inner).strip()
        if not text: continue
        counter += 1
        inserts.append((m.end() - len(m.group(4)) - 1, f' data-e="{key}#{counter}"'))

    # картинки
    for i, m in enumerate(tokens):
        if m.group(1) or m.group(2).lower() != 'img': continue
        attrs = m.group(3)
        if marked_already(attrs) or in_skip(m.start()) or has_attr(attrs, 'id'): continue
        s = attr(attrs, 'src')
        if not s or '/logo/' in s or 'favicon' in s or s.endswith('.svg') or 'apple-touch' in s: continue
        counter += 1
        inserts.append((m.end() - len(m.group(4)) - 1, f' data-e="{key}#{counter}"'))

    # слоты фото
    for i, m in enumerate(tokens):
        if m.group(1) or i not in close_of: continue
        attrs = m.group(3)
        if 'ph-card' not in attr(attrs, 'class').split(): continue
        if marked_already(attrs): continue
        counter += 1
        inserts.append((m.end() - len(m.group(4)) - 1, f' data-e="{key}#{counter}" data-kind="slot"'))

    out = src
    for pos, text in sorted(inserts, key=lambda x: -x[0]):
        out = out[:pos] + text + out[pos:]

    # подключение загрузчика редактора
    boot = ('../' if rel.startswith('coatings/') else '') + 'edit-boot.js'
    if 'edit-boot.js' not in out:
        out = out.replace('</body>', f'<script src="{boot}" defer></script>\n</body>', 1)

    if out != src:
        page.write_text(out, encoding='utf-8')
    return len(inserts)

if __name__ == '__main__':
    pages = sorted(p for p in list(ROOT.glob('*.html')) + list(ROOT.glob('coatings/*.html')) if p.name not in SERVICE_PAGES)
    total = 0
    for p in pages:
        n = mark(p); total += n
        print(f'{p.relative_to(ROOT).as_posix():32} +{n}')
    print(f'итого новых меток: {total}')
