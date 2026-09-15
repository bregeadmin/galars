#!/usr/bin/env python3
"""Считает PASSWORD_HASH для секрета функции galars-publish.
Использование: python3 tools/password-hash.py            — спросит пароль и PEPPER
Печатает sha256(пароль + PEPPER). PEPPER — любая случайная строка, её тоже кладём в секреты."""
import hashlib, getpass, secrets
pw = getpass.getpass('Пароль редактора: ')
pepper = input('PEPPER (пусто — сгенерировать): ').strip() or secrets.token_hex(16)
print('\nPEPPER        =', pepper)
print('PASSWORD_HASH =', hashlib.sha256((pw + pepper).encode('utf-8')).hexdigest())
