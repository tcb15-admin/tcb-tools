#!/usr/bin/env node
/**
 * VAPID 鍵ペアを生成する（一度だけ実行し、秘密鍵は Git に載せない）
 *
 * 使い方:
 *   cd cloudflare-sync
 *   node gen-vapid-keys.mjs
 */
import { generateVAPIDKeys } from 'web-push-neo';

const keys = await generateVAPIDKeys();

console.log('=== VAPID Keys（Web Push 用・一度だけ生成） ===\n');
console.log('1. template/config_boys15.json の VAPID_PUBLIC_KEY に設定:');
console.log(keys.publicKey);
console.log('\n2. Worker Secret（本番）:');
console.log('   npx wrangler secret put VAPID_PRIVATE_KEY');
console.log('   → 値:', keys.privateKey);
console.log('\n   npx wrangler secret put VAPID_PUBLIC_KEY');
console.log('   → 値:', keys.publicKey);
console.log('\n3. VAPID_SUBJECT（連絡先・mailto: または https://）:');
console.log('   npx wrangler secret put VAPID_SUBJECT');
console.log('   例: mailto:your-team@example.com');
console.log('\n4. config の VAPID_SUBJECT も同じ値に揃える');
console.log('5. python3 template/build.py boys15 で HTML を再ビルド');
