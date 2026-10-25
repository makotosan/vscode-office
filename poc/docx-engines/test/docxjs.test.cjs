const {test}=require('node:test');
const assert=require('node:assert/strict');
const JSZip=require('jszip');
const {prepare,documentHtml}=require('../input.cjs');
const {fixtures}=require('../fixtures.cjs');
const {generate,modelFromHtml}=require('../docxjs.cjs');
const {inspect,xml,nodes,W}=require('../inspect.cjs');
test('docx.js builds real heading/list/page-break and 5x3 table output',async()=>{
 for(const name of ['no-table','table-five-rows','merged-cells','png-jpeg']) {
  const input=await prepare(documentHtml(fixtures[name])),result=await generate(input),report=await inspect(result.bytes);
  assert.deepEqual(report.errors,[]);assert.equal(report.compatibilityMode,'15');assert.equal(result.diagnostics.length,0);
  if(name==='table-five-rows')assert.deepEqual(report.tables,[{rows:5,gridColumns:3}]);
  if(name==='no-table') {const z=await JSZip.loadAsync(result.bytes),doc=xml(await z.file('word/document.xml').async('string'));assert.equal(nodes(doc,W,'br').length,1);assert.ok(nodes(doc,W,'pStyle').length>=2);}
 }
});
test('linked PNG/JPEG occurrences have explicit IDs and separate external relationships',async()=>{
 const input=await prepare(documentHtml(fixtures['png-jpeg']),{imageMode:'linked'}),result=await generate(input),r=await inspect(result.bytes);
 assert.deepEqual(r.errors,[]);assert.equal(r.externalImages,2);
 const z=await JSZip.loadAsync(result.bytes),s=await z.file('word/document.xml').async('string');assert.equal((s.match(/r:link=/g)||[]).length,2);
});
test('SVG is explicitly unsupported without authorized raster fallback; CSS gaps fail diagnostics',async()=>{
 await assert.rejects(generate(await prepare(documentHtml(fixtures.svg))),/UNSUPPORTED/);
 const m=modelFromHtml(await prepare(documentHtml('<p style="float:left">x</p>')));assert.ok(m.diagnostics.some(d=>d.severity==='error'));
});
