"""Collects every player-facing Korean string (the translation keys) into tools/i18n/keys.json.
  python tools/i18n_extract.py
Korean is the source language: a key is the Korean text itself, with {0} {1} ... where a template literal fills in a
value. HTML inside strings is split at the tags (the page translates text node by text node).
"""
import io
import json
import os
import re

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
HANGUL = re.compile('[가-힣]')
JS = ['js/ui.js', 'js/data.js', 'js/game.js', 'js/net.js', 'js/commander.js']


def strip_comments(s):
    out, i, n = [], 0, len(s)
    while i < n:
        c = s[i]
        if c in '\'"`':  # a string: copy it whole
            j = i + 1
            while j < n and s[j] != c:
                j += 2 if s[j] == '\\' else 1
            out.append(s[i:j + 1]); i = j + 1
        elif s.startswith('//', i) and (i == 0 or s[i - 1] != ':'):
            j = s.find('\n', i); i = n if j < 0 else j
        elif s.startswith('/*', i):
            j = s.find('*/', i); i = n if j < 0 else j + 2
        else:
            out.append(c); i += 1
    return ''.join(out)


def literals(s):
    """string literals; a template literal's ${...} parts become {0} {1} ..."""
    i, n = 0, len(s)
    while i < n:
        c = s[i]
        if c in '\'"':
            j = i + 1
            while j < n and s[j] != c and s[j] != '\n':
                j += 2 if s[j] == '\\' else 1
            yield s[i + 1:j]; i = j + 1
        elif c == '`':
            j, buf, k, parts = i + 1, [], 0, []
            while j < n and s[j] != '`':
                if s.startswith('${', j):
                    depth, m = 1, j + 2
                    while m < n and depth:
                        if s[m] == '{': depth += 1
                        elif s[m] == '}': depth -= 1
                        elif s[m] == '`':  # a nested template inside ${}: its own strings count too
                            e = s.find('`', m + 1); parts.append(s[m:e + 1]); m = e
                        m += 1
                    inner = s[j + 2:m - 1]
                    for q in re.findall(r"'([^'\n]*[가-힣][^'\n]*)'", inner): parts.append("'" + q + "'")
                    buf.append('{%d}' % k); k += 1; j = m
                else:
                    buf.append(s[j]); j += 2 if s[j] == '\\' else 1
            yield ''.join(buf)
            for p in parts: yield from literals(p)
            i = j + 1
        else:
            i += 1


def pieces(text):
    text = text.replace('\\n', '\n')
    for seg in re.split(r'<[^>]*>|\n', text):
        seg = re.sub(r'\s+', ' ', seg).strip()
        if HANGUL.search(seg):
            # renumber the placeholders inside this piece from 0
            idx = {}
            seg = re.sub(r'\{(\d+)\}', lambda m: '{%d}' % idx.setdefault(m.group(1), len(idx)), seg)
            yield seg


def main():
    keys = {}
    for f in JS:
        s = strip_comments(io.open(os.path.join(ROOT, f), encoding='utf-8').read())
        s = re.sub(r"cr: '[^']*',?", '', s)  # (a card's reference name is never shown)
        for lit in literals(s):
            for p in pieces(lit): keys.setdefault(p, f)
    html = io.open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    html = re.sub(r'<!--.*?-->', '', html, flags=re.S)
    html = re.sub(r'<script.*?</script>', '', html, flags=re.S)
    for m in re.finditer(r'>([^<>]+)<', html):
        for p in pieces(m.group(1)): keys.setdefault(p, 'index.html')
    for m in re.finditer(r'(?:title|aria-label|placeholder)="([^"]*)"', html):
        for p in pieces(m.group(1)): keys.setdefault(p, 'index.html')
    os.makedirs(os.path.join(ROOT, 'tools', 'i18n'), exist_ok=True)
    out = sorted(keys)
    with io.open(os.path.join(ROOT, 'tools', 'i18n', 'keys.json'), 'w', encoding='utf-8') as fo:
        json.dump(out, fo, ensure_ascii=False, indent=0)
    print(len(out), 'keys')


if __name__ == '__main__':
    main()
