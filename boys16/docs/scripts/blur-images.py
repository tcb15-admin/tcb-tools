#!/usr/bin/env python3
"""マニュアル用スクショのメンバー名などをぼかす（任意・通常は未使用）。

16期マニュアルは実機表示のまま掲載する運用のため、再取得後は本スクリプトを実行しないこと。
"""
from pathlib import Path
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent / "images"

# (left, top, right, bottom) 画像ごとのぼかし矩形（ピクセル）
REGIONS = {
    "01-login.png": [],  # 氏名なし
    "02-step1.png": [],  # 氏名なし
    "03-step2-absence.png": [(0, 260, 1280, 2826)],
    "03b-step2-group.png": [(0, 180, 1280, 2826)],
    "04-step3.png": [(0, 200, 1280, 3061)],
    "05-print-preview.png": [(40, 120, 1240, 880)],
    "06-master.png": [
        (0, 520, 1280, 5200),   # メンバー一覧
        (0, 5200, 1280, 13515),  # 道具一覧（担当者名列）
    ],
    "07-history.png": [(0, 200, 1280, 900)],
}

BLUR_RADIUS = 14


def blur_box(img: Image.Image, box: tuple) -> None:
    x0, y0, x1, y1 = box
    w, h = img.size
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(w, x1), min(h, y1)
    if x1 <= x0 or y1 <= y0:
        return
    crop = img.crop((x0, y0, x1, y1))
    crop = crop.filter(ImageFilter.GaussianBlur(radius=BLUR_RADIUS))
    # 二重ぼかしで判読しにくく
    crop = crop.filter(ImageFilter.GaussianBlur(radius=8))
    img.paste(crop, (x0, y0))


def main() -> None:
    for name, boxes in REGIONS.items():
        path = ROOT / name
        if not path.exists():
            print("skip (missing):", name)
            continue
        img = Image.open(path).convert("RGB")
        for box in boxes:
            blur_box(img, box)
        img.save(path, optimize=True)
        print("blurred:", name, f"({len(boxes)} regions)")


if __name__ == "__main__":
    main()
