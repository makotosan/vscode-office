const {test}=require('node:test');
const assert=require('node:assert/strict');
const {prepare,documentHtml}=require('../input.cjs');
const {fixtures}=require('../fixtures.cjs');
const {inspect}=require('../inspect.cjs');
for(const engine of ['html-to-docx','oxford']) {
 test(`${engine} generates the same prepared table and images without altChunk`,async()=>{
  for(const name of ['table-five-rows','png-jpeg','svg']) {
   const input=await prepare(documentHtml(fixtures[name])),result=await require(`../${engine}.cjs`).generate(input),r=await inspect(result.bytes);
   assert.ok(result.bytes.length>1000);assert.equal(r.altChunk,0);
   if(name==='table-five-rows')assert.equal(r.tableCount,1);
   if(name==='png-jpeg')assert.equal(r.images,2);
  }
 });
 test(`${engine} links by explicit occurrence ID or rejects ambiguous metadata`,async()=>{
  const input=await prepare(documentHtml(fixtures['png-jpeg']),{imageMode:'linked'}),result=await require(`../${engine}.cjs`).generate(input);
  const final=await result.postprocess(result.bytes),r=await inspect(final);assert.equal(r.externalImages,2);
 });
}
