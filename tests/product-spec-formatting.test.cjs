const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const api = require('../assets/product-spec-classification.js');
const loadMes = require('./helpers/mes-harness.cjs');
const pages = require('../scripts/build-pages-preview.cjs');
const previous = pages.previousProductionRelease();
const current = pages.productionRelease();
const context = { module: { exports: {} } };
vm.runInNewContext(previous.get('assets/product-spec-classification.js').toString('utf8'), context);
const oldApi = context.module.exports;
const names = ['底蓋,蝶閥, 1000mm', '底蓋,蝶閥,1000mm-毛胚', '底蓋,蝶閥, 1200mm', '底蓋,蝶閥, 600mm'];
const canonical = names[1];
const plain = (data) => JSON.parse(JSON.stringify(data));

test('1000mm formatting pair merges; 600mm and 1200mm remain separate without invented suffixes', () => {
  assert.equal(oldApi.buildCatalog(names).pairs.length, 0);
  const c = api.buildCatalog(names);
  assert.equal(c.pairs.length, 1);
  assert.equal(c.aliases.get(names[0]).canonical, canonical);
  assert.equal(c.aliases.get(canonical).key, c.aliases.get(names[0]).key);
  assert.ok(!c.aliases.has(names[2]));
  assert.ok(!c.aliases.has(names[3]));
});

test('fullwidth commas, surrounding spaces and outer whitespace normalize only for matching', () => {
  const originals = Object.freeze(['  底蓋 ， 蝶閥, 1000mm  ', names[0], '底蓋,蝶閥,1000mm', '底蓋， 蝶閥 ，1000mm-毛胚　']);
  const c = api.buildCatalog(originals);
  assert.equal(c.pairs.length, 1);
  assert.equal(c.pairs[0].baseCount, 3);
  assert.equal(c.pairs[0].canonicalCount, 1);
  assert.deepEqual(c.pairs[0].baseNames, originals.slice(0, 3));
  for (const name of originals) assert.equal(c.aliases.get(name).canonical, canonical);
  assert.deepEqual([...c.aliases.keys()].sort(), [...originals].sort());
});

test('dimensions, part names, valve types, process suffixes and internal spaces are not normalized', () => {
  for (const other of ['底蓋,蝶閥,1200mm-毛胚', '底蓋,蝶閥,600mm-毛胚', '閥瓣,蝶閥,1000mm-毛胚',
    '底蓋,閘閥,1000mm-毛胚', '底蓋,蝶閥,1000mm-精加工-毛胚', '底蓋,蝶閥,1000 mm-毛胚',
    '底蓋,蝶閥,1000MM-毛胚', '底蓋蝶閥1000mm-毛胚', '底蓋,蝶閥,1000mm -毛胚']) {
    assert.equal(api.buildCatalog([names[0], other]).pairs.length, 0, other);
  }
  assert.equal(api.buildCatalog([names[0]]).aliases.size, 0);
});

test('multiple suffix matches remain disabled and preserve original names', () => {
  const originals = [names[0], '底蓋，蝶閥, 1000mm-毛胚', ' 底蓋,蝶閥,1000mm-毛胚-毛胚 '];
  const c = api.buildCatalog(originals);
  assert.equal(c.pairs.length, 2);
  assert.ok(c.pairs.every(p => p.ambiguous && !p.enabled));
  for (const name of originals) assert.equal(c.aliases.get(name).canonical, name);
});

test('legacy v1 exclusions apply across formatting variants and JSON retains original settings', () => {
  const legacy = { kind: 'mes-product-classification', version: 1, excludedBases: [' 底蓋，蝶閥, 1000mm ', names[0], '未載入的其他品名'] };
  const excluded = api.parseSettings(JSON.stringify(legacy));
  assert.deepEqual(api.exportSettings(excluded).excludedBases, [...legacy.excludedBases].sort());
  const c = api.buildCatalog(names, excluded);
  assert.equal(c.pairs[0].excluded, true);
  assert.equal(c.aliases.get(names[0]).canonical, names[0]);
  assert.notEqual(c.aliases.get(names[0]).key, c.aliases.get(names[1]).key);
  const enabled = api.setPairEnabled(excluded, c.pairs[0].base, true);
  assert.deepEqual([...enabled], ['未載入的其他品名']);
  assert.equal(excluded.size, 3);
  const disabled = api.setPairEnabled(enabled, c.pairs[0].base, false);
  assert.equal(api.buildCatalog(names, api.parseSettings(JSON.stringify(api.exportSettings(disabled)))).pairs[0].enabled, false);
});

