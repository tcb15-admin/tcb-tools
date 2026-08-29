#!/usr/bin/env python3
"""
東海中央ボーイズ 道具割振りツール ビルドスクリプト
=====================================================
使い方:
  python build.py                    # 全世代をビルド
  python build.py boys15             # 15期のみビルド

出力:
  boys15/index.html

※ビルド対象は boys15 のみ。
"""

import json, os, sys, re, shutil
from datetime import datetime, timezone, timedelta

# ===== 設定 =====
TEMPLATE_FILE = 'template/tool_template.html'
PARENT_TEMPLATE_FILE = 'template/parent_view_template.html'
PARENT_OUTPUT_NAME = 'kakunin.html'
ATT_STAFF_TEMPLATE = 'template/attendance/staff_template.html'
ATT_PARENT_TEMPLATE = 'template/attendance/parent_template.html'
PORTAL_TEMPLATE = 'template/portal/portal_template.html'
TEA_TEMPLATE = 'template/tea/tea_template.html'
CARPOOL_TEMPLATE = 'template/carpool/staff_template.html'
MASTER_BLOCK_START = '/*DEFAULT_MASTER_BLOCK*/'
MASTER_BLOCK_END = '/*END_DEFAULT_MASTER_BLOCK*/'
CONFIGS = {
    'boys15': 'template/config_boys15.json',
}


ASSET_VER_RE = re.compile(r'\b(src|href)="([^"]+\.(?:js|css))"')

def add_asset_version(html, version):
    """ローカルのJS/CSS参照に ?v=TOOL_VERSION を付与する。

    デプロイ直後にブラウザのHTTPキャッシュが古いJS/CSSを返し、
    「新しいHTML＋古いJS」の食い違いが起きるのを防ぐ（キャッシュバスティング）。
    外部URL（http/https/protocol-relative/data:）と既にクエリ付きのURLは対象外。
    Service Worker の登録（JSコード内の './sw.js'）はタグ属性ではないため影響しない。
    """
    v = str(version or '').strip()
    if not v:
        return html

    def _rep(m):
        attr, url = m.group(1), m.group(2)
        if url.startswith(('http://', 'https://', '//', 'data:')) or '?' in url:
            return m.group(0)
        return f'{attr}="{url}?v={v}"'

    return ASSET_VER_RE.sub(_rep, html)


def html_body_class(config):
    """html 要素の class。テーマクラスとシンプルUI（tcb-ui-simple）を合成。"""
    parts = []
    tc = str(config.get('HTML_THEME_CLASS', '') or '').strip()
    if tc:
        parts.append(tc)
    simple = str(config.get('UI_SIMPLE', '') or '').strip().lower()
    if simple in ('1', 'true', 'yes', 'on'):
        parts.append('tcb-ui-simple')
    return ' '.join(parts)

