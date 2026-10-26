const {test}=require('node:test');
const assert=require('node:assert/strict');
const JSZip=require('jszip');
const {withMode15}=require('../compatibility.cjs');
const {xml,nodes,W}=require('../inspect.cjs');
test('mode15 changes settings only, preserving document, SVG and relationships',async()=>{
 const z=new JSZip();
 z.file('word/settings.xml',`<w:settings xmlns:w="${W}"><w:zoom w:percent="100"/><w:rsids/><w:themeFontLang w:val="ja-JP"/></w:settings>`);
 z.file('word/document.xml','unchanged document');z.file('word/media/a.svg','<svg/>');z.file('word/_rels/document.xml.rels','unchanged relationships');
 const before=await z.generateAsync({type:'nodebuffer'}),after=await withMode15(before),out=await JSZip.loadAsync(after);
 for(const n of ['word/document.xml','word/media/a.svg','word/_rels/document.xml.rels'])assert.deepEqual(await out.file(n).async('nodebuffer'),await z.file(n).async('nodebuffer'));
 const d=xml(await out.file('word/settings.xml').async('string'));
 assert.equal(nodes(d,W,'compatSetting')[0].getAttributeNS(W,'val'),'15');assert.equal(nodes(d,W,'themeFontLang')[0].getAttributeNS(W,'val'),'ja-JP');
 const again=await JSZip.loadAsync(await withMode15(after));assert.equal(await again.file('word/settings.xml').async('string'),await out.file('word/settings.xml').async('string'));
});
test('existing compatibility flags survive; ambiguous containers are rejected',async()=>{
 const z=new JSZip();z.file('word/settings.xml',`<w:settings xmlns:w="${W}"><w:compat><w:doNotUseHTMLParagraphAutoSpacing/><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="12"/></w:compat></w:settings>`);
 const out=await JSZip.loadAsync(await withMode15(await z.generateAsync({type:'nodebuffer'}))),d=xml(await out.file('word/settings.xml').async('string'));
 assert.equal(nodes(d,W,'doNotUseHTMLParagraphAutoSpacing').length,1);assert.equal(nodes(d,W,'compatSetting')[0].getAttributeNS(W,'val'),'15');
 z.file('word/settings.xml',`<w:settings xmlns:w="${W}"><w:compat/><w:compat/></w:settings>`);await assert.rejects(withMode15(await z.generateAsync({type:'nodebuffer'})),/Ambiguous/);
});
