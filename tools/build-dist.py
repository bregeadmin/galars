#!/usr/bin/env python3
"""Собирает папку dist/ — ровно то, что заливается на хостинг.

Из рабочей папки убирается всё служебное: история git, скрипты сборки,
исходник серверной функции, документация. На хостинг едут только страницы,
стили, скрипты, картинки, шрифты и приёмник заявок.

Запуск:  python3 tools/build-dist.py
"""
import os, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')

# Папки, которые на хостинг не едут.
SKIP_DIRS = {
    '.git', '.github', '.claude', 'docs', 'supabase', 'tools',
    'dist', '_before', '_dev', 'zayavki', 'node_modules',
}

# Отдельные файлы, которые на хостинг не едут.
SKIP_FILES = {
    '.DS_Store', '.gitignore', 'CNAME',
    # настоящий конфиг с паролем — только руками на сервер
    'zayavka-config.php',
}

# Служебные страницы: внутренняя кухня проекта. По умолчанию не публикуем.
# Если клиенту они нужны — запустить с ключом --with-service.
SERVICE_PAGES = {'plan.html', 'status.html', 'site-map.html'}

def main():
    with_service = '--with-service' in sys.argv
    if os.path.exists(DIST):
        shutil.rmtree(DIST)
    os.makedirs(DIST)

    copied = 0
    skipped_service = []
    total_bytes = 0

    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        rel_base = os.path.relpath(base, ROOT)
        if rel_base == '.':
            rel_base = ''
        for f in files:
            if f in SKIP_FILES:
                continue
            if f in SERVICE_PAGES and not with_service:
                skipped_service.append(f)
                continue
            src = os.path.join(base, f)
            rel = os.path.join(rel_base, f) if rel_base else f
            dst = os.path.join(DIST, rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(src, dst)
            copied += 1
            total_bytes += os.path.getsize(src)

    # Папка для копий заявок — пустая, но закрытая от веба.
    zay = os.path.join(DIST, 'zayavki')
    os.makedirs(zay, exist_ok=True)
    # Apache 2.4 и 2.2 закрывают папку разными директивами, а php_flag
    # существует только при mod_php: без обёрток любая из строк роняет
    # сервер в 500.
    with open(os.path.join(zay, '.htaccess'), 'w') as fh:
        fh.write(
            '<IfModule mod_authz_core.c>\n'
            '  Require all denied\n'
            '</IfModule>\n'
            '<IfModule !mod_authz_core.c>\n'
            '  Order allow,deny\n'
            '  Deny from all\n'
            '</IfModule>\n'
            '<IfModule mod_php5.c>\n'
            '  php_flag engine off\n'
            '</IfModule>\n'
            '<IfModule mod_php7.c>\n'
            '  php_flag engine off\n'
            '</IfModule>\n'
        )

    print('Собрано в dist/')
    print('  файлов:  %d' % copied)
    print('  размер:  %.1f МБ' % (total_bytes / 1024 / 1024))
    if skipped_service:
        print('  не вошли служебные страницы: %s' % ', '.join(sorted(set(skipped_service))))
        print('  (нужны клиенту — перезапустить с ключом --with-service)')
    print()
    print('ВАЖНО: api/zayavka-config.php с паролем в dist/ не попадает.')
    print('Его кладут на сервер отдельно, руками.')

if __name__ == '__main__':
    main()
