#!/usr/bin/env python3
"""Ставит одинаковое меню (шапка + мобильная шторка) на все страницы сайта.
Эталон — index.html. Учитывает префикс ../ для coatings/ и aria-current."""
import re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

# href относительно корня сайта, подпись
NAV = [
    ("index.html#prod",    "Что делаем"),
    ("coatings/",          "Гальваника"),
    ("vakuum.html",        "Вакуумная металлизация"),
    ("index.html#works",   "Работы"),
    ("faq.html",           "Вопросы"),
    ("about.html",         "О компании"),
    ("index.html#contact", "Контакты"),
]
DRAWER = [
    ("index.html#prod",    "Что делаем"),
    ("coatings/",          "Гальваника в ваннах"),
    ("vakuum.html",        "Вакуумная металлизация"),
    ("index.html#works",   "Работы"),
    ("index.html#how",     "Как работаем"),
    ("faq.html",           "Вопросы"),
    ("about.html",         "О компании"),
    ("vacancies.html",     "Вакансии"),
    ("index.html#contact", "Контакты"),
]

def href_for(page, target):
    """Переводит href из корня сайта в href относительно страницы."""
    rel = page.relative_to(ROOT).as_posix()
    if rel == "index.html":
        return target.replace("index.html", "") or "index.html"
    if rel.startswith("coatings/"):
        if target == "coatings/":
            return "./"
        return "../" + target
    return target

def is_current(page, target):
    rel = page.relative_to(ROOT).as_posix()
    if rel.startswith("coatings/"):
        return target == "coatings/"
    return rel == target

def build_nav(page):
    lines = []
    for target, label in NAV:
        cur = ' aria-current="page"' if is_current(page, target) else ""
        lines.append(f'      <a href="{href_for(page, target)}"{cur}>{label}</a>')
    return "\n".join(lines)

def build_drawer(page):
    lines = []
    for i, (target, label) in enumerate(DRAWER, 1):
        lines.append(f'      <a href="{href_for(page, target)}"><span><span class="n">{i:02d}</span>{label}</span><span class="arrow">→</span></a>')
    return "\n".join(lines)

NAV_RE = re.compile(r'(<div class="nav-bar">\s*<nav>\n)(.*?)(\n\s*</nav>)', re.S)
CTA_RE = re.compile(r'(<a class="header-cta" href="[^"]*")(?: data-event="cta_calculate")?><span>[^<]*</span></a>')
DRAWER_RE = re.compile(r'(<nav class="drawer-nav">\n)(.*?)(\n\s*</nav>)', re.S)

changed = []
for page in sorted(list(ROOT.glob("*.html")) + list(ROOT.glob("coatings/*.html"))):
    src = page.read_text(encoding="utf-8")
    if 'class="nav-bar"' not in src or 'class="drawer-nav"' not in src:
        continue
    out, n1 = NAV_RE.subn(lambda m: m.group(1) + build_nav(page) + m.group(3), src, count=1)
    out, n2 = DRAWER_RE.subn(lambda m: m.group(1) + build_drawer(page) + m.group(3), out, count=1)
    assert n1 == 1 and n2 == 1, f"{page}: nav={n1} drawer={n2}"
    # кнопка в шапке — везде «Получить расчёт»
    out = CTA_RE.sub(lambda m: m.group(1) + ' data-event="cta_calculate"><span>Получить расчёт</span></a>', out, count=1)
    if out != src:
        page.write_text(out, encoding="utf-8")
        changed.append(page.relative_to(ROOT).as_posix())

print(f"обновлено {len(changed)} страниц:")
for c in changed: print("  ", c)
