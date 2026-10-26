const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {performance}=require('node:perf_hooks');
const {fixtures}=require('./fixtures.cjs');
const {prepare,documentHtml,hash}=require('./input.cjs');
const {inspect}=require('./inspect.cjs');
const engines={legacy:'./legacy.cjs',docxjs:'./docxjs.cjs','html-to-docx':'./html-to-docx.cjs',oxford:'./oxford.cjs'};
const adapters={...engines,pandoc:'./pandoc.cjs'};
function argumentsFor(argv) {
  const options={engine:'legacy',fixture:'table-five-rows','image-mode':'embedded',output:path.join(__dirname,'output')};
  for(const arg of argv) {
    const m=/^--([\w-]+)(?:=(.*))?$/.exec(arg);
    if(!m || !['engine','fixture','image-mode','output','chromium','preprocess','all'].includes(m[1])) throw new Error(`Unknown argument ${arg}`);
    options[m[1]]=m[2]===undefined?true:m[2];
  }
  if(!adapters[options.engine]) throw new Error(`Unsupported engine ${options.engine}`);
  if(!['embedded','linked'].includes(options['image-mode'])) throw new Error('Invalid image mode');
  if(!options.all&&!fixtures[options.fixture]) throw new Error(`Unknown fixture ${options.fixture}`);
  return options;
}
async function runCase(name,options) {
  const directory=path.resolve(options.output,options.engine,options['image-mode'],name);
  fs.mkdirSync(directory,{recursive:true});
  const record={engine:options.engine,fixture:name,imageMode:options['image-mode'],OS:os.platform(),CPU:os.arch(),node:process.version,word:{windows:'not-run',macOS:'not-run'},schema:'not-run'};
  const start=performance.now();
  try {
    const original=documentHtml(fixtures[name]);
    const input=options.preparedInput?{...options.preparedInput,imageMode:options['image-mode']}:await prepare(original,{imageMode:options['image-mode'],workDir:directory,chromium:options.chromium,preprocess:options.preprocess});
    fs.writeFileSync(path.join(directory,'source.html'),input.originalHtml||original);
    fs.writeFileSync(path.join(directory,'prepared.html'),input.html);
    fs.writeFileSync(path.join(directory,'assets.json'),JSON.stringify(input.assets.map(({bytes,...a})=>a),null,2));
    record.inputHash=input.inputHash;record.sourceHash=input.sourceHash;
    const generation=performance.now();
    const result=await require(adapters[options.engine]).generate(input);
    if(result.metadata)record.adapterMetadata=result.metadata;
    if(result.model)fs.writeFileSync(path.join(directory,'model.json'),JSON.stringify(result.model,null,2));
    if(input.imageMode==='linked') {
      fs.mkdirSync(path.join(directory,'assets'),{recursive:true});
      for(const a of input.assets)fs.writeFileSync(path.join(directory,'assets',`${a.id}.${a.mime==='image/jpeg'?'jpg':a.mime==='image/svg+xml'?'svg':'png'}`),a.bytes);
    }
    record.generationMs=performance.now()-generation;
    const bytes=Buffer.from(result.bytes);
    fs.writeFileSync(path.join(directory,'raw.docx'),bytes);
    record.raw={sha256:hash(bytes),bytes:bytes.length,...await inspect(bytes)};
    record.diagnostics=result.diagnostics;
    if(options.engine==='legacy') {
      const final=await require('./legacy.cjs').normalizer()(bytes);
      fs.writeFileSync(path.join(directory,'final.docx'),final);
      record.final={sha256:hash(final),bytes:final.length,...await inspect(final)};
      record.postprocess=['legacy-normalizer'];
    } else if(result.postprocess) {
      const final=await result.postprocess(bytes);
      fs.writeFileSync(path.join(directory,'final.docx'),final);
      record.final={sha256:hash(final),bytes:final.length,...await inspect(final)};
      record.postprocess=[result.postprocessName];
    } else { record.final=record.raw;record.postprocess=[]; }
    const {parse}=require('node-html-parser');
    const root=parse(input.html);root.querySelectorAll('head,script,style').forEach(e=>e.remove());
    const compact=s=>s.replace(/\s/g,'');
    record.fidelityErrors=[];
    if(compact((root.querySelector('body')||root).text)!==compact(record.final.text||''))record.fidelityErrors.push('Text differs');
    if(record.final.images!==input.assets.length)record.fidelityErrors.push('Image occurrence count differs');
    const expectedBreaks=root.querySelectorAll('.page-break').length;
    if(expectedBreaks>(record.final.pageBreaks||0))record.fidelityErrors.push('Explicit page break missing');
    for(let i=0;i<input.assets.length;i++) {
      const actual=record.final.imageExtents?.[i],expected=input.assets[i];
      if(!actual||Math.abs(actual.widthPx-expected.widthPx)>1||Math.abs(actual.heightPx-expected.heightPx)>1)record.fidelityErrors.push(`Image extent differs: ${expected.id}`);
    }
    record.status=record.final.errors.length||record.fidelityErrors.length||result.diagnostics.some(d=>d.severity==='error')?'fail':'structural-pass-word-pending';
  } catch(e) { record.status=e.message.startsWith('UNSUPPORTED:')?'unsupported':'fail';record.error=e.message; }
  record.totalMs=performance.now()-start;
  fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(record,null,2));
  return record;
}
async function main(argv=process.argv.slice(2)) {
  const options=argumentsFor(argv), records=[];
  for(const name of options.all?Object.keys(fixtures):[options.fixture]) { const r=await runCase(name,options);records.push(r);console.log(`${r.engine}/${r.imageMode}/${r.fixture}: ${r.status}${r.error?' - '+r.error:''}`); }
  fs.writeFileSync(path.resolve(options.output,`${options.engine}-${options['image-mode']}-results.json`),JSON.stringify(records,null,2));
  if(records.some(r=>r.status==='fail'||r.status==='unsupported')) process.exitCode=1;
  return records;
}
if(require.main===module) main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={main,runCase,argumentsFor,engines,adapters};
