#!/usr/bin/env python3
"""チームロゴ（円形エンブレム）＋アイコン文言でアプリ用アイコンを生成する。

tool_template.html に埋め込まれたロゴ(base64)を元に、各期の出力先へ PNG を書き出す。
文言は config の PWA_ICON_LABEL（なければ PWA_SHORT_NAME）を使う。
- 生成物: icon-512.png / icon-192.png / apple-touch-icon.png(180) / favicon-32.png
  （icon-512 はブックマーク・ホーム画面向けに要素を大きめ。maskable 用は中央80%安全域）
- 依存: Pillow（pip install pillow）と日本語フォント（macOS の Hiragino Sans GB）
- 実行: リポジトリのルートで  python3 template/gen_icons.py

ロゴや文言を差し替えたら本スクリプトを再実行し、続けて build.py で manifest を再生成する。
"""
import re, base64, io, json, os
from PIL import Image, ImageDraw, ImageFont

TEMPLATE = 'template/tool_template.html'
NAVY = (18, 32, 80, 255)       # #122050
RED = (192, 0, 10, 255)        # #c0000a
GOLD = (244, 197, 78, 255)     # tiger gold accent
WHITE = (255, 255, 255, 255)
FONT_PATH = '/System/Library/Fonts/Hiragino Sans GB.ttc'
FONT_INDEX = 0

TARGETS = {
    '15': 'boys15',
}


def load_crest():
    html = open(TEMPLATE, encoding='utf-8').read()
    m = re.search(r'data:image/png;base64,([A-Za-z0-9+/=]+)', html)
    if not m:
        raise SystemExit('ロゴ(base64)が tool_template.html に見つかりません')
    raw = base64.b64decode(m.group(1))
    return Image.open(io.BytesIO(raw)).convert('RGB')


def fit_font(text, max_w, start, ss):
    size = start
    while size > 10:
        f = ImageFont.truetype(FONT_PATH, size * ss, index=FONT_INDEX)
        b = f.getbbox(text, stroke_width=max(1, int(size * ss * 0.03)))
        if (b[2] - b[0]) <= max_w:
            return f, size
        size -= 2
    return ImageFont.truetype(FONT_PATH, 10 * ss, index=FONT_INDEX), 10


def icon_label(cohort):
    cfg_path = os.path.join('template', f'config_boys{cohort}.json')
    if os.path.isfile(cfg_path):
        with open(cfg_path, encoding='utf-8') as f:
            cfg = json.load(f)
        label = str(cfg.get('PWA_ICON_LABEL') or cfg.get('PWA_SHORT_NAME') or '').strip()
        if label:
            return label
    return cohort + '期ポータル'


def make_icon(crest, label, ss=3, maskable=False):
    """maskable=True: 中央80%安全域。False: ブックマーク向けにエンブレムを大きく。"""
    S = 512 * ss
    canvas = Image.new('RGBA', (S, S), NAVY)

    if maskable:
        diam = int(268 * ss)
        cy = int(66 * ss)
        max_w = int(380 * ss)
        font_start = 72
        text_top = int(354 * ss)
    else:
        # 余白を減らし、エンブレム＋文言で画面を埋める（Chrome ブックマーク対策）
        diam = int(360 * ss)
        cy = int(28 * ss)
        max_w = int(460 * ss)
        font_start = 78
        text_top = int(400 * ss)

    crest_r = crest.resize((diam, diam), Image.LANCZOS)
    mask = Image.new('L', (diam, diam), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, diam - 1, diam - 1], fill=255)
    cx = (S - diam) // 2

    ring_pad = int(6 * ss)
    ringd = ImageDraw.Draw(canvas)
    ringd.ellipse(
        [cx - ring_pad, cy - ring_pad, cx + diam + ring_pad, cy + diam + ring_pad],
        fill=GOLD,
    )
    canvas.paste(crest_r, (cx, cy), mask)

    text = str(label or '').strip() or 'ポータル'
    font, size = fit_font(text, max_w, font_start, ss)
    stroke = max(1, int(size * ss * 0.04))
    d = ImageDraw.Draw(canvas)
    tb = d.textbbox((0, 0), text, font=font, stroke_width=stroke)
    tw = tb[2] - tb[0]
    th = tb[3] - tb[1]
    tx = (S - tw) // 2 - tb[0]
    ty = text_top - tb[1]
    d.text((tx, ty), text, font=font, fill=WHITE, stroke_width=stroke, stroke_fill=WHITE)

    ul_y = text_top + th + int(10 * ss)
    ul_w = int(tw * 0.60)
    ul_x0 = (S - ul_w) // 2
    ul_h = int(8 * ss)
    d.rounded_rectangle(
        [ul_x0, ul_y, ul_x0 + ul_w, ul_y + ul_h],
        radius=ul_h // 2,
        fill=RED,
    )

    return canvas.resize((512, 512), Image.LANCZOS)


def save_team_logo(crest, folder):
    """ヘッダー用：期表記なしのチームエンブレムのみ"""
    size = 320
    crest_r = crest.resize((size, size), Image.LANCZOS)
    crest_r.save(os.path.join(folder, 'team-logo.png'))


def main():
    crest = load_crest()
    for cohort, folder in TARGETS.items():
        os.makedirs(folder, exist_ok=True)
        label = icon_label(cohort)
        icon_any = make_icon(crest, label, maskable=False)
        icon_mask = make_icon(crest, label, maskable=True)
        icon_any.save(os.path.join(folder, 'icon-512.png'))
        icon_any.resize((192, 192), Image.LANCZOS).save(os.path.join(folder, 'icon-192.png'))
        icon_any.resize((180, 180), Image.LANCZOS).save(os.path.join(folder, 'apple-touch-icon.png'))
        icon_any.resize((32, 32), Image.LANCZOS).save(os.path.join(folder, 'favicon-32.png'))
        icon_mask.save(os.path.join(folder, 'icon-512-maskable.png'))
        save_team_logo(crest, folder)
        print(
            '[OK]', folder,
            f'→ icon-512/192(any・大), maskable, apple-touch(180), favicon-32, team-logo ({label})',
        )


if __name__ == '__main__':
    main()
