const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const JSZip=require('jszip');
const {prepare,documentHtml}=require('../input.cjs');
const {fixtures,png}=require('../fixtures.cjs');
const {inspect,xml}=require('../inspect.cjs');
const {generate,linkImages}=require('../docxjs.cjs');
const {runCase}=require('../run.cjs');
test('duplicate raster occurrences link independently; stripped metadata fails closed',async()=>{
 const input=await prepare(documentHtml(`<p><img src="${png}" width="48" height="24"><img src="${png}" width="48" height="24"></p>`),{imageMode:'linked'});
 const result=await generate(input),final=await result.postprocess(result.bytes);assert.equal((await inspect(final)).externalImages,2);
 const z=await JSZip.loadAsync(result.bytes);z.file('word/document.xml',(await z.file('word/document.xml').async('string')).replace(/descr="poc-asset:[^"]+"/g,''));
 await assert.rejects(linkImages(await z.generateAsync({type:'nodebuffer'}),input),/Ambiguous/);
});
test('integrity inspector reports dangling relationships and DTD without repairing',async()=>{
 const input=await prepare(documentHtml(fixtures['png-jpeg'])),result=await generate(input),z=await JSZip.loadAsync(result.bytes);
 z.remove(Object.keys(z.files).find(p=>p.startsWith('word/media/')&&!z.files[p].dir));
 assert.ok((await inspect(await z.generateAsync({type:'nodebuffer'}))).errors.some(e=>e.includes('Missing relationship target')));
 assert.throws(()=>xml('<!DOCTYPE x><x/>'),/DTD/);
});
test('fidelity metrics distinguish library image dimension loss from XML validity',async()=>{
 const output=fs.mkdtempSync(path.join(os.tmpdir(),'engine-fidelity-'));
 try {
  const input=await prepare(documentHtml(fixtures['png-jpeg']));
  const a=await runCase('png-jpeg',{engine:'docxjs','image-mode':'embedded',output,preparedInput:input});
  const b=await runCase('png-jpeg',{engine:'html-to-docx','image-mode':'embedded',output,preparedInput:input});
  assert.equal(a.inputHash,b.inputHash);assert.deepEqual(a.fidelityErrors,[]);assert.ok(b.fidelityErrors.some(e=>e.includes('extent')));
 }finally{fs.rmSync(output,{recursive:true,force:true});}
});