test('conflicting order products still require manual review after formatting normalization', () => {
  const order = { workOrderNo: 'CONFLICT', productSpec: names[0], totalProcessingMs: 123 };
  const result = api.projectOrder(order, api.buildCatalog(names), [names[0], names[2]], x => x);
  assert.ok(result.productClassificationNote.includes('待人工確認'));
  assert.equal(result.productSpec, names[0]);
  assert.equal(result.totalProcessingMs, 123);
});

const rows = names.flatMap((spec, i) => ['Start', 'Pause', 'Resume', 'End'].map((status, j) => ({
  ID: `id-${i}-${j}`, 使用者: 'TEST', 設備編號: 'L3', 設備名稱: '傳統車床', 製令單號: `TEST-${i}`,
  品名規格: spec, 生產數量: 2, 動作狀態: status, 紀錄時間: `2026/10/${12 + i} ${['08:00:01', '09:00:02', '09:10:03', '11:00:04'][j]}`,
})));
rows.push({ ...rows[0] }, { 品名規格: names[0], 動作狀態: 'bad', 紀錄時間: 'bad' });

test('production formatting changes only grouping, preserving raw, duplicate, invalid, work and archive data', () => {
  const before = loadMes(previous.get('assets/simple-mes.js').toString('utf8'), oldApi);
  const after = loadMes(current.get('assets/simple-mes.js').toString('utf8'));
  for (const m of [before, after]) m.analyzeRows(structuredClone(rows), 'formatting test');
  for (const key of ['rawRows', 'validRecords', 'invalidRecords']) assert.deepEqual(plain(after.state[key]), plain(before.state[key]));
  assert.deepEqual(plain(after.state.archiveData.archiveSummary), plain(before.state.archiveData.archiveSummary));
  const fields = ['workOrderNo', 'quantity', 'stations', 'stationTransitions', 'machineWorkSummary', 'totalProcessingMs', 'totalWaitingMs', 'leadTimeMs', 'completed', 'includeInAverage', 'hasAnomaly'];
  const metrics = m => plain(m.buildWorkOrders(m.state.validRecords).map(o => Object.fromEntries(fields.map(k => [k, o[k]]))));
  assert.deepEqual(metrics(after), metrics(before));
  assert.deepEqual(plain(after.buildRawReportingSheet(after.state.rawRows)), plain(before.buildRawReportingSheet(before.state.rawRows)));
  const orders = after.buildWorkOrders(after.state.validRecords);
  assert.equal(orders.length, 4);
  const flow = after.buildProductSpecFlowAnalysis(orders, '');
  assert.equal(flow.length, 3);
  assert.equal(flow.find(g => g.productSpec === canonical).orderCount, 2);
  assert.equal(after.buildProductSpecComparisons(orders).find(g => g.productSpec === canonical).orderCount, 2);
  const sheets = after.buildAnalysisSheets(after.getScopedData());
  for (const sheet of [sheets.productFlowDetailSheet, sheets.productFlowSummarySheet]) assert.ok(sheet.rows.some(r => r[0] === `品名規格：${canonical}`));
  after.analyzeRows(structuredClone(rows), 'repeat');
  assert.equal(after.state.rawRows.length, rows.length);
});

test('production formatting release cannot include changes to other analysis functions', () => {
  const promotion = require('../scripts/production-classification.cjs');
  const before = previous.get('assets/simple-mes.js').toString('utf8');
  const after = current.get('assets/simple-mes.js').toString('utf8');
  for (const [, name] of before.matchAll(/^  function (\w+)\(/gm)) {
    if (!['renderShell', 'bindEvents', 'renderProductClassification'].includes(name)) {
      assert.equal(promotion.functionText(after, name), promotion.functionText(before, name), name);
    }
  }
});
