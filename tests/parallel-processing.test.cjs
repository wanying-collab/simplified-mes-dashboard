const {test} = require('node:test');
const assert = require('node:assert/strict');
const pages = require('../scripts/build-pages-preview.cjs');
const load = require('./helpers/mes-harness.cjs');
const source = pages.productionRelease().get('assets/simple-mes.js').toString('utf8');
const row = (machine, action, at, person='甲', order='TEST') => ({設備編號:machine,設備名稱:machine==='ACME'?'CNC立式車床':'人工站',製令單號:order,使用者:person,品名規格:'驗證產品',動作狀態:action,紀錄時間:at.includes('/')?at:'2026/11/02 '+at});
const run = (rows, code=source) => {
  const table={innerHTML:''};
  const mes=load(code,undefined,{document:{getElementById:id=>id==='flowTable'?table:null}});
  mes.analyzeRows(structuredClone(rows),'fixture');
  const orders=mes.buildWorkOrders(mes.state.validRecords);
  assert.deepEqual(JSON.parse(JSON.stringify(mes.state.rawRows)),rows);
  return {mes,orders,o:orders[0],table};
};
for (const [version, code] of [['production',source],['preview',undefined]]) {
  test(version+': parallel starts, operator handoff, independent closure, 4h+3h and no parallel wait',()=>{
    const rows=[row('L3','Start','08:00:00'),row('L10','Start','09:30:00','乙'),row('L3','End','13:15:00','丙'),row('L10','End','13:45:00','乙')];
    const {mes,o,table}=run(rows.reverse(),code);
    assert.equal(o.totalProcessingMs,7*3600000);assert.equal(o.totalWaitingMs,0);
    assert.equal(o.stations.length,2); assert.equal(o.hasAnomaly,false);assert.equal(o.completed,true);
    assert.equal(o.includeInAverage,true);assert.equal(o.duplicateEndCount,0);
    const people=mes.calculateWorkOrderOperatorAnalysis(o);
    assert.equal(people.length,3);assert.equal(people.reduce((s,r)=>s+r.totalProcessingMs,0),o.totalProcessingMs);
    mes.renderFlowTable({filteredWorkOrders:[o]});assert.match(table.innerHTML,/7:00:00/);
    const sheets=mes.buildAnalysisSheets({...mes.getScopedData(),workOrders:[o],analysisWorkOrders:[o]});
    assert.equal(sheets.workOrderSheet[0].總加工工時,'7:00:00');
  });
  test(version+': ACME resume is independent of YC-1 resume without a prior pause',()=>{
    const {o}=run([row('ACME','Start','07:50:00'),row('ACME','Pause','08:00:00'),row('ACME','Resume','08:07:25'),row('YC-1','Resume','13:23:41','乙'),row('YC-1','Pause','13:40:00','乙'),row('ACME','Pause','14:00:00')],code);
    assert.equal(o.hasAnomaly,false);assert.equal(o.unpairedSegments.length,0);
    assert.equal(o.stations.find(s=>s.machineId==='YC-1').processingMs,979000);
    assert.equal(o.stations.find(s=>s.machineId==='ACME' && s.startStatus==='Resume').endAt.getHours(),14);
  });
  test(version+': L3/L10 resume in parallel; supervisor End closes the order with no D2 work',()=>{
    const rows=['L3','L10'].flatMap((m,i)=>[row(m,'Start','2026/10/16 08:00:00'),row(m,'Pause','2026/10/16 09:00:00'),row(m,'Resume','2026/10/17 '+(i?'09:49:51':'08:08:03')),row(m,'Pause','2026/10/17 '+(i?'17:02:29':'17:02:23')),row(m,'Resume','2026/10/19 '+(i?'08:03:22':'08:00:03')),row(m,'Pause','2026/10/19 '+(i?'16:17:00':'16:17:37'),i?'乙':'甲')]);
    const before=run(rows,code),{o,mes}=run([...rows,row('D2','End','2026/10/27 09:18:26')],code);
    assert.equal(o.totalProcessingMs,before.o.totalProcessingMs);assert.equal(o.completed,true);
    assert.equal(mes.state.archiveData.archiveSummary.length,1);assert.equal(o.hasAnomaly,false);
    assert.ok(!o.stations.some(s=>s.machineId==='D2'));
    const day=o.stations.filter(s=>s.startAt.getDate()===19);
    assert.equal(day.reduce((n,s)=>n+(s.endAt-s.startAt),0),59472000);
    assert.equal(day.reduce((n,s)=>n+s.processingMs,0),48672000);
    const sliced=mes.buildWorkOrders(mes.state.validRecords.filter(r=>r.recordedAt.getDate()===19))[0];
    assert.equal(sliced.totalProcessingMs,48672000);assert.equal(sliced.hasAnomaly,false);
  });
}
test('nested parallel interval creates no false wait; only idle tail is assigned to the last finishing machine',()=>{
  const {o}=run([row('A','Start','08:00:00'),row('B','Start','09:00:00'),row('B','Pause','09:30:00'),row('C','Start','11:00:00'),row('C','Pause','11:15:00'),row('A','Pause','12:00:00'),row('D','Start','13:00:00'),row('D','End','13:10:00')]);
  assert.equal(o.totalWaitingMs,3600000);assert.equal(o.stationTransitions.length,1);assert.match(o.stationTransitions[0].fromStation,/A/);
});
test('duplicate opens, orphan/repeated Pause and time inversion remain warnings, never made-up work',()=>{
  for(const action of ['Resume','Start']){
    const {o}=run([row('L3','Start','08:00:00'),row('L3',action,'08:30:00'),row('L3','Pause','09:00:00'),row('L3','Pause','09:01:00')]);
    assert.equal(o.hasAnomaly,true);assert.match(o.anomalies.join(),/連續 Pause/);assert.equal(o.totalProcessingMs,1800000);assert.equal(o.includeInAverage,false);
  }
  const {o}=run([row('L3','Start','09:00:00'),row('L3','End','08:00:00')]);
  assert.equal(o.totalProcessingMs,0);assert.equal(o.hasAnomaly,true);assert.equal(o.includeInAverage,false);
});
test('manual elapsed >12h warns even across breaks; CNC has no manual warning; 12h exactly is not over',()=>{
  for(const [machine,end,expected] of [['L3','20:00:01',true],['L3','20:00:00',false],['ACME','20:00:01',false]]){
    const {o}=run([row(machine,'Start','08:00:00'),row(machine,'Pause',end)]);
    assert.equal(o.hasMissedPauseWarning,expected);
  }
});
test('an End on the same machine for another order cannot close or extend an unmatched opening',()=>{
  const {orders}=run([row('L3','Start','08:00:00'),row('L3','End','09:00:00','乙','OTHER')]);
  assert.ok(orders.every(o=>o.totalProcessingMs===0));assert.equal(orders.find(o=>o.workOrderNo==='TEST').stations[0].isOpen,true);
});
test('L3 six net hours plus overlapping L10 seven net hours sum to thirteen; first D3 Resume is a valid entry',()=>{
  const {o}=run([row('L3','Start','08:00:00'),row('L10','Resume','08:15:00','乙'),row('L3','Pause','15:30:00'),row('L10','Pause','16:45:00','乙')]);
  assert.deepEqual(Array.from(o.stations,s=>s.processingMs/3600000),[6,7]);assert.equal(o.totalProcessingMs,13*3600000);assert.equal(o.totalWaitingMs,0);
  const switched=run([row('L4','Start','08:00:00'),row('L4','Pause','09:00:00'),row('D3','Resume','09:05:00','乙'),row('D3','Pause','09:45:00','乙'),row('D3','End','12:00:00','主管')]).o;
  assert.equal(switched.totalProcessingMs,6000000);assert.equal(switched.totalWaitingMs,300000);assert.equal(switched.includeInAverage,true);
});
test('disabled actions, missing machine, negative duration, impossible dates are retained in raw/invalid data',()=>{
  const rows=[row('X','換模開始Mold change begins','08:00:01'),row('X','換模結束Mold change complete','08:30:00'),row('','Start','09:00:00'),row('X','Start','2026/02/31 08:00:00'),{...row('X','Pause','09:00:00'),本次工時:'-1:00:00'}];
  const {mes,orders}=run(rows);assert.equal(orders.length,0);assert.equal(mes.state.invalidRecords.length,5);assert.equal(mes.buildRawReportingSheet(rows).length,6);
  assert.doesNotMatch(source,/MESMoldChanges|mold-change-analysis|換模時間明細|品名規格換模時間統計|googleAuthorizeBtn/);
});
test('duplicate End is inert for work, completion and archive year; valid Pause-End is a closure only',()=>{
  const {o}=run([row('L3','Start','08:00:00'),row('L3','Pause','09:00:00'),row('L3','End','09:30:00'),row('L3','End','2027/01/02 12:00:00')]);
  assert.equal(o.totalProcessingMs,3600000);assert.equal(o.completed,true);assert.equal(o.archiveYear,'2026');assert.equal(o.duplicateEndCount,1);
});
