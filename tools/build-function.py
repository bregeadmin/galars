#!/usr/bin/env python3
"""Готовит функцию galars-publish к вставке в редактор Supabase: все не-ASCII символы
(русские сообщения, неразрывный пробел, тире) экранируются как \\uXXXX. Результат —
supabase/functions/galars-publish/index.dashboard.ts — чистый ASCII, кодировка при
вставке через буфер обмена сломаться не может. Исходник index.ts остаётся читаемым."""
import pathlib, re
src = pathlib.Path(__file__).resolve().parent.parent / 'supabase/functions/galars-publish/index.ts'
dst = src.with_name('index.dashboard.ts')
s = src.read_text(encoding='utf-8')
out = re.sub(r'[^\x00-\x7f]', lambda m: ''.join('\\u%04x' % ord(c) for c in m.group(0)), s)
dst.write_text(out, encoding='ascii')
print(f'{dst.name}: {len(out)} байт, не-ASCII: {sum(1 for c in out if ord(c) > 127)}')
