const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PRODUCTION_REF = 'e462853041d13dc8a7b0338207228f1bb3be9cd9';
const SITE_URL = 'https://wanying-collab.github.io/simplified-mes-dashboard/';
const PREVIEW_PATH = 'testing/google-sync';
const PUBLIC_FILES = [
  'index.html', '404.html', 'index-fixed.html', 'portal-fixed.html',
  'portal-X7K9M4Q2.html', 'portal-x7k9m4q2/index.html', '.nojekyll',
  'assets/simple-mes.js', 'assets/simple-mes.css',
  'assets/index-BQzHMGEN.js', 'assets/index-fgnBnJna.css',
];
const PREVIEW_FILES = PUBLIC_FILES.filter((name) => !name.startsWith('assets/index-'))
  .concat('assets/google-sheets-sync.js', 'assets/product-spec-classification.js');
const STORAGE_KEYS = [
  'mes_machine_master_v1', 'mes_setup_calendar_v1', 'mes_setup_calendar_backup_v1',
  'mes_setup_reviews_v1', 'mes_setup_reviews_backup_v1',
  'mes_product_classification_v1',
];
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const baseline = (name) => execFileSync('git', ['show', `${PRODUCTION_REF}:${name}`], { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 });

function previewJavaScript(source) {
  let result = source;
  for (const key of STORAGE_KEYS) {
    const literal = JSON.stringify(key);
    if (result.split(literal).length !== 2) throw new Error(`Unexpected storage key usage: ${key}`);
    result = result.replace(literal, JSON.stringify(`mes_test_google_sync__${key}`));
  }
  return result;
}

function previewHtml(source) {
  const banner = '<aside id="mes-test-environment" role="note" style="padding:12px 20px;background:#fff4d9;color:#543c0a;border-bottom:1px solid #ddc58c;font:14px/1.7 sans-serif">'
    + '<strong>MES Google Sheets 測試環境（非正式版）</strong><br>'
    + '測試版的機台、日曆及人工覆核設定獨立保存；需要既有設定時，請自行匯入 JSON 備份。'
    + ' Google Sheets 目前仍為「知道連結的任何人可以檢視」，OAuth 並未使原始資料成為私人資料。'
    + ` <a href="${SITE_URL}">回到正式 MES</a></aside>`;
  if (!source.includes('<head>') || !source.includes('<body>')) throw new Error('Unexpected HTML structure');
  return source.replace('<head>', '<head>\n    <meta name="robots" content="noindex, nofollow" />')
    .replace('<body>', `<body>\n    ${banner}`);
}

async function verifyLiveProduction(fetchImpl = fetch) {
  for (const name of PUBLIC_FILES.filter((name) => name !== '.nojekyll')) {
    const response = await fetchImpl(`${SITE_URL}${name}?production-check=${Date.now()}`, { signal: AbortSignal.timeout(30000), cache: 'no-store' });
    if (!response.ok) throw new Error(`Cannot verify production ${name}: HTTP ${response.status}`);
    const live = Buffer.from(await response.arrayBuffer());
    if (sha256(live) !== sha256(baseline(name))) throw new Error(`Production changed; refusing to overwrite: ${name}`);
  }
}

function build(output = path.join(ROOT, '_site')) {
  if (fs.existsSync(output)) throw new Error('Output already exists; use a fresh directory to prevent publishing stray files');
  const manifest = { productionRef: PRODUCTION_REF, previewRef: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(), production: {}, preview: {} };
  const write = (name, bytes) => {
    const target = path.join(output, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  };
  // Production bytes are read from the known live commit, never the working tree.
  for (const name of PUBLIC_FILES) {
    const bytes = baseline(name);
    write(name, bytes);
    manifest.production[name] = sha256(bytes);
  }
  for (const name of PREVIEW_FILES) {
    let bytes = fs.readFileSync(path.join(ROOT, name));
    if (name === 'assets/simple-mes.js') bytes = Buffer.from(previewJavaScript(bytes.toString('utf8')));
    if (name.endsWith('.html')) bytes = Buffer.from(previewHtml(bytes.toString('utf8')));
    write(`${PREVIEW_PATH}/${name}`, bytes);
    manifest.preview[name] = sha256(bytes);
  }
  write(`${PREVIEW_PATH}/deployment-manifest.json`, JSON.stringify(manifest, null, 2));
  return manifest;
}

if (require.main === module) {
  (async () => {
    if (process.argv.includes('--verify-live')) await verifyLiveProduction();
    if (!process.argv.includes('--verify-only')) {
      const manifest = build();
      console.log(`Production pinned to ${manifest.productionRef}; preview: ${SITE_URL}${PREVIEW_PATH}/`);
    }
  })().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { ROOT, PRODUCTION_REF, SITE_URL, PREVIEW_PATH, PUBLIC_FILES, PREVIEW_FILES, STORAGE_KEYS, sha256, baseline, previewJavaScript, previewHtml, verifyLiveProduction, build };
