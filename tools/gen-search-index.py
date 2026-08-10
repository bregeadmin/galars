#!/usr/bin/env python3
"""Собирает search-index.json из HTML-страниц сайта.

Запуск из корня сайта:  python3 tools/gen-search-index.py

Индекс — плоский список кусков текста, по одному на заголовок h1/h2/h3.
Каждый кусок знает свой якорь, поэтому поиск ведёт не просто на страницу,
а в нужное место страницы. Шапка, подвал и мобильное меню в индекс не идут —
иначе любое слово из меню находилось бы на всех страницах сразу.
"""

import json
import os
import re
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Служебные страницы (планы, карта сайта для клиента, 404) в поиск не попадают.
EXCLUDE = {"plan.html", "site-map.html", "status.html", "404.html"}

SKIP_TAGS = {"script", "style", "svg", "noscript", "canvas", "template"}
SKIP_SECTIONS = {"header", "footer"}          # шапка и подвал
SKIP_CLASSES = {"drawer", "search-overlay", "faq-toc"}  # меню и оглавления
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input",
        "link", "meta", "param", "source", "track", "wbr"}
HEADINGS = {"h1", "h2", "h3"}


class Extractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []          # [(tag, elem_id)]
        self.skip_depth = 0
        self.title = ""
        self.in_title = False
        self.in_heading = None
        self.buf = []            # текст текущего куска
        self.head_buf = []       # текст текущего заголовка
        self.cur_head = ""
        self.cur_anchor = ""
        self.chunks = []         # (anchor, heading, text)

    # — служебное —
    def _anchor(self):
        for tag, eid in reversed(self.stack):
            if eid:
                return eid
        return ""

    def _flush(self):
        text = re.sub(r"\s+", " ", " ".join(self.buf)).strip()
        if self.cur_head or text:
            self.chunks.append((self.cur_anchor, self.cur_head, text))
        self.buf = []

    # — разбор —
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in VOID:
            return
        if tag == "title":
            self.in_title = True
            return
        self.stack.append((tag, a.get("id", "")))
        if self.skip_depth:
            self.skip_depth += 1
            return
        classes = set((a.get("class") or "").split())
        if tag in SKIP_TAGS or tag in SKIP_SECTIONS or (classes & SKIP_CLASSES):
            self.skip_depth = 1
            return
        if tag in HEADINGS:
            self._flush()
            self.in_heading = tag
            self.head_buf = []
            self.cur_anchor = a.get("id") or self._anchor()

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False
            return
        if tag in VOID:
            return
        if self.skip_depth:
            self.skip_depth -= 1
        elif tag == self.in_heading:
            self.cur_head = re.sub(r"\s+", " ", " ".join(self.head_buf)).strip()
            self.in_heading = None
        # снимаем со стека до ближайшего совпадения — верстка местами без закрывающих тегов
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        if self.in_title:
            self.title += data
            return
        if self.skip_depth:
            return
        if self.in_heading:
            self.head_buf.append(data)
        else:
            self.buf.append(data)

    def close(self):
        super().close()
        self._flush()


def page_title(raw):
    t = re.sub(r"\s+", " ", raw).strip()
    return t.split("·")[0].strip() or t


def html_files():
    out = []
    for name in sorted(os.listdir(ROOT)):
        if name.endswith(".html") and name not in EXCLUDE:
            out.append(name)
    cdir = os.path.join(ROOT, "coatings")
    if os.path.isdir(cdir):
        for name in sorted(os.listdir(cdir)):
            if name.endswith(".html"):
                out.append("coatings/" + name)
    return out


def build():
    entries = []
    for rel in html_files():
        with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
            p = Extractor()
            p.feed(f.read())
            p.close()
        title = page_title(p.title)
        for anchor, head, text in p.chunks:
            if len(text) < 40 and len(head) < 3:
                continue
            url = rel + ("#" + anchor if anchor else "")
            entries.append({
                "u": url,
                "t": title,
                "s": head or title,
                "x": text[:1200],
            })
    return entries


if __name__ == "__main__":
    data = build()
    path = os.path.join(ROOT, "search-index.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(data)} записей → {path} ({os.path.getsize(path) / 1024:.0f} КБ)")