def warn_master_snapshot_stale(master_path, md, max_age_days=7):
    """boys15/master.json が D1 スナップショットとして古い場合に WARN。"""
    meta = md.get('_meta') if isinstance(md, dict) else None
    if not isinstance(meta, dict):
        print(f'[WARN] boys15: {master_path} に _meta がありません。'
              'D1 と乖離している可能性があります。'
              'SYNC_API_TOKEN=… node cloudflare-sync/scripts/pull-master.mjs を実行してください。')
        return
    synced_at = str(meta.get('syncedAt') or '').strip()
    if not synced_at:
        print(f'[WARN] boys15: master.json の _meta.syncedAt がありません。pull-master.mjs で再取得してください。')
        return
    try:
        dt = datetime.fromisoformat(synced_at.replace('Z', '+00:00'))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        age = datetime.now(timezone.utc) - dt.astimezone(timezone.utc)
        if age > timedelta(days=max_age_days):
            days = int(age.total_seconds() // 86400)
            print(f'[WARN] boys15: master.json のスナップショットが {days} 日古いです（syncedAt={synced_at}）。'
                  'マスタ内容を根拠にする前に pull-master.mjs を実行してください。')
    except ValueError:
        print(f'[WARN] boys15: master.json の _meta.syncedAt が不正です: {synced_at!r}')


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

    if target == 'boys15':
        master_path = os.path.normpath(
            os.path.join(os.path.dirname(config_path), '..', 'boys15', 'master.json')
        )
        if not os.path.exists(master_path):
            print(f'[ERROR] boys15: {master_path} がありません')
            return html
        with open(master_path, encoding='utf-8') as f:
            md = json.load(f)
        warn_master_snapshot_stale(master_path, md)
        for embed_key in ('MB', 'TL', 'DESCS'):
            if embed_key not in md:
                print(f'[ERROR] boys15: master.json に {embed_key} がありません')
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
        'name': str(config.get('PWA_NAME', config.get('TEAM_NAME', 'ポータル'))),
        'short_name': str(config.get('PWA_SHORT_NAME', config.get('COHORT_LABEL', 'ポータル'))),
        'lang': 'ja',
        'start_url': './portal/',
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


def pages_base_url(config):
    pages_base = str(config.get('PAGES_BASE_URL', '') or '').rstrip('/')
    if pages_base:
        return pages_base
    manual = str(config.get('MANUAL_URL', '') or '')
    if '/docs/' in manual:
        return manual.split('/docs/')[0].rstrip('/')
    return ''


def apply_placeholders(html, mapping):
    for key, val in mapping.items():
        html = html.replace('{{' + key + '}}', str(val))
    remaining = re.findall(r'\{\{[^}]+\}\}', html)
    return html, remaining


def build_portal_and_attendance(target, config, out_dir):
    """ポータルと出欠アプリ（スタッフ／保護者）を世代ディレクトリへ出力。"""
    pages_base = pages_base_url(config)
    cohort = str(config.get('COHORT_KEY', ''))

    # 出欠トラック設定（チーム固有の呼称・フォーム種別は config で上書き可能）
    att_defaults = {
        'ATT_TRACK_A_LABEL': 'MG LINE',
        'ATT_TRACK_B_LABEL': '親父 LINE',
        'ATT_TRACK_A_SHORT': 'MG',
        'ATT_TRACK_B_SHORT': '親父',
        'ATT_TRACK_A_FORM': 'family',
        'ATT_TRACK_B_FORM': 'marks',
        'ATT_TRACK_B_ROLE': '',
        'ATT_TRACK_A_NOTE': '',
        'ATT_TRACK_B_NOTE': 'フォーム回答が正です（LINEスケジュールの代わり）。送信後も同じURLから訂正できます。',
    }
    att = {k: str(config.get(k, v)) for k, v in att_defaults.items()}
    tracks = {
        'a': {
            'label': att['ATT_TRACK_A_LABEL'],
            'short': att['ATT_TRACK_A_SHORT'],
            'form': att['ATT_TRACK_A_FORM'],
            'role': '',
            'note': att['ATT_TRACK_A_NOTE'],
        },
        'b': {
            'label': att['ATT_TRACK_B_LABEL'],
            'short': att['ATT_TRACK_B_SHORT'],
            'form': att['ATT_TRACK_B_FORM'],
            'role': att['ATT_TRACK_B_ROLE'],
            'note': att['ATT_TRACK_B_NOTE'],
        },
    }

    mapping = {
        'COHORT_KEY': cohort,
        'COHORT_LABEL': str(config.get('COHORT_LABEL', '')),
        'TEAM_NAME': str(config.get('TEAM_NAME', '')),
        'TEAM_SHORT_NAME': str(config.get('TEAM_SHORT_NAME', '')),
        'TEAM_SLOGAN': str(config.get('TEAM_SLOGAN', '')),
        'THEME_COLOR': str(config.get('THEME_COLOR', '#122050') or '#122050'),
        'SYNC_API_BASE_URL': str(config.get('SYNC_API_BASE_URL', '')),
        'TOOL_VERSION': str(config.get('TOOL_VERSION', '')),
        'INITIAL_PW': str(config.get('INITIAL_PW', '')),
        'LS_PREFIX': str(config.get('LS_PREFIX', '')),
        'PAGES_BASE_URL': pages_base,
        'COHORT_KEY_JSON': json.dumps(cohort, ensure_ascii=False),
        'COHORT_LABEL_JSON': json.dumps(str(config.get('COHORT_LABEL', '')), ensure_ascii=False),
        'TEAM_NAME_JSON': json.dumps(str(config.get('TEAM_NAME', '')), ensure_ascii=False),
        'TEAM_SHORT_NAME_JSON': json.dumps(str(config.get('TEAM_SHORT_NAME', '')), ensure_ascii=False),
        'SYNC_API_BASE_URL_JSON': json.dumps(str(config.get('SYNC_API_BASE_URL', '')), ensure_ascii=False),
        'SYNC_API_TOKEN_JSON': json.dumps(str(config.get('SYNC_API_TOKEN', '')), ensure_ascii=False),
        'INITIAL_PW_JSON': json.dumps(str(config.get('INITIAL_PW', '')), ensure_ascii=False),
        'LS_PREFIX_JSON': json.dumps(str(config.get('LS_PREFIX', '')), ensure_ascii=False),
        'PAGES_BASE_URL_JSON': json.dumps(pages_base, ensure_ascii=False),
        'ATT_TRACKS_JSON': json.dumps(tracks, ensure_ascii=False),
        'PWA_NAME': str(config.get('PWA_NAME', '')),
        'PWA_SHORT_NAME': str(config.get('PWA_SHORT_NAME', '')),
    }
    mapping.update(att)

    portal_dir = os.path.join(out_dir, 'portal')
    att_dir = os.path.join(out_dir, 'attendance')
    os.makedirs(portal_dir, exist_ok=True)
    os.makedirs(att_dir, exist_ok=True)

    # ポータル
    if os.path.exists(PORTAL_TEMPLATE):
        with open(PORTAL_TEMPLATE, encoding='utf-8') as f:
            html = f.read()
        html, rem = apply_placeholders(html, mapping)
        if rem:
            print(f'[WARN] {target}(portal): 未置換 {set(rem)}')
        html = add_asset_version(html, config.get('TOOL_VERSION'))
        with open(os.path.join(portal_dir, 'index.html'), 'w', encoding='utf-8') as f:
            f.write(html)
        print(f'[OK] {target}(portal) → {portal_dir}/index.html')
    portal_css_src = 'template/portal/portal.css'
    if os.path.exists(portal_css_src):
        shutil.copy2(portal_css_src, os.path.join(portal_dir, 'portal.css'))
        print(f'[OK] {target}(portal.css) → {portal_dir}/portal.css')
    portal_js_src = 'template/portal/portal-summary.js'
    if os.path.exists(portal_js_src):
        shutil.copy2(portal_js_src, os.path.join(portal_dir, 'portal-summary.js'))
        print(f'[OK] {target}(portal-summary.js) → {portal_dir}/portal-summary.js')
    shell_css_src = os.path.join(os.path.dirname(TEMPLATE_FILE), 'tcb-shell.css')
    if os.path.isfile(shell_css_src):
        # ポータル／出欠／お茶は ../tcb-shell.css を参照（道具と同階層）
        shutil.copy2(shell_css_src, os.path.join(out_dir, 'tcb-shell.css'))

    # 出欠スタッフ（トークン埋め込みあり・Git に平文を載せない運用は既存と同様）
    if os.path.exists(ATT_STAFF_TEMPLATE):
        with open(ATT_STAFF_TEMPLATE, encoding='utf-8') as f:
            html = f.read()
        html, rem = apply_placeholders(html, mapping)
        if rem:
            print(f'[WARN] {target}(attendance staff): 未置換 {set(rem)}')
        html = add_asset_version(html, config.get('TOOL_VERSION'))
        with open(os.path.join(att_dir, 'index.html'), 'w', encoding='utf-8') as f:
            f.write(html)
        print(f'[OK] {target}(attendance) → {att_dir}/index.html')

    # 出欠保護者（トークンを絶対に埋め込まない）
    if os.path.exists(ATT_PARENT_TEMPLATE):
        with open(ATT_PARENT_TEMPLATE, encoding='utf-8') as f:
            html = f.read()
        if 'SYNC_API_TOKEN' in html or 'apiToken' in html:
            print(f'[ERROR] {target}: 出欠保護者ページにトークン参照があります。中止します。')
            return False
        html, rem = apply_placeholders(html, mapping)
        if rem:
            print(f'[WARN] {target}(attendance parent): 未置換 {set(rem)}')
        html = add_asset_version(html, config.get('TOOL_VERSION'))
        with open(os.path.join(att_dir, 'kaito.html'), 'w', encoding='utf-8') as f:
            f.write(html)
        print(f'[OK] {target}(attendance parent) → {att_dir}/kaito.html')

    # 出欠アセット
    att_assets = (
        'attendance.css',
        'attendance-staff.js',
        'attendance-parent.js',
        'attendance-line.js',
        'attendance-briefing.js',
        'attendance-jp-calendar.js',
    )
    att_src_dir = os.path.join(os.path.dirname(TEMPLATE_FILE), 'attendance')
    for name in att_assets:
        src = os.path.join(att_src_dir, name)
        if os.path.isfile(src):
            shutil.copy2(src, os.path.join(att_dir, name))

    # お茶当番
    tea_dir = os.path.join(out_dir, 'tea')
    os.makedirs(tea_dir, exist_ok=True)
    if os.path.exists(TEA_TEMPLATE):
        with open(TEA_TEMPLATE, encoding='utf-8') as f:
            html = f.read()
        html, rem = apply_placeholders(html, mapping)
        if rem:
            print(f'[WARN] {target}(tea): 未置換 {set(rem)}')
        html = add_asset_version(html, config.get('TOOL_VERSION'))
        with open(os.path.join(tea_dir, 'index.html'), 'w', encoding='utf-8') as f:
            f.write(html)
        print(f'[OK] {target}(tea) → {tea_dir}/index.html')
    tea_assets = ('tea.css', 'tea-app.js', 'tea-line.js', 'tea-print.js', 'tea-seed-2026-08.js')
    tea_src_dir = os.path.join(os.path.dirname(TEMPLATE_FILE), 'tea')
    for name in tea_assets:
        src = os.path.join(tea_src_dir, name)
        if os.path.isfile(src):
            shutil.copy2(src, os.path.join(tea_dir, name))

    # 配車
    carpool_dir = os.path.join(out_dir, 'carpool')
    os.makedirs(carpool_dir, exist_ok=True)
    if os.path.exists(CARPOOL_TEMPLATE):
        with open(CARPOOL_TEMPLATE, encoding='utf-8') as f:
            html = f.read()
        html, rem = apply_placeholders(html, mapping)
        if rem:
            print(f'[WARN] {target}(carpool): 未置換 {set(rem)}')
        html = add_asset_version(html, config.get('TOOL_VERSION'))
        with open(os.path.join(carpool_dir, 'index.html'), 'w', encoding='utf-8') as f:
            f.write(html)
        print(f'[OK] {target}(carpool) → {carpool_dir}/index.html')
    carpool_assets = ('carpool.css', 'carpool-staff.js', 'carpool-validate.js', 'carpool-line.js')
    carpool_src_dir = os.path.join(os.path.dirname(TEMPLATE_FILE), 'carpool')
    for name in carpool_assets:
        src = os.path.join(carpool_src_dir, name)
        if os.path.isfile(src):
            shutil.copy2(src, os.path.join(carpool_dir, name))

    # 同期クライアント（出欠／お茶／配車が ../tcb-sync-api.js を参照）
    sync_src = os.path.join(os.path.dirname(TEMPLATE_FILE), 'tcb-sync-api.js')
    if os.path.isfile(sync_src):
        shutil.copy2(sync_src, os.path.join(out_dir, 'tcb-sync-api.js'))

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

    pages_base = pages_base_url(config)
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

    html = add_asset_version(html, config.get('TOOL_VERSION'))

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
    # 例: SYNC_API_TOKEN='（新トークン）' python3 template/build.py boys15
    _tok = normalize_sync_token(os.environ.get('SYNC_API_TOKEN', ''))
    if _tok:
        config['SYNC_API_TOKEN'] = _tok
    _cfg_tok = str(config.get('SYNC_API_TOKEN', '') or '')
    if not _cfg_tok or _cfg_tok.startswith('__'):
        print(f'[WARN] {target}: SYNC_API_TOKEN が未設定（プレースホルダのまま）です。'
              'この出力ではクラウド同期が無効になります。'
              "配布用は SYNC_API_TOKEN='…' python3 template/build.py で再ビルドしてください。")

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

    # JS/CSS参照へ ?v=TOOL_VERSION を付与（デプロイ直後のキャッシュずれ対策）
    html = add_asset_version(html, config.get('TOOL_VERSION'))

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
        'jspdf.umd.min.js', 'html2canvas.min.js', 'html2pdf.min.js',
        'tcb-print-pdf.js', 'tcb-sync-api.js',
        'tcb-swap-mgr.js', 'tcb-swap-mgr.css',
        'tcb-push-mgr.js', 'tcb-push-mgr.css',
        'tcb-pwa-install.js', 'tcb-pwa-install.css',
        'tcb-group-hold.js', 'tcb-group-hold.css',
        'tcb-feedback.js', 'tcb-feedback.css',
        'tcb-device.js',
        'tcb-presummary.js', 'tcb-presummary.css',
        'tcb-p1-flow.js', 'tcb-p1-flow.css',
        'tcb-shell.css',
        'tcb-login.css',
        'tcb-login.js',
        'gear.css',
        'tcb-gear-ui.css',
        'tcb-swap-list.js', 'tcb-swap-list.css',
        'tcb-handoff-plan.js', 'tcb-handoff-plan.css',
        'tcb-assign-board.js', 'tcb-assign-board.css',
        'tcb-team-rules.js',
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

    # 役割ポータル＋出欠アプリ
    build_portal_and_attendance(target, config, out_dir)
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
