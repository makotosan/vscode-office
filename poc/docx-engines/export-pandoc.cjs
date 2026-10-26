const fs=require('node:fs');
const path=require('node:path');
const {inspect}=require('./inspect.cjs');
const {hash}=require('./input.cjs');
const {acceptanceStatus}=require('./acceptance.cjs');
async function main() {
 const base=path.join(__dirname,'output/pandoc'),s=JSON.parse(fs.readFileSync(path.join(base,'comparison.json'),'utf8'));
 const previous=JSON.parse(fs.readFileSync(path.join(__dirname,'measurements/windows-node24.json'),'utf8'));
 for(const r of s.records) {
  const prior=previous.records.find(p=>p.fixture===r.fixture);
  if(r.inputHash!==prior?.inputHash)throw new Error('Input hash differs from original comparison');
  if(!r.final)continue;
  const dir=path.join(base,`attempt-${r.attempt}`,r.engine,r.imageMode,r.fixture);
  for(const stage of ['raw','final']) {
   const bytes=fs.readFileSync(path.join(dir,stage==='final'&&r.postprocess.length?'final.docx':'raw.docx'));
   if(hash(bytes)!==r[stage].sha256)throw new Error('Saved DOCX hash mismatch');
   r[stage].pageBreaks=(await inspect(bytes)).pageBreaks;
  }
  if(r.fixture==='no-table'&&!r.final.pageBreaks) {
   r.fidelityErrors=[...new Set([...r.fidelityErrors,'Explicit page break missing'])];r.status='fail';
  }
  r.overallStatus=acceptanceStatus(r);
  fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(r,null,2));
 }
 fs.writeFileSync(path.join(base,'comparison.json'),JSON.stringify(s,null,2));
 const result={date:'2026-10-26 JST',release:JSON.parse(fs.readFileSync(path.join(__dirname,'.tools/pandoc-release.json'),'utf8')),
  runtime:{OS:s.OS,CPU:s.CPU,node:s.node,sdk:'3.3.0',framework:'local .NET5 override; framework warning; CI .NET8'},
  sameInputHashes:true,word:{windows:'not-run',macOS:'not-run'},
  records:s.records.map(r=>({...r,raw:r.raw&&{...r.raw,text:undefined},final:r.final&&{...r.final,text:undefined}}))};
 fs.writeFileSync(path.join(__dirname,'measurements/pandoc-windows-node24.json'),JSON.stringify(result,null,2));
 for(const mode of ['embedded','linked']) {const rows=s.records.filter(r=>r.imageMode===mode);console.log(JSON.stringify({mode,generated:rows.filter(r=>r.final).length,sdk2019Pass:rows.filter(r=>r.sdk.final?.['2019']?.status==='pass').length,fidelityMismatch:rows.filter(r=>r.fidelityErrors?.length).length,unsupported:rows.filter(r=>r.status==='unsupported').length}));}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
