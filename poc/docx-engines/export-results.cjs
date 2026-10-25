const fs=require('node:fs');
const path=require('node:path');
function exportResults() {
 const full=JSON.parse(fs.readFileSync(path.join(__dirname,'output/evaluation/comparison.json'),'utf8'));
 const bundles=JSON.parse(fs.readFileSync(path.join(__dirname,'output/bundles.json'),'utf8'));
 const records=full.records.map(r=>({engine:r.engine,fixture:r.fixture,imageMode:r.imageMode,inputHash:r.inputHash,status:r.status,
  error:r.error?.replaceAll(__dirname,'<poc>'),generationMs:r.generationMs,totalMs:r.totalMs,preparationMs:r.preparationMs,diagnostics:r.diagnostics,fidelityErrors:r.fidelityErrors,
  raw:r.raw&&{sha256:r.raw.sha256,bytes:r.raw.bytes,errors:r.raw.errors},final:r.final&&{sha256:r.final.sha256,bytes:r.final.bytes,errors:r.final.errors,compatibilityMode:r.final.compatibilityMode},
  postprocess:r.postprocess,sdk:r.sdk,word:r.word,
  overallStatus:r.status==='unsupported'?'unsupported':!r.final?'generation-fail':Object.values(r.sdk?.final||{}).some(s=>s.status==='fail'||s.status==='error')?'schema-fail':r.status==='fail'?'fidelity-or-integrity-fail':'word-pending'}));
 const summary={generatedAt:full.generatedAt,OS:full.OS,CPU:full.CPU,node:full.node,repeat:full.repeat,
  runtimeNote:'Local SDK 3.3.0 ran on .NET 5 with framework support warning; CI uses .NET 8. No Word acceptance.',
  sourceNote:'Synthetic measurements from the generator code in the #15 evaluation PR, after #13/#14; no production export changes.',
  inputFailures:full.inputFailures.map(f=>({fixture:f.fixture,expected:f.expected,error:f.error.replaceAll(__dirname,'<poc>')})),dependencies:full.dependencies,bundles:bundles.candidates,records};
 const directory=path.join(__dirname,'measurements');fs.mkdirSync(directory,{recursive:true});
 fs.writeFileSync(path.join(directory,'windows-node24.json'),JSON.stringify(summary,null,2));
 fs.copyFileSync(path.join(__dirname,'output/evaluation/comparison.md'),path.join(directory,'comparison.md'));
 console.log(`Exported ${records.length} synthetic result records`);
}
if(require.main===module)exportResults();
module.exports={exportResults};
