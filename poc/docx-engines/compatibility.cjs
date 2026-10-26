const fs=require('node:fs/promises');
const path=require('node:path');
const JSZip=require('jszip');
const {XMLSerializer}=require('@xmldom/xmldom');
const {xml,nodes,children,W}=require('./inspect.cjs');
const {hash}=require('./input.cjs');
const WORD='http://schemas.microsoft.com/office/word';
async function withMode15(bytes) {
 const zip=await JSZip.loadAsync(bytes,{checkCRC32:true}),entry=zip.file('word/settings.xml');
 if(!entry)throw new Error('Missing word/settings.xml');
 const doc=xml(await entry.async('string')),root=doc.documentElement;
 if(root.namespaceURI!==W||root.localName!=='settings')throw new Error('Invalid settings root');
 const existing=children(root).filter(n=>n.namespaceURI===W&&n.localName==='compat');
 if(existing.length>1)throw new Error('Ambiguous compatibility containers');
 let compat=existing[0];
 if(!compat){
  compat=doc.createElementNS(W,'w:compat');
  const following=new Set('docVars rsids attachedSchema themeFontLang clrSchemeMapping doNotIncludeSubdocsInStats doNotAutoCompressPictures forceUpgrade captions readModeInkLockDown smartTagType schemaLibrary doNotEmbedSmartTags decimalSymbol listSeparator'.split(' '));
  const next=children(root).find(n=>following.has(n.localName)||(n.namespaceURI!==W&&n.localName==='mathPr'));
  root.insertBefore(compat,next||null);
 }
 const modes=nodes(compat,W,'compatSetting').filter(n=>n.getAttributeNS(W,'name')==='compatibilityMode'&&n.getAttributeNS(W,'uri')===WORD);
 const mode=modes[0]||doc.createElementNS(W,'w:compatSetting');
 mode.setAttributeNS(W,'w:name','compatibilityMode');mode.setAttributeNS(W,'w:uri',WORD);mode.setAttributeNS(W,'w:val','15');
 if(!mode.parentNode)compat.appendChild(mode);
 for(const duplicate of modes.slice(1))compat.removeChild(duplicate);
 zip.file('word/settings.xml',new XMLSerializer().serializeToString(doc));
 return zip.generateAsync({type:'nodebuffer'});
}
async function main(input,output) {
 if(!input||!output||path.resolve(input)===path.resolve(output))throw new Error('Pass distinct input.docx and NEW output.docx');
 const before=await fs.readFile(input),after=await withMode15(before);
 const a=await JSZip.loadAsync(before),b=await JSZip.loadAsync(after),changed=[];
 for(const [name,e]of Object.entries(a.files))if(!e.dir&&!Buffer.from(await e.async('nodebuffer')).equals(await b.file(name).async('nodebuffer')))changed.push(name);
 if(changed.some(n=>n!=='word/settings.xml'))throw new Error('Unexpected package modification');
 await fs.writeFile(output,after,{flag:'wx'});
 console.log(JSON.stringify({inputSha256:hash(before),outputSha256:hash(after),changedParts:changed,output}));
}
if(require.main===module)main(...process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={withMode15};
