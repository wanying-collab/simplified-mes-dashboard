const { execFileSync } = require('node:child_process');

// Promote only the reviewed classification delta, never the preview application.
const CLASSIFICATION_REF = '53b7a57d9da0d1dc22fb477dbafde2fcef9d9004';
const BEFORE_CLASSIFICATION_REF = '8e9a6b86824a0d33f16362252060a9e1851789f3';
const MODULE_FILE = 'assets/product-spec-classification.js';
const CHANGED_FILES = ['assets/simple-mes.js', 'portal-x7k9m4q2/index.html', 'portal-X7K9M4Q2.html', MODULE_FILE];
const FUNCTIONS = [
  'buildWorkOrders', 'buildStandards', 'buildScheduleRows',
  'buildProductSpecComparisons', 'buildProductSpecFlowAnalysis',
  'calculateProductOperatorAnalysis', 'groupByPartNo', 'calculatePartSummary', 'buildAnalysisSheets',
];

function replaceOnce(source, before, after) {
  if (!before || source.split(before).length !== 2) throw new Error('Classification promotion anchor changed');
  return source.replace(before, () => after);
}

function between(source, start, end) {
  if (source.split(start).length !== 2 || source.split(end).length !== 2) throw new Error('Classification block changed');
  const index = source.indexOf(start);
  const last = source.indexOf(end, index + start.length);
  if (last < 0) throw new Error('Classification block order changed');
  return source.slice(index, last);
}

function functionText(source, name) {
  const start = `  function ${name}(`;
  if (source.split(start).length !== 2) throw new Error(`Unexpected function: ${name}`);
  const index = source.indexOf(start);
  const last = source.indexOf('\n  }\n', index);
  if (last < 0) throw new Error(`Unterminated function: ${name}`);
  return source.slice(index, last + 5);
}

function createProductionRelease(root, baseline, files) {
  const read = (ref, name) => execFileSync('git', ['show', `${ref}:${name}`], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
  const approved = read(CLASSIFICATION_REF, 'assets/simple-mes.js').toString('utf8');
  const previous = read(BEFORE_CLASSIFICATION_REF, 'assets/simple-mes.js').toString('utf8');
  const result = new Map(files.map((name) => [name, baseline(name)]));
  let source = result.get('assets/simple-mes.js').toString('utf8');
  for (const name of FUNCTIONS) {
    const oldFunction = functionText(previous, name);
    if (functionText(source, name) !== oldFunction) throw new Error(`Unreviewed production difference: ${name}`);
    source = replaceOnce(source, oldFunction, functionText(approved, name));
  }
  source = replaceOnce(source, '  const state = {', '  const PRODUCT_CLASSIFICATION_STORAGE_KEY = "mes_product_classification_v1";\n\n  const state = {');
  source = replaceOnce(source, '    rawRows: [],', '    rawRows: [],\n    productClassification: { aliases: new Map(), pairs: [] },\n    productClassificationExclusions: new Set(),');
  source = replaceOnce(source, '  bindEvents();\n  renderAll();', '  bindEvents();\n  restoreProductClassification();\n  renderAll();');
  const sectionStart = '        <section class="panel section-block" id="product-classification">';
  const sectionEnd = '        <section class="panel section-block" id="comparison-analysis">';
  source = replaceOnce(source, sectionEnd, between(approved, sectionStart, sectionEnd) + sectionEnd);
  const events = between(approved, '  function bindEvents() {\n', '    const excelInput = document.getElementById("excelInput");');
  source = replaceOnce(source, '  function bindEvents() {\n', events);
  source = replaceOnce(source, '    state.rawRows = rows;', '    state.rawRows = rows;\n    state.productClassification = window.MESProductClassification.buildCatalog(prepared.map(productClassificationName), state.productClassificationExclusions);');
  const helperEnd = '  function mapRowToRecord(row, index) {';
  source = replaceOnce(source, helperEnd, between(approved, '  function productClassificationName(record) {', helperEnd) + helperEnd);
  source = replaceOnce(source, '    renderRawReportingSection();\n    renderArchiveSection(scoped);', '    renderRawReportingSection();\n    renderProductClassification();\n    renderArchiveSection(scoped);');
  result.set('assets/simple-mes.js', Buffer.from(source));
  result.set(MODULE_FILE, read(CLASSIFICATION_REF, MODULE_FILE));
  for (const name of CHANGED_FILES.filter((name) => name.endsWith('.html'))) {
    const html = result.get(name).toString('utf8');
    const prefix = name.includes('/') ? '../' : './';
    const script = `    <script defer src="${prefix}assets/simple-mes.js"></script>`;
    result.set(name, Buffer.from(replaceOnce(html, script, `    <script defer src="${prefix}${MODULE_FILE}"></script>\n${script}`)));
  }
  for (const [name, bytes] of result) {
    if (name.startsWith('assets/index-') || name.endsWith('.css')) continue;
    if (/MESGoogleSheets|initializeGoogleSheetsSync|google-sheets-sync\.js|accounts\.google\.com\/gsi|sheets\.googleapis\.com|googleAuthorizeBtn/.test(bytes.toString('utf8'))) {
      throw new Error(`Google synchronization must not be published in production: ${name}`);
    }
  }
  return result;
}

module.exports = { CLASSIFICATION_REF, BEFORE_CLASSIFICATION_REF, MODULE_FILE, CHANGED_FILES, FUNCTIONS, functionText, createProductionRelease };
