const {test}=require('node:test');
const assert=require('node:assert/strict');
const {prepare,documentHtml}=require('../input.cjs');
const {fixtures}=require('../fixtures.cjs');
const {inspect,xml,nodes,W}=require('../inspect.cjs');
const {generate}=require('../pandoc.cjs');
const {argumentsFor,engines}=require('../run.cjs');
test('Pandoc is explicit opt-in, not added to the existing four-engine default',()=>{
 assert.equal(argumentsFor(['--engine=pandoc']).engine,'pandoc');assert.equal(Object.keys(engines).length,4);
});
test('Pandoc generates a real A4 five-row table when explicitly provided', {skip:!process.env.PANDOC_BIN},async()=>{
 const result=await generate(await prepare(documentHtml(fixtures['table-five-rows'])));
 const r=await inspect(result.bytes);assert.deepEqual(r.errors,[]);assert.deepEqual(r.tables,[{rows:5,gridColumns:3}]);
 assert.match(result.metadata.version,/pandoc/);
 const z=await require('jszip').loadAsync(result.bytes),d=xml(await z.file('word/document.xml').async('string'));
 assert.equal(nodes(d,W,'pgSz')[0].getAttributeNS(W,'w'),'11906');
});
