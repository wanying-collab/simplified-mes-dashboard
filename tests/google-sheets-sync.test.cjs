const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CONFIG, parseSheetData, serialDate, createController } = require('../assets/google-sheets-sync.js');
const names = ['ID', '使用者', '設備編號', '設備名稱', '製令單號', '母件編號', '需求料件', '品名規格', '生產數量', '動作狀態', '紀錄時間', '其他欄位'];
const fields = [undefined, 'operator', 'machineId', 'machineName', 'workOrderNo', 'parentItemNo', 'requiredItem', 'productSpec', 'quantity', 'actionStatus', 'recordedAt'];
const findField = (header) => fields[names.indexOf(header)];
const cell = (value) => ({ effectiveValue: typeof value === 'number' ? { numberValue: value } : { stringValue: value } });
const event = ['001', '測試操作員', 'L1', '測試設備', 'ORDER-A', 'P', 'R', '測試產品', 5, '開始 Start', '2026/10/15 08:10:43', '保留'];
function payload(records = [event], headers = names) {
  return { properties: { timeZone: 'Asia/Taipei', locale: 'zh_TW' }, sheets: [{ properties: { title: CONFIG.sheetName }, data: [{ rowData: [headers, ...records].map((row) => ({ values: row.map(cell) })) }] }] };
}
const turn = () => new Promise((resolve) => setImmediate(resolve));
function harness(t, overrides = {}) {
  const h = { applied: [], states: [], requests: [], currentTime: 1000, data: payload(), responseStatus: 200 };
  const oauth = { initTokenClient(config) { h.auth = config; return { requestAccessToken() {} }; } };
  h.controller = createController({ findField, now: () => h.currentTime, getOAuth: () => oauth,
    onStatus: (state) => { h.states.push(state); h.last = state; },
    applyRows: (rows) => h.applied.push(rows),
    fetch: async (url, opts) => { h.requests.push({ url, opts }); return { status: h.responseStatus, ok: h.responseStatus === 200, json: async () => h.data }; },
    ...overrides,
  });
  h.login = async () => { h.controller.authorize(); h.auth.callback({ access_token: 'test-only-not-a-real-token', expires_in: 3600, scope: CONFIG.scope }); await turn(); };
  t.after(() => h.controller.disconnect());
  return h;
}
test('raw fields, action text, duplicate and invalid events survive', () => {
  const invalid = [...event]; invalid[4] = ''; invalid[9] = '未知動作'; invalid[10] = '無效時間';
  const rows = parseSheetData(payload([event, event, invalid]), findField).rows;
  assert.equal(rows.length, 3); assert.deepEqual(rows[0], rows[1]);
  assert.equal(rows[2]['動作狀態'], '未知動作'); assert.equal(rows[0]['其他欄位'], '保留');
  assert.equal(rows[0].ID, '001');
});
test('serial dates retain seconds even when formatted text hides them', () => {
  const p = payload(); const date = p.sheets[0].data[0].rowData[1].values[10];
  const n = (Date.UTC(2026, 9, 15, 8, 10, 43) - Date.UTC(1899, 11, 30)) / 86400000;
  date.effectiveValue = { numberValue: n }; date.formattedValue = '2026/10/15 08:10';
  assert.equal(parseSheetData(p, findField).rows[0]['紀錄時間'], '2026/10/15 08:10:43');
  assert.equal(serialDate(n), '2026/10/15 08:10:43');
});
test('trailing blanks preserve column alignment', () => {
  const p = payload(); p.sheets[0].data[0].rowData[1].values[5] = {};
  p.sheets[0].data[0].rowData[1].values.pop();
  const row = parseSheetData(p, findField).rows[0];
  assert.equal(row['母件編號'], ''); assert.equal(row['需求料件'], 'R'); assert.equal(row['其他欄位'], '');
});
test('numeric IDs retain displayed leading zeros', () => {
  const p = payload(); p.sheets[0].data[0].rowData[1].values[0] = { effectiveValue: { numberValue: 7 }, formattedValue: '000007' };
  assert.equal(parseSheetData(p, findField).rows[0].ID, '000007');
});
test('header position is detected; title and empty rows are not events', () => {
  const p = payload(); p.sheets[0].data[0].rowData.unshift({ values: [cell('加工紀錄')] }, { values: [] });
  assert.equal(parseSheetData(p, findField).headerRow, 3);
});
test('ambiguous data before header is rejected', () => {
  const p = payload(); p.sheets[0].data[0].rowData.unshift({ values: [cell('A'), cell('B')] });
  assert.throws(() => parseSheetData(p, findField), /表頭前/);
});
test('blank, duplicate or missing headers fail rather than lose values', () => {
  assert.throws(() => parseSheetData(payload([event], names.map((n) => n === 'ID' ? '無ID' : n)), findField), /完整表頭/);
  assert.throws(() => parseSheetData(payload([event], [...names.slice(0, -1), 'ID']), findField), /重複/);
  assert.throws(() => parseSheetData(payload([event], [...names.slice(0, -1), '']), findField), /缺少欄名/);
});
test('wrong timezone, wrong sheet, empty response and repeated header fail safely', () => {
  const p = payload(); p.properties.timeZone = 'UTC'; assert.throws(() => parseSheetData(p, findField), /時區/);
  const q = payload(); q.sheets[0].properties.title = '其他表'; assert.throws(() => parseSheetData(q, findField), /找不到/);
  assert.throws(() => parseSheetData(payload([]), findField), /沒有資料/);
  assert.throws(() => parseSheetData(payload([event, names]), findField), /重複表頭/);
});
test('large sheets are not truncated', () => {
  assert.equal(parseSheetData(payload(Array.from({ length: 15001 }, () => event)), findField).rows.length, 15001);
});
test('format-only cells and empty rows are not records; booleans and zero survive', () => {
  const p = payload(); p.sheets[0].data[0].rowData.push({ values: [{ effectiveFormat: { numberFormat: { type: 'DATE' } } }] });
  p.sheets[0].data[0].rowData[1].values[8] = cell(0);
  p.sheets[0].data[0].rowData[1].values[11] = { effectiveValue: { boolValue: false } };
  const result = parseSheetData(p, findField); assert.equal(result.rows.length, 1); assert.equal(result.rows[0]['其他欄位'], false); assert.equal(result.rows[0]['生產數量'], 0);
});
test('no token means no API call or automatic authorization popup', async (t) => {
  const h = harness(t); h.controller.start(); await h.controller.sync();
  assert.equal(h.requests.length, 0); assert.equal(h.auth, undefined); assert.match(h.last.status, /授權/);
});
test('authorization is readonly, narrow and synchronizes immediately', async (t) => {
  const h = harness(t); await h.login(); assert.equal(h.auth.scope, CONFIG.scope); assert.equal(h.auth.include_granted_scopes, false);
  assert.equal(h.applied.length, 1); const request = h.requests[0]; const url = new URL(request.url);
  assert.equal(url.searchParams.get('ranges'), "'加工紀錄表'"); assert.equal(request.opts.method, 'GET');
  assert.equal(url.searchParams.has('access_token'), false); assert.equal(request.opts.credentials, 'omit');
  assert.equal(h.last.rowCount, 1); assert.match(h.last.status, /同步成功/);
});
test('repeat sync replaces rows without deduping the source', async (t) => {
  const h = harness(t); h.data = payload([event, event]); await h.login(); await h.controller.sync();
  assert.deepEqual(h.applied.map((r) => r.length), [2, 2]);
});
test('existing valid in-page token can sync on start', async (t) => {
  const h = harness(t); await h.login(); await h.controller.start(); assert.equal(h.applied.length, 2);
});
for (const status of [401, 403, 404, 429, 500]) test(`HTTP ${status} retains last successful data and reports failure`, async (t) => {
  const h = harness(t); await h.login(); const last = h.last.lastSuccessAt;
  h.responseStatus = status; await h.controller.sync();
  assert.equal(h.applied.length, 1); assert.equal(h.last.lastSuccessAt, last); assert.match(h.last.status, /同步失敗.*舊資料/);
  if (status === 401) assert.equal(h.last.authorized, false);
});
test('expired tokens require authorization', async (t) => {
  const h = harness(t); await h.login(); h.currentTime += 3600000; await h.controller.sync();
  assert.equal(h.applied.length, 1); assert.equal(h.last.authorized, false);
});
test('network failure never applies a new snapshot', async (t) => {
  const h = harness(t, { fetch: async () => { throw new TypeError('network'); } }); await h.login();
  assert.equal(h.applied.length, 0); assert.match(h.last.error, /網路/);
});
test('malformed JSON and missing headers retain old data', async (t) => {
  const h = harness(t); await h.login(); h.data = {}; await h.controller.sync(); assert.equal(h.applied.length, 1);
});
test('duplicate requests are blocked; manual import cancels a late fetch', async (t) => {
  let resolve;
  const h = harness(t, { fetch: () => new Promise((r) => { resolve = r; }) });
  h.controller.authorize(); h.auth.callback({ access_token: 'test', scope: CONFIG.scope, expires_in: 3600 });
  assert.equal(await h.controller.sync(), false);
  h.controller.beginManual(); h.controller.endManual(true);
  resolve({ status: 200, ok: true, json: async () => payload() }); await turn();
  assert.equal(h.applied.length, 0); assert.match(h.last.status, /手動匯入資料/);
});
test('manual import during OAuth prevents late authorization from replacing data', async (t) => {
  const h = harness(t); h.controller.authorize(); const callback = h.auth.callback;
  h.controller.beginManual(); h.controller.endManual(true);
  callback({ access_token: 'test', scope: CONFIG.scope, expires_in: 3600 }); await turn();
  assert.equal(h.requests.length, 0); assert.equal(h.applied.length, 0);
});
test('manual loading blocks sync; failed manual import releases it', async (t) => {
  const h = harness(t); await h.login(); h.controller.beginManual(); assert.equal(await h.controller.sync(), false);
  h.controller.endManual(false); await h.controller.sync(); assert.equal(h.applied.length, 2);
});
test('denied scope and popup cancellation are visible', async (t) => {
  const h = harness(t); h.controller.authorize(); h.auth.callback({ error: 'access_denied' });
  assert.match(h.last.error, /授權未完成/); h.controller.authorize(); h.auth.error_callback({ type: 'popup_closed' });
  assert.match(h.last.error, /關閉或被阻擋/);
});
test('analysis failure is not reported as success', async (t) => {
  const h = harness(t, { applyRows: () => { throw new Error('analysis failed'); } }); await h.login();
  assert.equal(h.last.lastSuccessAt, null); assert.match(h.last.status, /同步失敗/);
});
test('clearing token prevents further reads until new authorization', async (t) => {
  const h = harness(t); await h.login(); h.controller.disconnect(); await h.controller.sync(); assert.equal(h.requests.length, 1);
});
