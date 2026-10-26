"""Build index.html from src/editor.html and data/levels.json.

Run from the repo root: python3 tools/build.py
"""
import json
import pathlib

root = pathlib.Path(__file__).resolve().parent.parent
levels = json.loads((root / 'data' / 'levels.json').read_text(encoding='utf-8'))
page = (root / 'src' / 'editor.html').read_text(encoding='utf-8')
data = json.dumps(levels, separators=(',', ':'), ensure_ascii=False).replace('</', '<\\/')
page = page.replace('/*LEVELS*/', data)

# src/editor.html has no <html>/<head>/<body> so it can be published as a claude.ai artifact.
# Wrap it into a full document for opening locally or on GitHub Pages.
i = page.index('<style>')
j = page.index('</style>', i) + len('</style>')
full = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        + page[:i] + page[i:j] + '\n</head>\n<body>\n' + page[j:] + '\n</body>\n</html>\n')
(root / 'index.html').write_text(full, encoding='utf-8')
print('wrote index.html,', len(levels), 'levels')
