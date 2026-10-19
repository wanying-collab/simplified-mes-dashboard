const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const pages = require('../scripts/build-pages-preview.cjs');
const promotion = require('../scripts/production-classification.cjs');
const loadMes = require('./helpers/mes-harness.cjs');
const release = pages.productionRelease();
const beforeSource = pages.baseline('assets/simple-mes.js').toString('utf8');
const afterSource = release.get('assets/simple-mes.js').toString('utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

test('production changes only the two entry scripts, MES classification wiring and pinned pure module', () => {
  new vm.Script(afterSource);
  new vm.Script(release.get(promotion.MODULE_FILE).toString('utf8'));
  for (const name of pages.PUBLIC_FILES) {
    if (!promotion.CHANGED_FILES.includes(name)) assert.deepEqual(release.get(name), pages.baseline(name), name);
  }
  for (const [name, bytes] of release) {
    assert.ok(!/google-sheets-sync|accounts\.google\.com\/gsi|sheets\.googleapis\.com|initializeGoogleSheetsSync|googleAuthorizeBtn/.test(bytes.toString('utf8')), name);
  }
  assert.ok(!release.has('assets/google-sheets-sync.js'));
  for (const name of ['portal-x7k9m4q2/index.html', 'portal-X7K9M4Q2.html']) {
    const html = release.get(name).toString('utf8');
    assert.ok(html.indexOf('product-spec-classification.js') < html.indexOf('simple-mes.js'));
    assert.ok(html.includes(`product-spec-classification.js?v=${promotion.FORMAT_REVISION}`));
    assert.ok(html.includes(`simple-mes.js?v=${promotion.FORMAT_REVISION}`));
  }
  assert.ok(afterSource.includes('id="product-classification"'));
  assert.ok(afterSource.includes('mes_machine_master_v1'));
  assert.ok(!afterSource.includes('localStorage.clear('));
});

test('every existing production function outside the explicit classification allowlist is byte-identical', () => {
  const allowed = new Set([...promotion.FUNCTIONS, 'renderShell', 'bindEvents', 'analyzeRows', 'renderAll']);
  for (const [, name] of beforeSource.matchAll(/^  function (\w+)\(/gm)) {
    if (!allowed.has(name)) assert.equal(promotion.functionText(afterSource, name), promotion.functionText(beforeSource, name), name);
  }
});

const base = '底蓋,蝶閥-800mm';
const events = (no, spec) => ['Start', 'End'].map((status, i) => ({
  使用者: '測試', 設備編號: 'L3', 設備名稱: '傳統車床L3', 製令單號: no,
  品名規格: spec, 生產數量: 2, 動作狀態: status, 紀錄時間: `2026/10/19 ${i ? '11' : '08'}:00:01`,
}));
const rows = [...events('A', base), ...events('B', `${base}-毛胚`), ...events('C', '底蓋,蝶閥-900mm-毛胚')];
rows.push({ ...rows[0] }, { 品名規格: base, 紀錄時間: 'bad', 動作狀態: 'bad' });

test('production classification preserves raw events, work orders, times, anomaly and archive results', () => {
  const before = loadMes(beforeSource), after = loadMes(afterSource);
  before.analyzeRows(structuredClone(rows), 'test'); after.analyzeRows(structuredClone(rows), 'test');
  for (const key of ['rawRows', 'validRecords', 'invalidRecords']) assert.deepEqual(plain(after.state[key]), plain(before.state[key]), key);
  assert.deepEqual(plain(after.state.archiveData.archiveSummary), plain(before.state.archiveData.archiveSummary));
  const fields = ['workOrderNo', 'totalProcessingMs', 'totalWaitingMs', 'leadTimeMs', 'totalTimeWithAllowance', 'completed', 'includeInAverage', 'hasAnomaly', 'stations', 'stationTransitions', 'machineWorkSummary', 'archiveYear'];
  const metrics = (mes) => plain(mes.buildWorkOrders(mes.state.validRecords).map((o) => Object.fromEntries(fields.map((key) => [key, o[key]]))));
  assert.deepEqual(metrics(after), metrics(before));
  assert.deepEqual(plain(after.buildRawReportingSheet(after.state.rawRows)), plain(before.buildRawReportingSheet(before.state.rawRows)));
  const orders = after.buildWorkOrders(after.state.validRecords);
  assert.equal(orders.length, 3);
  assert.equal(after.buildProductSpecFlowAnalysis(orders, '').length, 2);
  assert.equal(after.buildProductSpecComparisons(orders).find((g) => g.productSpec === `${base}-毛胚`).orderCount, 2);
  const sheets = after.buildAnalysisSheets(after.getScopedData());
  assert.ok(JSON.stringify(sheets.productFlowDetailSheet).includes(`${base}-毛胚`));
  after.state.productClassificationExclusions = new Set([base]);
  after.analyzeRows(structuredClone(rows), 'excluded');
  assert.equal(after.buildProductSpecFlowAnalysis(after.buildWorkOrders(after.state.validRecords), '').length, 3);
});

test('preview changes only classification; Google synchronization, setup analysis and reviews are unchanged', () => {
  for (const name of pages.PREVIEW_FILES) {
    if (name === promotion.MODULE_FILE) {
      assert.equal(release.get(name).toString('utf8'), fs.readFileSync(path.join(pages.ROOT, name), 'utf8').replaceAll('\r\n', '\n'));
      continue;
    }
    const pinned = execFileSync('git', ['show', `${promotion.CLASSIFICATION_REF}:${name}`], { cwd: pages.ROOT, maxBuffer: 2000000 }).toString('utf8').replaceAll('\r\n', '\n');
    const current = fs.readFileSync(path.join(pages.ROOT, name), 'utf8').replaceAll('\r\n', '\n');
    const expected = name === 'assets/simple-mes.js' ? promotion.upgradeClassificationIntegration(pinned)
      : promotion.CHANGED_FILES.includes(name) && name.endsWith('.html') ? promotion.versionClassificationEntry(pinned) : pinned;
    assert.equal(current, expected, name);
  }
});

const responseFor = (choose) => async (url) => {
  const name = url.slice(pages.SITE_URL.length).split('?')[0];
  const bytes = choose(name);
  return { ok: Boolean(bytes), status: bytes ? 200 : 404, arrayBuffer: async () => bytes };
};
test('deployment accepts the complete old release and the complete approved classification release', async () => {
  const previous = pages.previousProductionRelease();
  await pages.verifyLiveProduction(responseFor((name) => previous.get(name)));
  await pages.verifyLiveProduction(responseFor((name) => release.get(name)));
});

test('deployment refuses mixed releases or a missing/corrupt classification module', async () => {
  const previous = pages.previousProductionRelease();
  await assert.rejects(pages.verifyLiveProduction(responseFor((name) => name === 'assets/simple-mes.js' ? previous.get(name) : release.get(name))), /refusing to overwrite/);
  await assert.rejects(pages.verifyLiveProduction(responseFor((name) => name === promotion.MODULE_FILE ? previous.get(name) : release.get(name))), /refusing to overwrite/);
  await assert.rejects(pages.verifyLiveProduction(responseFor((name) => name === promotion.MODULE_FILE ? null : release.get(name))), /HTTP 404/);
  await assert.rejects(pages.verifyLiveProduction(responseFor((name) => name === promotion.MODULE_FILE ? Buffer.from('unexpected') : release.get(name))), /refusing to overwrite/);
});
