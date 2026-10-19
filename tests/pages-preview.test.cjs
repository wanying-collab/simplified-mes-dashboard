const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const preview = require('../scripts/build-pages-preview.cjs');

test('preview changes only registered storage key literals, not MES analysis', () => {
  const source = fs.readFileSync(path.join(preview.ROOT, 'assets/simple-mes.js'), 'utf8');
  const result = preview.previewJavaScript(source);
  assert.equal(result.replaceAll('mes_test_google_sync__', ''), source);
  assert.equal((result.match(/mes_test_google_sync__/g) || []).length, preview.STORAGE_KEYS.length);
  for (const key of preview.STORAGE_KEYS) assert.ok(!result.includes(JSON.stringify(key)));
  assert.throws(() => preview.previewJavaScript(source.replace('mes_machine_master_v1', 'renamed_key')));
});

test('public artifact promotes classification only and excludes backups/source documents', () => {
  const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mes-preview-')), 'site');
  const manifest = preview.build(output);
  for (const [name, bytes] of preview.productionRelease()) assert.deepEqual(fs.readFileSync(path.join(output, name)), bytes);
  const all = fs.readdirSync(output, { recursive: true }).filter((name) => fs.statSync(path.join(output, name)).isFile());
  const expected = [...preview.productionRelease().keys(), ...preview.PREVIEW_FILES.map((name) => `${preview.PREVIEW_PATH}/${name}`), `${preview.PREVIEW_PATH}/deployment-manifest.json`];
  assert.deepEqual(all.map((name) => name.split(path.sep).join('/')).sort(), expected.sort());
  assert.equal(manifest.productionRef, preview.PRODUCTION_REF);
  const html = fs.readFileSync(path.join(output, preview.PREVIEW_PATH, 'portal-x7k9m4q2/index.html'), 'utf8');
  assert.ok(html.includes('mes-test-environment'));
  assert.ok(html.includes('OAuth 並未使原始資料成為私人資料'));
  assert.ok(html.includes('../assets/google-sheets-sync.js'));
  assert.throws(() => preview.build(output), /already exists/);
});

test('deployment refuses a changed or unavailable live production file', async () => {
  await assert.rejects(preview.verifyLiveProduction(async () => ({ ok: true, arrayBuffer: async () => Buffer.from('changed') })), /refusing to overwrite/);
  await assert.rejects(preview.verifyLiveProduction(async () => ({ ok: false, status: 503 })), /HTTP 503/);
});
