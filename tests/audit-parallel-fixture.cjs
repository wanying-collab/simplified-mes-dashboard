// Private input/output paths are supplied at run time. Never publish the audit or raw workbook.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const pages = require('../scripts/build-pages-preview.cjs'), load = require('./helpers/mes-harness.cjs');
const [file, parser, excel, out] = process.argv.slice(2);
const X = require(path.resolve(parser));
const bytes = fs.readFileSync(file), book = X.read(bytes,{type:'buffer'});
const rows = X.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{defval:''});
const plain = x => JSON.parse(JSON.stringify(x));
const fmt = ms => {const n=Math.round(ms/1000);return [Math.floor(n/3600),String(Math.floor(n/60)%60).padStart(2,'0'),String(n%60).padStart(2,'0')].join(':');};
const before=load(pages.classificationRelease().get('assets/simple-mes.js').toString());
const after=load(pages.productionRelease().get('assets/simple-mes.js').toString(),undefined,{excelSource:fs.readFileSync(excel,'utf8'),captureExport:true});
function breakAdjusted(start,end) {
  let ms=end-start;
  for(const d=new Date(+start);d.setHours(0,0,0,0)<=end;d.setDate(d.getDate()+1)){
    for(const [h,m,duration] of [[10,0,15],[12,0,60],[15,0,15]]){
      const begin=new Date(+d).setHours(h,m,0,0);
      ms-=Math.max(0,Math.min(+end,begin+duration*60000)-Math.max(+start,begin));
    }
  }
  return ms;
}
// Independent ledger: partition BEFORE sorting, then match adjacent machine actions.
function reference(records){
  const machines=Map.groupBy(records,r=>r.machineId), segments=[];
  for(const events of machines.values()){
    events.sort((a,b)=>a.recordedAt-b.recordedAt);
    for(let j=1;j<events.length;j++){
      const a=events[j-1], b=events[j], prev=events[j-2];
      if (!['Pause','End'].includes(b.actionStatus) || b.recordedAt<=a.recordedAt) continue;
      if(a.actionStatus!=='Start' && !(a.actionStatus==='Resume' && prev?.actionStatus==='Pause')) continue;
      segments.push({machine:a.machineId,from:a.id,to:b.id,ms:breakAdjusted(a.recordedAt,b.recordedAt)});
    }
  }
  return segments;
}
(async()=>{
  for(const m of [before,after]) m.analyzeRows(structuredClone(rows),'audit');
  assert.deepEqual(plain(after.state.rawRows),rows);
  assert.deepEqual(plain(after.buildRawReportingSheet(rows)),plain(before.buildRawReportingSheet(rows)));
  const olds=before.buildWorkOrders(before.state.validRecords), orders=after.buildWorkOrders(after.state.validRecords);
  const oldMap=new Map(olds.map(o=>[o.workOrderNo,o])), newMap=new Map(orders.map(o=>[o.workOrderNo,o]));
  const changes=[], reasons={}, unresolved=[];
  const tap=(reason,ms)=>{const v=reasons[reason]||={n:0,ms:0};v.n++;v.ms+=ms;};
  const key=s=>JSON.stringify([s.machineId,+s.startAt,+s.endAt,s.processingMs]);
  for(const orderNo of new Set([...oldMap.keys(),...newMap.keys()])){
    const old=oldMap.get(orderNo), cur=newMap.get(orderNo), rec=cur?.rawRecords||[];
    const ledger=reference([...rec]);
    assert.equal(ledger.reduce((s,r)=>s+r.ms,0),cur?.totalProcessingMs||0,orderNo);
    assert.deepEqual(ledger.map(r=>[r.from,r.to,r.ms].join('|')).sort(),plain((cur?.stations||[]).filter(s=>s.endAt).map(s=>[s.startRecordId,s.endRecordId,s.processingMs].join('|')).sort()),orderNo);
    const oldSegments=(old?.stations||[]).filter(s=>s.processingMs>0), next=(cur?.stations||[]).filter(s=>s.processingMs>0);
    const missing=[...next];let removed=0, added=0;
    for(const s of oldSegments){
      const i=missing.findIndex(n=>key(n)===key(s)); if(i>=0){missing.splice(i,1);continue;}
      const oldRows=old.rawRecords, start=oldRows.find(r=>+r.recordedAt===+s.startAt&&r.actionStatus===s.startStatus&&r.machineId===s.machineId);
      const ends=oldRows.filter(r=>+r.recordedAt===+s.endAt&&r.actionStatus===s.endStatus);
      let reason;
      if(s.isOpen) reason='舊版推算未關閉區段';
      else if(!start || !rec.some(r=>r.id===start.id) || ends.every(r=>!rec.some(n=>n.id===r.id))) reason='起訖資料不完整或已停用';
      else if(!ends.some(r=>r.machineId===s.machineId)) reason='舊版跨機台關閉';
      else if(s.startStatus==='Resume' && !after.state.machineEventAudit.resumeIds.has(start.id)) reason='Resume 缺少同機台前序';
      else if(rec.some(r=>r.machineId===s.machineId&&r.recordedAt>s.startAt&&r.recordedAt<s.endAt)) reason='同機台區段內另有啟停事件';
      else unresolved.push({orderNo,segment:s});
      if(reason) tap(reason,-s.processingMs);removed+=s.processingMs;
    }
    for(const s of missing){tap('新版保留可逐筆核對的同機台閉合段',s.processingMs);added+=s.processingMs;}
    const delta=(cur?.totalProcessingMs||0)-(old?.totalProcessingMs||0);
    assert.equal(added-removed,delta,orderNo);
    if(delta || old?.completed!==cur?.completed || old?.totalWaitingMs!==cur?.totalWaitingMs)
      changes.push({orderNo,before:fmt(old?.totalProcessingMs||0),after:fmt(cur?.totalProcessingMs||0),removedMs:removed,addedMs:added,completed:cur?.completed,issues:cur?.anomalies});
  }
  const summary=(m,orders)=>({raw:m.state.rawRows.length,valid:m.state.validRecords.length,invalid:m.state.invalidRecords.length,orders:orders.length,
    work:fmt(orders.reduce((s,o)=>s+o.totalProcessingMs,0)),wait:fmt(orders.reduce((s,o)=>s+o.totalWaitingMs,0)),completed:orders.filter(o=>o.completed).length,
    samples:m.buildStandards(orders).reduce((s,g)=>s+g.completedCount,0),missed:orders.reduce((s,o)=>s+o.missedPauseWarnings.length,0)});
  const result={before:summary(before,olds),after:summary(after,orders),reasons,unresolved,changes};
  if(out)fs.writeFileSync(out,JSON.stringify(result,null,2));
  assert.equal(unresolved.length,0,'Unexplained historical segments: stop deployment');
  for(const year of after.state.archiveData.archiveSummary){assert.equal(year.workOrderCount,orders.filter(o=>o.completed&&String(o.archiveYear)===String(year.year)).length);}
  const eligible=orders.filter(o=>o.includeInAverage&&o.normalizedProductSpec);assert.equal(result.after.samples,eligible.length);
  const excelRead=async()=>{assert.ok(after.book,after.state.message);return X.read(await after.book.xlsx.writeBuffer(),{type:'buffer'});};
  const previousYears=after.state.archiveData.archiveSummary.map(x=>String(x.year));
  for(const year of previousYears){after.state.includeArchiveInAnalysis=true;after.state.selectedArchiveYear=year;await after.exportAllAnalysisReport();const wb=await excelRead();
    assert.ok(!wb.SheetNames.some(n=>n.includes('換模')));const data=X.utils.sheet_to_json(wb.Sheets['製令單彙總']);
    const selected=after.getScopedData().workOrders;assert.equal(data.length,selected.length);
    for(const row of data){const o=newMap.get(row.製令單號);assert.equal(row.總加工工時,fmt(o.totalProcessingMs));assert.equal(row.總等待工時,fmt(o.totalWaitingMs));}
    assert.equal(X.utils.sheet_to_json(wb.Sheets['原始報工紀錄']).length,rows.length);
    await after.exportYearlyArchiveReport(year);const yearly=await excelRead();
    const ids=new Set(orders.filter(o=>String(o.archiveYear)===year&&o.completed).map(o=>o.workOrderNo));
    assert.equal(X.utils.sheet_to_json(yearly.Sheets['年度原始報工紀錄']).length,after.buildRawReportingSheet(rows,ids).length-1);
  }
  assert.ok(fs.readFileSync(file).equals(bytes),'Original workbook bytes must be unchanged');
  console.log(JSON.stringify({...result,changes:changes.length,excel:'checked',actualParallel:orders.flatMap(o=>{const closed=o.stations.filter(s=>s.endAt&&s.startAt.getMonth()===9&&s.startAt.getDate()===19&&['L3','L10'].includes(s.machineId));return closed.some(s=>s.startAt.getSeconds()===3)&&closed.some(s=>s.startAt.getSeconds()===22)?[{machines:closed.map(s=>[s.machineId,fmt(s.processingMs)]),completed:o.completed}]:[];})},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
