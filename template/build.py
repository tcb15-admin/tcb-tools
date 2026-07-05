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
PARENT_TEMPLATE_FILE = 'template/parent_view_template.html'
PARENT_OUTPUT_NAME = 'kakunin.html'
MASTER_BLOCK_START = '/*DEFAULT_MASTER_BLOCK*/'
MASTER_BLOCK_END = '/*END_DEFAULT_MASTER_BLOCK*/'
CONFIGS = {
    'boys15': 'template/config_boys15.json',
    'boys16': 'template/config_boys16.json',
}


def html_body_class(config):
    """html 要素の class。テーマ（16期）と 15期シンプルUI（tcb-ui-simple）を合成。"""
    parts = []
    tc = str(config.get('HTML_THEME_CLASS', '') or '').strip()
    if tc:
        parts.append(tc)
    simple = str(config.get('UI_SIMPLE', '') or '').strip().lower()
    if simple in ('1', 'true', 'yes', 'on'):
        parts.append('tcb-ui-simple')
    return ' '.join(parts)

def apply_default_master_block(html, target, config_path):
    """テンプレ内の DEFAULT_MB / TL / DESCS を世代別に差し替え（マーカーは boys15 では除去のみ）。"""
    s = html.find(MASTER_BLOCK_START)
    e = html.find(MASTER_BLOCK_END)
    if s < 0 or e < 0:
        print(f'[WARN] {target}: DEFAULT_MASTER_BLOCK マーカーがテンプレートにありません')
        return html
    e_end = e + len(MASTER_BLOCK_END)
    inner_start = s + len(MASTER_BLOCK_START)
    if inner_start < len(html) and html[inner_start] == '\n':
        inner_start += 1
    inner = html[inner_start:e].strip()

    if target == 'boys16':
        cfg_dir = os.path.dirname(config_path)
        defaults_path = os.path.join(cfg_dir, 'master_defaults_boys16.json')
        if not os.path.exists(defaults_path):
            print(f'[ERROR] boys16: {defaults_path} がありません')
            return html
        with open(defaults_path, encoding='utf-8') as f:
            md = json.load(f)
        body = (
            'var DEFAULT_MB=' + json.dumps(md['MB'], ensure_ascii=False) + ';\n'
            'var DEFAULT_TL=' + json.dumps(md['TL'], ensure_ascii=False) + ';\n'
            'var DEFAULT_DESCS=' + json.dumps(md['DESCS'], ensure_ascii=False) + ';'
        )
        return html[:s] + body + html[e_end:]

    if target == 'boys15':
        master_path = os.path.normpath(
            os.path.join(os.path.dirname(config_path), '..', 'boys15', 'master.json')
        )
        if not os.path.exists(master_path):
            print(f'[ERROR] boys15: {master_path} がありません')
            return html
        with open(master_path, encoding='utf-8') as f:
            md = json.load(f)
        for key in ('MB', 'TL', 'DESCS'):
            if key not in md:
                print(f'[ERROR] boys15: master.json に {key} がありません')
                return html
        body = (
            'var DEFAULT_MB=' + json.dumps(md['MB'], ensure_ascii=False) + ';\n'
            'var DEFAULT_TL=' + json.dumps(md['TL'], ensure_ascii=False) + ';\n'
            'var DEFAULT_DESCS=' + json.dumps(md['DESCS'], ensure_ascii=False) + ';'
        )
        return html[:s] + body + html[e_end:]

    # その他ターゲット: マーカー間のテンプレ本文をそのまま使用
    return html[:s] + inner + html[e_end:]


