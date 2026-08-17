# -*- coding: utf-8 -*-
"""
build.py — このサイトの「組み立て役」（自作の静的サイトジェネレーター）

やっていることは3つだけ：
  1. templates/base.html（全ページ共通の枠）を読む
  2. content/*.html（各ページの中身）を1つずつ枠にはめて docs/ に書き出す
  3. static/（css・js・画像・favicon）を docs/ にそのままコピーする

つまり「共通部分は1か所に、ページごとの中身は別々に」書いておいて、
実行するたびに公開用の完成品（docs/）を作り直す。
これが Astro や Hugo などの静的サイトジェネレーターの正体です。

使い方：  python build.py
"""
import pathlib, shutil, re

ROOT     = pathlib.Path(__file__).parent
SITE_URL = 'https://trust6236.github.io/onkan-lp/'      # 公開URL（OGPやcanonicalに使う）
SITE     = '音感トレーニング'

# ページ一覧（＝ヘッダーのメニュー順）。ファイル名 と 表示名
PAGES = [
    ('index.html',   'トップ'),
    ('howto.html',   '使い方'),
    ('about.html',   '作った人'),
    ('news.html',    'お知らせ'),
    ('contact.html', 'お問い合わせ'),
]

def read_content(path):
    """content/xxx.html の先頭にある『title: 〜』『description: 〜』の行と、本文を分けて返す"""
    text = path.read_text(encoding='utf-8')
    meta, body = {}, text
    m = re.match(r'((?:[a-z_]+:.*\n)+)\n', text)          # 先頭の「key: value」行の塊
    if m:
        for line in m.group(1).splitlines():
            k, v = line.split(':', 1)
            meta[k.strip()] = v.strip()
        body = text[m.end():]
    return meta, body

def build():
    base = (ROOT / 'templates' / 'base.html').read_text(encoding='utf-8')
    docs = ROOT / 'docs'
    if docs.exists():
        shutil.rmtree(docs)                                # 毎回まっさらから作り直す
    docs.mkdir()

    # 3. static/ をコピー（css/ js/ images/ favicon.svg）
    for item in (ROOT / 'static').iterdir():
        if item.is_dir():
            shutil.copytree(item, docs / item.name)
        else:
            shutil.copy2(item, docs / item.name)

    # 2. 各ページを組み立てる
    for fname, label in PAGES:
        meta, body = read_content(ROOT / 'content' / fname)
        title = meta.get('title', label)
        # メニュー：いま見ているページには class="on" を付ける
        nav = '\n'.join(
            f'      <li><a href="{f}"{" class=\"on\"" if f == fname else ""}>{l}</a></li>'
            for f, l in PAGES)
        page_title = title if fname == 'index.html' else f'{title}｜{SITE}'
        html = (base
                .replace('{{page_title}}', page_title)
                .replace('{{og_title}}', title)
                .replace('{{description}}', meta.get('description', ''))
                .replace('{{site_url}}', SITE_URL)
                .replace('{{path}}', '' if fname == 'index.html' else fname)
                .replace('{{nav}}', nav)
                .replace('{{content}}', body.rstrip() + '\n'))
        (docs / fname).write_text(html, encoding='utf-8')
        print(f'  {fname:14s} ← content/{fname}  ({label})')

    print(f'完成: {docs}  （このフォルダが公開されます）')

if __name__ == '__main__':
    build()
