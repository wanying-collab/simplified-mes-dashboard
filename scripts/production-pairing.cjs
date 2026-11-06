const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { functionText } = require('./production-classification.cjs');

const BASE = 'a45b0b8ce662f1ce7a1f8006714b460b9b06ec05';
const JS = 'assets/simple-mes.js';
const FUNCTIONS = ['analyzeRows','mapRowToRecord','resolveMissedPauseWarning','buildWorkOrder','buildStationTransitions','calculateWorkOrderOperatorAnalysis','buildInvalidReason','normalizeStatus','parseDateTime','resolveWorkOrderStatus','resolveFlowHint'];
const HELPERS = ['pairWorkOrderMachineEvents','buildMachineEventAudit'];
const ENTRIES = ['portal-x7k9m4q2/index.html','portal-X7K9M4Q2.html'];
const REVISION = 'parallel-events-v1';
function promote(root, previous) {
  const pinned = execFileSync('git',['show',BASE+':'+JS],{cwd:root,maxBuffer:2000000}).toString('utf8');
  const local = fs.readFileSync(path.join(root,JS),'utf8').replaceAll('\r\n','\n');
  const result = new Map(previous);
  let production = result.get(JS).toString('utf8'), expectedLocal = pinned;
  for (const name of FUNCTIONS) {
    const old = functionText(pinned,name), updated = functionText(local,name);
    if (functionText(production,name) !== old) throw new Error('Unexpected pairing baseline: '+name);
    production = production.replace(old,()=>updated);
    expectedLocal = expectedLocal.replace(old,()=>updated);
  }
  const anchor = '  function createStation(stationNo, record) {';
  const helpers = HELPERS.map(name=>functionText(local,name)+'\n').join('');
  production = production.replace(anchor,()=>helpers+anchor);
  if (expectedLocal.replace(anchor,()=>helpers+anchor) !== local) throw new Error('Unrelated preview changes outside the approved pairing functions');
  if (/MESMoldChanges|mold-change-analysis|MESGoogleSheets|googleAuthorizeBtn|sheets\.googleapis\.com/.test(production)) throw new Error('Preview or cancelled feature in production');
  result.set(JS, Buffer.from(production));
  for (const file of ENTRIES) {
    const html = result.get(file).toString('utf8'), old = 'assets/simple-mes.js?v=comma-whitespace-v1';
    if (html.split(old).length !== 2) throw new Error('Unexpected production entry: '+file);
    result.set(file,Buffer.from(html.replace(old,'assets/simple-mes.js?v='+REVISION)));
  }
  return result;
}
module.exports = { BASE, JS, FUNCTIONS, HELPERS, ENTRIES, REVISION, promote };
