const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { buildCatalog, projectOrder, parseSettings, exportSettings } = require('../assets/product-spec-classification.js');
const loadMes = require('./helpers/mes-harness.cjs');
const base = '底蓋,蝶閥-800mm', canonical = `${base}-毛胚`;
const plain = (value) => JSON.parse(JSON.stringify(value));

test('exact terminal suffix pair uses the existing blank name, preserving source names', () => {
  const names = [base, canonical, base];
  const c = buildCatalog(names);
  assert.equal(c.pairs.length, 1);
  assert.equal(c.aliases.get(base).canonical, canonical);
  assert.equal(c.aliases.get(base).key, c.aliases.get(canonical).key);
  assert.deepEqual(names, [base, canonical, base]);
  assert.equal(c.pairs[0].baseCount, 2);
});

test('no fuzzy matching or invented blank suffix for unpaired, differently sized or different parts', () => {
  for (const other of ['底蓋,蝶閥-900mm-毛胚', '閥瓣,蝶閥-800mm-毛胚', '底蓋蝶閥-800mm-毛胚', '底蓋,蝶閥-800MM-毛胚', `${base} -毛胚`, `${canonical}加工`]) {
    assert.equal(buildCatalog([base, other]).pairs.length, 0);
  }
  assert.equal(buildCatalog([base]).aliases.size, 0);
  assert.equal(buildCatalog([canonical]).aliases.size, 0);
});

test('explicit exclusions keep both names separate and survive JSON round-trip', () => {
  const excluded = parseSettings(JSON.stringify(exportSettings(new Set([base, '其他待保留排除品名']))));
  const c = buildCatalog([base, canonical], excluded);
  assert.equal(c.aliases.get(base).canonical, base);
  assert.notEqual(c.aliases.get(base).key, c.aliases.get(canonical).key);
  assert.equal(c.pairs[0].enabled, false);
  assert.equal(excluded.size, 2);
  assert.throws(() => parseSettings({ kind: 'wrong', version: 1, excludedBases: [] }));
  assert.throws(() => parseSettings({ kind: 'mes-product-classification', version: 1, excludedBases: [null] }));
});

test('multi-suffix ambiguity and conflicting products in one work order are not forced together', () => {
  const c = buildCatalog([base, canonical, `${canonical}-毛胚`]);
  assert.ok(c.pairs.every((pair) => !pair.enabled));
  const order = { workOrderNo: 'A', productSpec: base, normalizedProductSpec: base, totalProcessingMs: 123, rawRecords: [] };
  const projected = projectOrder(order, buildCatalog([base, canonical]), [base, '不同產品'], (x) => x);
  assert.ok(projected.productClassificationNote.includes('待人工確認'));
  assert.equal(projected.totalProcessingMs, 123);
  assert.equal(order.productGroupKey, undefined);
});

function events(order, spec, start, end) {
  return [
    { ID: `${order}-start`, 使用者: '測試人員', 設備編號: 'L3', 設備名稱: '傳統車床L3', 製令單號: order, 品名規格: spec, 生產數量: 2, 動作狀態: '開始 Start', 紀錄時間: `2026/10/19 ${start}` },
    { ID: `${order}-end`, 使用者: '測試人員', 設備編號: 'L3', 設備名稱: '傳統車床L3', 製令單號: order, 品名規格: spec, 生產數量: 2, 動作狀態: '結束 End', 紀錄時間: `2026/10/19 ${end}` },
  ];
}
const fixture = [...events('A', base, '08:00:00', '09:00:00'), ...events('B', canonical, '09:00:00', '11:00:00'), ...events('C', '底蓋蝶閥-800mm-毛胚', '13:00:00', '14:00:00')];
fixture.push({ ...fixture[0] }, { 使用者: '測試人員', 品名規格: base, 動作狀態: '未知', 紀錄時間: '錯誤時間' });
const baselineSource = () => execFileSync('git', ['show', '8e9a6b86824a0d33f16362252060a9e1851789f3:assets/simple-mes.js'], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', maxBuffer: 2000000 });

test('MES raw events, valid/invalid counts, work orders, processing, waiting and archive results are unchanged', () => {
  const before = loadMes(baselineSource()), after = loadMes();
  before.analyzeRows(structuredClone(fixture), 'fixture'); after.analyzeRows(structuredClone(fixture), 'fixture');
  assert.deepEqual(plain(after.state.rawRows), fixture);
  assert.deepEqual(plain(after.state.validRecords), plain(before.state.validRecords));
  assert.deepEqual(plain(after.state.invalidRecords), plain(before.state.invalidRecords));
  const bo = before.buildWorkOrders(before.state.validRecords), ao = after.buildWorkOrders(after.state.validRecords);
  const metrics = (orders) => orders.map((o) => Object.fromEntries(['workOrderNo', 'totalProcessingMs', 'totalWaitingMs', 'leadTimeMs', 'totalTimeWithAllowance', 'completed', 'includeInAverage', 'hasAnomaly', 'stations', 'stationTransitions', 'archiveYear'].map((k) => [k, o[k]])));
  assert.deepEqual(plain(metrics(ao)), plain(metrics(bo)));
  assert.deepEqual(plain(after.state.archiveData.archiveSummary), plain(before.state.archiveData.archiveSummary));
  assert.deepEqual(plain(after.buildRawReportingSheet()), plain(before.buildRawReportingSheet()));
  assert.deepEqual(plain(after.getHistoricalSetupAnalysis()), plain(before.getHistoricalSetupAnalysis()));
});

test('flow, comparison, historical standards, operator groups and Excel share exact grouping; repeated imports replace', () => {
  const mes = loadMes();
  mes.analyzeRows(structuredClone(fixture), 'fixture');
  const orders = mes.buildWorkOrders(mes.state.validRecords);
  const flow = mes.buildProductSpecFlowAnalysis(orders, '');
  assert.equal(flow.length, 2);
  assert.equal(flow.find((g) => g.productSpec === canonical).orderCount, 2);
  assert.equal(mes.buildProductSpecComparisons(orders)[0].orderCount, 2);
  assert.equal(mes.calculateProductOperatorAnalysis(orders).length, 2);
  assert.ok(mes.buildStandards(orders).some((g) => g.productSpec === canonical));
  mes.state.includeArchiveInAnalysis = true;
  const sheets = mes.buildAnalysisSheets(mes.getScopedData());
  const serialized = JSON.stringify(sheets.productFlowDetailSheet);
  assert.ok(serialized.includes(canonical));
  assert.equal(orders.find((o) => o.workOrderNo === 'A').originalProductSpec, base);
  assert.equal(orders.find((o) => o.workOrderNo === 'A').productSpec, canonical);
  mes.analyzeRows(structuredClone(fixture), 'repeat');
  assert.equal(mes.state.rawRows.length, fixture.length);
  assert.equal(mes.buildWorkOrders(mes.state.validRecords).length, 3);
});

test('exclusion works on MES historical grouping and future imports without changing samples', () => {
  const mes = loadMes();
  mes.state.productClassificationExclusions = new Set([base]);
  mes.analyzeRows(structuredClone(fixture), 'fixture');
  const orders = mes.buildWorkOrders(mes.state.validRecords);
  assert.equal(orders.find((o) => o.workOrderNo === 'A').productSpec, base);
  assert.equal(mes.buildProductSpecFlowAnalysis(orders, '').length, 3);
  mes.analyzeRows(events('A', base, '08:00:00', '09:00:00'), 'only base');
  assert.equal(mes.buildWorkOrders(mes.state.validRecords)[0].productSpec, base);
});