def build_manifest(target, config, out_dir):
    """PWA用の Web App Manifest（manifest.webmanifest）を世代別に生成する。
    ホーム画面追加時の名称・テーマ色・アイコンを定義。アイコンPNGは別途 .tmp-gen-icons.py 等で生成し配置しておく。"""
    theme = str(config.get('THEME_COLOR', '#122050') or '#122050')
    manifest = {
        'name': str(config.get('PWA_NAME', config.get('TEAM_NAME', '道具割振り'))),
        'short_name': str(config.get('PWA_SHORT_NAME', config.get('COHORT_LABEL', '道具'))),
        'lang': 'ja',
        'start_url': './index.html',
        'scope': './',
        'display': 'standalone',
        'orientation': 'portrait',
        'background_color': '#122050',
        'theme_color': theme,
        'icons': [
            {'src': 'icon-192.png', 'sizes': '192x192', 'type': 'image/png', 'purpose': 'any'},
            {'src': 'icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any'},
            {'src': 'icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'},
        ],
    }
    out_path = os.path.join(out_dir or '.', 'manifest.webmanifest')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    missing = [n for n in ('icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'favicon-32.png')
               if not os.path.isfile(os.path.join(out_dir or '.', n))]
    if missing:
        print(f'[WARN] {target}: アイコン未配置 {missing}（python3 template/gen_icons.py で生成してください）')
    print(f'[OK] {target}(manifest) → {out_path}')
    return True


def build_parent_view(target, config, out_dir):
    """保護者向け確認ページ（kakunin.html）を生成。トークンは絶対に埋め込まない。"""
    if not os.path.exists(PARENT_TEMPLATE_FILE):
        print(f'[WARN] {target}: 保護者向けテンプレートが見つかりません: {PARENT_TEMPLATE_FILE}')
        return False

    with open(PARENT_TEMPLATE_FILE, encoding='utf-8') as f:
        html = f.read()

    if 'SYNC_API_TOKEN' in html:
        print(f'[ERROR] {target}: 保護者向けページにトークン参照が含まれています。中止します。')
        return False

    html = html.replace('{{HTML_BODY_CLASS}}', html_body_class(config))

    pages_base = str(config.get('PAGES_BASE_URL', '') or '').rstrip('/')
    if not pages_base:
        manual = str(config.get('MANUAL_URL', '') or '')
        if '/docs/' in manual:
            pages_base = manual.split('/docs/')[0].rstrip('/')
    html = html.replace('{{PAGES_BASE_URL}}', pages_base)

    parent_keys = [
        'TEAM_NAME', 'TEAM_SHORT_NAME', 'TEAM_SLOGAN', 'COHORT_KEY', 'COHORT_LABEL',
        'SYNC_API_BASE_URL', 'TOOL_VERSION',
    ]
    for key in parent_keys:
        html = html.replace('{{' + key + '}}', str(config.get(key, '')))
    html = html.replace(' class=""', '')

    remaining = re.findall(r'\{\{[^}]+\}\}', html)
    if remaining:
        print(f'[WARN] {target}(確認ページ): 未置換のプレースホルダ: {set(remaining)}')

    out_path = os.path.join(out_dir or '.', PARENT_OUTPUT_NAME)
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'[OK] {target}(確認ページ) → {out_path}')
    return True


def normalize_sync_token(raw):
    """メモ帳等からのコピペで紛れ込むカール引用符を除去（トークン本体は英数字記号のみ想定）。"""
    s = str(raw or '').strip()
    curly = ('\u2018', '\u2019', '\u201c', '\u201d', '\u0060', '\u00b4', '\uff07')
    if any(c in s for c in curly):
        for c in curly:
            s = s.replace(c, '')
        s = s.strip()
        print('[WARN] SYNC_API_TOKEN: カール引用符（‘ ’ 等）を除去しました。シェルでは直線の \' を使ってください。')
    return s


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

    # Public リポジトリ対策: SYNC_API_TOKEN は Git に載せず、ビルド時のみ環境変数で渡す
    # 例: SYNC_API_TOKEN='（新トークン）' python3 template/build.py boys15 boys16
    _tok = normalize_sync_token(os.environ.get('SYNC_API_TOKEN', ''))
    if _tok:
        config['SYNC_API_TOKEN'] = _tok

    with open(TEMPLATE_FILE, encoding='utf-8') as f:
        html = f.read()

    html = apply_default_master_block(html, target, config_path)

    html = html.replace('{{HTML_BODY_CLASS}}', html_body_class(config))

    # プレースホルダを置換
    placeholders = [
        'TEAM_NAME', 'TEAM_SHORT_NAME', 'TEAM_SLOGAN',
        'INITIAL_PW', 'LS_PREFIX', 'GITHUB_MASTER_URL', 'GITHUB_FOLDER_NAME',
        'TOOL_VERSION', 'HTML_THEME_CLASS',
        'COHORT_KEY', 'COHORT_LABEL',
        'SYNC_API_BASE_URL', 'SYNC_API_TOKEN',
        'PARENT_VIEW_URL',
        'MANUAL_URL',
        'VAPID_PUBLIC_KEY', 'VAPID_SUBJECT',
        'PWA_NAME', 'PWA_SHORT_NAME', 'THEME_COLOR',
    ]

    for key in placeholders:
        if key not in config:
            print(f'[WARN] {target}: config.jsonに {key} がありません')
            continue
        html = html.replace('{{' + key + '}}', str(config[key]))
    html = html.replace(' class=""', '')

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

    out_dir = os.path.dirname(out_path) or '.'
    # index.html（道具MGR）用アセット＋保護者確認ページ（kakunin.html）用アセット
    assets = (
        'html2pdf.bundle.min.js',
        'tcb-print-pdf.js', 'tcb-sync-api.js',
        'tcb-swap-mgr.js', 'tcb-swap-mgr.css',
        'tcb-push-mgr.js', 'tcb-push-mgr.css',
        'tcb-pwa-install.js', 'tcb-pwa-install.css',
        'sw.js',
        'parent-swap.js', 'parent-swap.css',
    )
    for asset in assets:
        src_asset = os.path.join(os.path.dirname(TEMPLATE_FILE), asset)
        if os.path.isfile(src_asset):
            shutil.copy2(src_asset, os.path.join(out_dir, asset))

    print(f'[OK] {target} → {out_path}  (v{config.get("TOOL_VERSION","?")})')

    # PWA用マニフェスト（ホーム画面追加対応）
    build_manifest(target, config, out_dir)

    # 保護者向け確認ページ（案2 Step2-1）
    build_parent_view(target, config, out_dir)
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
