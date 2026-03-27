#!/usr/bin/env python3
"""
東海中央ボーイズ 道具割振りツール ビルドスクリプト
=====================================================
使い方:
  python build.py                    # 全世代をビルド
  python build.py boys15             # 15期のみビルド
  python build.py boys15 boys16      # 複数指定

出力:
  boys15/index.html
  boys16/index.html
"""

import json, os, sys, re, shutil

# ===== 設定 =====
TEMPLATE_FILE = 'template/tool_template.html'
CONFIGS = {
    'boys15': 'template/config_boys15.json',
    'boys16': 'template/config_boys16.json',
}

def build(target):
    """指定世代のHTMLを生成"""
    if target not in CONFIGS:
        print(f'[ERROR] 不明なターゲット: {target}')
        print(f'  使用可能: {", ".join(CONFIGS.keys())}')
        return False

    config_path = CONFIGS[target]
    if not os.path.exists(config_path):
        print(f'[ERROR] 設定ファイルが見つかりません: {config_path}')
        return False

    if not os.path.exists(TEMPLATE_FILE):
        print(f'[ERROR] テンプレートが見つかりません: {TEMPLATE_FILE}')
        return False

    with open(config_path, encoding='utf-8') as f:
        config = json.load(f)

    with open(TEMPLATE_FILE, encoding='utf-8') as f:
        html = f.read()

    # プレースホルダを置換
    placeholders = [
        'TEAM_NAME', 'TEAM_SHORT_NAME', 'TEAM_SLOGAN',
        'INITIAL_PW', 'LS_PREFIX', 'GITHUB_MASTER_URL',
        'TOOL_VERSION',
    ]

    for key in placeholders:
        if key not in config:
            print(f'[WARN] {target}: config.jsonに {key} がありません')
            continue
        html = html.replace('{{' + key + '}}', config[key])

    # 未置換のプレースホルダをチェック
    remaining = re.findall(r'\{\{[^}]+\}\}', html)
    if remaining:
        print(f'[WARN] {target}: 未置換のプレースホルダ: {set(remaining)}')

    # 出力先ディレクトリを作成
    out_path = config.get('OUTPUT_PATH', f'{target}/index.html')
    out_dir = os.path.dirname(out_path)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(html)

    print(f'[OK] {target} → {out_path}  (v{config.get("TOOL_VERSION","?")})')
    return True


def main():
    targets = sys.argv[1:] if len(sys.argv) > 1 else list(CONFIGS.keys())

    print('=' * 50)
    print('東海中央ボーイズ 道具割振りツール ビルド')
    print('=' * 50)

    success = 0
    for t in targets:
        if build(t):
            success += 1

    print('-' * 50)
    print(f'完了: {success}/{len(targets)} 成功')
    print()
    print('次のステップ:')
    for t in targets:
        if t in CONFIGS:
            config = json.load(open(CONFIGS[t], encoding='utf-8'))
            out = config.get('OUTPUT_PATH', f'{t}/index.html')
            print(f'  → GitHubに {out} をアップロード')


if __name__ == '__main__':
    main()
