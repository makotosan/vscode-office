const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const JSZip=require('jszip');
const {fixtures}=require('../fixtures.cjs');
const {prepare,documentHtml,hash}=require('../input.cjs');
const {inspect}=require('../inspect.cjs');
const {runCase,argumentsFor}=require('../run.cjs');
test('identical image occurrences receive independent stable IDs',async()=>{
 const a=await prepare(documentHtml(fixtures['duplicate-images'])),b=await prepare(documentHtml(fixtures['duplicate-images']));
 assert.equal(a.inputHash,b.inputHash);assert.equal(a.assets[0].sha256,a.assets[1].sha256);assert.notEqual(a.assets[0].id,a.assets[1].id);
});
test('missing images and unrendered dynamics fail before generation',async()=>{
 await assert.rejects(prepare(documentHtml(fixtures['broken-image'])));
 await assert.rejects(prepare(documentHtml(fixtures.mermaid)),/not rendered/);
 assert.throws(()=>argumentsFor(['--engine=missing']),/Unsupported/);
 assert.throws(()=>argumentsFor(['--image-mode=other']),/Invalid/);
});
test('baseline retains raw defects and repairs a separate final copy',async()=>{
 const output=fs.mkdtempSync(path.join(os.tmpdir(),'engine-poc-'));
 try {
  const r=await runCase('table-five-rows',{engine:'legacy','image-mode':'embedded',output});
  assert.equal(r.status,'structural-pass-word-pending');assert.ok(r.raw.errors.some(e=>e.includes('grid')));assert.equal(r.final.errors.length,0);
  assert.deepEqual(r.final.tables,[{rows:5,gridColumns:3}]);assert.equal(r.final.compatibilityMode,'15');assert.equal(r.word.macOS,'not-run');
  const file=path.join(output,'legacy','embedded','table-five-rows','raw.docx'),raw=fs.readFileSync(file);
  await inspect(raw);assert.equal(hash(fs.readFileSync(file)),hash(raw));
  const zip=await JSZip.loadAsync(raw);zip.remove('word/document.xml');assert.ok((await inspect(await zip.generateAsync({type:'nodebuffer'}))).errors.length);
 }finally{fs.rmSync(output,{recursive:true,force:true});}
});
