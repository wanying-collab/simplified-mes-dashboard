const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const classification = require('../../assets/product-spec-classification.js');

module.exports = function loadMes(source = fs.readFileSync(path.join(__dirname, '../../assets/simple-mes.js'), 'utf8')) {
  const storage = new Map();
  const localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) };
  const names = ['state', 'analyzeRows', 'buildWorkOrders', 'getScopedData', 'buildStandards', 'buildScheduleRows', 'buildProductSpecComparisons', 'buildProductSpecFlowAnalysis', 'buildAnalysisSheets', 'buildRawReportingSheet', 'getHistoricalSetupAnalysis', 'getSetupUnreportedRisk', 'buildYearlyArchiveData', 'calculateProductOperatorAnalysis', 'saveProductClassification', 'normalizeProductSpec', 'mapRowToRecord'];
  const api = names.filter((name) => name === 'state' || source.includes(`function ${name}(`));
  const marker = 'const root = document.getElementById("root");';
  if (!source.includes(marker)) throw new Error('MES entry changed');
  const context = { console, localStorage, window: { localStorage, MESProductClassification: classification }, document: { getElementById: () => null }, setTimeout, clearTimeout, structuredClone, TextDecoder, TextEncoder };
  vm.createContext(context);
  vm.runInContext(source.replace(marker, `globalThis.__mes = {${api.join(',')}}; renderAll = () => {}; ${marker}`), context);
  return context.__mes;
};
